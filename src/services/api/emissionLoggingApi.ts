/**
 * Emission Logging API Endpoint Contract
 * 
 * POST /api/emissions/log
 * 
 * Request:
 * {
 *   "action_id": "uuid",
 *   "user_id": "uuid",
 *   "emissions_lbs": 22.5,
 *   "action_type": "verified_action",
 *   "quantity": 10,
 *   "unit": "lbs"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "action_id": "uuid",
 *   "user_id": "uuid",
 *   "emissions_lbs": "22.500000",  // Exact numeric as string
 *   "user_total_lbs": "34.900000",  // Exact numeric as string
 *   "global_total_lbs": "34.900000", // Exact numeric as string
 *   "is_duplicate": false,
 *   "message": "Emission logged successfully"
 * }
 */

import { logEmission, EmissionLogRequest, EmissionLogResponse } from '../emissionLogging';

/**
 * POST /api/emissions/log
 * Idempotent, atomic emission logging endpoint
 */
export async function logEmissionApi(request: EmissionLogRequest): Promise<EmissionLogResponse> {
  return await logEmission(request);
}

/**
 * GET /api/emissions/user/:userId
 * Get exact user total emissions
 */
export async function getUserTotalApi(userId: string): Promise<{ user_id: string; total_lbs: string }> {
  const { getUserTotalEmissions } = await import('../emissionLogging');
  const total = await getUserTotalEmissions(userId);
  return {
    user_id: userId,
    total_lbs: total,
  };
}

/**
 * GET /api/emissions/global
 * Get exact global total emissions
 */
export async function getGlobalTotalApi(): Promise<{ total_lbs: string }> {
  const { getGlobalTotalEmissionsExact } = await import('../emissionLogging');
  const total = await getGlobalTotalEmissionsExact();
  return {
    total_lbs: total,
  };
}

/**
 * POST /api/emissions/reconcile
 * Run reconciliation check and auto-resync if needed
 */
export async function reconcileEmissionsApi(): Promise<{
  in_sync: boolean;
  user_stats_sum: string;
  global_total: string;
  discrepancy: string;
  fixed: boolean;
  timestamp: string;
}> {
  const { reconcileEmissions } = await import('../emissionLogging');
  return await reconcileEmissions();
}

/**
 * GET /api/emissions/health
 * Get emission logging health status
 */
export async function getEmissionHealthApi(): Promise<{
  total_actions: number;
  total_events: number;
  missing_events: number;
  global_total_lbs: string;
  user_stats_sum: string;
  in_sync: boolean;
  last_check: string;
}> {
  const { getEmissionLoggingHealth } = await import('../emissionLogging');
  return await getEmissionLoggingHealth();
}

