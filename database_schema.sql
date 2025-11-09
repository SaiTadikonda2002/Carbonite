-- Database Schema for AI Verification System
-- All emissions stored/calculated/displayed in pounds (lbs) only
--
-- IMPORTANT: To enable real-time updates on Global Impact page:
-- 1. Go to Supabase Dashboard > Database > Replication
-- 2. Enable replication for 'global_emissions' table
-- 3. This allows the frontend to subscribe to UPDATE events
-- 4. If Realtime is not enabled, the page will fall back to polling every 3 seconds

-- Users table
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT,
  password_hash TEXT NOT NULL,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User actions table (logs every action, verified by AI)
CREATE TABLE IF NOT EXISTS user_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  unit TEXT NOT NULL,
  emissions_saved_lbs NUMERIC(14,4) NOT NULL CHECK (emissions_saved_lbs >= 0),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_verified ON user_actions(verified);
CREATE INDEX IF NOT EXISTS idx_user_actions_created_at ON user_actions(created_at);

-- User stats table (aggregated per-user totals)
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  total_emissions_lbs NUMERIC(16,4) NOT NULL DEFAULT 0,
  monthly_lbs JSONB NOT NULL DEFAULT '{}'::JSONB,
  yearly_lbs JSONB NOT NULL DEFAULT '{}'::JSONB,
  action_count INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Global emissions table (single row tracking worldwide total)
