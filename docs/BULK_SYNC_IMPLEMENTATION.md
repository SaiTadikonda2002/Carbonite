# Bulk Sync Implementation: Sync All User Action Logs into Global Total

## Overview

This implementation provides a comprehensive system to atomically aggregate every verified user action log (lbs) into a single global emission total. It uses exact numeric precision (NUMERIC(30,6)), ensures idempotency, maintains an audit trail, and includes comprehensive tests.

## Key Features

✅ **Exact Numeric Precision**: NUMERIC(30,6) - no rounding/truncation  
✅ **Atomic Updates**: All updates in single DB transaction  
✅ **Idempotency**: Duplicate action_id inserts are ignored  
✅ **Bulk Backfill**: Recompute totals from source of truth  
✅ **Audit Trail**: Corrections logged in emissions_corrections table  
✅ **Reconciliation**: Hourly verification with auto-correction  
✅ **Real-Time Events**: PostgreSQL NOTIFY for leaderboard updates  

## Database Schema

### Tables

```sql
-- User actions with NUMERIC(30,6) for precise storage
CREATE TABLE user_actions (
  action_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  emissions_saved_lbs NUMERIC(30,6) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  logged_at TIMESTAMPTZ NOT NULL,  -- For audit/ordering
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- User stats with NUMERIC(30,6)
CREATE TABLE user_stats (
  user_id UUID PRIMARY KEY,
  total_emissions_lbs NUMERIC(30,6) DEFAULT 0,
  action_count INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Global emissions with NUMERIC(30,6)
CREATE TABLE global_emissions (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  total_lbs_saved NUMERIC(30,6) DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Emissions corrections for audit trail
CREATE TABLE emissions_corrections (
  correction_id UUID PRIMARY KEY,
  previous_total NUMERIC(30,6) NOT NULL,
  corrected_total NUMERIC(30,6) NOT NULL,
  discrepancy NUMERIC(30,6) NOT NULL,
  reason TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  performed_by TEXT,
  reconciliation_run_id UUID,
  metadata JSONB DEFAULT '{}'
);
```

## API Endpoints

### POST /api/actions/log

**Request:**
```json
{
  "action_id": "a1-uuid",
  "user_id": "user1-uuid",
  "lbs": "10.2",
  "logged_at": "2025-11-05T10:00:00Z",
  "verified": true,
  "metadata": {}
}
```

**Response:**
```json
{
  "success": true,
  "action_id": "a1-uuid",
  "user_id": "user1-uuid",
  "emissions_lbs": "10.200000",
  "user_total_lbs": "10.200000",
  "global_total_lbs": "10.200000",
  "is_duplicate": false,
  "message": "Emission logged successfully",
  "timestamp": "2025-11-05T10:00:00Z"
}
```

### POST /api/actions/bulk_backfill

**Request:**
```json
{
  "actions": [
    {
      "action_id": "a1-uuid",
      "user_id": "user1-uuid",
      "lbs": "10.2",
      "logged_at": "2025-11-05T10:00:00Z",
      "verified": true
    },
    {
      "action_id": "a2-uuid",
      "user_id": "user2-uuid",
      "lbs": "10.3",
      "logged_at": "2025-11-05T10:05:00Z",
      "verified": true
    },
    {
      "action_id": "a3-uuid",
      "user_id": "user3-uuid",
      "lbs": "10.4",
      "logged_at": "2025-11-05T10:10:00Z",
      "verified": true
    }
  ],
  "idempotency_key": "optional-key"
}
```

**Response:**
```json
{
  "success": true,
  "inserted_count": 3,
  "skipped_count": 0,
  "global_total_lbs": "30.900000",
  "affected_users": 3,
  "message": "Bulk backfill completed: 3 inserted, 0 skipped"
}
```

### POST /api/actions/reconcile

**Request:**
```json
{
  "performed_by": "system",
  "auto_correct": true
}
```

**Response:**
```json
{
  "in_sync": false,
  "user_stats_sum": "30.900000",
  "global_total": "30.500000",
  "discrepancy": "0.400000",
  "fixed": true,
  "correction_id": "correction-uuid",
  "timestamp": "2025-11-05T12:00:00Z"
}
```

## Example Scenario

### Input Data

```json
[
  {
    "user_id": "user1-uuid",
    "action_id": "a1-uuid",
    "lbs": "10.2",
    "logged_at": "2025-11-05T10:00:00Z",
    "verified": true
  },
  {
    "user_id": "user2-uuid",
    "action_id": "a2-uuid",
    "lbs": "10.3",
    "logged_at": "2025-11-05T10:05:00Z",
    "verified": true
  },
  {
    "user_id": "user3-uuid",
    "action_id": "a3-uuid",
    "lbs": "10.4",
    "logged_at": "2025-11-05T10:10:00Z",
    "verified": true
  }
]
```

### Expected Result

```json
{
  "global_emissions.total_lbs_saved": "30.900000",
  "user_stats": {
    "user1": "10.200000",
    "user2": "10.300000",
    "user3": "10.400000"
  },
  "leaderboard_order": [
    {"rank": 1, "user_id": "user3-uuid", "total_lbs": "10.400000"},
    {"rank": 2, "user_id": "user2-uuid", "total_lbs": "10.300000"},
    {"rank": 3, "user_id": "user1-uuid", "total_lbs": "10.200000"}
  ]
}
```

