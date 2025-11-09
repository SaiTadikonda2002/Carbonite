# Production Schema Integration

## Overview

The application now supports a production-grade database schema designed for scale (10M users, 1B events) while maintaining full backward compatibility with previous schemas.

## Schema Evolution

### Production Schema (Current)
- **user_stats_summary** - Pre-aggregated user stats with ranks
- **global_stats_rollup** - Key-based rollups (global_all_time, country_US_2025, etc.)
- **user_action_events** - Partitioned event table with idempotency
- **leaderboard_snapshots** - Pre-calculated leaderboard snapshots

### Previous Schema (Compatible)
- **user_statistics** - Pre-aggregated user stats
- **global_statistics** - Single-row global stats
- **user_action_logs** - Action log table
- **leaderboards** - Cached leaderboard rankings

### Legacy Schema (Fallback)
- **user_stats** - Basic user stats
- **global_emissions** - Global emissions total
- **user_actions** - User actions table

## Production Schema Details

### user_stats_summary
```sql
CREATE TABLE user_stats_summary (
  user_id UUID PRIMARY KEY,
  total_co2_saved_kg NUMERIC(12,2),
  total_actions INT,
  current_month_co2 NUMERIC(10,2),
  current_year_co2 NUMERIC(10,2),
  streak_days INT,
  last_action_date DATE,
  rank_global INT,
  rank_country INT,
  updated_at TIMESTAMPTZ
);
```

**Key Features:**
- Includes pre-calculated ranks (global and country)
- Updated by async worker consuming event stream
- 5-minute batch updates
- Indexed on `total_co2_saved_kg DESC` and `rank_country`

### global_stats_rollup
```sql
CREATE TABLE global_stats_rollup (
  rollup_key VARCHAR PRIMARY KEY, -- 'global_all_time', 'country_US_2025', etc.
  total_users INT,
  total_co2_saved_kg NUMERIC(15,2),
  total_actions BIGINT,
  computed_at TIMESTAMPTZ
);
```

**Key Features:**
- Key-based rollups for flexible querying
- Supports global, country, and time-based rollups
- Updated by background job every 1 minute
- Cached in Redis with 30s TTL

**Rollup Keys:**
- `global_all_time` - All-time global stats
- `country_US_2025` - US stats for 2025
- `country_GB_2025` - UK stats for 2025
- etc.

### user_action_events
```sql
CREATE TABLE user_action_events (
  event_id BIGSERIAL,
  user_id UUID,
  action_id INT,
  quantity NUMERIC(10,2),
  co2_saved_kg NUMERIC(10,4),
  event_timestamp TIMESTAMPTZ,
  action_date DATE,
  idempotency_key UUID UNIQUE
) PARTITION BY RANGE (action_date);
```

**Key Features:**
- Partitioned by date (monthly partitions)
- Idempotency via `idempotency_key` UNIQUE constraint
- Archive >2yr to S3
- Indexed on `(user_id, action_date DESC)` and `(event_timestamp DESC)`
- Size: 1B rows = ~50GB compressed

### leaderboard_snapshots
```sql
CREATE TABLE leaderboard_snapshots (
  scope VARCHAR, -- 'global', 'country', 'organization'
  scope_value VARCHAR, -- 'US', 'org_123', etc.
  period VARCHAR, -- 'all_time', 'yearly', 'monthly', 'weekly'
  user_id UUID,
  rank INT,
  co2_saved_kg NUMERIC(12,2),
  snapshot_time TIMESTAMPTZ,
  UNIQUE(scope, scope_value, period, rank)
);
```

**Key Features:**
- Pre-calculated snapshots (top 10K per scope/period)
- Generated hourly by background job
- Cached in Redis with 5min TTL
- Supports multiple scopes and periods

## Data Flow

### Write Path (Production)
1. API receives action → INSERT into `user_action_events` with `idempotency_key`
2. Publish event to Kafka
3. Stream processor (Kafka Streams) consumes events
4. Updates `user_stats_summary` (async, 5min batches)
5. Updates `global_stats_rollup` (async, 1min batches)
6. Checks achievement criteria
7. Hourly job generates `leaderboard_snapshots`

