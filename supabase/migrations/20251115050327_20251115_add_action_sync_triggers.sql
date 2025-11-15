/*
  # Add Triggers to Synchronize User Stats and Global Emissions

  1. Triggers
    - Create trigger to sync user_stats when user_actions are inserted
    - Create trigger to sync global_emissions when user_stats are updated
  
  2. Functions
    - sync_user_stats_on_action_insert: Updates user_stats.total_lbs on action insert
    - sync_global_emissions_on_stats_update: Updates global_emissions.total_lbs_saved on stats update
*/

-- Function to sync user_stats when action is inserted
CREATE OR REPLACE FUNCTION sync_user_stats_on_action_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update user_stats with the new action's emissions
  INSERT INTO user_stats (user_id, total_lbs, action_count, last_updated)
  VALUES (
    NEW.user_id,
    COALESCE(NEW.custom_emissions_saved, NEW.emissions_saved_lbs, 0),
    1,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_lbs = user_stats.total_lbs + COALESCE(NEW.custom_emissions_saved, NEW.emissions_saved_lbs, 0),
    action_count = user_stats.action_count + 1,
    last_updated = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user_actions insert
DROP TRIGGER IF EXISTS trigger_sync_user_stats_on_action_insert ON user_actions;
CREATE TRIGGER trigger_sync_user_stats_on_action_insert
AFTER INSERT ON user_actions
FOR EACH ROW
EXECUTE FUNCTION sync_user_stats_on_action_insert();

-- Function to sync global_emissions when user_stats is updated
CREATE OR REPLACE FUNCTION sync_global_emissions_on_stats_update()
RETURNS TRIGGER AS $$
DECLARE
  v_diff NUMERIC;
BEGIN
  -- Calculate the difference and update global_emissions
  v_diff := NEW.total_lbs - COALESCE(OLD.total_lbs, 0);
  
  INSERT INTO global_emissions (id, total_lbs_saved, total_actions, last_updated)
  VALUES (1, v_diff, 0, now())
  ON CONFLICT (id) DO UPDATE SET
    total_lbs_saved = global_emissions.total_lbs_saved + v_diff,
    last_updated = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for user_stats update
DROP TRIGGER IF EXISTS trigger_sync_global_emissions_on_stats_update ON user_stats;
CREATE TRIGGER trigger_sync_global_emissions_on_stats_update
AFTER UPDATE ON user_stats
FOR EACH ROW
EXECUTE FUNCTION sync_global_emissions_on_stats_update();

-- Ensure global_emissions row exists
INSERT INTO global_emissions (id, total_lbs_saved, total_actions, last_updated)
VALUES (1, 0, 0, now())
ON CONFLICT (id) DO NOTHING;