## SQL Pseudocode for Bulk Backfill

```sql
BEGIN;

-- Insert new verified actions; ignore duplicates
INSERT INTO user_actions(action_id, user_id, lbs, verified, logged_at, metadata, created_at)
VALUES --bulk values--
ON CONFLICT (action_id) DO NOTHING;

-- Recompute per-user sums for users affected by this batch (safe approach)
WITH affected_users AS (
  SELECT DISTINCT user_id FROM user_actions WHERE action_id IN (/* inserted action_ids */)
),
user_sums AS (
  SELECT 
    user_id, 
    SUM(lbs) AS sum_lbs,
    COUNT(*) AS action_count
  FROM user_actions 
  WHERE verified = TRUE 
    AND user_id IN (SELECT user_id FROM affected_users)
  GROUP BY user_id
)
UPDATE user_stats 
SET 
  total_emissions_lbs = user_sums.sum_lbs,
  action_count = user_sums.action_count,
  last_updated = NOW()
FROM user_sums 
WHERE user_stats.user_id = user_sums.user_id;

-- Recompute global total exactly from source of truth
UPDATE global_emissions 
SET 
  total_lbs_saved = (
    SELECT COALESCE(SUM(lbs), 0::NUMERIC(30,6))
    FROM user_actions
    WHERE verified = TRUE
  ),
  last_updated = NOW()
WHERE id = 1
RETURNING total_lbs_saved;

COMMIT;
```

## Reconciliation

### Hourly Reconciliation Process

1. **Query Source of Truth:**
   ```sql
   SELECT SUM(lbs) AS sum_user_totals 
   FROM user_actions 
   WHERE verified = TRUE;
   ```

2. **Compare with Global Total:**
   ```sql
   SELECT total_lbs_saved 
   FROM global_emissions 
   WHERE id = 1;
   ```

3. **On Mismatch:**
   - Log mismatch with diff and list of recent actions
   - Insert audit row into `emissions_corrections` with:
     - `previous_total`: Current global_emissions.total_lbs_saved
     - `corrected_total`: SUM(user_actions.lbs WHERE verified=TRUE)
     - `discrepancy`: ABS(difference)
     - `reason`: Description of correction
     - `performed_by`: System or admin user
   - Optionally auto-correct by setting `global_emissions.total_lbs_saved = sum_user_totals`
   - Notify ops/monitoring channel with details

## Tests

### Unit Tests

1. **Sequential Logging:**
   - Insert three verified actions sequentially
   - Assert `global_emissions.total_lbs_saved === '30.900000'`
   - Assert each `user_stats` equals respective values exactly

2. **Idempotency:**
   - Re-submit the same `action_ids`
   - Assert totals do not change

3. **Bulk Backfill:**
   - Run bulk backfill with same actions
   - Assert idempotency and exact global total

4. **Concurrent Inserts:**
   - Simulate concurrent inserts for many users
   - After completion, assert global total equals sum of verified actions (exact equality)

### Integration Tests

1. **Backfill Older Logs:**
   - Backfill logs with `logged_at` earlier than current
   - Ensure global total equals SUM(all verified actions)
   - Verify audit preserves `logged_at` ordering

2. **Reconciliation:**
   - Corrupt `global_emissions` manually
   - Run reconciliation
   - Assert emission correction is recorded
   - Assert `global_emissions` corrected to SUM(user_actions)

### Acceptance Assertions

✅ `global_emissions.total_lbs_saved === '30.900000'`  
✅ `user_stats` for user1 === '10.200000', user2 === '10.300000', user3 === '10.400000'  
✅ Leaderboard ranks users descending by `total_emissions_lbs` (ties resolved deterministically)  
✅ API responses return numeric totals as strings preserving full precision  

## Operational Notes

1. **Prefer Source of Truth:**
   - During backfill, compute global total from `user_actions WHERE verified = TRUE`
   - This avoids incremental drift

2. **Avoid Float Types:**
   - Never use float/double types in DB for monetary/aggregate numeric sums
   - Always use NUMERIC/DECIMAL with explicit precision

3. **JavaScript Precision:**
   - Return numeric values as strings to avoid JS float precision loss
   - Encourage client use of decimal libraries (decimal.js, BigNumber)

## Files Created

1. `database_schema_bulk_sync.sql` - Database schema and functions
2. `src/services/bulkSync.ts` - Core bulk sync service
3. `src/services/api/bulkSyncApi.ts` - API endpoints
4. `tests/bulkSync.test.ts` - Comprehensive test suite
5. `docs/BULK_SYNC_IMPLEMENTATION.md` - This documentation

## Implementation Status

✅ **Complete** - Ready for deployment and testing

All requirements met:
- Exact numeric precision (NUMERIC(30,6))
- Atomic updates in single transaction
- Idempotency via ON CONFLICT DO NOTHING
- Bulk backfill with source-of-truth recomputation
- Audit trail with corrections logging
- Reconciliation with auto-correction
- Comprehensive tests demonstrating example scenario

