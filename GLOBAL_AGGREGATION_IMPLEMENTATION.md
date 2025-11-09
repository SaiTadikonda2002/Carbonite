# Global Aggregation and Leaderboard Implementation

This document describes the implementation of global aggregation and leaderboard functionality according to the specification.

## Key Features

✅ **Total Calculation**: `SUM(user_stats.total_emissions_lbs) = global_emissions.total_lbs_saved`  
✅ **Leaderboard Logic**: Users ordered by `total_emissions_lbs DESC` with tie-breaking by timestamp  
✅ **Active Users Count**: Count of users with at least 1 verified action  
✅ **Sync Check Validation**: Hourly verification to ensure consistency  
✅ **Precision**: All calculations use 2 decimal points  
✅ **API-like Endpoints**: Service functions matching expected API structure  
✅ **Real-time Updates**: Trigger-based updates on each verified action

## Overview

The implementation ensures that:
- `SUM(user_stats.total_emissions_lbs) = global_emissions.total_lbs_saved`
- Leaderboard displays users ordered by `total_emissions_lbs`
- Active users count tracks users with at least 1 verified action
- Hourly sync check validates and fixes any inconsistencies

## Database Schema Updates

### Updated Functions in `database_schema.sql`

1. **Consistency Check View** - Updated to use `user_stats` instead of `user_actions`:
   ```sql
   CREATE OR REPLACE VIEW consistency_check AS
   SELECT 
     (SELECT COALESCE(SUM(total_emissions_lbs), 0) FROM user_stats) AS user_stats_sum_lbs,
     (SELECT total_lbs_saved FROM global_emissions WHERE id = 1) AS global_total_lbs,
     (SELECT COALESCE(SUM(total_emissions_lbs), 0) FROM user_stats) = 
       (SELECT total_lbs_saved FROM global_emissions WHERE id = 1) AS in_sync;
   ```

2. **Sync Function** - `sync_global_emissions_from_user_stats()`:
   - Validates that `global_emissions.total_lbs_saved = SUM(user_stats.total_emissions_lbs)`
   - Automatically fixes inconsistencies if found
   - Returns sync status and values

3. **Active Users Count Function** - `get_active_users_count()`:
   - Returns count of distinct users with at least 1 verified action
   - Query: `SELECT COUNT(DISTINCT user_id) FROM user_actions WHERE verified=true`

4. **Leaderboard Function** - `get_leaderboard(limit_count)`:
   - Returns users ordered by `total_emissions_lbs DESC`
   - Query: `SELECT user_id, username, total_emissions_lbs FROM user_stats WHERE total_emissions_lbs > 0 ORDER BY total_emissions_lbs DESC`
   - Handles ties by comparing timestamps of last verified action
   - Includes rank, user_id, username, total_emissions_lbs, action_count, and last_update_timestamp
   - Precision: 2 decimal points for all calculations

5. **Hourly Sync Check Function** - `hourly_sync_check()`:
   - Runs sync validation
   - Returns JSONB with sync status
   - Action on discrepancy: Log mismatch and trigger auto-resync of global totals
   - Alert channel: System admin or monitoring dashboard
   - Precision: 2 decimal points for all calculations
   - Can be scheduled with pg_cron or external cron service

## TypeScript Service Functions

### `src/services/leaderboard.ts`

All functions ensure precision up to 2 decimal points for all calculations.

#### Functions:

1. **`getLeaderboard(limit?: number)`**
   - Returns leaderboard entries ordered by `total_emissions_lbs DESC`
   - Format: `"Rank 1: User1 - 27.5 lbs"`, `"Rank 2: User2 - 7.2 lbs"`
   - Handles ties by comparing timestamps of last verified action
   - Includes `last_update_timestamp` in response
   - Precision: 2 decimal points
   - Real-time updates on each new verified action

2. **`getActiveUsersCount()`**
   - Returns count of users with at least 1 verified action
   - Display: `"Total Active Users: 2"`

3. **`getGlobalTotalEmissions()`**
   - Returns global total from `global_emissions.total_lbs_saved`
   - Formula: `SUM(user_stats.total_emissions_lbs) = global_emissions.total_lbs_saved`
   - Example: `"User1: 27.5 lbs + User2: 7.2 lbs = Global: 34.7 lbs"`
   - Precision: 2 decimal points

4. **`performSyncCheck()`**
   - Validates that `global_emissions.total_lbs_saved = SUM(user_stats.total_emissions_lbs)`
   - Automatically fixes inconsistencies
   - Logs mismatch and triggers auto-resync of global totals
   - Alert channel: System admin or monitoring dashboard
   - Returns sync status with discrepancy amount
   - Precision: 2 decimal points

