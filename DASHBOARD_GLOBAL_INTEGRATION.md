# Dashboard and Global Impact Integration

## Overview

This document describes the integration between the User Dashboard and Global Impact pages, implementing a comprehensive climate action tracking system similar to cooltheglobe.org.

## Architecture

### Database Schema Integration

The integration uses a comprehensive database schema with the following key tables:

1. **user_statistics** - Pre-aggregated user statistics for fast dashboard queries
   - `total_co2_saved_kg` - Total CO₂ saved by user (in kg)
   - `current_month_co2_saved` - Monthly CO₂ saved
   - `current_year_co2_saved` - Yearly CO₂ saved
   - `total_actions_count` - Total number of actions logged
   - `streak_days` - Current streak of consecutive days with actions
   - `last_action_date` - Date of last action

2. **global_statistics** - Single-row table with real-time global metrics
   - `total_users` - Total number of active users
   - `total_co2_saved_kg` - Total CO₂ saved globally (in kg)
   - `total_actions_count` - Total actions logged globally
   - `countries_count` - Number of countries represented

3. **user_action_logs** - Main transaction table storing every action
   - Links to predefined actions and users
   - Stores quantity, CO₂ saved, and metadata

4. **leaderboards** - Cached rankings for different periods and scopes
   - Supports: all_time, yearly, monthly, weekly
   - Supports: global, country, organization scopes

### Service Layer

**`src/services/climateStats.ts`** - New comprehensive service layer that:
- Queries new schema tables (`user_statistics`, `global_statistics`, `leaderboards`)
- Falls back to existing tables (`user_stats`, `global_emissions`, `user_actions`) for backward compatibility
- Handles unit conversions (kg ↔ lbs)
- Provides leaderboard queries with period filtering

## Dashboard Page (`src/pages/Dashboard.tsx`)

### Features

1. **Personal Statistics Cards**
   - Total Impact (with global rank)
   - Streak (days in a row)
   - This Month (CO₂ saved and actions)
   - This Year (CO₂ saved with goal tracking)

2. **Global Community Impact Card**
   - Shows user's contribution percentage
   - Displays global total CO₂ saved
   - Shows total users and actions
   - Links to Global Impact page

3. **Real-time Updates**
   - Subscribes to `user_statistics` table changes
   - Subscribes to `global_statistics` table changes
   - Automatically refreshes when data changes

4. **Data Sources**
   - Primary: New schema (`user_statistics`, `global_statistics`)
   - Fallback: Existing schema (`user_stats`, `global_emissions`)
   - Calculated: From `user_actions` if tables don't exist

### Key Metrics Displayed

- **Total CO₂ Saved**: User's lifetime impact (lbs and kg)
- **Global Rank**: User's position on all-time leaderboard
- **Monthly Progress**: Current month's CO₂ saved
- **Yearly Progress**: Current year's CO₂ saved
- **Streak**: Consecutive days with actions
- **Global Total**: Community-wide CO₂ saved
- **Contribution %**: User's share of global impact

## Global Impact Page (`src/pages/GlobalImpact.tsx`)

### Features

1. **Global Statistics Dashboard**
   - Total CO₂ saved globally (lbs and kg)
   - Total active users
   - Total actions logged
   - Countries represented
   - Tree equivalent calculations

2. **Live Activity Feed**
   - Real-time feed of all user actions
   - Filters: time range, category, country
   - Shows username, action, CO₂ saved, timestamp
   - Auto-updates via Supabase real-time subscriptions

3. **Top Contributors Leaderboard**
   - Period filters: All-time, Yearly, Monthly, Weekly
   - Shows rank, username, CO₂ saved, action count
   - Updates in real-time

4. **Milestone Progress**
   - Visual progress bar to next milestone
   - Shows current milestone achievement
   - Displays progress percentage

5. **Impact Equivalents**
   - Trees planted equivalent
   - Car-free days
   - Flights offset
   - Homes powered (days)

### Data Sources

- Primary: `global_statistics` table (single row, fast query)
- Leaderboard: `leaderboards` table (pre-calculated rankings)
- Activity Feed: `user_action_logs` or `user_actions` (fallback)
- Real-time: Supabase subscriptions on `user_actions` table

