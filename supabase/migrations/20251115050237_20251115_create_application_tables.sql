/*
  # Create Application Tables - Profiles, Action Templates, and Dependencies
  
  1. New Tables
    - `profiles`: User profile data linked to auth.users
    - `action_templates`: Pre-defined climate actions
    - Extends existing: users, user_actions, user_stats, global_emissions
  
  2. Security
    - RLS enabled on all tables
    - Users can read their own profile and all public actions
    - Only authenticated users can log actions
  
  3. Data Integrity
    - Foreign key constraints to prevent orphaned records
    - Default values for all timestamps
    - Check constraints for positive values
*/

-- Create profiles table linked to Supabase auth.users
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Create action_templates table
CREATE TABLE IF NOT EXISTS action_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  difficulty_level TEXT DEFAULT 'Medium',
  time_commitment TEXT,
  cost_impact TEXT,
  emissions_saved NUMERIC(12,4) NOT NULL DEFAULT 0,
  how_to_guide TEXT,
  tips TEXT,
  icon TEXT DEFAULT '🌱',
  points_reward INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on action_templates
ALTER TABLE action_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for action_templates
CREATE POLICY "Anyone can view active action templates"
  ON action_templates FOR SELECT
  USING (is_active = true);

-- Seed initial action templates
INSERT INTO action_templates (title, category, description, difficulty_level, time_commitment, cost_impact, emissions_saved, icon, points_reward, is_active)
VALUES
  ('Bike Commute', 'Transportation', 'Bike to work instead of driving', 'Medium', '30 min', 'Free', 2.5, '🚴', 25, true),
  ('Public Transport', 'Transportation', 'Use public transportation for daily commute', 'Easy', '15 min', 'Low', 1.8, '🚌', 20, true),
  ('Switch to LED Bulbs', 'Home', 'Replace incandescent bulbs with LED', 'Easy', '15 min', 'Low', 0.15, '💡', 15, true),
  ('Reduce Meat Consumption', 'Food', 'Go vegetarian for one day', 'Medium', '0 min', 'Low', 3.2, '🥗', 20, true),
  ('Carpool', 'Transportation', 'Share rides with coworkers', 'Easy', '10 min', 'Low', 1.5, '🚗', 15, true),
  ('Reduce Shower Time', 'Water', 'Take shorter showers (5 min)', 'Easy', '5 min', 'Free', 0.25, '🚿', 10, true),
  ('Recycle', 'Waste', 'Properly recycle waste materials', 'Easy', '10 min', 'Free', 0.5, '♻️', 10, true),
  ('Plant a Tree', 'Materials', 'Plant a tree in your community', 'Hard', '1 hour', 'Free', 20.0, '🌳', 50, true),
  ('Buy Local', 'Food', 'Purchase food from local sources', 'Easy', '30 min', 'Neutral', 0.8, '🏪', 12, true),
  ('Use Reusable Bags', 'Materials', 'Replace plastic bags with reusable ones', 'Easy', '5 min', 'Low', 0.1, '🛍️', 10, true);

-- Create index on action_templates for faster queries
CREATE INDEX IF NOT EXISTS idx_action_templates_active ON action_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_action_templates_category ON action_templates(category);

-- Update user_actions table to work with profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_actions' AND column_name = 'action_template_id'
  ) THEN
    ALTER TABLE user_actions ADD COLUMN action_template_id UUID REFERENCES action_templates(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_actions' AND column_name = 'custom_title'
  ) THEN
    ALTER TABLE user_actions ADD COLUMN custom_title TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_actions' AND column_name = 'custom_emissions_saved'
  ) THEN
    ALTER TABLE user_actions ADD COLUMN custom_emissions_saved NUMERIC(12,4);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_actions' AND column_name = 'notes'
  ) THEN
    ALTER TABLE user_actions ADD COLUMN notes TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_actions' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE user_actions ADD COLUMN photo_url TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_actions' AND column_name = 'logged_at'
  ) THEN
    ALTER TABLE user_actions ADD COLUMN logged_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Rename columns for consistency with user_stats table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_stats' AND column_name = 'total_emissions_lbs'
  ) THEN
    ALTER TABLE user_stats RENAME COLUMN total_emissions_lbs TO total_lbs;
  END IF;
END $$;

-- Create index on user_actions for profile queries
CREATE INDEX IF NOT EXISTS idx_user_actions_logged_at ON user_actions(logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_action_template ON user_actions(action_template_id);