CREATE TABLE IF NOT EXISTS global_emissions (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_lbs_saved NUMERIC(20,4) NOT NULL DEFAULT 0,
  total_actions BIGINT NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initialize global_emissions if empty
INSERT INTO global_emissions (id, total_lbs_saved, total_actions)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Database trigger: Automatically syncs to global_emissions when action is verified
CREATE OR REPLACE FUNCTION global_sync_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when verified changes from false to true
  IF NEW.verified = TRUE AND (OLD.verified IS NULL OR OLD.verified = FALSE) THEN
    -- Update user_stats
    INSERT INTO user_stats (user_id, total_emissions_lbs, action_count, last_updated)
    VALUES (NEW.user_id, NEW.emissions_saved_lbs, 1, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET 
      total_emissions_lbs = user_stats.total_emissions_lbs + NEW.emissions_saved_lbs,
      action_count = user_stats.action_count + 1,
      last_updated = NOW();
    
    -- Update global_emissions (atomic transaction)
    UPDATE global_emissions
    SET 
      total_lbs_saved = total_lbs_saved + NEW.emissions_saved_lbs,
      total_actions = total_actions + 1,
      last_updated = NOW()
    WHERE id = 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS global_sync_trigger ON user_actions;
CREATE TRIGGER global_sync_trigger
  AFTER UPDATE ON user_actions
  FOR EACH ROW
  WHEN (NEW.verified = TRUE AND (OLD.verified IS NULL OR OLD.verified = FALSE))
  EXECUTE FUNCTION global_sync_trigger_function();

-- Consistency check view: Validates that global_emissions.total_lbs_saved = SUM(user_stats.total_emissions_lbs)
CREATE OR REPLACE VIEW consistency_check AS
SELECT 
  (SELECT COALESCE(SUM(total_emissions_lbs), 0) FROM user_stats) AS user_stats_sum_lbs,
  (SELECT total_lbs_saved FROM global_emissions WHERE id = 1) AS global_total_lbs,
  (SELECT COALESCE(SUM(total_emissions_lbs), 0) FROM user_stats) = 
    (SELECT total_lbs_saved FROM global_emissions WHERE id = 1) AS in_sync;

-- Function to validate and fix sync between user_stats and global_emissions
CREATE OR REPLACE FUNCTION sync_global_emissions_from_user_stats()
RETURNS TABLE(
  was_in_sync BOOLEAN,
  user_stats_sum NUMERIC,
  global_total NUMERIC,
  fixed BOOLEAN
) AS $$
DECLARE
  stats_sum NUMERIC;
  global_val NUMERIC;
  is_synced BOOLEAN;
BEGIN
  -- Calculate sum from user_stats
  SELECT COALESCE(SUM(total_emissions_lbs), 0) INTO stats_sum FROM user_stats;
  
  -- Get current global total
  SELECT total_lbs_saved INTO global_val FROM global_emissions WHERE id = 1;
  
  -- Check if in sync
  is_synced := (stats_sum = global_val);
  
  -- If not in sync, fix it
  IF NOT is_synced THEN
    UPDATE global_emissions
    SET 
      total_lbs_saved = stats_sum,
      last_updated = NOW()
    WHERE id = 1;
  END IF;
  
  -- Return result
  RETURN QUERY SELECT is_synced, stats_sum, global_val, NOT is_synced;
END;
$$ LANGUAGE plpgsql;

-- Function to get active users count (users with at least 1 verified action)
CREATE OR REPLACE FUNCTION get_active_users_count()
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(DISTINCT user_id) 
    FROM user_actions 
    WHERE verified = TRUE
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get leaderboard (users ordered by total_emissions_lbs)
-- Handles ties by comparing timestamps of last verified action
CREATE OR REPLACE FUNCTION get_leaderboard(limit_count INTEGER DEFAULT 100)
RETURNS TABLE(
  rank INTEGER,
  user_id UUID,
  username TEXT,
  total_emissions_lbs NUMERIC,
  action_count INTEGER,
  last_update_timestamp TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH ranked_users AS (
    SELECT 
      us.user_id,
      u.username,
      us.total_emissions_lbs,
      us.action_count,
      us.last_updated AS last_update_timestamp,
      -- Get the most recent verified action timestamp for tie-breaking
      COALESCE(
        (SELECT MAX(ua.verified_at) 
         FROM user_actions ua 
         WHERE ua.user_id = us.user_id AND ua.verified = TRUE),
        us.last_updated
      ) AS last_verified_action_at
    FROM user_stats us
    JOIN users u ON u.user_id = us.user_id
    WHERE us.total_emissions_lbs > 0
  )
  SELECT 
    ROW_NUMBER() OVER (
      ORDER BY 
        ranked_users.total_emissions_lbs DESC,
        ranked_users.last_verified_action_at DESC
    )::INTEGER AS rank,
    ranked_users.user_id,
    ranked_users.username,
    ROUND(ranked_users.total_emissions_lbs::NUMERIC, 2) AS total_emissions_lbs,
    ranked_users.action_count,
    ranked_users.last_update_timestamp
  FROM ranked_users
  ORDER BY 
    ranked_users.total_emissions_lbs DESC,
    ranked_users.last_verified_action_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function for hourly sync check (can be called by pg_cron or external scheduler)
-- Action on discrepancy: Log mismatch and trigger auto-resync of global totals
-- Alert channel: System admin or monitoring dashboard
CREATE OR REPLACE FUNCTION hourly_sync_check()
RETURNS JSONB AS $$
DECLARE
  check_result RECORD;
  result JSONB;
  discrepancy NUMERIC;
BEGIN
  -- Run sync check
  SELECT * INTO check_result FROM sync_global_emissions_from_user_stats();
  
  -- Calculate discrepancy if any
  discrepancy := ABS(check_result.user_stats_sum - check_result.global_total);
  
  -- Build result JSON with precision up to 2 decimal points
  result := jsonb_build_object(
    'timestamp', NOW(),
    'was_in_sync', check_result.was_in_sync,
    'user_stats_sum', ROUND(check_result.user_stats_sum::NUMERIC, 2),
    'global_total', ROUND(check_result.global_total::NUMERIC, 2),
    'discrepancy', ROUND(discrepancy::NUMERIC, 2),
    'fixed', check_result.fixed,
    'in_sync', (ROUND(check_result.user_stats_sum::NUMERIC, 2) = ROUND(check_result.global_total::NUMERIC, 2)),
    'alert_channel', 'System admin or monitoring dashboard'
  );
  
  -- Log mismatch if there was an issue
  -- In production, this would be sent to monitoring dashboard or alert system
  IF NOT check_result.was_in_sync THEN
    RAISE WARNING 'Sync check found inconsistency: user_stats_sum=%, global_total=%, discrepancy=%, fixed=%', 
      ROUND(check_result.user_stats_sum::NUMERIC, 2),
      ROUND(check_result.global_total::NUMERIC, 2),
      ROUND(discrepancy::NUMERIC, 2),
      check_result.fixed;
    
    -- Optional: Insert into audit log table if it exists
    -- INSERT INTO sync_check_log (timestamp, was_in_sync, user_stats_sum, global_total, discrepancy, fixed)
    -- VALUES (NOW(), check_result.was_in_sync, check_result.user_stats_sum, check_result.global_total, discrepancy, check_result.fixed);
  END IF;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Optional: Set up pg_cron for hourly sync check (requires pg_cron extension)
-- Uncomment if pg_cron is available in your Supabase instance:
-- SELECT cron.schedule('hourly-sync-check', '0 * * * *', 'SELECT hourly_sync_check();');

-- Enable Row Level Security (RLS) if needed
-- ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE global_emissions ENABLE ROW LEVEL SECURITY;

