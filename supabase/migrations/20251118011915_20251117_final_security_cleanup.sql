/*
  # Final Security and Performance Cleanup

  1. Fix remaining RLS policy to use (select auth.uid())
  2. Drop unused indexes to reduce storage and improve write performance
  3. Note: Password protection setting is configured in Supabase Auth settings (not in SQL)
*/

-- Fix remaining INSERT policy on profiles
DROP POLICY "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- Drop unused indexes to improve write performance and reduce storage
DROP INDEX IF EXISTS idx_user_stats_total_lbs;
DROP INDEX IF EXISTS idx_action_templates_category;
DROP INDEX IF EXISTS idx_action_templates_active;
DROP INDEX IF EXISTS idx_user_actions_action_template_id;
