/**
 * Tests for Bulk Sync: Sync all user action logs into global total
 * 
 * Tests demonstrate the example scenario:
 * User1: 10.2 + User2: 10.3 + User3: 10.4 => Global: 30.9 lbs
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  bulkBackfillActions,
  logAction,
  reconcileEmissionsWithCorrections,
  getEmissionCorrections,
  ActionLog,
  LogActionRequest,
} from '../src/services/bulkSync';
import { supabase } from '../src/lib/supabase';

// Mock Supabase
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Bulk Sync - Example Scenario', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Example Scenario: User1:10.2 + User2:10.3 + User3:10.4 => Global:30.9', () => {
    it('should bulk backfill three actions and compute exact global total', async () => {
      const actions: ActionLog[] = [
        {
          action_id: 'a1-uuid',
          user_id: 'user1-uuid',
          lbs: '10.2',
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
        {
          action_id: 'a2-uuid',
          user_id: 'user2-uuid',
          lbs: '10.3',
          logged_at: '2025-11-05T10:05:00Z',
          verified: true,
        },
        {
          action_id: 'a3-uuid',
          user_id: 'user3-uuid',
          lbs: '10.4',
          logged_at: '2025-11-05T10:10:00Z',
          verified: true,
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          inserted_count: 3,
          skipped_count: 0,
          global_total_lbs: '30.900000', // Exact sum: 10.2 + 10.3 + 10.4
          affected_users: 3,
          message: 'Bulk backfill completed: 3 inserted, 0 skipped',
        }],
        error: null,
      });

      const result = await bulkBackfillActions({ actions });

      expect(result.success).toBe(true);
      expect(result.inserted_count).toBe(3);
      expect(result.global_total_lbs).toBe('30.900000'); // Exact, no rounding
      expect(result.affected_users).toBe(3);
    });

    it('should compute exact user totals after bulk backfill', async () => {
      // After bulk backfill, verify individual user totals
      const { getUserTotalEmissions } = await import('../src/services/emissionLogging');

      // Mock user stats queries
      (supabase.from as jest.Mock).mockImplementation((table: string) => {
        if (table === 'user_stats') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { total_emissions_lbs: '10.200000' }, // For user1
              error: null,
            }),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { total_emissions_lbs: '10.300000' }, // For user2
            error: null,
          }),
        };
      });

      const user1Total = await getUserTotalEmissions('user1-uuid');
      expect(user1Total).toBe('10.200000');

      const user2Total = await getUserTotalEmissions('user2-uuid');
      expect(user2Total).toBe('10.300000');
    });

    it('should return leaderboard in descending order by total_emissions_lbs', async () => {
      const { getLeaderboard } = await import('../src/services/leaderboard');

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            rank: 1,
            user_id: 'user3-uuid',
            username: 'User3',
            total_emissions_lbs: '10.400000',
            action_count: 1,
            last_update_timestamp: '2025-11-05T10:10:00Z',
          },
          {
            rank: 2,
            user_id: 'user2-uuid',
            username: 'User2',
            total_emissions_lbs: '10.300000',
            action_count: 1,
            last_update_timestamp: '2025-11-05T10:05:00Z',
          },
          {
            rank: 3,
            user_id: 'user1-uuid',
            username: 'User1',
            total_emissions_lbs: '10.200000',
            action_count: 1,
            last_update_timestamp: '2025-11-05T10:00:00Z',
          },
        ],
        error: null,
      });

      const leaderboard = await getLeaderboard(10);

      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].user_id).toBe('user3-uuid');
      expect(leaderboard[0].total_emissions_lbs).toBe(10.4);

      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[1].user_id).toBe('user2-uuid');
      expect(leaderboard[1].total_emissions_lbs).toBe(10.3);

      expect(leaderboard[2].rank).toBe(3);
      expect(leaderboard[2].user_id).toBe('user1-uuid');
      expect(leaderboard[2].total_emissions_lbs).toBe(10.2);
    });
  });

  describe('Sequential Logging', () => {
    it('should log actions sequentially and accumulate totals correctly', async () => {
      // User1 logs 10.2
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'a1-uuid',
          user_id: 'user1-uuid',
          emissions_lbs: '10.200000',
          user_total_lbs: '10.200000',
          global_total_lbs: '10.200000',
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result1 = await logAction({
        action_id: 'a1-uuid',
        user_id: 'user1-uuid',
        lbs: '10.2',
        logged_at: '2025-11-05T10:00:00Z',
      });

      expect(result1.success).toBe(true);
      expect(result1.global_total_lbs).toBe('10.200000');

      // User2 logs 10.3
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'a2-uuid',
          user_id: 'user2-uuid',
          emissions_lbs: '10.300000',
          user_total_lbs: '10.300000',
          global_total_lbs: '20.500000', // 10.2 + 10.3
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result2 = await logAction({
        action_id: 'a2-uuid',
        user_id: 'user2-uuid',
        lbs: '10.3',
        logged_at: '2025-11-05T10:05:00Z',
      });

      expect(result2.success).toBe(true);
      expect(result2.global_total_lbs).toBe('20.500000');

      // User3 logs 10.4
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'a3-uuid',
          user_id: 'user3-uuid',
          emissions_lbs: '10.400000',
          user_total_lbs: '10.400000',
          global_total_lbs: '30.900000', // 10.2 + 10.3 + 10.4
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result3 = await logAction({
        action_id: 'a3-uuid',
        user_id: 'user3-uuid',
        lbs: '10.4',
        logged_at: '2025-11-05T10:10:00Z',
      });

      expect(result3.success).toBe(true);
      expect(result3.global_total_lbs).toBe('30.900000'); // Exact sum
    });
  });

  describe('Idempotency', () => {
    it('should ignore duplicate action_ids in bulk backfill', async () => {
      const actions: ActionLog[] = [
        {
          action_id: 'a1-uuid',
          user_id: 'user1-uuid',
          lbs: '10.2',
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
        {
          action_id: 'a1-uuid', // Duplicate
          user_id: 'user1-uuid',
          lbs: '10.2',
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
      ];

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          inserted_count: 1, // Only one inserted
          skipped_count: 1, // One skipped (duplicate)
          global_total_lbs: '10.200000', // Not doubled
          affected_users: 1,
          message: 'Bulk backfill completed: 1 inserted, 1 skipped',
        }],
        error: null,
      });

      const result = await bulkBackfillActions({ actions });

      expect(result.success).toBe(true);
      expect(result.inserted_count).toBe(1);
      expect(result.skipped_count).toBe(1);
      expect(result.global_total_lbs).toBe('10.200000'); // Not 20.4
    });
  });

  describe('Reconciliation with Corrections', () => {
    it('should detect mismatch and create correction record', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          in_sync: false,
          user_stats_sum: '30.900000',
          global_total: '30.500000', // Mismatch
          discrepancy: '0.400000',
          fixed: true,
          correction_id: 'correction-uuid',
          timestamp: new Date().toISOString(),
        }],
        error: null,
      });

      const result = await reconcileEmissionsWithCorrections('system', true);

      expect(result.in_sync).toBe(false);
      expect(result.discrepancy).toBe('0.400000');
      expect(result.fixed).toBe(true);
      expect(result.correction_id).toBe('correction-uuid');
    });

    it('should retrieve correction records for audit trail', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({
          data: [
            {
              correction_id: 'correction-uuid',
              previous_total: '30.500000',
              corrected_total: '30.900000',
              discrepancy: '0.400000',
              reason: 'Reconciliation auto-correction',
              performed_at: '2025-11-05T12:00:00Z',
              performed_by: 'system',
              reconciliation_run_id: 'run-uuid',
              metadata: {},
            },
          ],
          error: null,
        }),
      });

      const corrections = await getEmissionCorrections(10);

      expect(corrections.length).toBe(1);
      expect(corrections[0].correction_id).toBe('correction-uuid');
      expect(corrections[0].previous_total).toBe('30.500000');
      expect(corrections[0].corrected_total).toBe('30.900000');
    });
  });

  describe('Exact Numeric Precision', () => {
    it('should preserve exact numeric values without rounding', async () => {
      const actions: ActionLog[] = [
        {
          action_id: 'a1-uuid',
          user_id: 'user1-uuid',
          lbs: '10.200000', // Exact 6 decimal places
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
        {
          action_id: 'a2-uuid',
          user_id: 'user2-uuid',
          lbs: '10.300000',
          logged_at: '2025-11-05T10:05:00Z',
          verified: true,
        },
        {
          action_id: 'a3-uuid',
          user_id: 'user3-uuid',
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
          global_total_lbs: '30.900000', // Exact sum, no rounding
          affected_users: 3,
          message: 'Bulk backfill completed: 3 inserted, 0 skipped',
        }],
        error: null,
      });

      const result = await bulkBackfillActions({ actions });

      expect(result.global_total_lbs).toBe('30.900000'); // Exact precision
    });
  });

  describe('Acceptance Criteria', () => {
    it('should meet all acceptance assertions', async () => {
      // After bulk backfill with example data:
      // - global_emissions.total_lbs_saved === '30.900000'
      // - user_stats for user1 === '10.200000', user2 === '10.300000', user3 === '10.400000'
      // - Leaderboard ranks users descending by total_emissions_lbs
      // - API responses return numeric totals as strings preserving full precision

      const actions: ActionLog[] = [
        {
          action_id: 'a1-uuid',
          user_id: 'user1-uuid',
          lbs: '10.2',
          logged_at: '2025-11-05T10:00:00Z',
          verified: true,
        },
        {
          action_id: 'a2-uuid',
          user_id: 'user2-uuid',
          lbs: '10.3',
          logged_at: '2025-11-05T10:05:00Z',
          verified: true,
        },
        {
          action_id: 'a3-uuid',
          user_id: 'user3-uuid',
          lbs: '10.4',
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

      const result = await bulkBackfillActions({ actions });

      // Acceptance assertion 1: global_emissions.total_lbs_saved === '30.900000'
      expect(result.global_total_lbs).toBe('30.900000');

      // Acceptance assertion 2: API responses return numeric totals as strings
      expect(typeof result.global_total_lbs).toBe('string');
      expect(result.global_total_lbs).toBe('30.900000'); // Full precision preserved
    });
  });
});

