-- FINAL SIMPLE SOLUTION: Global Emission Tracking
-- Run this SQL in Supabase SQL Editor - it will work with your existing schema
-- 
-- Requirements:
-- 1. All user action logs are added to global_emissions
-- 2. Formula: SUM(user_stats.total_lbs) = global_emissions.total_lbs
-- 3. All users see the same global total on their profile
-- 4. Leaderboard shows users ranked by total_lbs

-- 1. Create user_stats table (stores per-user totals)
-- Column: total_lbs = total_emissions_lbs (for consistency with requirement)
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY,
  total_lbs NUMERIC(18,6) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Also support total_emissions_lbs column name for backward compatibility
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'user_stats' AND column_name = 'total_emissions_lbs') THEN
    ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS total_emissions_lbs NUMERIC(18,6);
  END IF;
END $$;

-- Update total_emissions_lbs to match total_lbs if it exists
UPDATE user_stats SET total_emissions_lbs = total_lbs WHERE total_emissions_lbs IS NULL;

-- 2. Create global_emissions table (stores global total)
-- Support both total_lbs and total_lbs_saved column names
CREATE TABLE IF NOT EXISTS global_emissions (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_lbs NUMERIC(18,6) NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add total_lbs_saved column if it doesn't exist (for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'global_emissions' AND column_name = 'total_lbs_saved') THEN
    ALTER TABLE global_emissions ADD COLUMN IF NOT EXISTS total_lbs_saved NUMERIC(18,6);
  END IF;
END $$;

-- 3. Initialize global_emissions
INSERT INTO global_emissions (id, total_lbs, total_lbs_saved, last_updated)
VALUES (1, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE
SET total_lbs_saved = COALESCE(global_emissions.total_lbs, global_emissions.total_lbs_saved, 0),
    total_lbs = COALESCE(global_emissions.total_lbs, global_emissions.total_lbs_saved, 0);

-- 4. Function to update totals when action is logged
-- This ensures ALL user actions are added to global_emissions
CREATE OR REPLACE FUNCTION update_emission_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_lbs NUMERIC(18,6);
BEGIN
  -- Calculate lbs from action
  -- Priority: custom_emissions_saved > action_template emissions
  IF NEW.custom_emissions_saved IS NOT NULL AND NEW.custom_emissions_saved > 0 THEN
    v_lbs := NEW.custom_emissions_saved;
  ELSIF NEW.action_template_id IS NOT NULL THEN
    -- Get from template (convert kg to lbs)
    SELECT COALESCE((SELECT emissions_saved FROM action_templates WHERE id = NEW.action_template_id), 0) * 2.20462
    INTO v_lbs;
  ELSE
    v_lbs := 0;
  END IF;
  
  -- Update totals if lbs > 0
  IF v_lbs > 0 THEN
    -- Update user_stats (per-user totals)
    INSERT INTO user_stats (user_id, total_lbs, last_updated)
    VALUES (NEW.user_id, v_lbs, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET total_lbs = user_stats.total_lbs + v_lbs,
        last_updated = NOW();
    
    -- Update total_emissions_lbs if column exists (for backward compatibility)
    UPDATE user_stats 
    SET total_emissions_lbs = total_lbs 
    WHERE user_id = NEW.user_id 
      AND (total_emissions_lbs IS NULL OR total_emissions_lbs != total_lbs);
    
    -- Update global_emissions (global total - same for all users)
    -- Formula: SUM(user_stats.total_lbs) = global_emissions.total_lbs
    UPDATE global_emissions
    SET total_lbs = total_lbs + v_lbs,
        total_lbs_saved = COALESCE(total_lbs_saved, 0) + v_lbs,
        last_updated = NOW()
    WHERE id = 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger (updates totals automatically when action is logged)
DROP TRIGGER IF EXISTS trigger_update_emission_totals ON user_actions;
CREATE TRIGGER trigger_update_emission_totals
  AFTER INSERT ON user_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_emission_totals();

-- 6. Backfill existing data
-- Recalculates all totals from source of truth (user_actions table)
CREATE OR REPLACE FUNCTION backfill_totals()
RETURNS VOID AS $$
BEGIN
  -- Calculate user totals from existing actions
  -- Use custom_emissions_saved if available, otherwise use template emissions (kg to lbs)
  WITH user_totals AS (
    SELECT 
      ua.user_id,
      SUM(
        CASE 
          WHEN ua.custom_emissions_saved IS NOT NULL AND ua.custom_emissions_saved > 0 
          THEN ua.custom_emissions_saved
          WHEN ua.action_template_id IS NOT NULL 
          THEN COALESCE((SELECT emissions_saved FROM action_templates WHERE id = ua.action_template_id), 0) * 2.20462
          ELSE 0
        END
      ) AS total
    FROM user_actions ua
    WHERE (ua.custom_emissions_saved IS NOT NULL AND ua.custom_emissions_saved > 0)
       OR ua.action_template_id IS NOT NULL
    GROUP BY ua.user_id
  )
  -- Insert user stats, handling total_emissions_lbs column if it exists
  INSERT INTO user_stats (user_id, total_lbs, last_updated)
  SELECT user_id, total, NOW()
  FROM user_totals
  ON CONFLICT (user_id) DO UPDATE
  SET total_lbs = EXCLUDED.total_lbs,
      last_updated = NOW();
  
  -- Update total_emissions_lbs if column exists
  UPDATE user_stats 
  SET total_emissions_lbs = total_lbs 
  WHERE total_emissions_lbs IS NULL OR total_emissions_lbs != total_lbs;
  
  -- Calculate global total from user_stats
  -- Formula: SUM(user_stats.total_lbs) = global_emissions.total_lbs
  UPDATE global_emissions
  SET total_lbs = (SELECT COALESCE(SUM(total_lbs), 0) FROM user_stats),
      total_lbs_saved = (SELECT COALESCE(SUM(total_lbs), 0) FROM user_stats),
      last_updated = NOW()
  WHERE id = 1;
END;
$$ LANGUAGE plpgsql;

-- 7. Run backfill
SELECT backfill_totals();

-- 8. Helper functions
CREATE OR REPLACE FUNCTION get_user_total(p_user_id UUID)
RETURNS NUMERIC(18,6) AS $$
BEGIN
  RETURN COALESCE(
    (SELECT total_lbs FROM user_stats WHERE user_id = p_user_id),
    (SELECT total_emissions_lbs FROM user_stats WHERE user_id = p_user_id),
    0::NUMERIC(18,6)
  );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_global_total()
RETURNS NUMERIC(18,6) AS $$
BEGIN
  -- Returns the same global total for all users
  -- Formula: SUM(user_stats.total_lbs) = global_emissions.total_lbs
  RETURN COALESCE(
    (SELECT total_lbs FROM global_emissions WHERE id = 1),
    (SELECT total_lbs_saved FROM global_emissions WHERE id = 1),
    0::NUMERIC(18,6)
  );
END;
$$ LANGUAGE plpgsql;

-- 9. Leaderboard function
-- Returns users ranked by total_emissions_lbs (same as total_lbs)
-- Query: SELECT user_id, username, total_emissions_lbs FROM user_stats WHERE total_emissions_lbs > 0 ORDER BY total_emissions_lbs DESC
CREATE OR REPLACE FUNCTION get_leaderboard_simple(limit_count INTEGER DEFAULT 100)
RETURNS TABLE(
  rank INTEGER,
  user_id UUID,
  username TEXT,
  total_emissions_lbs NUMERIC(18,6),
  global_total_lbs NUMERIC(18,6)
) AS $$
DECLARE
  v_global_total NUMERIC(18,6);
BEGIN
  -- Get global total (same for all users)
  SELECT get_global_total() INTO v_global_total;
  
  -- Return leaderboard with global total
  RETURN QUERY
  WITH ranked_users AS (
    SELECT 
      us.user_id,
      COALESCE(p.username, p.full_name, 'Anonymous') AS username,
      COALESCE(us.total_lbs, us.total_emissions_lbs, 0) AS total_lbs
    FROM user_stats us
    LEFT JOIN profiles p ON p.id = us.user_id
    WHERE COALESCE(us.total_lbs, us.total_emissions_lbs, 0) > 0
    ORDER BY COALESCE(us.total_lbs, us.total_emissions_lbs, 0) DESC
    LIMIT limit_count
  )
  SELECT 
    ROW_NUMBER() OVER (ORDER BY ranked_users.total_lbs DESC)::INTEGER AS rank,
    ranked_users.user_id,
    ranked_users.username,
    ranked_users.total_lbs AS total_emissions_lbs,
    v_global_total AS global_total_lbs
  FROM ranked_users
  ORDER BY ranked_users.total_lbs DESC;
END;
$$ LANGUAGE plpgsql;

-- 10. Sync function to ensure consistency
-- Validates: SUM(user_stats.total_lbs) = global_emissions.total_lbs
CREATE OR REPLACE FUNCTION sync_global_from_user_stats()
RETURNS TABLE(
  was_in_sync BOOLEAN,
  user_stats_sum NUMERIC(18,6),
  global_total NUMERIC(18,6),
  fixed BOOLEAN
) AS $$
DECLARE
  v_user_sum NUMERIC(18,6);
  v_global NUMERIC(18,6);
  v_is_synced BOOLEAN;
BEGIN
  -- Calculate sum from user_stats
  SELECT COALESCE(SUM(COALESCE(total_lbs, total_emissions_lbs, 0)), 0)
  INTO v_user_sum
  FROM user_stats;
  
  -- Get current global total
  SELECT COALESCE(total_lbs, total_lbs_saved, 0)
  INTO v_global
  FROM global_emissions
  WHERE id = 1;
  
  -- Check if in sync
  v_is_synced := (v_user_sum = v_global);
  
  -- If not in sync, fix it
  IF NOT v_is_synced THEN
    UPDATE global_emissions
    SET total_lbs = v_user_sum,
        total_lbs_saved = v_user_sum,
        last_updated = NOW()
    WHERE id = 1;
  END IF;
  
  -- Return result
  RETURN QUERY SELECT v_is_synced, v_user_sum, v_global, NOT v_is_synced;
END;
$$ LANGUAGE plpgsql;

