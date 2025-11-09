# Atomic, Idempotent Emission Logging Implementation

## Overview

This implementation provides an idempotent, atomic emission logging endpoint and backend flow that:

- Accepts verified user action logs in lbs with `action_id` (UUID) and `user_id`
- Persists `user_actions` with lbs as `NUMERIC(18,6)` (no rounding)
- Atomically updates `user_stats.total_emissions_lbs` and `global_emissions.total_lbs_saved` in the same DB transaction
- Uses `ON CONFLICT / UPDATE ... RETURNING` and `SELECT ... FOR UPDATE` to prevent lost updates under concurrency
- Enforces idempotency by ignoring duplicate `action_id` inserts and returning the original result
- Emits `emissions.updated` events with exact numeric totals (as strings) after commit for real-time leaderboard updates
- Provides hourly reconciliation to verify `global_emissions.total_lbs_saved == SUM(user_stats.total_emissions_lbs)`
- Returns exact numeric totals in API responses (not rounded)

## Database Schema

### Table Definitions

```sql
-- User actions table with NUMERIC(18,6) for precise emissions storage
CREATE TABLE user_actions (
  action_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT NOT NULL,
  emissions_saved_lbs NUMERIC(18,6) NOT NULL CHECK (emissions_saved_lbs >= 0),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

-- User stats with NUMERIC(18,6) for precise totals
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  total_emissions_lbs NUMERIC(18,6) NOT NULL DEFAULT 0,
  monthly_lbs JSONB NOT NULL DEFAULT '{}'::JSONB,
  yearly_lbs JSONB NOT NULL DEFAULT '{}'::JSONB,
  action_count INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global emissions with NUMERIC(18,6) for precise global total
CREATE TABLE global_emissions (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_lbs_saved NUMERIC(18,6) NOT NULL DEFAULT 0,
  total_actions BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Emission events table for real-time updates
CREATE TABLE emission_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES user_actions(action_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  emissions_lbs NUMERIC(18,6) NOT NULL,
  user_total_lbs NUMERIC(18,6) NOT NULL,
  global_total_lbs NUMERIC(18,6) NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'emissions.updated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Endpoint Contract

### POST /api/emissions/log

**Request:**
```json
{
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440000",
  "emissions_lbs": 22.5,
  "action_type": "verified_action",
  "quantity": 10,
  "unit": "lbs"
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440000",
  "emissions_lbs": "22.500000",
  "user_total_lbs": "22.500000",
  "global_total_lbs": "22.500000",
  "is_duplicate": false,
  "message": "Emission logged successfully"
}
```

**Idempotent Response (duplicate action_id):**
```json
{
  "success": true,
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440000",
  "emissions_lbs": "22.500000",
  "user_total_lbs": "22.500000",
  "global_total_lbs": "22.500000",
  "is_duplicate": true,
  "message": "Action already logged (idempotent)"
}
```

## Concurrency-Safe Pseudocode

```pseudocode
FUNCTION log_emission_atomic(action_id, user_id, emissions_lbs):
  BEGIN TRANSACTION
  
  -- Check idempotency
  existing_action = SELECT action_id FROM user_actions 
                    WHERE action_id = action_id FOR UPDATE
  
  IF existing_action IS NOT NULL:
    -- Return existing result (idempotent)
    user_total = SELECT total_emissions_lbs FROM user_stats WHERE user_id = user_id
    global_total = SELECT total_lbs_saved FROM global_emissions WHERE id = 1
    RETURN existing_result(user_total, global_total, is_duplicate=true)
  
  -- Lock global_emissions for update (prevent lost updates)
  global_row = SELECT * FROM global_emissions WHERE id = 1 FOR UPDATE
  
  -- Insert action (idempotent via unique constraint)
  INSERT INTO user_actions (action_id, user_id, emissions_saved_lbs, verified)
  VALUES (action_id, user_id, emissions_lbs, TRUE)
  ON CONFLICT (action_id) DO NOTHING
  
  -- If insert was blocked, return existing result
  IF action_not_inserted:
    RETURN existing_result(is_duplicate=true)
  
  -- Update user_stats atomically
  INSERT INTO user_stats (user_id, total_emissions_lbs, action_count)
  VALUES (user_id, emissions_lbs, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET total_emissions_lbs = user_stats.total_emissions_lbs + emissions_lbs,
      action_count = user_stats.action_count + 1
  RETURNING total_emissions_lbs INTO user_total
  
  -- Update global_emissions atomically
  UPDATE global_emissions
  SET total_lbs_saved = total_lbs_saved + emissions_lbs,
      total_actions = total_actions + 1
  WHERE id = 1
  RETURNING total_lbs_saved INTO global_total
  
  -- Emit event (after commit)
  INSERT INTO emission_events (action_id, user_id, emissions_lbs, 
                               user_total_lbs, global_total_lbs)
  VALUES (action_id, user_id, emissions_lbs, user_total, global_total)
  
  COMMIT TRANSACTION
  
  -- Emit NOTIFY for real-time updates
  NOTIFY 'emissions.updated', json_event
  
  RETURN success_result(user_total, global_total, is_duplicate=false)
END FUNCTION
```

## Test Scenarios

### Sequential Logging

**Scenario 1: User1 logs 22.5 lbs**
- Input: `{ action_id: "action-1", user_id: "user-1", emissions_lbs: 22.5 }`
- Expected: `global_total_lbs = "22.500000"`
- Expected: User1 is rank 1 in leaderboard

**Scenario 2: User2 logs 12.4 lbs**
- Input: `{ action_id: "action-2", user_id: "user-2", emissions_lbs: 12.4 }`
- Expected: `global_total_lbs = "34.900000"` (22.5 + 12.4)
- Expected: User1 is rank 1, User2 is rank 2 in leaderboard

### Concurrent Logging

**Scenario: Multiple users log simultaneously**
- User1 logs 22.5 lbs
- User2 logs 12.4 lbs
- User1 logs 5.1 lbs (second action)

**Expected:**
- All requests succeed
- No lost updates
- Final `global_total_lbs = "40.000000"` (22.5 + 12.4 + 5.1)
- User1 total = "27.600000" (22.5 + 5.1)
- User2 total = "12.400000"

### Idempotency

**Scenario: Duplicate action_id**
- First call: `{ action_id: "action-1", user_id: "user-1", emissions_lbs: 22.5 }`
- Second call: `{ action_id: "action-1", user_id: "user-1", emissions_lbs: 22.5 }`

**Expected:**
- First call: `is_duplicate = false`, global_total increases
- Second call: `is_duplicate = true`, global_total unchanged
- Both calls return same totals

### Exact Numeric Precision

**Scenario: Precise decimal values**
- Input: `{ action_id: "action-precise", user_id: "user-1", emissions_lbs: 12.345678 }`

**Expected:**
- Response: `emissions_lbs = "12.345678"` (exact, no rounding)
- All calculations preserve 6 decimal places

## Reconciliation

### Hourly Reconciliation

The system runs hourly reconciliation to verify:
```
global_emissions.total_lbs_saved == SUM(user_stats.total_emissions_lbs)
```

**Process:**
1. Calculate `SUM(user_stats.total_emissions_lbs)`
2. Get `global_emissions.total_lbs_saved`
3. Compare values
4. If mismatch: log discrepancy and auto-resync `global_emissions`
5. Alert monitoring system

**Reconciliation Function:**
```sql
SELECT * FROM reconcile_emissions();
```

Returns:
```json
{
  "in_sync": false,
  "user_stats_sum": "40.000000",
  "global_total": "39.500000",
  "discrepancy": "0.500000",
  "fixed": true,
  "timestamp": "2024-01-01T12:00:00Z"
}
```

## Monitoring and Alerts

### Health Check

**GET /api/emissions/health**

Returns:
```json
{
  "total_actions": 100,
  "total_events": 100,
  "missing_events": 0,
  "global_total_lbs": "1234.567890",
  "user_stats_sum": "1234.567890",
  "in_sync": true,
  "last_check": "2024-01-01T12:00:00Z"
}
```

### Alert Conditions

1. **Missing Events**: `total_actions - total_events > 0`
   - Alert: "Emission events missing"

2. **Sync Mismatch**: `in_sync = false`
   - Alert: "Reconciliation found discrepancy: {discrepancy} lbs"
   - Auto-resync triggered

3. **High Discrepancy**: `discrepancy > threshold`
   - Alert: "Large discrepancy detected: {discrepancy} lbs"

## Real-Time Updates

### Event Emission

After successful emission logging, the system emits:
- PostgreSQL NOTIFY event: `emissions.updated`
- Event payload includes exact numeric totals as strings

**Event Payload:**
```json
{
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440000",
  "emissions_lbs": "22.500000",
  "user_total_lbs": "22.500000",
  "global_total_lbs": "34.900000",
  "event_type": "emissions.updated",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### Subscription

Frontend can subscribe to events:
```typescript
import { subscribeToEmissionEvents } from './services/emissionLogging';

const unsubscribe = subscribeToEmissionEvents((event) => {
  // Update leaderboard in real-time
  updateLeaderboard(event);
});
```

## Implementation Files

- `database_schema_emission_logging.sql` - Database schema and functions
- `src/services/emissionLogging.ts` - Core emission logging service
- `src/services/api/emissionLoggingApi.ts` - API endpoint contracts
- `tests/emissionLogging.test.ts` - Comprehensive test suite

## Key Features

✅ **Idempotency**: Duplicate `action_id` inserts are ignored  
✅ **Atomicity**: All updates in single transaction  
✅ **Concurrency Safety**: `SELECT FOR UPDATE` prevents lost updates  
✅ **Exact Precision**: `NUMERIC(18,6)` with no rounding  
✅ **Real-Time Events**: PostgreSQL NOTIFY for leaderboard updates  
✅ **Reconciliation**: Hourly verification with auto-resync  
✅ **Monitoring**: Health checks and alerting

