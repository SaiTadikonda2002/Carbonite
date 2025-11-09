/**
 * API-like service functions for global aggregation and leaderboard
 * These functions match the expected API endpoints structure:
 * - /api/global/total
 * - /api/leaderboard
 * - /api/users/active
 * 
 * Response format: JSON
 * Fields required: user_id, username, total_emissions_lbs, rank, last_update_timestamp
 */

import { supabase } from '../../lib/supabase';
import {
  getLeaderboard,
  getActiveUsersCount,
  getGlobalTotalEmissions,
  performSyncCheck,
  LeaderboardEntry,
  SyncCheckResult,
} from '../leaderboard';

/**
 * API Response Types
 */
export interface GlobalTotalResponse {
  total_lbs_saved: number;
  unit: string;
  last_update_timestamp: string;
  formula: string;
  example: {
    User1: string;
    User2: string;
    Global_Total: string;
  };
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total_count: number;
  limit: number;
  last_update_timestamp: string;
}

export interface ActiveUsersResponse {
  count: number;
  display_format: string;
  last_update_timestamp: string;
}

export interface SyncCheckResponse {
  was_in_sync: boolean;
  user_stats_sum: number;
  global_total: number;
  fixed: boolean;
  in_sync: boolean;
  timestamp: string;
  alert_channel?: string;
}

/**
 * GET /api/global/total
 * Returns global total emissions saved
 */
export async function getGlobalTotalApi(): Promise<GlobalTotalResponse> {
  const total = await getGlobalTotalEmissions();
  const { data } = await supabase
    .from('global_emissions')
    .select('last_updated')
    .eq('id', 1)
    .single();

  // Get example breakdown from top users
  const leaderboard = await getLeaderboard(2);
  const example: { User1: string; User2: string; Global_Total: string } = {
    User1: leaderboard[0] ? `${leaderboard[0].total_emissions_lbs.toFixed(2)} lbs` : '0.00 lbs',
    User2: leaderboard[1] ? `${leaderboard[1].total_emissions_lbs.toFixed(2)} lbs` : '0.00 lbs',
    Global_Total: `${total.toFixed(2)} lbs`,
  };

  return {
    total_lbs_saved: parseFloat(total.toFixed(2)),
    unit: 'pounds (lbs) of CO₂e',
    last_update_timestamp: data?.last_updated || new Date().toISOString(),
    formula: 'global_emissions.total_lbs_saved = SUM(user_stats.total_emissions_lbs)',
    example,
  };
}

/**
 * GET /api/leaderboard
 * Returns leaderboard entries ordered by total_emissions_lbs
 * Handles ties by comparing timestamps of last verified action
 */
export async function getLeaderboardApi(limit: number = 100): Promise<LeaderboardResponse> {
  const entries = await getLeaderboard(limit);
  
  return {
    entries,
    total_count: entries.length,
    limit,
    last_update_timestamp: entries[0]?.last_update_timestamp || new Date().toISOString(),
  };
}

/**
 * GET /api/users/active
 * Returns count of active users (users with at least 1 verified action)
 */
export async function getActiveUsersApi(): Promise<ActiveUsersResponse> {
  const count = await getActiveUsersCount();
  
  return {
    count,
    display_format: `Total Active Users: ${count}`,
    last_update_timestamp: new Date().toISOString(),
  };
}

/**
 * POST /api/sync/check
 * Performs sync check validation
 * Action on discrepancy: Log mismatch and trigger auto-resync of global totals
 * Alert channel: System admin or monitoring dashboard
 */
export async function performSyncCheckApi(): Promise<SyncCheckResponse> {
  const result = await performSyncCheck();
  
  // Log mismatch if found
  if (!result.in_sync) {
    console.error('⚠️ Sync check found discrepancy:', {
      user_stats_sum: result.user_stats_sum,
      global_total: result.global_total,
      difference: Math.abs(result.user_stats_sum - result.global_total),
      timestamp: result.timestamp,
    });
    
    // In production, this would send to monitoring dashboard or alert system
    // For now, we log it and the sync check function already fixes it
  }
  
  return {
    ...result,
    alert_channel: 'System admin or monitoring dashboard',
  };
}

/**
 * Combined API response for dashboard/overview
 */
export interface GlobalOverviewResponse {
  global_total: GlobalTotalResponse;
  leaderboard: LeaderboardResponse;
  active_users: ActiveUsersResponse;
  sync_status: SyncCheckResponse;
}

/**
 * GET /api/global/overview
 * Returns combined overview of global stats, leaderboard, active users, and sync status
 */
export async function getGlobalOverviewApi(): Promise<GlobalOverviewResponse> {
  const [globalTotal, leaderboard, activeUsers, syncStatus] = await Promise.all([
    getGlobalTotalApi(),
    getLeaderboardApi(10), // Top 10 for overview
    getActiveUsersApi(),
    performSyncCheckApi(),
  ]);

  return {
    global_total: globalTotal,
    leaderboard,
    active_users: activeUsers,
    sync_status: syncStatus,
  };
}

