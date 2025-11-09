import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, UserAction, ActionTemplate } from '../lib/supabase';
import { TrendingDown, Flame, Award, Target, Globe, TrendingUp, Users, Zap, BarChart3, ArrowRight } from 'lucide-react';
import { getUserTotal, getGlobalTotal } from '../services/simpleEmissionLogging';
import { 
  getUserStatistics,
  getUserStatsSummary,
  getGlobalStatistics, 
  getLeaderboardEntries,
  getRecentActionLogs,
  kgToLbs 
} from '../services/climateStats';
import { TREE_EQUIVALENT_LBS_PER_TREE } from '../constants/emissionFactors';

export default function Dashboard() {
  const { profile } = useAuth();
  const [actions, setActions] = useState<UserAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<any>(null);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [stats, setStats] = useState({
    totalEmissionsSaved: 0,
    actionsThisMonth: 0,
    currentStreak: 0,
    globalTotalLbs: 0,
    monthlyCo2Kg: 0,
    yearlyCo2Kg: 0,
  });

  useEffect(() => {
    loadDashboardData();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('dashboard-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_statistics',
          filter: `user_id=eq.${profile?.id}`,
        },
        () => {
          loadDashboardData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'global_statistics',
        },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const loadDashboardData = async () => {
    if (!profile) return;

    try {
      // Load comprehensive statistics using new service
      // Try production schema first (includes ranks), fallback to previous schema
      const [userStatsSummary, userStatistics, globalStatistics, actionsResult, leaderboard] = await Promise.all([
        getUserStatsSummary(profile.id), // Production schema with ranks
        getUserStatistics(profile.id), // Previous/legacy schema
        getGlobalStatistics(),
        supabase
          .from('user_actions')
          .select(`
            *,
            action_templates (*)
          `)
          .eq('user_id', profile.id)
          .order('logged_at', { ascending: false })
          .limit(10),
        getLeaderboardEntries('all_time', 'global', undefined, 1000),
      ]);

      const { data: actionsData } = actionsResult;

      // Use production schema if available (has ranks), otherwise use previous schema
      const statsToUse = userStatsSummary || userStatistics;
      setUserStats(statsToUse);
      setGlobalStats(globalStatistics);

      // Get user's rank from production schema if available, otherwise calculate from leaderboard
      if (userStatsSummary?.rank_global) {
        setUserRank(userStatsSummary.rank_global);
      } else if (leaderboard && statsToUse) {
        const rankIndex = leaderboard.findIndex(
          (entry) => entry.user_id === profile.id
        );
        setUserRank(rankIndex >= 0 ? rankIndex + 1 : null);
      }

      // Convert kg to lbs for display
      // Support both production schema (current_month_co2) and previous schema (current_month_co2_saved)
      const totalCo2Lbs = statsToUse 
        ? kgToLbs(statsToUse.total_co2_saved_kg)
        : 0;
      const monthlyCo2Lbs = statsToUse
        ? kgToLbs((statsToUse as any).current_month_co2 || (statsToUse as any).current_month_co2_saved || 0)
        : 0;
      const yearlyCo2Lbs = statsToUse
        ? kgToLbs((statsToUse as any).current_year_co2 || (statsToUse as any).current_year_co2_saved || 0)
        : 0;
      // Always fetch global total from simpleEmissionLogging service
      // This ensures all users see the same global total
      // Formula: SUM(user_stats.total_lbs) = global_emissions.total_lbs
      const [userTotal, globalTotal] = await Promise.all([
        getUserTotal(profile.id),
        getGlobalTotal(),
      ]);

      // Always use simple global total to ensure consistency across all users
      // All users should see the same global total: SUM(user_stats.total_lbs)
      const globalTotalLbs = globalTotal;

      // Use user statistics if available, otherwise use simple user total
      const fallbackTotal = totalCo2Lbs || userTotal;
      const fallbackGlobal = globalTotal;

      if (actionsData) {
        setActions(actionsData);

        const thisMonth = new Date();
        thisMonth.setDate(1);
        thisMonth.setHours(0, 0, 0, 0);

        const monthActions = actionsData.filter(
          (a) => new Date(a.logged_at) >= thisMonth
        );

        setStats({
          totalEmissionsSaved: totalCo2Lbs || fallbackTotal,
          actionsThisMonth: (statsToUse as any)?.total_actions || (statsToUse as any)?.total_actions_count || monthActions.length,
          currentStreak: statsToUse?.streak_days || profile.current_streak,
          globalTotalLbs: globalTotalLbs || fallbackGlobal,
          monthlyCo2Kg: (statsToUse as any)?.current_month_co2 || (statsToUse as any)?.current_month_co2_saved || 0,
          yearlyCo2Kg: (statsToUse as any)?.current_year_co2 || (statsToUse as any)?.current_year_co2_saved || 0,
        });
      } else {
        setStats({
          totalEmissionsSaved: totalCo2Lbs || fallbackTotal,
          actionsThisMonth: (statsToUse as any)?.total_actions || (statsToUse as any)?.total_actions_count || 0,
          currentStreak: statsToUse?.streak_days || profile.current_streak,
          globalTotalLbs: globalTotalLbs || fallbackGlobal,
          monthlyCo2Kg: (statsToUse as any)?.current_month_co2 || (statsToUse as any)?.current_month_co2_saved || 0,
          yearlyCo2Kg: (statsToUse as any)?.current_year_co2 || (statsToUse as any)?.current_year_co2_saved || 0,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {profile?.full_name}!
        </h1>
        <p className="text-gray-600 mt-1">
          Track your progress and continue making an impact
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <TrendingDown className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              Total Impact
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-4xl font-bold">
              {stats.totalEmissionsSaved.toFixed(1)} lbs
            </div>
            <p className="text-emerald-100 text-sm">
              {userStats ? `${userStats.total_co2_saved_kg.toFixed(2)} kg CO₂` : 'CO₂ saved'}
            </p>
            {userRank && (
              <p className="text-emerald-100 text-xs mt-2">
                <Award className="w-3 h-3 inline mr-1" />
                Rank #{userRank} globally
              </p>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <Flame className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              Streak
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-4xl font-bold">
              {stats.currentStreak}
            </div>
            <p className="text-teal-100 text-sm">days in a row</p>
            {userStats?.last_action_date && (
              <p className="text-teal-100 text-xs mt-2">
                Last action: {new Date(userStats.last_action_date).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <BarChart3 className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              This Month
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-4xl font-bold">
              {kgToLbs(stats.monthlyCo2Kg).toFixed(1)} lbs
            </div>
            <p className="text-blue-100 text-sm">
              {stats.monthlyCo2Kg.toFixed(2)} kg CO₂
            </p>
            <p className="text-blue-100 text-xs mt-2">
              {stats.actionsThisMonth} actions
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <Target className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              This Year
            </span>
          </div>
          <div className="space-y-1">
            <div className="text-4xl font-bold">
              {kgToLbs(stats.yearlyCo2Kg).toFixed(1)} lbs
            </div>
            <p className="text-purple-100 text-sm">
              {stats.yearlyCo2Kg.toFixed(2)} kg CO₂
            </p>
            {profile?.monthly_goal && (
              <p className="text-purple-100 text-xs mt-2">
                Goal: {profile.monthly_goal * 12} lbs/year
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Global Community Impact Card */}
      {globalStats && stats.globalTotalLbs > 0 && (
        <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 rounded-xl shadow-lg p-6 text-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-4 rounded-xl">
                <Globe className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-1">Global Impact</h2>
                <p className="text-emerald-100 text-sm">
                  {globalStats.total_users.toLocaleString()} active users
                </p>
              </div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-3xl font-bold mb-1">
                {stats.globalTotalLbs.toLocaleString(undefined, { maximumFractionDigits: 0 })} lbs
              </div>
              <p className="text-emerald-100 text-sm">
                {globalStats.total_co2_saved_kg.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg CO₂ saved
              </p>
              <p className="text-emerald-100 text-xs mt-1">
                {Math.floor(stats.globalTotalLbs / TREE_EQUIVALENT_LBS_PER_TREE).toLocaleString()} trees equivalent
              </p>
            </div>
            <div className="text-center md:text-right">
              <div className="text-2xl font-bold mb-1">
                {((stats.totalEmissionsSaved / stats.globalTotalLbs) * 100).toFixed(2)}%
              </div>
              <p className="text-emerald-100 text-sm">Your contribution</p>
              <p className="text-emerald-100 text-xs mt-1">
                {stats.totalEmissionsSaved.toFixed(1)} lbs of {stats.globalTotalLbs.toLocaleString(undefined, { maximumFractionDigits: 0 })} lbs
              </p>
            </div>
          </div>
          {globalStats.total_actions_count > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>{globalStats.total_actions_count.toLocaleString()} total actions</span>
              </div>
              {globalStats.countries_count > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>{globalStats.countries_count} countries</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-emerald-100 text-sm text-center">
              💡 See detailed global statistics, leaderboards, and live activity feed on the <strong>Global Impact</strong> page
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Actions</h2>
        {actions.length === 0 ? (
          <p className="text-gray-600 text-center py-8">
            No actions yet. Start logging your climate actions!
          </p>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => {
              const template = action.action_templates as ActionTemplate;
              return (
                <div
                  key={action.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-100"
                >
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">{template?.icon || '🌱'}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {action.custom_title || template?.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {new Date(action.logged_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-600">
                      {((action.custom_emissions_saved || (template?.emissions_saved || 0) * 2.20462)).toFixed(1)} lbs CO₂
                    </div>
                    <div className="text-sm text-teal-600">
                      +{template?.points_reward || 10} pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