### Read Path (Production)
1. Dashboard/Global Impact queries hit Redis cache (60s TTL)
2. Cache miss → Query `user_stats_summary` or `leaderboard_snapshots`
3. Response time: <200ms p95 latency
4. Fallback to previous/legacy schemas if production tables don't exist

## Service Layer Integration

The `climateStats.ts` service automatically detects and uses the best available schema:

```typescript
// Priority order for each query type:

// User Statistics:
1. user_stats_summary (production - includes ranks)
2. user_statistics (previous)
3. user_stats (legacy)
4. Calculated from user_actions

// Global Statistics:
1. global_stats_rollup (production - key-based)
2. global_statistics (previous)
3. global_emissions (legacy)
4. Calculated from user_stats

// Leaderboards:
1. leaderboard_snapshots (production - pre-calculated)
2. leaderboards (previous)
3. Calculated from user_stats_summary/user_statistics

// Action Logs:
1. user_action_events (production - partitioned)
2. user_action_logs (previous)
3. user_actions (legacy)
```

## Performance Optimizations

### Caching Strategy
- **L1**: App memory cache (10K users, 30s TTL)
- **L2**: Redis cache (100K users, 60-300s TTL)
- **L3**: CDN cache (1hr TTL)

### Scaling
- **Write**: 1 master database
- **Read**: 3 read replicas
- **Connection Pooling**: PgBouncer
- **Sharding**: `user_action_events` by `user_id` if >5TB

### Database Optimizations
- **Partitioning**: `user_action_events` by date (monthly)
- **Indexing**: BRIN indexes on timestamps
- **Archiving**: Events >2yr moved to S3
- **Prepared Statements**: All queries use prepared statements

## Capacity Targets

- **Writes**: 10K writes/sec
- **Reads**: 100K reads/sec
- **Latency**: <200ms p95
- **Uptime**: 99.99%

## Migration Path

### Phase 1: Deploy Production Schema (Parallel)
1. Create production tables alongside existing tables
2. Set up Kafka event streaming
3. Deploy async workers for aggregation
4. Deploy background jobs for leaderboards

### Phase 2: Dual Write (Both Schemas)
1. Write to both production and previous schemas
2. Verify data consistency
3. Monitor performance

### Phase 3: Switch Reads (Gradual)
1. Update service layer to prefer production schema
2. Monitor for issues
3. Keep previous schema as fallback

### Phase 4: Deprecate Previous Schema
1. Stop writing to previous schema
2. Archive old data
3. Remove previous schema tables (optional)

## Backward Compatibility

The service layer maintains full backward compatibility:

- **Automatic Detection**: Detects which schema is available
- **Graceful Fallback**: Falls back to previous/legacy schemas
- **No Breaking Changes**: Existing code continues to work
- **Gradual Migration**: Can migrate incrementally

## Testing

### Schema Detection Test
```typescript
// Test that service detects production schema
const stats = await getUserStatistics(userId);
// Should use user_stats_summary if available

// Test fallback to previous schema
// Remove production tables, should use user_statistics

// Test fallback to legacy schema
// Remove previous tables, should use user_stats
```

### Performance Test
- Verify <200ms p95 latency
- Test with 10K concurrent users
- Verify Redis cache hit rate >90%
- Test leaderboard generation time

## Monitoring

### Key Metrics
- Cache hit rate (target: >90%)
- Query latency p95 (target: <200ms)
- Database connection pool usage
- Kafka lag (target: <1min)
- Leaderboard generation time (target: <5min)

### Alerts
- Cache hit rate <80%
- Query latency p95 >500ms
- Database connection pool >80% full
- Kafka lag >5min
- Leaderboard generation >10min

## Future Enhancements

1. **Real-time Aggregation**: Stream processing for sub-second updates
2. **Materialized Views**: Pre-calculate complex queries
3. **Read Replicas**: Geographic distribution
4. **Sharding**: Horizontal scaling for user_action_events
5. **Compression**: Columnar storage for analytics

