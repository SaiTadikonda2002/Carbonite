import { supabase } from '../lib/supabase';

/**
 * Leaderboard entry interface
 * Matches API response format requirements
 */
export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  total_emissions_lbs: number;
  action_count: number;
  last_update_timestamp: string;
}

/**
 * Get leaderboard: Users ordered by total_emissions_lbs
 * Query: SELECT user_id, username, total_emissions_lbs FROM user_stats 
 *        WHERE total_emissions_lbs > 0 ORDER BY total_emissions_lbs DESC
 * 
 * Display format: "Rank 1: User1 - 27.5 lbs", "Rank 2: User2 - 7.2 lbs"
 * Refresh: Real-time update on each new verified action
 * Handles ties by comparing timestamps of last verified action
 * Precision: Up to 2 decimal points for all calculations
 */
export async function getLeaderboard(limit: number = 100): Promise<LeaderboardEntry[]> {
  try {
    // Option 1: Use database function (recommended)
    const { data, error } = await supabase.rpc('get_leaderboard', { limit_count: limit });
    
    if (error) {
      console.error('Error calling get_leaderboard function:', error);
      // Fallback to direct query
      return await getLeaderboardDirect(limit);
    }
    
    return (data || []).map((entry: any) => ({
      rank: entry.rank,
      user_id: entry.user_id,
      username: entry.username || 'Anonymous',
      total_emissions_lbs: parseFloat(entry.total_emissions_lbs?.toFixed(2) || '0') || 0,
      action_count: entry.action_count || 0,
      last_update_timestamp: entry.last_update_timestamp || new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return [];
  }
}

/**
 * Direct query fallback for leaderboard
 * Handles ties by comparing timestamps of last verified action
 */
async function getLeaderboardDirect(limit: number): Promise<LeaderboardEntry[]> {
  // Get user stats with last verified action timestamp for tie-breaking
  const { data: statsData, error: statsError } = await supabase
    .from('user_stats')
    .select(`
      user_id,
      total_emissions_lbs,
      action_count,
      last_updated,
      users!inner(username)
    `)
    .gt('total_emissions_lbs', 0);

  if (statsError) {
    console.error('Error fetching user stats:', statsError);
    return [];
  }

  // Get last verified action timestamps for tie-breaking
  const userIds = (statsData || []).map((entry: any) => entry.user_id);
  const { data: actionsData } = await supabase
    .from('user_actions')
    .select('user_id, verified_at')
    .in('user_id', userIds)
    .eq('verified', true)
    .order('verified_at', { ascending: false });

  // Create a map of user_id to last verified action timestamp
  const lastVerifiedMap = new Map<string, string>();
  (actionsData || []).forEach((action: any) => {
    if (!lastVerifiedMap.has(action.user_id)) {
      lastVerifiedMap.set(action.user_id, action.verified_at);
    }
  });

  // Sort by total_emissions_lbs DESC, then by last verified action timestamp DESC
  const sorted = (statsData || []).sort((a: any, b: any) => {
    const aLbs = parseFloat(a.total_emissions_lbs) || 0;
    const bLbs = parseFloat(b.total_emissions_lbs) || 0;
    
    if (aLbs !== bLbs) {
      return bLbs - aLbs; // DESC order
    }
    
    // Tie-breaking: compare last verified action timestamps
    const aTimestamp = lastVerifiedMap.get(a.user_id) || a.last_updated;
    const bTimestamp = lastVerifiedMap.get(b.user_id) || b.last_updated;
    return new Date(bTimestamp).getTime() - new Date(aTimestamp).getTime();
  });

  return sorted.slice(0, limit).map((entry: any, index: number) => ({
    rank: index + 1,
    user_id: entry.user_id,
    username: entry.users?.username || 'Anonymous',
    total_emissions_lbs: parseFloat((parseFloat(entry.total_emissions_lbs) || 0).toFixed(2)),
    action_count: entry.action_count || 0,
    last_update_timestamp: lastVerifiedMap.get(entry.user_id) || entry.last_updated || new Date().toISOString(),
  }));
}

/**
 * Format leaderboard entry for display
 * Example: "Rank 1: User1 - 27.5 lbs"
 * Precision: 2 decimal points
 */
export function formatLeaderboardEntry(entry: LeaderboardEntry): string {
  return `Rank ${entry.rank}: ${entry.username} - ${entry.total_emissions_lbs.toFixed(2)} lbs`;
}

/**
 * Get active users count
 * Definition: Users who logged at least 1 verified action
 * Query: SELECT COUNT(DISTINCT user_id) FROM user_actions WHERE verified=true
 * Display: "Total Active Users: 2"
 */
export async function getActiveUsersCount(): Promise<number> {
  try {
    // Option 1: Use database function (recommended)
    const { data, error } = await supabase.rpc('get_active_users_count');
    
    if (error) {
      console.error('Error calling get_active_users_count function:', error);
      // Fallback to direct query
      return await getActiveUsersCountDirect();
    }
    
    return data || 0;
  } catch (error) {
    console.error('Error fetching active users count:', error);
    return 0;
  }
}

/**
 * Direct query fallback for active users count
 */
async function getActiveUsersCountDirect(): Promise<number> {
  // Get distinct count of users with verified actions
  const { count, error } = await supabase
    .from('user_actions')
    .select('user_id', { count: 'exact', head: true })
    .eq('verified', true);

  if (error) {
    console.error('Error fetching active users count (direct query):', error);
    return 0;
  }

  return count || 0;
}

/**
 * Get global total emissions
 * Formula: SUM(user_stats.total_emissions_lbs) = global_emissions.total_lbs_saved
 * Example: "User1: 27.5 lbs + User2: 7.2 lbs = Global: 34.7 lbs"
 * Update trigger: On each verified action, increment global total
 * Precision: 2 decimal points
 */
export async function getGlobalTotalEmissions(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('global_emissions')
      .select('total_lbs_saved')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Error fetching global total emissions:', error);
      // Fallback: calculate from user_stats
      return await getGlobalTotalFromUserStats();
    }

    const total = parseFloat(data?.total_lbs_saved || '0') || 0;
    return parseFloat(total.toFixed(2));
  } catch (error) {
    console.error('Error fetching global total emissions:', error);
    return 0;
  }
}

/**
 * Calculate global total from user_stats (fallback/verification)
 * Precision: 2 decimal points
 */
export async function getGlobalTotalFromUserStats(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('total_emissions_lbs');

    if (error) {
      console.error('Error calculating from user_stats:', error);
      return 0;
    }

    const total = (data || []).reduce(
      (sum: number, entry: any) => sum + (parseFloat(entry.total_emissions_lbs) || 0),
      0
    );

    return parseFloat(total.toFixed(2));
  } catch (error) {
    console.error('Error calculating global total from user_stats:', error);
    return 0;
  }
}