5. **`runHourlySyncCheck()`**
   - Runs hourly sync validation
   - Can be called by cron job or scheduled task

### `src/services/syncScheduler.ts`

Utility functions for setting up hourly sync checks:

1. **`setupClientSideSyncCheck()`** - For testing/development (not recommended for production)
2. **`triggerSyncCheck()`** - Manual trigger for sync check
3. **`PG_CRON_SETUP_SQL`** - SQL script for setting up pg_cron

### `src/services/api/globalApi.ts`

API-like service functions matching expected endpoints:

1. **`getGlobalTotalApi()`** - `/api/global/total`
   - Returns global total with example breakdown
   - Includes formula, unit, and last_update_timestamp

2. **`getLeaderboardApi(limit)`** - `/api/leaderboard`
   - Returns leaderboard entries with all required fields
   - Includes user_id, username, total_emissions_lbs, rank, last_update_timestamp

3. **`getActiveUsersApi()`** - `/api/users/active`
   - Returns active users count with display format
   - Format: "Total Active Users: {count}"

4. **`performSyncCheckApi()`** - `/api/sync/check`
   - Performs sync check validation
   - Logs mismatch and triggers auto-resync
   - Returns alert channel information

5. **`getGlobalOverviewApi()`** - `/api/global/overview`
   - Combined overview of all global stats
   - Returns global total, leaderboard, active users, and sync status

## Usage Examples

### Get Leaderboard

```typescript
import { getLeaderboard, formatLeaderboardEntry } from './services/leaderboard';

// Get top 10 users
const leaderboard = await getLeaderboard(10);

// Format for display
leaderboard.forEach(entry => {
  console.log(formatLeaderboardEntry(entry));
  // Output: "Rank 1: User1 - 27 lbs"
});
```

### Get Active Users Count

```typescript
import { getActiveUsersCount } from './services/leaderboard';

const activeUsers = await getActiveUsersCount();
console.log(`Total Active Users: ${activeUsers}`);
```

### Get Global Total

```typescript
import { getGlobalTotalEmissions } from './services/leaderboard';

const globalTotal = await getGlobalTotalEmissions();
console.log(`Global Total: ${globalTotal} lbs`);
```

### Run Sync Check

```typescript
import { performSyncCheck } from './services/leaderboard';

const result = await performSyncCheck();
if (!result.in_sync) {
  console.warn('Inconsistency found and fixed:', result);
}
```

## Setting Up Hourly Sync Check

### Option 1: Using pg_cron (Recommended)

Run this SQL in Supabase SQL Editor:

```sql
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly sync check
SELECT cron.schedule(
  'hourly-sync-check',
  '0 * * * *',  -- Every hour at minute 0
  'SELECT hourly_sync_check();'
);
```

### Option 2: Using Supabase Edge Functions

Create an Edge Function that calls `hourly_sync_check()` and set up a scheduled trigger.

### Option 3: External Cron Service

Set up a scheduled task (e.g., GitHub Actions, Vercel Cron) that calls:
- API endpoint that triggers `runHourlySyncCheck()`
- Or directly calls the Supabase RPC function

### Option 4: Client-Side (Testing Only)

```typescript
import { setupClientSideSyncCheck } from './services/syncScheduler';

// Set up hourly sync check (for testing only)
const cleanup = setupClientSideSyncCheck(
  (result) => console.log('Sync check:', result),
  (error) => console.error('Sync check error:', error)
);

// Cleanup when done
// cleanup();
```

## Real-Time Updates

The leaderboard and global totals update in real-time when:
- A new action is verified (via database trigger)
- The trigger automatically updates `user_stats` and `global_emissions`
- Frontend can subscribe to changes using Supabase Realtime

## Validation

The sync check ensures:
- `global_emissions.total_lbs_saved = SUM(user_stats.total_emissions_lbs)`
- If inconsistency is found, it's automatically fixed
- Hourly cron job runs validation to catch any edge cases

## Database Trigger Flow

1. User action is verified: `user_actions.verified = TRUE`
2. Trigger fires: `global_sync_trigger`
3. Updates `user_stats.total_emissions_lbs += emissions_saved_lbs`
4. Updates `global_emissions.total_lbs_saved += emissions_saved_lbs`
5. Both updates happen atomically in a single transaction

## Notes

- All emissions are stored and calculated in pounds (lbs)
- The trigger ensures real-time updates on each verified action
- The sync check validates consistency hourly
- Leaderboard is ordered by `total_emissions_lbs DESC`
- Active users are those with at least 1 verified action

