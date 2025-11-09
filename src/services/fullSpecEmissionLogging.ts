/**
 * Full-Spec: User Action Logs (lbs) + Global Aggregate
 * 
 * Complete implementation with:
 * - Exact NUMERIC(30,6) precision
 * - Idempotency via action_id
 * - Atomic transactions
 * - Audit trail
 * - Reconciliation
 * - Event emission
 */

import { supabase } from '../lib/supabase';

/**
 * Action log request
 */
export interface ActionLogRequest {
  action_id: string; // UUID (required, client-generated)
  user_id: string; // UUID (required)
  lbs: number | string; // Decimal string or number (required)
  logged_at: string; // ISO8601 timestamp (required)
  verified: boolean; // Must be true to count
  username?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Action log response (exact numeric totals as strings)
 */
export interface ActionLogResponse {
  status: 'success' | 'error';
  action_id: string;
  user_total_lbs: string; // Exact numeric as string
  global_total_lbs: string; // Exact numeric as string
  is_duplicate: boolean;
  timestamp: string;
}

/**
 * POST /api/actions/log
 * Log a single verified user action (idempotent, atomic)
 */
export async function logActionFullSpec(request: ActionLogRequest): Promise<ActionLogResponse> {
  try {
    // Validate payload
    if (!request.action_id || !request.user_id || request.lbs === undefined || !request.logged_at) {
      throw new Error('Missing required fields: action_id, user_id, lbs, logged_at');
    }

    if (request.verified !== true) {
      throw new Error('verified must be true to count');
    }

    if (request.lbs < 0) {
      throw new Error('lbs must be non-negative');
    }

    const lbsValue = typeof request.lbs === 'string' ? request.lbs : request.lbs.toString();

    // Call database function for atomic, idempotent logging
    const { data, error } = await supabase.rpc('log_action_atomic', {
      p_action_id: request.action_id,
      p_user_id: request.user_id,
      p_lbs: lbsValue,
      p_logged_at: request.logged_at,
      p_username: request.username || null,
      p_metadata: request.metadata || {},
      p_performed_by: 'system',
    });

    if (error) {
      console.error('Error logging action:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from log_action_atomic');
    }

    const result = data[0];

    // Emit event (would be done via trigger or separate service)
    // emitEmissionEvent(...)

    return {
      status: result.success ? 'success' : 'error',
      action_id: result.action_id,
      user_total_lbs: result.user_total_lbs.toString(),
      global_total_lbs: result.global_total_lbs.toString(),
      is_duplicate: result.is_duplicate,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in logActionFullSpec:', error);
    return {
      status: 'error',
      action_id: request.action_id,
      user_total_lbs: '0',
      global_total_lbs: '0',
      is_duplicate: false,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Bulk backfill request
 */
export interface BulkBackfillRequest {
  actions: ActionLogRequest[];
  idempotency_key?: string;
}

/**
 * Bulk backfill response
 */
export interface BulkBackfillResponse {
  status: 'success' | 'error';
  inserted_count: number;
  global_total_lbs: string; // Exact numeric as string
  timestamp: string;
}

/**
 * POST /api/actions/bulk_backfill
 * Bulk backfill with recomputation from source of truth
 */
export async function bulkBackfillFullSpec(request: BulkBackfillRequest): Promise<BulkBackfillResponse> {
  try {
    // Validate and filter only verified actions
    const verifiedActions = request.actions.filter(action => action.verified === true);

    if (verifiedActions.length === 0) {
      throw new Error('No verified actions provided');
    }

    // Convert to JSONB format
    const actionsJsonb = verifiedActions.map(action => ({
      action_id: action.action_id,
      user_id: action.user_id,
      lbs: typeof action.lbs === 'string' ? action.lbs : action.lbs.toString(),
      logged_at: action.logged_at,
      verified: action.verified,
      metadata: action.metadata || {},
    }));

    // Call database function
    const { data, error } = await supabase.rpc('bulk_backfill_actions_recompute', {
      p_actions: actionsJsonb as any,
      p_idempotency_key: request.idempotency_key || null,
      p_performed_by: 'system',
    });

    if (error) {
      console.error('Error in bulk backfill:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from bulk_backfill_actions_recompute');
    }

    const result = data[0];

    // Emit event (would be done via trigger or separate service)
    // emitBulkEmissionEvent(...)

    return {
      status: result.success ? 'success' : 'error',
      inserted_count: result.inserted_count || 0,
      global_total_lbs: result.global_total_lbs.toString(),
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in bulkBackfillFullSpec:', error);
    return {
      status: 'error',
      inserted_count: 0,
      global_total_lbs: '0',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * GET /api/global/total
 * Fetch authoritative global total (stringified numeric)
 */
export async function getGlobalTotalFullSpec(): Promise<{
  global_total_lbs: string;
  last_update: string;
}> {
  try {
    const { data, error } = await supabase
      .from('global_emissions')
      .select('total_lbs_saved, last_update')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Error fetching global total:', error);
      throw error;
    }

    return {
      global_total_lbs: data.total_lbs_saved.toString(),
      last_update: data.last_update,
    };
  } catch (error: any) {
    console.error('Error in getGlobalTotalFullSpec:', error);
    throw error;
  }
}

/**
 * GET /api/users/{user_id}/actions
 * Fetch user action history (sub-set entries) sorted by logged_at asc
 */
export async function getUserActionsFullSpec(userId: string): Promise<Array<{
  action_id: string;
  lbs: string;
  logged_at: string;
  verified_at: string | null;
  metadata: Record<string, unknown>;
}>> {
  try {
    const { data, error } = await supabase
      .from('user_actions')
      .select('action_id, lbs, logged_at, verified_at, metadata')
      .eq('user_id', userId)
      .eq('verified', true)
      .order('logged_at', { ascending: true });

    if (error) {
      console.error('Error fetching user actions:', error);
      throw error;
    }

    return (data || []).map((action: any) => ({
      action_id: action.action_id,
      lbs: action.lbs.toString(),
      logged_at: action.logged_at,
      verified_at: action.verified_at,
      metadata: action.metadata || {},
    }));
  } catch (error: any) {
    console.error('Error in getUserActionsFullSpec:', error);
    throw error;
  }
}

/**
 * GET /api/leaderboard?limit=100
 * Return ordered list of users by total_emissions_lbs DESC
 */
export async function getLeaderboardFullSpec(limit: number = 100): Promise<Array<{
  rank: number;
  user_id: string;
  username: string;
  total_lbs: string; // Exact numeric as string
  last_update: string;
}>> {
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, username, total_emissions_lbs, last_update')
      .gt('total_emissions_lbs', 0)
      .order('total_emissions_lbs', { ascending: false })
      .order('last_update', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching leaderboard:', error);
      throw error;
    }

    return (data || []).map((entry: any, index: number) => ({
      rank: index + 1,
      user_id: entry.user_id,
      username: entry.username || 'Anonymous',
      total_lbs: entry.total_emissions_lbs.toString(),
      last_update: entry.last_update,
    }));
  } catch (error: any) {
    console.error('Error in getLeaderboardFullSpec:', error);
    throw error;
  }
}

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
  in_sync: boolean;
  sum_user_totals: string;
  global_total: string;
  discrepancy: string;
  fixed: boolean;
  audit_id: string | null;
  timestamp: string;
}

/**
 * POST /api/reconcile
 * Run reconciliation with audit logging
 */
export async function reconcileEmissionsFullSpec(
  performedBy: string = 'system',
  autoCorrect: boolean = true
): Promise<ReconciliationResult> {
  try {
    const { data, error } = await supabase.rpc('reconcile_emissions_audit', {
      p_performed_by: performedBy,
      p_auto_correct: autoCorrect,
    });

    if (error) {
      console.error('Error in reconciliation:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from reconcile_emissions_audit');
    }

    const result = data[0];

    return {
      in_sync: result.in_sync,
      sum_user_totals: result.sum_user_totals.toString(),
      global_total: result.global_total.toString(),
      discrepancy: result.discrepancy.toString(),
      fixed: result.fixed,
      audit_id: result.audit_id?.toString() || null,
      timestamp: result.timestamp,
    };
  } catch (error: any) {
    console.error('Error in reconcileEmissionsFullSpec:', error);
    throw error;
  }
}

/**
 * Get audit trail
 */
export interface AuditEntry {
  audit_id: string;
  entity: string;
  entity_id: string;
  previous_value: string;
  new_value: string;
  change_lbs: string;
  reason: string;
  performed_by: string | null;
  performed_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Get health status
 */
export interface HealthStatus {
  total_actions: number;
  total_users: number;
  global_total_lbs: string;
  sum_user_totals: string;
  in_sync: boolean;
  corrections_last_24h: number;
  last_check: string;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  try {
    const { data, error } = await supabase
      .from('emissions_health')
      .select('*')
      .single();

    if (error) {
      console.error('Error fetching health status:', error);
      throw error;
    }

    return {
      total_actions: data.total_actions || 0,
      total_users: data.total_users || 0,
      global_total_lbs: data.global_total_lbs.toString(),
      sum_user_totals: data.sum_user_totals.toString(),
      in_sync: data.in_sync || false,
      corrections_last_24h: data.corrections_last_24h || 0,
      last_check: data.last_check || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in getHealthStatus:', error);
    throw error;
  }
}

/**
 * Get audit trail
 */
export async function getAuditTrail(limit: number = 100): Promise<AuditEntry[]> {
  try {
    const { data, error } = await supabase
      .from('emissions_audit')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching audit trail:', error);
      throw error;
    }

    return (data || []).map((entry: any) => ({
      audit_id: entry.audit_id,
      entity: entry.entity,
      entity_id: entry.entity_id,
      previous_value: entry.previous_value.toString(),
      new_value: entry.new_value.toString(),
      change_lbs: entry.change_lbs.toString(),
      reason: entry.reason,
      performed_by: entry.performed_by,
      performed_at: entry.performed_at,
      metadata: entry.metadata || {},
    }));
  } catch (error: any) {
    console.error('Error in getAuditTrail:', error);
    throw error;
  }
}

