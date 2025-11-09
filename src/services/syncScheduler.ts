/**
 * Sync Scheduler Utility
 * 
 * This utility helps set up and manage the hourly sync check.
 * 
 * For Supabase, you can set up the hourly sync check in one of these ways:
 * 
 * 1. Using pg_cron extension (if available in your Supabase instance):
 *    Run this SQL in Supabase SQL Editor:
 *    SELECT cron.schedule('hourly-sync-check', '0 * * * *', 'SELECT hourly_sync_check();');
 * 
 * 2. Using Supabase Edge Functions with a scheduled trigger:
 *    Create an Edge Function that calls hourly_sync_check() and set up a cron trigger
 * 
 * 3. Using an external cron service (e.g., GitHub Actions, Vercel Cron, etc.):
 *    Set up a scheduled task that calls the sync check API endpoint
 * 
 * 4. Client-side polling (not recommended for production, but useful for testing):
 *    Use the setupClientSideSyncCheck() function below
 */

import { runHourlySyncCheck, SyncCheckResult } from './leaderboard';

/**
 * Set up client-side hourly sync check (for testing/development)
 * Note: This is not recommended for production as it requires the client to be active
 * For production, use server-side cron jobs or Supabase Edge Functions
 */
export function setupClientSideSyncCheck(
  onCheckComplete?: (result: SyncCheckResult) => void,
  onError?: (error: Error) => void
): () => void {
  // Run immediately
  runHourlySyncCheck()
    .then((result) => {
      console.log('✅ Initial sync check completed:', result);
      if (onCheckComplete) onCheckComplete(result);
    })
    .catch((error) => {
      console.error('❌ Sync check error:', error);
      if (onError) onError(error);
    });

  // Set up hourly interval (3600000 ms = 1 hour)
  const intervalId = setInterval(() => {
    runHourlySyncCheck()
      .then((result) => {
        console.log('✅ Hourly sync check completed:', result);
        if (onCheckComplete) onCheckComplete(result);
      })
      .catch((error) => {
        console.error('❌ Sync check error:', error);
        if (onError) onError(error);
      });
  }, 3600000); // 1 hour

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Manual trigger for sync check (useful for admin panels or testing)
 */
export async function triggerSyncCheck(): Promise<SyncCheckResult> {
  try {
    const result = await runHourlySyncCheck();
    console.log('✅ Sync check completed:', result);
    return result;
  } catch (error) {
    console.error('❌ Sync check failed:', error);
    throw error;
  }
}

/**
 * SQL script to set up pg_cron (run this in Supabase SQL Editor if pg_cron is available)
 */
export const PG_CRON_SETUP_SQL = `
-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly sync check
SELECT cron.schedule(
  'hourly-sync-check',
  '0 * * * *',  -- Every hour at minute 0
  'SELECT hourly_sync_check();'
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('hourly-sync-check');
`;

