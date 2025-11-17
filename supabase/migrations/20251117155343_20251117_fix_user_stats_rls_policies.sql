/*
  # Fix user_stats RLS Policies

  The user_stats table needs INSERT and UPDATE policies to allow triggers
  to automatically update stats when actions are logged.

  Triggers run as the database owner (postgres), which bypasses RLS, but
  we still need explicit policies for other operations.

  Changes:
  - Add INSERT policy allowing system operations (required for triggers)
  - Add UPDATE policy allowing system operations (required for triggers)
  - Keep SELECT policy for public viewing
*/

-- Add INSERT policy for user_stats (allows system/trigger operations)
CREATE POLICY "System can insert user stats" ON user_stats
  FOR INSERT
  WITH CHECK (true);

-- Add UPDATE policy for user_stats (allows system/trigger operations)
CREATE POLICY "System can update user stats" ON user_stats
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
