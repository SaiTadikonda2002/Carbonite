/**
 * Atomic, Idempotent Emission Logging Service
 * 
 * Provides:
 * - Idempotent emission logging with action_id deduplication
 * - Atomic updates to user_stats and global_emissions
 * - Concurrency-safe operations using SELECT FOR UPDATE
 * - Exact numeric totals (no rounding)
 * - Event emission for real-time updates
 */

import { supabase } from '../lib/supabase';

/**
 * Emission logging request interface
 */
export interface EmissionLogRequest {
  action_id: string; // UUID
  user_id: string; // UUID
  emissions_lbs: number; // Exact numeric value (will be stored as NUMERIC(18,6))
  action_type?: string;
  quantity?: number;
  unit?: string;
}

/**
 * Emission logging response interface
 * Returns exact numeric totals (as strings) for precision
 */
export interface EmissionLogResponse {
  success: boolean;
  action_id: string;
  user_id: string;
  emissions_lbs: string; // Exact numeric as string
  user_total_lbs: string; // Exact numeric as string
  global_total_lbs: string; // Exact numeric as string
  is_duplicate: boolean;
  message: string;
}

/**
 * Atomic, idempotent emission logging endpoint
 * 
 * Features:
 * - Idempotency: Duplicate action_id inserts are ignored, returns original result
 * - Atomicity: All updates happen in a single transaction
 * - Concurrency safety: Uses SELECT FOR UPDATE to prevent lost updates
 * - Precision: Returns exact numeric totals (as strings) with no rounding
 * 
 * @param request Emission log request with action_id, user_id, and emissions_lbs
 * @returns Response with exact numeric totals
 */
export async function logEmission(request: EmissionLogRequest): Promise<EmissionLogResponse> {
  try {
    // Validate input
    if (!request.action_id || !request.user_id || request.emissions_lbs === undefined) {
      throw new Error('Missing required fields: action_id, user_id, emissions_lbs');
    }

    if (request.emissions_lbs < 0) {
      throw new Error('emissions_lbs must be non-negative');
    }

    // Call database function for atomic, idempotent logging
    const { data, error } = await supabase.rpc('log_emission_atomic', {
      p_action_id: request.action_id,
      p_user_id: request.user_id,
      p_emissions_lbs: request.emissions_lbs.toString(), // Pass as string to preserve precision
      p_action_type: request.action_type || 'verified_action',
      p_quantity: request.quantity || null,
      p_unit: request.unit || 'lbs',
    });

    if (error) {
      console.error('Error logging emission:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from log_emission_atomic');
    }

    const result = data[0];

    // Return exact numeric totals as strings (no rounding)
    return {
      success: result.success,
      action_id: result.action_id,
      user_id: result.user_id,
      emissions_lbs: result.emissions_lbs.toString(),
      user_total_lbs: result.user_total_lbs.toString(),
      global_total_lbs: result.global_total_lbs.toString(),
      is_duplicate: result.is_duplicate,
      message: result.message,
    };
  } catch (error: any) {
    console.error('Error in logEmission:', error);
    return {
      success: false,
      action_id: request.action_id,
      user_id: request.user_id,
      emissions_lbs: request.emissions_lbs.toString(),
      user_total_lbs: '0',
      global_total_lbs: '0',
      is_duplicate: false,
      message: error.message || 'Failed to log emission',
    };
  }
}

/**
 * Get exact numeric totals for a user
 * Returns as strings to preserve precision
 */
export async function getUserTotalEmissions(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('total_emissions_lbs')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching user total:', error);
      return '0';
    }

    return data?.total_emissions_lbs?.toString() || '0';
  } catch (error) {
    console.error('Error in getUserTotalEmissions:', error);
    return '0';
  }
}

/**
 * Get exact global total emissions
 * Returns as string to preserve precision
 */
export async function getGlobalTotalEmissionsExact(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('global_emissions')
      .select('total_lbs_saved')
      .eq('id', 1)
      .single();

    if (error) {
      console.error('Error fetching global total:', error);
      return '0';
    }

    return data?.total_lbs_saved?.toString() || '0';
  } catch (error) {
    console.error('Error in getGlobalTotalEmissionsExact:', error);
    return '0';
  }
}

/**
 * Subscribe to emission events for real-time updates
 * Listens to PostgreSQL NOTIFY events
 */
export function subscribeToEmissionEvents(
  callback: (event: {
    action_id: string;
    user_id: string;
    emissions_lbs: string;
    user_total_lbs: string;
    global_total_lbs: string;
    event_type: string;
    timestamp: string;
  }) => void
): () => void {
  const channel = supabase
    .channel('emission-events')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'emission_events',
      },
      (payload: any) => {
        const event = payload.new;
        callback({
          action_id: event.action_id,
          user_id: event.user_id,
          emissions_lbs: event.emissions_lbs.toString(),
          user_total_lbs: event.user_total_lbs.toString(),
          global_total_lbs: event.global_total_lbs.toString(),
          event_type: event.event_type,
          timestamp: event.created_at,
        });
      }
    )
    .subscribe();

  // Also listen to PostgreSQL NOTIFY events
  const notifyChannel = supabase
    .channel('emission-notify')
    .on('broadcast', { event: 'emissions.updated' }, (payload: any) => {
      callback(payload.payload);
    })
    .subscribe();

  // Return cleanup function
  return () => {
    supabase.removeChannel(channel);
    supabase.removeChannel(notifyChannel);
  };
}

/**
 * Reconciliation function
 * Verifies global_emissions.total_lbs_saved == SUM(user_stats.total_emissions_lbs)
 * Auto-resyncs on mismatch
 */
export interface ReconciliationResult {
  in_sync: boolean;
  user_stats_sum: string; // Exact numeric as string
  global_total: string; // Exact numeric as string
  discrepancy: string; // Exact numeric as string
  fixed: boolean;
  timestamp: string;
}

export async function reconcileEmissions(): Promise<ReconciliationResult> {
  try {
    const { data, error } = await supabase.rpc('reconcile_emissions');

    if (error) {
      console.error('Error in reconciliation:', error);
      throw error;
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from reconcile_emissions');
    }

    const result = data[0];

    return {
      in_sync: result.in_sync,
      user_stats_sum: result.user_stats_sum.toString(),
      global_total: result.global_total.toString(),
      discrepancy: result.discrepancy.toString(),
      fixed: result.fixed,
      timestamp: result.timestamp,
    };
  } catch (error: any) {
    console.error('Error in reconcileEmissions:', error);
    throw error;
  }
}

/**
 * Get emission logging health status
 */
export interface EmissionLoggingHealth {
  total_actions: number;
  total_events: number;
  missing_events: number;
  global_total_lbs: string;
  user_stats_sum: string;
  in_sync: boolean;
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
      total_events: data.total_events || 0,
      missing_events: data.missing_events || 0,
      global_total_lbs: data.global_total_lbs?.toString() || '0',
      user_stats_sum: data.user_stats_sum?.toString() || '0',
      in_sync: data.in_sync || false,
      last_check: data.last_check || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error in getEmissionLoggingHealth:', error);
    throw error;
  }
}