## Integration Points

### 1. Shared Data Services

Both pages use `src/services/climateStats.ts` for:
- User statistics queries
- Global statistics queries
- Leaderboard queries with period filtering
- Unit conversions (kg ↔ lbs)

### 2. Real-time Synchronization

- Dashboard subscribes to user-specific updates
- Global Impact subscribes to all user updates
- Both use Supabase real-time subscriptions
- Fallback polling every 5 seconds if subscriptions fail

### 3. Consistent Metrics

- Both pages display CO₂ in both lbs and kg
- Both use same tree equivalent calculations
- Both show consistent global totals
- Both use same leaderboard data source

### 4. Navigation Flow

- Dashboard shows user's contribution to global total
- Dashboard links to Global Impact page for details
- Global Impact shows where user ranks globally
- Both pages accessible via main navigation menu

## Data Flow

### When User Logs an Action

1. Action inserted into `user_action_logs` (or `user_actions`)
2. Database trigger updates `user_statistics`:
   - Increments `total_co2_saved_kg`
   - Updates `current_month_co2_saved` if within current month
   - Updates `current_year_co2_saved` if within current year
   - Increments `total_actions_count`
   - Updates `streak_days`
   - Updates `last_action_date`

3. Database trigger updates `global_statistics`:
   - Increments `total_co2_saved_kg`
   - Increments `total_actions_count`

4. Background job recalculates `leaderboards` table (hourly)

5. Real-time subscriptions notify:
   - Dashboard (user-specific updates)
   - Global Impact (all user updates)

6. Both pages refresh automatically

### Dashboard Query Flow

1. Load `user_statistics` for current user
2. Load `global_statistics` (single row)
3. Load leaderboard to find user's rank
4. Load recent actions for activity feed
5. Convert kg to lbs for display
6. Calculate contribution percentage

### Global Impact Query Flow

1. Load `global_statistics` (single row, cached)
2. Load leaderboard for selected period
3. Load recent action logs (all users)
4. Apply filters (time, category, country)
5. Calculate milestones and equivalents

## Performance Optimizations

1. **Pre-aggregation**: `user_statistics` and `global_statistics` tables avoid expensive JOINs
2. **Caching**: Global statistics cached in Redis (30s TTL) - to be implemented
3. **Indexing**: Composite indexes on frequently queried columns
4. **Partitioning**: `user_action_logs` partitioned by date (monthly) - to be implemented
5. **Read Replicas**: Separate read replicas for dashboard queries - to be implemented

## Backward Compatibility

The integration maintains full backward compatibility:

- Falls back to `user_stats` if `user_statistics` doesn't exist
- Falls back to `global_emissions` if `global_statistics` doesn't exist
- Falls back to `user_actions` if `user_action_logs` doesn't exist
- Calculates statistics from source tables if aggregated tables don't exist

## Future Enhancements

1. **Achievement System**: Integrate `achievements` and `user_achievements` tables
2. **Organizations**: Add organization/team features
3. **Competitions**: Add challenge/competition features
4. **Country Leaderboards**: Filter leaderboards by country
5. **Weekly Statistics**: Add weekly aggregation to `user_statistics`
6. **Advanced Analytics**: Charts and graphs for trends
7. **Export Data**: Allow users to export their statistics

## Testing

To test the integration:

1. **Dashboard**:
   - Verify user statistics load correctly
   - Verify global statistics display
   - Verify rank calculation
   - Verify real-time updates when logging actions

2. **Global Impact**:
   - Verify global statistics load
   - Verify leaderboard with different periods
   - Verify activity feed updates
   - Verify filters work correctly

3. **Integration**:
   - Verify both pages show consistent global totals
   - Verify user's contribution percentage matches
   - Verify navigation between pages works
   - Verify real-time updates propagate to both pages

## Database Migration

To migrate to the new schema:

1. Create new tables: `user_statistics`, `global_statistics`, `leaderboards`, `user_action_logs`
2. Create database triggers to auto-update aggregated tables
3. Backfill data from existing `user_actions` table
4. Set up background jobs for leaderboard recalculation
5. Enable Supabase real-time on relevant tables

See the provided SQL schema in the user's prompt for complete table definitions and triggers.

