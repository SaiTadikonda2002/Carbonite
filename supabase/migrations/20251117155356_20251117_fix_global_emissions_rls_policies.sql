/*
  # Fix global_emissions RLS Policies

  The global_emissions table needs INSERT and UPDATE policies to allow
  triggers to automatically sync global totals.

  Changes:
  - Add INSERT policy allowing system operations (required for triggers)
  - Add UPDATE policy allowing system operations (required for triggers)
  - Keep SELECT policy for public viewing
*/

-- Add INSERT policy for global_emissions (allows system/trigger operations)
CREATE POLICY "System can insert global emissions" ON global_emissions
  FOR INSERT
  WITH CHECK (true);

-- Add UPDATE policy for global_emissions (allows system/trigger operations)
CREATE POLICY "System can update global emissions" ON global_emissions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
