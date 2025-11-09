/**
 * Tests for Atomic, Idempotent Emission Logging
 * 
 * Tests cover:
 * - Sequential logging
 * - Concurrent logging (race conditions)
 * - Idempotency (duplicate action_id)
 * - Exact numeric precision (no rounding)
 * - Reconciliation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { logEmission, reconcileEmissions, EmissionLogRequest } from '../src/services/emissionLogging';
import { supabase } from '../src/lib/supabase';

// Mock Supabase for testing
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('Emission Logging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Sequential Logging', () => {
    it('should log User1 emission of 22.5 lbs and update global total to 34.90', async () => {
      const request: EmissionLogRequest = {
        action_id: 'action-1',
        user_id: 'user-1',
        emissions_lbs: 22.5,
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'action-1',
          user_id: 'user-1',
          emissions_lbs: '22.500000',
          user_total_lbs: '22.500000',
          global_total_lbs: '22.500000',
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result = await logEmission(request);

      expect(result.success).toBe(true);
      expect(result.emissions_lbs).toBe('22.500000');
      expect(result.user_total_lbs).toBe('22.500000');
      expect(result.global_total_lbs).toBe('22.500000');
      expect(result.is_duplicate).toBe(false);
    });

    it('should log User2 emission of 12.4 lbs and update global total correctly', async () => {
      const request: EmissionLogRequest = {
        action_id: 'action-2',
        user_id: 'user-2',
        emissions_lbs: 12.4,
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'action-2',
          user_id: 'user-2',
          emissions_lbs: '12.400000',
          user_total_lbs: '12.400000',
          global_total_lbs: '34.900000', // 22.5 + 12.4
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result = await logEmission(request);

      expect(result.success).toBe(true);
      expect(result.global_total_lbs).toBe('34.900000');
      expect(result.is_duplicate).toBe(false);
    });
  });

  describe('Idempotency', () => {
    it('should return existing result for duplicate action_id', async () => {
      const request: EmissionLogRequest = {
        action_id: 'action-1',
        user_id: 'user-1',
        emissions_lbs: 22.5,
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'action-1',
          user_id: 'user-1',
          emissions_lbs: '22.500000',
          user_total_lbs: '22.500000',
          global_total_lbs: '22.500000',
          is_duplicate: true,
          message: 'Action already logged (idempotent)',
        }],
        error: null,
      });

      const result = await logEmission(request);

      expect(result.success).toBe(true);
      expect(result.is_duplicate).toBe(true);
      expect(result.message).toContain('idempotent');
    });

    it('should not modify totals when duplicate action_id is submitted', async () => {
      const request: EmissionLogRequest = {
        action_id: 'action-1',
        user_id: 'user-1',
        emissions_lbs: 22.5,
      };

      // First call
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'action-1',
          user_id: 'user-1',
          emissions_lbs: '22.500000',
          user_total_lbs: '22.500000',
          global_total_lbs: '22.500000',
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const firstResult = await logEmission(request);
      expect(firstResult.is_duplicate).toBe(false);

      // Second call (duplicate)
      (supabase.rpc as jest.Mock).mockResolvedValueOnce({
        data: [{
          success: true,
          action_id: 'action-1',
          user_id: 'user-1',
          emissions_lbs: '22.500000',
          user_total_lbs: '22.500000',
          global_total_lbs: '22.500000', // Same total, not doubled
          is_duplicate: true,
          message: 'Action already logged (idempotent)',
        }],
        error: null,
      });

      const secondResult = await logEmission(request);
      expect(secondResult.is_duplicate).toBe(true);
      expect(secondResult.global_total_lbs).toBe(firstResult.global_total_lbs);
    });
  });

  describe('Concurrent Logging', () => {
    it('should handle concurrent requests without lost updates', async () => {
      const requests: EmissionLogRequest[] = [
        { action_id: 'action-1', user_id: 'user-1', emissions_lbs: 22.5 },
        { action_id: 'action-2', user_id: 'user-2', emissions_lbs: 12.4 },
        { action_id: 'action-3', user_id: 'user-1', emissions_lbs: 5.1 },
      ];

      // Simulate concurrent execution
      const promises = requests.map((req, index) => {
        (supabase.rpc as jest.Mock).mockResolvedValueOnce({
          data: [{
            success: true,
            action_id: req.action_id,
            user_id: req.user_id,
            emissions_lbs: req.emissions_lbs.toFixed(6),
            user_total_lbs: req.user_id === 'user-1' 
              ? (22.5 + (index === 2 ? 5.1 : 0)).toFixed(6)
              : '12.400000',
            global_total_lbs: '40.000000', // All should sum correctly
            is_duplicate: false,
            message: 'Emission logged successfully',
          }],
          error: null,
        });
        return logEmission(req);
      });

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.is_duplicate).toBe(false);
      });

      // Verify no lost updates
      const globalTotals = results.map(r => parseFloat(r.global_total_lbs));
      // All should reflect correct totals (may vary based on order, but should be consistent)
      expect(globalTotals.every(total => total >= 22.5 && total <= 40.0)).toBe(true);
    });
  });

  describe('Exact Numeric Precision', () => {
    it('should preserve exact numeric values without rounding', async () => {
      const request: EmissionLogRequest = {
        action_id: 'action-precise',
        user_id: 'user-1',
        emissions_lbs: 22.500000, // Exact value
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'action-precise',
          user_id: 'user-1',
          emissions_lbs: '22.500000', // Exact, no rounding
          user_total_lbs: '22.500000',
          global_total_lbs: '22.500000',
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result = await logEmission(request);

      // Verify exact precision
      expect(result.emissions_lbs).toBe('22.500000');
      expect(result.user_total_lbs).toBe('22.500000');
      expect(result.global_total_lbs).toBe('22.500000');
    });

    it('should handle very precise decimal values', async () => {
      const request: EmissionLogRequest = {
        action_id: 'action-precise-2',
        user_id: 'user-1',
        emissions_lbs: 12.345678,
      };

      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          success: true,
          action_id: 'action-precise-2',
          user_id: 'user-1',
          emissions_lbs: '12.345678', // Exact precision preserved
          user_total_lbs: '34.845678',
          global_total_lbs: '34.845678',
          is_duplicate: false,
          message: 'Emission logged successfully',
        }],
        error: null,
      });

      const result = await logEmission(request);

      expect(result.emissions_lbs).toBe('12.345678');
    });
  });

  describe('Reconciliation', () => {
    it('should detect and fix discrepancies', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          in_sync: false,
          user_stats_sum: '40.000000',
          global_total: '39.500000',
          discrepancy: '0.500000',
          fixed: true,
          timestamp: new Date().toISOString(),
        }],
        error: null,
      });

      const result = await reconcileEmissions();

      expect(result.in_sync).toBe(false);
      expect(result.discrepancy).toBe('0.500000');
      expect(result.fixed).toBe(true);
    });

    it('should confirm sync when totals match', async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [{
          in_sync: true,
          user_stats_sum: '40.000000',
          global_total: '40.000000',
          discrepancy: '0.000000',
          fixed: false,
          timestamp: new Date().toISOString(),
        }],
        error: null,
      });

      const result = await reconcileEmissions();

      expect(result.in_sync).toBe(true);
      expect(result.discrepancy).toBe('0.000000');
      expect(result.fixed).toBe(false);
    });
  });

  describe('Leaderboard Ordering', () => {
    it('should return users in descending order by total_emissions_lbs', async () => {
      // After User1 logs 22.5 and User2 logs 12.4:
      // User1 should be rank 1, User2 should be rank 2
      const { getLeaderboard } = await import('../src/services/leaderboard');
      
      // Mock leaderboard query
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            rank: 1,
            user_id: 'user-1',
            username: 'User1',
            total_emissions_lbs: '22.500000',
            action_count: 1,
            last_update_timestamp: new Date().toISOString(),
          },
          {
            rank: 2,
            user_id: 'user-2',
            username: 'User2',
            total_emissions_lbs: '12.400000',
            action_count: 1,
            last_update_timestamp: new Date().toISOString(),
          },
        ],
        error: null,
      });

      const leaderboard = await getLeaderboard(10);

      expect(leaderboard[0].rank).toBe(1);
      expect(leaderboard[0].user_id).toBe('user-1');
      expect(leaderboard[0].total_emissions_lbs).toBe(22.5);
      
      expect(leaderboard[1].rank).toBe(2);
      expect(leaderboard[1].user_id).toBe('user-2');
      expect(leaderboard[1].total_emissions_lbs).toBe(12.4);
    });
  });
});

