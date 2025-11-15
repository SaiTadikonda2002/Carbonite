# Technical Implementation Details

## Database Architecture

### Tables Structure

#### 1. profiles
- **Purpose**: User profile information linked to Supabase auth
- **Key Fields**:
  - `id` (UUID): Foreign key to auth.users
  - `full_name`, `username`: User identification
  - `total_points`, `level`: Gamification
  - `current_streak`, `longest_streak`: Activity tracking
  - `household_size`, `baseline_emissions`, `monthly_goal`: User preferences

#### 2. action_templates
- **Purpose**: Pre-defined climate actions
- **Key Fields**:
  - `id` (UUID): Unique action identifier
  - `title`, `category`: Action classification
  - `emissions_saved` (NUMERIC): kg CO₂ saved
  - `difficulty_level`, `time_commitment`, `cost_impact`: User guidance
  - `icon`, `points_reward`: UI and gamification
  - `is_active` (BOOLEAN): Activation control

#### 3. user_actions
- **Purpose**: Log of user's climate actions
- **Key Fields**:
  - `action_id` (UUID): Unique action log entry
  - `user_id` (UUID): Foreign key to users
  - `action_template_id` (UUID): Reference to template
  - `custom_emissions_saved` (NUMERIC): Custom emissions (kg)
  - `logged_at` (TIMESTAMPTZ): When action was logged
  - `verified` (BOOLEAN): Verification status

#### 4. user_stats
- **Purpose**: Pre-aggregated user statistics
- **Key Fields**:
  - `user_id` (UUID): Primary key (one row per user)
  - `total_lbs` (NUMERIC): Cumulative emissions saved (pounds)
  - `action_count` (INT): Total actions logged
  - `monthly_lbs` (JSONB): Monthly breakdown
  - `yearly_lbs` (JSONB): Yearly breakdown

#### 5. global_emissions
- **Purpose**: Global aggregate totals
- **Key Fields**:
  - `id` (INT): Fixed at 1 (single row)
  - `total_lbs_saved` (NUMERIC): Global total emissions saved
  - `total_actions` (BIGINT): Global action count
  - `last_updated` (TIMESTAMPTZ): Last sync timestamp

### Database Triggers

#### Trigger 1: sync_user_stats_on_action_insert
```sql
AFTER INSERT ON user_actions
→ Executes sync_user_stats_on_action_insert()
→ Updates user_stats.total_lbs += new_action.emissions
→ Increments user_stats.action_count
```

**Logic**:
- On INSERT into user_actions
- Add emissions to user's total_lbs
- Increment action count
- Update last_updated timestamp

#### Trigger 2: sync_global_emissions_on_stats_update
```sql
AFTER UPDATE ON user_stats
→ Executes sync_global_emissions_on_stats_update()
→ Updates global_emissions.total_lbs_saved += diff
```

**Logic**:
- On UPDATE to user_stats
- Calculate difference in total_lbs
- Add difference to global total
- Update last_updated timestamp

### Row Level Security Policies

#### profiles table
- SELECT: Authenticated users can view all
- INSERT: Users can insert their own profile
- UPDATE: Users can update their own profile

#### action_templates table
- SELECT: Anyone can view active templates
- No INSERT/UPDATE/DELETE for non-admin

#### user_actions table
- SELECT: Authenticated users can view all
- INSERT: Users can insert their own actions
- UPDATE: Users can update unverified actions

#### user_stats table
- SELECT: Authenticated users can view all
- No direct UPDATE (only via triggers)

#### global_emissions table
- SELECT: Authenticated users can view
- No direct UPDATE (only via triggers)

## Frontend Integration

### Authentication Flow
```
User Registration
  ↓
Supabase Auth.signUp()
  ↓
Create profile record
  ↓
Profile available in context
```

### Data Loading Flow
```
Dashboard Load
  ↓
fetch getUserTotal(userId) → user_stats.total_lbs
fetch getGlobalTotal() → global_emissions.total_lbs_saved
fetch recent actions → user_actions
  ↓
Display statistics
```

### Action Logging Flow
```
User selects action
  ↓
INSERT into user_actions
  ↓
Trigger fires: sync_user_stats_on_action_insert
  ↓
user_stats updated
  ↓
Trigger fires: sync_global_emissions_on_stats_update
  ↓
global_emissions updated
  ↓
Realtime update to dashboard
```

## Data Conversions

### Emissions Calculation
```
Stored: Pounds (lbs)
Display: Pounds and Kilograms (kg)

Formula: 1 lb = 0.453592 kg
Example: 1 kg = 2.20462 lbs
```

### Example: Bike Commute
```
Database stores: 2.5 kg
Conversion: 2.5 * 2.20462 = 5.51155 lbs
Displayed: 5.5 lbs CO₂ saved
```

## Performance Optimizations

### Indexes
- `idx_user_actions_user_id`: Fast user action lookups
- `idx_user_actions_verified`: Filter verified actions
- `idx_user_actions_created_at`: Sort by timestamp
- `idx_action_templates_active`: Filter active templates
- `idx_action_templates_category`: Filter by category

### Query Optimization
- Use `.maybeSingle()` for optional queries
- Grateful fallback when tables don't exist
- Support multiple schema versions
- Batch load related data

## Error Handling

### Service Layer
```typescript
try {
  Query database
} catch {
  Try fallback query
  Return default value if all fail
}
```

### Frontend Components
```typescript
try {
  Load dashboard data
} catch {
  Set safe default values
  Show loading state
}
```

## Security Measures

1. **Authentication**: Supabase Auth with email/password
2. **Authorization**: RLS policies enforce data access
3. **Data Validation**: Check constraints on columns
4. **Input Sanitization**: All user inputs via parameterized queries
5. **Secrets**: Environment variables for API keys

## Scalability Considerations

### Current Implementation
- Single global_emissions row (id=1)
- Works for current scale
- Auto-triggers maintain consistency

### Future Optimization
- Partitioning by date for user_actions
- Caching layer for frequently accessed data
- Read replicas for reporting queries
- Periodic archive of old data

## Monitoring

### Key Metrics
- Total users: COUNT(profiles)
- Total actions: COUNT(user_actions)
- Global emissions: global_emissions.total_lbs_saved
- Consistency: SUM(user_stats.total_lbs) = global_emissions.total_lbs_saved

### Logging
- All triggers log to console in development
- Audit trail in sync_audit_log table
- Timestamp tracking on all tables

## Testing Checklist

- [x] Database tables created
- [x] Triggers configured
- [x] RLS policies applied
- [x] Action templates seeded
- [x] Frontend queries working
- [x] Authentication flow tested
- [x] Build succeeds
- [x] No schema errors at runtime

## Deployment Notes

1. All migrations are idempotent (use IF NOT EXISTS)
2. No data loss from previous schema
3. Backward compatible with existing code
4. Triggers are non-blocking
5. RLS policies are restrictive by default

## Support & Maintenance

### Common Issues & Solutions

**Issue**: Profile not found after signup
**Solution**: Check RLS policies, ensure profile INSERT triggered

**Issue**: Actions not updating global total
**Solution**: Verify triggers are enabled, check trigger logs

**Issue**: Performance degradation
**Solution**: Check table sizes, consider archiving old data

### Monitoring Queries

```sql
-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE tablename IN ('profiles', 'user_actions', 'user_stats', 'global_emissions');

-- Verify consistency
SELECT SUM(total_lbs) as user_stats_sum, total_lbs_saved as global_total
FROM user_stats, global_emissions;

-- Check recent actions
SELECT COUNT(*) FROM user_actions WHERE created_at > NOW() - INTERVAL '1 day';
```

