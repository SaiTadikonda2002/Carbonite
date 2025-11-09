/**
 * Bulk Sync API Endpoints
 * 
 * POST /api/actions/log
 * POST /api/actions/bulk_backfill
 * POST /api/actions/reconcile
 * GET /api/actions/corrections
 * GET /api/actions/health
 */

import {
  logAction,
  bulkBackfillActions,
  reconcileEmissionsWithCorrections,
  getEmissionCorrections,
  getEmissionLoggingHealth,
  LogActionRequest,
  BulkBackfillRequest,
} from '../bulkSync';

/**
 * POST /api/actions/log
 * Log a single verified action
 * 
 * Request:
 * {
 *   "action_id": "a1-uuid",
 *   "user_id": "user1-uuid",
 *   "lbs": "10.2",
 *   "logged_at": "2025-11-05T10:00:00Z",
 *   "action_type": "verified_action",
 *   "metadata": {}
 * }
 * 
 * Response:
 * {
 *   "status": "success",
 *   "action_id": "a1-uuid",
 *   "user_total_lbs": "10.200000",
 *   "global_total_lbs": "10.200000",
 *   "timestamp": "2025-11-05T10:00:00Z"
 * }
 */
export async function logActionApi(request: LogActionRequest) {
  return await logAction(request);
}

/**
 * POST /api/actions/bulk_backfill
 * Bulk backfill verified actions and recompute totals from source of truth
 * 
 * Request:
 * {
 *   "actions": [
 *     {
 *       "action_id": "a1-uuid",
 *       "user_id": "user1-uuid",
 *       "lbs": "10.2",
 *       "logged_at": "2025-11-05T10:00:00Z",
 *       "verified": true
 *     },
 *     ...
 *   ],
 *   "idempotency_key": "optional-key"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "inserted_count": 3,
 *   "skipped_count": 0,
 *   "global_total_lbs": "30.900000",
 *   "affected_users": 3,
 *   "message": "Bulk backfill completed: 3 inserted, 0 skipped"
 * }
 */
export async function bulkBackfillApi(request: BulkBackfillRequest) {
  return await bulkBackfillActions(request);
}

/**
 * POST /api/actions/reconcile
 * Run reconciliation with corrections logging
 * 
 * Request:
 * {
 *   "performed_by": "system",
 *   "auto_correct": true
 * }
 * 
 * Response:
 * {
 *   "in_sync": false,
 *   "user_stats_sum": "30.900000",
 *   "global_total": "30.500000",
 *   "discrepancy": "0.400000",
 *   "fixed": true,
 *   "correction_id": "correction-uuid",
 *   "timestamp": "2025-11-05T12:00:00Z"
 * }
 */
export async function reconcileApi(
  performedBy: string = 'system',
  autoCorrect: boolean = true
) {
  return await reconcileEmissionsWithCorrections(performedBy, autoCorrect);
}

/**
 * GET /api/actions/corrections
 * Get emission corrections (audit trail)
 * 
 * Query params:
 * - limit: number (default: 100)
 * 
 * Response:
 * [
 *   {
 *     "correction_id": "correction-uuid",
 *     "previous_total": "30.500000",
 *     "corrected_total": "30.900000",
 *     "discrepancy": "0.400000",
 *     "reason": "Reconciliation auto-correction",
 *     "performed_at": "2025-11-05T12:00:00Z",
 *     "performed_by": "system",
 *     "reconciliation_run_id": "run-uuid",
 *     "metadata": {}
 *   },
 *   ...
 * ]
 */
export async function getCorrectionsApi(limit: number = 100) {
  return await getEmissionCorrections(limit);
}

/**
 * GET /api/actions/health
 * Get emission logging health status
 * 
 * Response:
 * {
 *   "total_actions": 100,
 *   "total_users": 3,
 *   "global_total_lbs": "30.900000",
 *   "user_stats_sum": "30.900000",
 *   "in_sync": true,
 *   "total_corrections": 0,
 *   "corrections_last_24h": 0,
 *   "last_check": "2025-11-05T12:00:00Z"
 * }
 */
export async function getHealthApi() {
  return await getEmissionLoggingHealth();
}

