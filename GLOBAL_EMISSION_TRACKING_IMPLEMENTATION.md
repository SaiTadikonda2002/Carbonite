# Global Emission Tracking Implementation

## ✅ Implementation Complete

Global emission tracking has been added to display both user total and global total on every user's dashboard.

## Changes Made

### 1. Dashboard Component (`src/pages/Dashboard.tsx`)

**Updates:**
- ✅ Added `globalTotalLbs` to stats state
- ✅ Fetches global total from `global_emissions` table
- ✅ Fetches user total from `user_stats` table
- ✅ Displays both values on the dashboard

**Display Format:**
- **Total Impact Card**: Shows user total with global total below
  - Format: `{user_total} lbs` with `Global: {global_total} lbs` below
  - Example: `10.2 lbs` with `Global: 30.9 lbs` below

- **Global Community Impact Card**: New prominent card showing:
  - User contribution: `{user_total} lbs`
  - Global total: `{global_total} lbs`
  - Example: "Your contribution: 10.2 lbs" and "30.9 lbs total saved"

## Data Flow

### When User Logs Action:
1. User logs action with emissions (e.g., 10.2 lbs)
2. Database trigger automatically:
   - Updates `user_stats.total_emissions_lbs` (adds 10.2)
   - Updates `global_emissions.total_lbs_saved` (adds 10.2)
3. Dashboard refreshes and shows:
   - User total: 10.2 lbs
   - Global total: 30.9 lbs (if other users have logged actions)

### Example Scenario:

**Initial State:**
- user1: 0 lbs
- user2: 0 lbs
- user3: 0 lbs
- global_emissions.total_lbs_saved: 0 lbs

**After User1 logs 10.2 lbs:**
- user1: 10.2 lbs
- global_emissions.total_lbs_saved: 10.2 lbs
- Dashboard shows: "10.2 lbs" with "Global: 10.2 lbs"

**After User2 logs 10.3 lbs:**
- user1: 10.2 lbs
- user2: 10.3 lbs
- global_emissions.total_lbs_saved: 20.5 lbs
- User1's dashboard shows: "10.2 lbs" with "Global: 20.5 lbs"
- User2's dashboard shows: "10.3 lbs" with "Global: 20.5 lbs"

**After User3 logs 10.4 lbs:**
- user1: 10.2 lbs
- user2: 10.3 lbs
- user3: 10.4 lbs
- global_emissions.total_lbs_saved: 30.9 lbs
- All dashboards show their user total with "Global: 30.9 lbs"

## Database Schema

The global emission tracking uses:
- `user_stats.total_emissions_lbs` - Per-user cumulative total
- `global_emissions.total_lbs_saved` - Global aggregate total
- Database triggers automatically update both when actions are verified

## Precision

- All values stored as `NUMERIC(30,6)` (exact precision, no rounding)
- Displayed with 2 decimal places for readability
- Exact values preserved in database

## Real-Time Updates

- Dashboard fetches global total on load
- Can be enhanced with real-time subscriptions for live updates
- Global total updates automatically via database triggers when any user logs an action

## Files Modified

1. **`src/pages/Dashboard.tsx`**
   - Added global total fetching
   - Added user total from user_stats
   - Updated UI to display both values
   - Added Global Community Impact card

## Display Examples

### Total Impact Card:
```
┌─────────────────────────┐
│  Total Impact           │
│                         │
│  10.20 lbs              │
│  CO₂ saved              │
│  🌍 Global: 30.90 lbs   │
└─────────────────────────┘
```

### Global Community Impact Card:
```
┌─────────────────────────────────────┐
│  🌍 Global Community Impact         │
│                                     │
│  Your contribution: 10.20 lbs       │
│                      30.90          │
│                      lbs total saved│
└─────────────────────────────────────┘
```

---

**Status**: ✅ Complete - Global emission tracking is now visible on every user's dashboard

