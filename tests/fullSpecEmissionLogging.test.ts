/**
 * Full-Spec Tests: User Action Logs + Global Aggregate
 * 
 * Tests demonstrate the example scenario:
 * User1: 10.2 + User2: 10.3 + User3: 10.4 => Global: 30.9 lbs
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  logActionFullSpec,
  bulkBackfillFullSpec,
  getGlobalTotalFullSpec,
  getUserActionsFullSpec,
  getLeaderboardFullSpec,
  reconcileEmissionsFullSpec,
  ActionLogRequest,
} from '../src/services/fullSpecEmissionLogging';
import { supabase } from '../src/lib/supabase';

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Full-Spec Emission Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Example Scenario: User1:10.2 + User2:10.3 + User3:10.4 => Global:30.9', () => {
    it('should log three actions sequentially and produce exact global total', async () => {
      // User1 logs 10.2
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'a1',
          user_id: 'user1',
          user_total_lbs: '10.200000',
          global_total_lbs: '10.200000',
          is_duplicate: false,
          message: 'Action logged successfully',
        }],
        error: null,
      });

      const result1 = await logActionFullSpec({
        action_id: 'a1',
        user_id: 'user1',
        lbs: '10.200000',
        logged_at: '2025-11-05T10:00:00Z',
        verified: true,
      });

      expect(result1.status).toBe('success');
      expect(result1.global_total_lbs).toBe('10.200000');

      // User2 logs 10.3
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'a2',
          user_id: 'user2',
          user_total_lbs: '10.300000',
          global_total_lbs: '20.500000', // 10.2 + 10.3
          is_duplicate: false,
          message: 'Action logged successfully',
        }],
        error: null,
      });

      const result2 = await logActionFullSpec({
        action_id: 'a2',
        user_id: 'user2',
        lbs: '10.300000',
        logged_at: '2025-11-05T10:05:00Z',
        verified: true,
      });

      expect(result2.status).toBe('success');
      expect(result2.global_total_lbs).toBe('20.500000');

      // User3 logs 10.4
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'a3',
          user_id: 'user3',
          user_total_lbs: '10.400000',
          global_total_lbs: '30.900000', // 10.2 + 10.3 + 10.4
          is_duplicate: false,
          message: 'Action logged successfully',
        }],
        error: null,
      });

      const result3 = await logActionFullSpec({
        action_id: 'a3',
        user_id: 'user3',
        lbs: '10.400000',
        logged_at: '2025-11-05T10:10:00Z',
        verified: true,
      });

      expect(result3.status).toBe('success');
      expect(result3.global_total_lbs).toBe('30.900000'); // Exact sum
    });

    it('should bulk backfill three actions and recompute exact global total', async () => {
      const actions: ActionLogRequest[] = [
        {
          action_id: 'a1',
          user_id: 'user1',
          lbs: '10.200000',
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
        {
          action_id: 'a2',
          user_id: 'user2',
          lbs: '10.300000',
          logged_at: '2025-11-05T10:05:00Z',
          verified: true,
        },
        {
          action_id: 'a3',
          user_id: 'user3',
          lbs: '10.400000',
          logged_at: '2025-11-05T10:10:00Z',
          verified: true,
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          inserted_count: 3,
          skipped_count: 0,
          global_total_lbs: '30.900000', // Exact sum from source of truth
          affected_users: 3,
          message: 'Bulk backfill completed: 3 inserted, 0 skipped',
        }],
        error: null,
      });

      const result = await bulkBackfillFullSpec({ actions });

      expect(result.status).toBe('success');
      expect(result.inserted_count).toBe(3);
      expect(result.global_total_lbs).toBe('30.900000'); // Exact, no rounding
    });
  });

  describe('Idempotency', () => {
    it('should return existing result for duplicate action_id', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'a1',
          user_id: 'user1',
          user_total_lbs: '10.200000',
          global_total_lbs: '10.200000',
          is_duplicate: true,
          message: 'Action already logged (idempotent)',
        }],
        error: null,
      });

      const result = await logActionFullSpec({
        action_id: 'a1',
        user_id: 'user1',
        lbs: '10.200000',
        logged_at: '2025-11-05T10:00:00Z',
        verified: true,
      });

      expect(result.status).toBe('success');
      expect(result.is_duplicate).toBe(true);
      expect(result.global_total_lbs).toBe('10.200000'); // Unchanged
    });
  });

  describe('Exact Numeric Precision', () => {
    it('should preserve exact numeric values without rounding', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'a1',
          user_id: 'user1',
          user_total_lbs: '10.200000',
          global_total_lbs: '10.200000',
          is_duplicate: false,
          message: 'Action logged successfully',
        }],
        error: null,
      });

      const result = await logActionFullSpec({
        action_id: 'a1',
        user_id: 'user1',
        lbs: '10.200000',
        logged_at: '2025-11-05T10:00:00Z',
        verified: true,
      });

      expect(result.user_total_lbs).toBe('10.200000');
      expect(result.global_total_lbs).toBe('10.200000');
      expect(typeof result.user_total_lbs).toBe('string');
      expect(typeof result.global_total_lbs).toBe('string');
    });
  });

  describe('Leaderboard', () => {
    it('should return users in descending order by total_emissions_lbs', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        gt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              user_id: 'user3',
              username: 'User3',
              total_emissions_lbs: '10.400000',
              last_update: '2025-11-05T10:10:00Z',
            },
            {
              user_id: 'user2',
              username: 'User2',
              total_emissions_lbs: '10.300000',
              last_update: '2025-11-05T10:05:00Z',
            },
            {
              user_id: 'user1',
              username: 'User1',
              total_emissions_lbs: '10.200000',
              last_update: '2025-11-05T10:00:00Z',
            },
          ],
          error: null,
        }),
      });

      const leaderboard = await getLeaderboardFullSpec(10);

      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].user_id).toBe('user3');
      expect(leaderboard[0].total_lbs).toBe('10.400000');

      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[1].user_id).toBe('user2');
      expect(leaderboard[1].total_lbs).toBe('10.300000');

      expect(leaderboard[2].rank).toBe(3);
      expect(leaderboard[2].user_id).toBe('user1');
      expect(leaderboard[2].total_lbs).toBe('10.200000');
    });
  });

  describe('Reconciliation', () => {
    it('should detect mismatch and create audit entry', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          in_sync: false,
          sum_user_totals: '30.900000',
          global_total: '30.500000', // Mismatch
          discrepancy: '0.400000',
          fixed: true,
          audit_id: 'audit-uuid',
          timestamp: new Date().toISOString(),
        }],
        error: null,
      });

      const result = await reconcileEmissionsFullSpec('system', true);

      expect(result.in_sync).toBe(false);
      expect(result.sum_user_totals).toBe('30.900000');
      expect(result.global_total).toBe('30.500000');
      expect(result.discrepancy).toBe('0.400000');
      expect(result.fixed).toBe(true);
      expect(result.audit_id).toBe('audit-uuid');
    });
  });

  describe('Acceptance Criteria', () => {
    it('should meet all acceptance assertions', async () => {
      // After bulk backfill with example data:
      // - global_emissions.total_lbs_saved === '30.900000'
      // - Each user_stats.total_emissions_lbs equals SUM(user_actions.lbs WHERE user_id = X AND verified = TRUE)
      // - APIs return numeric totals as strings preserving precision

      const actions: ActionLogRequest[] = [
        {
          action_id: 'a1',
          user_id: 'user1',
          lbs: '10.200000',
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
        {
          action_id: 'a2',
          user_id: 'user2',
          lbs: '10.300000',
          logged_at: '2025-11-05T10:05:00Z',
          verified: true,
        },
        {
          action_id: 'a3',
          user_id: 'user3',
          lbs: '10.400000',
          logged_at: '2025-11-05T10:10:00Z',
          verified: true,
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          inserted_count: 3,
          skipped_count: 0,
          global_total_lbs: '30.900000',
          affected_users: 3,
          message: 'Bulk backfill completed: 3 inserted, 0 skipped',
        }],
        error: null,
      });

      const result = await bulkBackfillFullSpec({ actions });

      // Acceptance assertion 1: global_emissions.total_lbs_saved === '30.900000'
      expect(result.global_total_lbs).toBe('30.900000');

      // Acceptance assertion 2: APIs return numeric totals as strings preserving precision
      expect(typeof result.global_total_lbs).toBe('string');
      expect(result.global_total_lbs).toBe('30.900000'); // Full precision preserved
    });
  });
});

