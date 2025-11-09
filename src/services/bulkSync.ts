/**
 * Bulk Sync Service: Sync all user action logs into global total
 * 
 * Features:
 * - Bulk backfill with exact sum from source of truth
 * - Idempotent action insertion
 * - Exact numeric precision (NUMERIC(30,6))
 * - Audit trail with corrections logging
 * - Reconciliation with auto-correction
 */

import { supabase } from '../lib/supabase';

/**
 * Action log interface
 */
export interface ActionLog {
  action_id: string; // UUID
  user_id: string; // UUID
  lbs: number | string; // Numeric value (will be converted to NUMERIC(30,6))
  logged_at: string; // ISO8601 timestamp
  verified: boolean;
  action_type?: string;
  quantity?: number;
  unit?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Bulk backfill request
 */
export interface BulkBackfillRequest {
  actions: ActionLog[];
  idempotency_key?: string;
}

/**
 * Bulk backfill response
 */
export interface BulkBackfillResponse {
  success: boolean;
  inserted_count: number;
  skipped_count: number;
  global_total_lbs: string; // Exact numeric as string
  affected_users: number;
  message: string;
}

/**
 * POST /api/actions/bulk_backfill
 * Bulk backfill verified actions and recompute totals from source of truth
 */
export async function bulkBackfillActions(
  request: BulkBackfillRequest
): Promise<BulkBackfillResponse> {
  try {
    // Validate input
    if (!request.actions || request.actions.length === 0) {
      throw new Error('No actions provided');
    }

    // Filter to only verified actions
    const verifiedActions = request.actions.filter(action => action.verified === true);

    if (verifiedActions.length === 0) {
      throw new Error('No verified actions provided');
    }

    // Convert to JSONB format for database function
    const actionsJsonb = verifiedActions.map(action => ({
      action_id: action.action_id,
      user_id: action.user_id,
      lbs: typeof action.lbs === 'string' ? action.lbs : action.lbs.toString(),
      logged_at: action.logged_at,
      verified: action.verified,
      action_type: action.action_type || 'verified_action',
      quantity: action.quantity || null,
      unit: action.unit || 'lbs',
      metadata: action.metadata || {},
    }));

    // Call database function for bulk backfill
    const { data, error } = await supabase.rpc('bulk_backfill_actions', {
      p_actions: actionsJsonb as any,
      p_idempotency_key: request.idempotency_key || null,
    });

    if (error) {
      console.error('Error in bulk backfill:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from bulk_backfill_actions');
    }

    const result = data[0];

    return {
      success: result.success,
      inserted_count: result.inserted_count || 0,
      skipped_count: result.skipped_count || 0,
      global_total_lbs: result.global_total_lbs?.toString() || '0',
      affected_users: result.affected_users || 0,
      message: result.message || 'Bulk backfill completed',
    };
  } catch (error: any) {
    console.error('Error in bulkBackfillActions:', error);
    return {
      success: false,
      inserted_count: 0,
      skipped_count: 0,
      global_total_lbs: '0',
      affected_users: 0,
      message: error.message || 'Failed to bulk backfill actions',
    };
  }
}

/**
 * Single action log (enhanced with logged_at support)
 */
export interface LogActionRequest {
  action_id: string;
  user_id: string;
  lbs: number | string;
  logged_at?: string; // ISO8601 timestamp (defaults to now)
  action_type?: string;
  quantity?: number;
  unit?: string;
  metadata?: Record<string, unknown>;
}

export interface LogActionResponse {
  success: boolean;
  action_id: string;
  user_id: string;
  emissions_lbs: string; // Exact numeric as string
  user_total_lbs: string; // Exact numeric as string
  global_total_lbs: string; // Exact numeric as string
  is_duplicate: boolean;
  message: string;
  timestamp: string;
}

/**
 * POST /api/actions/log
 * Log a single verified action
 */
export async function logAction(request: LogActionRequest): Promise<LogActionResponse> {
  try {
    // Validate input
    if (!request.action_id || !request.user_id || request.lbs === undefined) {
      throw new Error('Missing required fields: action_id, user_id, lbs');
    }

    const lbsValue = typeof request.lbs === 'string' ? request.lbs : request.lbs.toString();

    // Call database function
    const { data, error } = await supabase.rpc('log_emission_atomic', {
      p_action_id: request.action_id,
      p_user_id: request.user_id,
      p_emissions_lbs: lbsValue,
      p_logged_at: request.logged_at || new Date().toISOString(),
      p_action_type: request.action_type || 'verified_action',
      p_quantity: request.quantity || null,
      p_unit: request.unit || 'lbs',
      p_metadata: request.metadata || {},
    });

    if (error) {
      console.error('Error logging action:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from log_emission_atomic');
    }

    const result = data[0];

    return {
      success: result.success,
      action_id: result.action_id,
      user_id: result.user_id,
      emissions_lbs: result.emissions_lbs.toString(),
      user_total_lbs: result.user_total_lbs.toString(),
      global_total_lbs: result.global_total_lbs.toString(),
      is_duplicate: result.is_duplicate,
      message: result.message,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in logAction:', error);
    return {
      success: false,
      action_id: request.action_id,
      user_id: request.user_id,
      emissions_lbs: typeof request.lbs === 'string' ? request.lbs : request.lbs.toString(),
      user_total_lbs: '0',
      global_total_lbs: '0',
      is_duplicate: false,
      message: error.message || 'Failed to log action',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Reconciliation result with corrections
 */
export interface ReconciliationResult {
  in_sync: boolean;
  user_stats_sum: string; // Exact numeric as string
  global_total: string; // Exact numeric as string
  discrepancy: string; // Exact numeric as string
  fixed: boolean;
  correction_id: string | null;
  timestamp: string;
}

/**
 * POST /api/actions/reconcile
 * Run reconciliation with corrections logging
 */
export async function reconcileEmissionsWithCorrections(
  performedBy: string = 'system',
  autoCorrect: boolean = true
): Promise<ReconciliationResult> {
  try {
    const { data, error } = await supabase.rpc('reconcile_emissions_with_corrections', {
      p_performed_by: performedBy,
      p_auto_correct: autoCorrect,
    });

    if (error) {
      console.error('Error in reconciliation:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from reconcile_emissions_with_corrections');
    }

    const result = data[0];

    return {
      in_sync: result.in_sync,
      user_stats_sum: result.user_stats_sum.toString(),
      global_total: result.global_total.toString(),
      discrepancy: result.discrepancy.toString(),
      fixed: result.fixed,
      correction_id: result.correction_id?.toString() || null,
      timestamp: result.timestamp,
    };
  } catch (error: any) {
    console.error('Error in reconcileEmissionsWithCorrections:', error);
    throw error;
  }
}

/**
 * Get all corrections (audit trail)
 */
export interface EmissionCorrection {
  correction_id: string;
  previous_total: string;
  corrected_total: string;
  discrepancy: string;
  reason: string;
  performed_at: string;
  performed_by: string | null;
  reconciliation_run_id: string | null;
  metadata: Record<string, unknown>;
}

export async function getEmissionCorrections(
  limit: number = 100
): Promise<EmissionCorrection[]> {
  try {
    const { data, error } = await supabase
      .from('emissions_corrections')
      .select('*')
      .order('performed_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching corrections:', error);
      throw error;
    }

    return (data || []).map((correction: any) => ({
      correction_id: correction.correction_id,
      previous_total: correction.previous_total.toString(),
      corrected_total: correction.corrected_total.toString(),
      discrepancy: correction.discrepancy.toString(),
      reason: correction.reason,
      performed_at: correction.performed_at,
      performed_by: correction.performed_by,
      reconciliation_run_id: correction.reconciliation_run_id,
      metadata: correction.metadata || {},
    }));
  } catch (error: any) {
    console.error('Error in getEmissionCorrections:', error);
    throw error;
  }
}

/**
 * Get emission logging health status
 */
export interface EmissionLoggingHealth {
  total_actions: number;
  total_users: number;
  global_total_lbs: string;
  user_stats_sum: string;
  in_sync: boolean;
  total_corrections: number;
  corrections_last_24h: number;
  last_check: string;
}

export async function getEmissionLoggingHealth(): Promise<EmissionLoggingHealth> {
  try {
    const { data, error } = await supabase
      .from('emission_logging_health')
      .select('*')
      .single();

    if (error) {
      console.error('Error fetching health status:', error);
      throw error;
    }

    return {
      total_actions: data.total_actions || 0,
      total_users: data.total_users || 0,
      global_total_lbs: data.global_total_lbs?.toString() || '0',
      user_stats_sum: data.user_stats_sum?.toString() || '0',
      in_sync: data.in_sync || false,
      total_corrections: data.total_corrections || 0,
      corrections_last_24h: data.corrections_last_24h || 0,
      last_check: data.last_check || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in getEmissionLoggingHealth:', error);
    throw error;
  }
}