/**
 * Sync check validation
 * Validation: global_emissions.total_lbs_saved MUST equal SUM of all user_stats.total_emissions_lbs
 * Cron job: Hourly verification to ensure consistency
 */
export interface SyncCheckResult {
  was_in_sync: boolean;
  user_stats_sum: number;
  global_total: number;
  discrepancy?: number;
  fixed: boolean;
  in_sync: boolean;
  timestamp: string;
  alert_channel?: string;
}

export async function performSyncCheck(): Promise<SyncCheckResult> {
  try {
    // Use database function for sync check
    const { data, error } = await supabase.rpc('sync_global_emissions_from_user_stats');
    
    if (error) {
      console.error('Error calling sync_global_emissions_from_user_stats:', error);
      // Fallback: manual check
      return await performSyncCheckManual();
    }

    const result = Array.isArray(data) ? data[0] : data;
    const userStatsSum = parseFloat(result?.user_stats_sum || '0') || 0;
    const globalTotal = parseFloat(result?.global_total || '0') || 0;
    const discrepancy = Math.abs(userStatsSum - globalTotal);
    
    return {
      was_in_sync: result?.was_in_sync || false,
      user_stats_sum: parseFloat(userStatsSum.toFixed(2)),
      global_total: parseFloat(globalTotal.toFixed(2)),
      discrepancy: parseFloat(discrepancy.toFixed(2)),
      fixed: result?.fixed || false,
      in_sync: result?.was_in_sync || false,
      timestamp: new Date().toISOString(),
      alert_channel: 'System admin or monitoring dashboard',
    };
  } catch (error) {
    console.error('Error performing sync check:', error);
    return await performSyncCheckManual();
  }
}

/**
 * Manual sync check (fallback)
 * Precision: 2 decimal points for comparison
 */
async function performSyncCheckManual(): Promise<SyncCheckResult> {
  const userStatsSum = await getGlobalTotalFromUserStats();
  const globalTotal = await getGlobalTotalEmissions();
  // Compare with 2 decimal precision
  const isInSync = Math.abs(userStatsSum - globalTotal) < 0.01;

  // If not in sync, fix it
  if (!isInSync) {
    try {
      await supabase
        .from('global_emissions')
        .update({
          total_lbs_saved: userStatsSum,
          last_updated: new Date().toISOString(),
        })
        .eq('id', 1);
      
      console.warn('⚠️ Sync check found inconsistency and fixed it:', {
        user_stats_sum: userStatsSum,
        global_total: globalTotal,
      });
    } catch (error) {
      console.error('Error fixing sync:', error);
    }
  }

  const discrepancy = Math.abs(userStatsSum - globalTotal);
  
  return {
    was_in_sync: isInSync,
    user_stats_sum: parseFloat(userStatsSum.toFixed(2)),
    global_total: parseFloat(globalTotal.toFixed(2)),
    discrepancy: parseFloat(discrepancy.toFixed(2)),
    fixed: !isInSync,
    in_sync: isInSync,
    timestamp: new Date().toISOString(),
    alert_channel: 'System admin or monitoring dashboard',
  };
}

/**
 * Run hourly sync check (can be called by cron job or scheduled task)
 */
export async function runHourlySyncCheck(): Promise<SyncCheckResult> {
  try {
    const { data, error } = await supabase.rpc('hourly_sync_check');
    
    if (error) {
      console.error('Error calling hourly_sync_check:', error);
      return await performSyncCheckManual();
    }

    const result = data as any;
    return {
      was_in_sync: result?.was_in_sync || false,
      user_stats_sum: parseFloat(result?.user_stats_sum || '0') || 0,
      global_total: parseFloat(result?.global_total || '0') || 0,
      discrepancy: result?.discrepancy ? parseFloat(result.discrepancy) : undefined,
      fixed: result?.fixed || false,
      in_sync: result?.in_sync || false,
      timestamp: result?.timestamp || new Date().toISOString(),
      alert_channel: result?.alert_channel || 'System admin or monitoring dashboard',
    };
  } catch (error) {
    console.error('Error running hourly sync check:', error);
    return await performSyncCheckManual();
  }
}

