/*
  # Complete Climate Action App Setup

  1. Tables
    - profiles: User profiles linked to auth.users
    - action_templates: Pre-defined climate actions
    - user_actions: User's logged actions
    - user_stats: Aggregated user statistics
    - global_emissions: Global aggregated totals
  
  2. Security
    - Enable RLS on all tables
    - Policies for secure data access
  
  3. Functions
    - Automatic sync triggers
    - Helper functions for totals
    - Leaderboard functions
  
  4. Data
    - Seed 10 action templates
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  location TEXT,
  household_size INTEGER DEFAULT 1,
  baseline_emissions NUMERIC(12,2) DEFAULT 0,
  monthly_goal NUMERIC(12,2) DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action templates
CREATE TABLE IF NOT EXISTS action_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  difficulty_level TEXT DEFAULT 'Medium',
  time_commitment TEXT DEFAULT 'Medium',
  cost_impact TEXT DEFAULT 'Low',
  emissions_saved NUMERIC(12,2) NOT NULL DEFAULT 0,
  how_to_guide TEXT,
  tips TEXT,
  icon TEXT,
  points_reward INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User actions
CREATE TABLE IF NOT EXISTS user_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_template_id UUID REFERENCES action_templates(id) ON DELETE SET NULL,
  custom_title TEXT,
  custom_emissions_saved NUMERIC(12,2),
  notes TEXT,
  photo_url TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User stats (aggregated per user)
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_lbs NUMERIC(18,6) DEFAULT 0,
  total_emissions_lbs NUMERIC(18,6) DEFAULT 0,
  action_count INTEGER DEFAULT 0,
  monthly_lbs JSONB DEFAULT '{}'::JSONB,
  yearly_lbs JSONB DEFAULT '{}'::JSONB,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Global emissions (single row)
CREATE TABLE IF NOT EXISTS global_emissions (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_lbs NUMERIC(18,6) DEFAULT 0,
  total_lbs_saved NUMERIC(18,6) DEFAULT 0,
  total_actions BIGINT DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize global_emissions
INSERT INTO global_emissions (id, total_lbs, total_lbs_saved, total_actions)
VALUES (1, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_actions_user_id ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_logged_at ON user_actions(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_total_lbs ON user_stats(total_lbs DESC);
CREATE INDEX IF NOT EXISTS idx_action_templates_category ON action_templates(category);
CREATE INDEX IF NOT EXISTS idx_action_templates_active ON action_templates(is_active);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_emissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for action_templates
CREATE POLICY "Action templates are viewable by everyone" ON action_templates
  FOR SELECT USING (is_active = true);

-- RLS Policies for user_actions
CREATE POLICY "Users can view all actions" ON user_actions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own actions" ON user_actions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own actions" ON user_actions
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for user_stats
CREATE POLICY "User stats are viewable by everyone" ON user_stats
  FOR SELECT USING (true);

-- RLS Policies for global_emissions
CREATE POLICY "Global emissions viewable by everyone" ON global_emissions
  FOR SELECT USING (true);

-- Trigger: Sync user_stats when action is inserted
CREATE OR REPLACE FUNCTION sync_user_stats_on_action_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_lbs NUMERIC(18,6);
BEGIN
  -- Calculate emissions in lbs
  IF NEW.custom_emissions_saved IS NOT NULL AND NEW.custom_emissions_saved > 0 THEN
    v_lbs := NEW.custom_emissions_saved;
  ELSIF NEW.action_template_id IS NOT NULL THEN
    SELECT COALESCE(emissions_saved * 2.20462, 0) INTO v_lbs
    FROM action_templates
    WHERE id = NEW.action_template_id;
  ELSE
    v_lbs := 0;
  END IF;
  
  -- Update or create user_stats
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_user_stats ON user_actions;
CREATE TRIGGER trigger_sync_user_stats
  AFTER INSERT ON user_actions
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_stats_on_action_insert();

-- Trigger: Sync global_emissions when user_stats is updated
CREATE OR REPLACE FUNCTION sync_global_emissions_on_stats_update()
RETURNS TRIGGER AS $$
DECLARE
  v_diff NUMERIC(18,6);
BEGIN
  -- Calculate difference
  v_diff := NEW.total_lbs - COALESCE(OLD.total_lbs, 0);
  
  -- Update global_emissions
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_global_emissions ON user_stats;
CREATE TRIGGER trigger_sync_global_emissions
  AFTER INSERT OR UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION sync_global_emissions_on_stats_update();

-- Helper function: Get user total
CREATE OR REPLACE FUNCTION get_user_total(p_user_id UUID)
RETURNS NUMERIC(18,6) AS $$
BEGIN
  RETURN COALESCE(
    (SELECT total_lbs FROM user_stats WHERE user_id = p_user_id),
    0::NUMERIC(18,6)
  );
END;
$$ LANGUAGE plpgsql;

-- Helper function: Get global total
CREATE OR REPLACE FUNCTION get_global_total()
RETURNS NUMERIC(18,6) AS $$
BEGIN
  RETURN COALESCE(
    (SELECT total_lbs_saved FROM global_emissions WHERE id = 1),
    0::NUMERIC(18,6)
  );
END;
$$ LANGUAGE plpgsql;

-- Leaderboard function
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
$$ LANGUAGE plpgsql;

-- Seed action templates
INSERT INTO action_templates (title, category, description, emissions_saved, icon, difficulty_level, time_commitment, cost_impact, points_reward)
VALUES
  ('Bike to Work', 'Transportation', 'Cycle instead of driving for your commute', 2.5, '🚲', 'Medium', '30-60 min', 'Free', 25),
  ('Use Public Transport', 'Transportation', 'Take the bus or train instead of driving', 1.8, '🚌', 'Easy', '15-30 min', 'Low', 20),
  ('Switch to LED Bulbs', 'Home', 'Replace incandescent bulbs with LED alternatives', 0.15, '💡', 'Easy', '5-15 min', 'Low', 15),
  ('Eat Plant-Based Meal', 'Food', 'Choose a vegetarian or vegan meal', 3.2, '🥗', 'Easy', '15-30 min', 'Low', 30),
  ('Carpool', 'Transportation', 'Share rides with colleagues or friends', 1.5, '🚗', 'Medium', '30-60 min', 'Free', 20),
  ('Shorter Shower', 'Water', 'Reduce shower time by 5 minutes', 0.25, '🚿', 'Easy', '5 min', 'Free', 10),
  ('Recycle', 'Waste', 'Properly sort and recycle household waste', 0.5, '♻️', 'Easy', '5-15 min', 'Free', 15),
  ('Plant a Tree', 'Materials', 'Plant a tree or support reforestation', 20.0, '🌳', 'Hard', '60+ min', 'Medium', 100),
  ('Buy Local Products', 'Food', 'Purchase locally sourced food and goods', 0.8, '🏪', 'Easy', '15-30 min', 'Medium', 15),
  ('Use Reusable Bags', 'Waste', 'Bring reusable bags when shopping', 0.1, '🛍️', 'Easy', '5 min', 'Free', 10)
ON CONFLICT DO NOTHING;
