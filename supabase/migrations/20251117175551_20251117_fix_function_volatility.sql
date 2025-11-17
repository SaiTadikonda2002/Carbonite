/*
  # Fix Function Volatility

  Trigger functions that perform INSERT/UPDATE operations must be VOLATILE,
  not IMMUTABLE. Only utility functions that just read data can be IMMUTABLE.

  Changes:
  - sync_user_stats_on_action_insert: VOLATILE (performs INSERT/UPDATE)
  - sync_global_emissions_on_stats_update: VOLATILE (performs UPDATE)
  - get_user_total: STABLE (only reads, no writes)
  - get_global_total: STABLE (only reads, no writes)
  - get_leaderboard_simple: STABLE (only reads, no writes)
*/

DROP FUNCTION IF EXISTS sync_user_stats_on_action_insert() CASCADE;
CREATE OR REPLACE FUNCTION sync_user_stats_on_action_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_lbs NUMERIC(18,6);
BEGIN
  IF NEW.custom_emissions_saved IS NOT NULL AND NEW.custom_emissions_saved > 0 THEN
    v_lbs := NEW.custom_emissions_saved;
  ELSIF NEW.action_template_id IS NOT NULL THEN
    SELECT COALESCE(emissions_saved * 2.20462, 0) INTO v_lbs
    FROM action_templates
    WHERE id = NEW.action_template_id;
  ELSE
    v_lbs := 0;
  END IF;
  
  IF v_lbs > 0 THEN
    INSERT INTO user_stats (user_id, total_lbs, total_emissions_lbs, action_count)
    VALUES (NEW.user_id, v_lbs, v_lbs, 1)
    ON CONFLICT (user_id) DO UPDATE
    SET 
      total_lbs = user_stats.total_lbs + v_lbs,
      total_emissions_lbs = user_stats.total_emissions_lbs + v_lbs,
      action_count = user_stats.action_count + 1,
      last_updated = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public;

CREATE TRIGGER trigger_sync_user_stats
  AFTER INSERT ON user_actions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_stats_on_action_insert();

DROP FUNCTION IF EXISTS sync_global_emissions_on_stats_update() CASCADE;
CREATE OR REPLACE FUNCTION sync_global_emissions_on_stats_update()
RETURNS TRIGGER AS $$
DECLARE
  v_diff NUMERIC(18,6);
BEGIN
  v_diff := NEW.total_lbs - COALESCE(OLD.total_lbs, 0);
  
  IF v_diff != 0 THEN
    UPDATE global_emissions
    SET 
      total_lbs = total_lbs + v_diff,
      total_lbs_saved = total_lbs_saved + v_diff,
      total_actions = total_actions + (NEW.action_count - COALESCE(OLD.action_count, 0)),
      last_updated = NOW()
    WHERE id = 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public;

CREATE TRIGGER trigger_sync_global_emissions
  AFTER INSERT OR UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION sync_global_emissions_on_stats_update();

DROP FUNCTION IF EXISTS get_user_total(p_user_id uuid) CASCADE;
CREATE OR REPLACE FUNCTION get_user_total(p_user_id UUID)
RETURNS NUMERIC(18,6) AS $$
BEGIN
  RETURN COALESCE(
    (SELECT total_lbs FROM user_stats WHERE user_id = p_user_id),
    0::NUMERIC(18,6)
  );
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

DROP FUNCTION IF EXISTS get_global_total() CASCADE;
CREATE OR REPLACE FUNCTION get_global_total()
RETURNS NUMERIC(18,6) AS $$
BEGIN
  RETURN COALESCE(
    (SELECT total_lbs_saved FROM global_emissions WHERE id = 1),
    0::NUMERIC(18,6)
  );
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

DROP FUNCTION IF EXISTS get_leaderboard_simple(limit_count integer) CASCADE;
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
  SELECT get_global_total() INTO v_global_total;
  
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
$$ LANGUAGE plpgsql STABLE SET search_path = public;
