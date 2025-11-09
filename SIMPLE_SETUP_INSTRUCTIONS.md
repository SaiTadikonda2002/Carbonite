# Simple Global Emission Tracking - Setup Instructions

## Quick Setup (3 Steps)

### Step 1: Run Database Migration
Execute `setup_global_emissions.sql` in your Supabase SQL Editor.

This will:
- Create `user_stats` table (stores per-user totals)
- Create `global_emissions` table (stores global total)
- Create trigger to auto-update totals when actions are logged
- Backfill existing data

### Step 2: Verify Tables Created
Check that these tables exist:
- `user_stats` (user_id, total_lbs, last_updated)
- `global_emissions` (id, total_lbs, last_updated)

### Step 3: Test
The Dashboard will now automatically:
- Show user total: `{user_total} lbs`
- Show global total: `Global: {global_total} lbs`

## How It Works

1. **When user logs action:**
   - Action is inserted into `user_actions` table
   - Trigger automatically:
     - Updates `user_stats.total_lbs` (adds action's lbs)
     - Updates `global_emissions.total_lbs` (adds action's lbs)

2. **Dashboard displays:**
   - User total from `user_stats.total_lbs`
   - Global total from `global_emissions.total_lbs`

## Example

**User1 logs 10.2 lbs:**
- `user_stats` for user1: `10.2 lbs`
- `global_emissions.total_lbs`: `10.2 lbs`
- Dashboard shows: `10.2 lbs (Global: 10.2 lbs)`

**User2 logs 10.3 lbs:**
- `user_stats` for user2: `10.3 lbs`
- `global_emissions.total_lbs`: `20.5 lbs` (10.2 + 10.3)
- User1's dashboard shows: `10.2 lbs (Global: 20.5 lbs)`
- User2's dashboard shows: `10.3 lbs (Global: 20.5 lbs)`

**User3 logs 10.4 lbs:**
- `user_stats` for user3: `10.4 lbs`
- `global_emissions.total_lbs`: `30.9 lbs` (10.2 + 10.3 + 10.4)
- All dashboards show: `{user_total} lbs (Global: 30.9 lbs)`

## Files

- `setup_global_emissions.sql` - Run this once to set up everything
- `database_working.sql` - Alternative setup (if needed)
- `src/services/simpleEmissionLogging.ts` - Service functions
- `src/pages/Dashboard.tsx` - Already updated to show both totals

## That's It!

After running the SQL migration, the Dashboard will automatically show both user total and global total. The trigger handles all updates automatically.

