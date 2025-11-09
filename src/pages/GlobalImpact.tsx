import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Zap, TrendingDown, Globe as GlobeIcon, RefreshCw, Trophy, Award, Clock } from 'lucide-react';
import { TREE_EQUIVALENT_LBS_PER_TREE } from '../constants/emissionFactors';
import { getLeaderboard, getActiveUsersCount, getGlobalTotalEmissions, LeaderboardEntry } from '../services/leaderboard';
import { 
  getGlobalStatistics, 
  getLeaderboardEntries as getNewLeaderboardEntries,
  kgToLbs 
} from '../services/climateStats';

interface GlobalStats {
  totalEmissionsLbs: number;
  totalActions: number;
  totalUsers: number;
  countriesRepresented: number;
}

interface RecentAction {
  id: string;
  username: string;
  actionTitle: string;
  actionDescription: string;
  emissionsLbs: number;
  timestamp: string;
  country?: string;
  actionType?: string;
}

interface TopContributor {
  username: string;
  totalEmissionsLbs: number;
  actionCount: number;
}

interface LeaderboardData {
  entries: LeaderboardEntry[];
  activeUsers: number;
  globalTotal: number;
}

export default function GlobalImpact() {
  const [stats, setStats] = useState<GlobalStats>({
    totalEmissionsLbs: 0,
    totalActions: 0,
    totalUsers: 0,
    countriesRepresented: 0,
  });
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [topContributors, setTopContributors] = useState<TopContributor[]>([]);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [feedPage, setFeedPage] = useState(1);
  const [newActionCount, setNewActionCount] = useState(0);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'all_time' | 'yearly' | 'monthly' | 'weekly'>('all_time');
  const [globalStats, setGlobalStats] = useState<any>(null);

  const loadGlobalStats = async () => {
    try {
      // Load comprehensive statistics using new service
      const [newGlobalStats, newLeaderboard, oldLeaderboard, activeUsers, globalTotal] = await Promise.all([
        getGlobalStatistics(),
        getNewLeaderboardEntries(leaderboardPeriod, 'global', undefined, 10),
        getLeaderboard(10),
        getActiveUsersCount(),
        getGlobalTotalEmissions(),
      ]);

      setGlobalStats(newGlobalStats);

      // Use new leaderboard if available, otherwise fall back to old
      const leaderboardEntries = newLeaderboard.length > 0 
        ? newLeaderboard.map(entry => ({
            rank: entry.rank,
            user_id: entry.user_id,
            username: entry.username,
            total_emissions_lbs: kgToLbs(entry.co2_saved_kg),
            action_count: 0, // Would need to fetch separately
            last_update_timestamp: entry.updated_at,
          }))
        : oldLeaderboard;

      setLeaderboardData({
        entries: leaderboardEntries,
        activeUsers: newGlobalStats?.total_users || activeUsers,
        globalTotal: newGlobalStats ? kgToLbs(newGlobalStats.total_co2_saved_kg) : globalTotal,
      });

      // Calculate total emissions and actions from user_actions table
      // Fetch ALL actions from ALL users (no user filter)
      const { data: allActions, error: actionsError } = await supabase
        .from('user_actions')
        .select(`
          id,
          custom_emissions_saved,
          custom_title,
          logged_at,
          action_templates (
            emissions_saved,
            title,
            category
          ),
          profiles (
            username,
            full_name,
            location
          )
        `)
        .order('logged_at', { ascending: false })
        .limit(500); // Get up to 500 most recent actions

      if (actionsError) {
        console.error('Error loading actions:', actionsError);
      }

      // Calculate total emissions (custom_emissions_saved is already in lbs, template emissions_saved is in kg)
      let totalEmissions = 0;
      let actionCount = 0;
      const recent: RecentAction[] = [];
      const contributorMap = new Map<string, { emissions: number; count: number }>();

      if (allActions) {
        allActions.forEach((action: any) => {
          // custom_emissions_saved is already in lbs, action_templates.emissions_saved is in kg
          const emissions = action.custom_emissions_saved || 
            ((action.action_templates?.emissions_saved || 0) * 2.20462);
          
          if (emissions > 0) {
            totalEmissions += emissions;
            actionCount++;

            // Build recent actions from ALL users (up to 100)
            const username = action.profiles?.username || 
              action.profiles?.full_name || 
              'Anonymous';
            
            const actionTitle = action.action_templates?.title || action.custom_title || 'Custom Action';
            
            // Build descriptive text
            let description = '';
            if (action.action_templates?.title) {
              description = action.action_templates.title.toLowerCase();
            } else if (action.custom_title) {
              description = action.custom_title.toLowerCase();
            } else {
              description = 'took climate action';
            }
            
            if (username !== 'Anonymous') {
              recent.push({
                id: action.id,
                username: username,
                actionTitle: actionTitle,
                actionDescription: description,
                emissionsLbs: emissions,
                timestamp: action.logged_at,
                country: action.profiles?.location || undefined,
                actionType: action.action_templates?.category || undefined,
              });
            }

            // Track contributors
            const existing = contributorMap.get(username) || { emissions: 0, count: 0 };
            contributorMap.set(username, {
              emissions: existing.emissions + emissions,
              count: existing.count + 1,
            });
          }
        });
      }

      // Get top contributors
      const topContribs: TopContributor[] = Array.from(contributorMap.entries())
        .map(([username, data]) => ({
          username,
          totalEmissionsLbs: data.emissions,
          actionCount: data.count,
        }))
        .sort((a, b) => b.totalEmissionsLbs - a.totalEmissionsLbs)
        .slice(0, 10);

      // Get total users count
      const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get countries (placeholder - would need location data)
      const countriesCount = 0; // TODO: implement when location tracking is added

      // Apply filters
      let filteredRecent = recent;
      
      // Filter by time range
      if (timeRange !== 'all') {
        const now = new Date();
        const cutoff = new Date();
        switch (timeRange) {
          case 'today':
            cutoff.setHours(0, 0, 0, 0);
            break;
          case 'week':
            cutoff.setDate(now.getDate() - 7);
            break;
          case 'month':
            cutoff.setMonth(now.getMonth() - 1);
            break;
          case 'year':
            cutoff.setFullYear(now.getFullYear() - 1);
            break;
        }
        filteredRecent = filteredRecent.filter(a => new Date(a.timestamp) >= cutoff);
      }
      
      // Filter by category
      if (selectedCategory !== 'all') {
        filteredRecent = filteredRecent.filter(a => 
          a.actionType?.toLowerCase() === selectedCategory.toLowerCase()
        );
      }
      
      // Filter by country
      if (selectedCountry !== 'all') {
        filteredRecent = filteredRecent.filter(a => 
          a.country?.toLowerCase() === selectedCountry.toLowerCase()
        );
      }

      // Use new global stats if available, otherwise use calculated values
      const finalGlobalLbs = newGlobalStats 
        ? kgToLbs(newGlobalStats.total_co2_saved_kg)
        : (leaderboardData?.globalTotal || totalEmissions);
      
      setStats({
        totalEmissionsLbs: finalGlobalLbs,
        totalActions: newGlobalStats?.total_actions_count || actionCount,
        totalUsers: newGlobalStats?.total_users || leaderboardData?.activeUsers || userCount || 0,
        countriesRepresented: newGlobalStats?.countries_count || countriesCount,
      });

      // Update top contributors from leaderboard (new service takes priority)
      if (leaderboardData?.entries && leaderboardData.entries.length > 0) {
        const contributors = leaderboardData.entries.map(entry => ({
          username: entry.username,
          totalEmissionsLbs: entry.total_emissions_lbs,
          actionCount: entry.action_count,
        }));
        setTopContributors(contributors);
      } else {
        // Fallback to old calculation
        setTopContributors(topContribs);
      }
      
      setRecentActions(filteredRecent);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading global stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadGlobalStats();

    // Subscribe to user_actions changes for real-time updates from ALL users
    const channel = supabase
      .channel('global-actions-updates', {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_actions',
        },
        (payload: any) => {
          console.log('🔄 New action from ANY user detected:', payload);
          setNewActionCount(prev => prev + 1);
          // Refresh after a short delay to ensure data is available
          setTimeout(() => {
            loadGlobalStats();
          }, 1000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_actions',
        },
        (payload: any) => {
          // If action was verified, update
          if (payload.new?.verified || payload.new?.custom_emissions_saved) {
            console.log('🔄 Action verified/updated:', payload);
            setNewActionCount(prev => prev + 1);
            setTimeout(() => {
              loadGlobalStats();
            }, 1000);
          }
        }
      )
      .subscribe();

    // Poll every 5 seconds as backup
    const pollInterval = setInterval(() => {
      loadGlobalStats();
    }, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, []);

  // Reload when filters change (filters are applied in loadGlobalStats, but we need to trigger reload)
  useEffect(() => {
    if (!loading) {
      loadGlobalStats();
    }
  }, [timeRange, selectedCategory, selectedCountry, leaderboardPeriod]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setNewActionCount(0);
    await loadGlobalStats();
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getMilestone = (lbs: number) => {
    const milestones = [
      { value: 1000000, label: '1M lbs', icon: '🎉' },
      { value: 100000, label: '100K lbs', icon: '🏆' },
      { value: 50000, label: '50K lbs', icon: '⭐' },
      { value: 10000, label: '10K lbs', icon: '🌟' },
      { value: 1000, label: '1K lbs', icon: '💚' },
    ];

    for (const milestone of milestones) {
      if (lbs >= milestone.value) {
        const nextMilestone = milestones[milestones.indexOf(milestone) - 1];
        const progress = nextMilestone 
          ? ((lbs % milestone.value) / (nextMilestone.value - milestone.value)) * 100
          : 100;
        return { current: milestone, next: nextMilestone, progress: Math.min(progress, 100) };
      }
    }

    const nextMilestone = milestones[milestones.length - 1];
    const progress = (lbs / nextMilestone.value) * 100;
    return { current: null, next: nextMilestone, progress: Math.min(progress, 100) };
  };

  const milestone = getMilestone(stats.totalEmissionsLbs);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Global Impact</h1>
          <p className="text-gray-600 mt-1">
            Real-time collective impact of our community worldwide
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <TrendingDown className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              Total CO₂ Saved
            </span>
          </div>
          <div className="text-4xl font-bold mb-1">
            {leaderboardData?.globalTotal 
              ? leaderboardData.globalTotal.toFixed(2) 
              : stats.totalEmissionsLbs.toLocaleString(undefined, { maximumFractionDigits: 0 })
            } Lbs
          </div>
          <p className="text-emerald-100">
            {Math.floor(stats.totalEmissionsLbs / TREE_EQUIVALENT_LBS_PER_TREE).toLocaleString()} trees planted equivalent
          </p>
        </div>

        <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <Users className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              Community
            </span>
          </div>
          <div className="text-4xl font-bold mb-1">
            {leaderboardData?.activeUsers 
              ? leaderboardData.activeUsers.toLocaleString() 
              : stats.totalUsers.toLocaleString()
            }
          </div>
          <p className="text-teal-100">Active users worldwide</p>
        </div>

        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <Zap className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              Actions
            </span>
          </div>
          <div className="text-4xl font-bold mb-1">
            {stats.totalActions.toLocaleString()}
          </div>
          <p className="text-cyan-100">Climate actions taken</p>
        </div>

        <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-xl shadow-lg text-white">
          <div className="flex items-center justify-between mb-4">
            <GlobeIcon className="w-8 h-8" />
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              Countries
            </span>
          </div>
          <div className="text-4xl font-bold mb-1">
            {stats.countriesRepresented || '🌍'}
          </div>
          <p className="text-blue-100">Countries represented</p>
        </div>
      </div>

      {/* Milestone Progress */}
      {milestone.next && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Award className="w-6 h-6 text-emerald-600" />
              <h2 className="text-xl font-bold text-gray-900">
                {milestone.current ? `Reached ${milestone.current.label}! ${milestone.current.icon}` : 'Next Milestone'}
              </h2>
            </div>
            <span className="text-sm text-gray-500">
              {milestone.next.label}
            </span>
          </div>
          <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-500"
              style={{ width: `${milestone.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <span>{stats.totalEmissionsLbs.toLocaleString()} lbs saved</span>
            <span>
              {((milestone.next.value - stats.totalEmissionsLbs) / 1000).toFixed(0)}K lbs to go
            </span>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live Activity Feed - ALL USERS */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xl font-bold text-gray-900">Global Activity Feed</h2>
              {newActionCount > 0 && (
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  {newActionCount} new
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">Updated {formatTimeAgo(lastUpdate.toISOString())}</span>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="all">All Categories</option>
              <option value="transportation">Transportation</option>
              <option value="home">Home</option>
              <option value="food">Food</option>
              <option value="materials">Materials</option>
            </select>
            {selectedCountry !== 'all' && (
              <button
                onClick={() => setSelectedCountry('all')}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Clear Country Filter
              </button>
            )}
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            {recentActions.length > 0 ? (
              recentActions.slice(0, 50 * feedPage).map((action, index) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-all"
                  style={{ 
                    animation: 'fadeIn 0.3s ease-in',
                    animationDelay: `${Math.min(index * 0.03, 0.5)}s`,
                    animationFillMode: 'both'
                  }}
                >
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold flex-shrink-0">
                    {action.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      <span className="font-semibold">{action.username}</span>{' '}
                      <span className="text-gray-700">saved</span>{' '}
                      <span className="text-emerald-600 font-semibold">{action.emissionsLbs.toFixed(1)} lbs</span>{' '}
                      <span className="text-gray-700">by</span>{' '}
                      <span className="text-emerald-600">{action.actionDescription}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {action.country && (
                        <>
                          <span className="text-xs text-gray-500">{action.country}</span>
                          <span className="text-xs text-gray-400">•</span>
                        </>
                      )}
                      <span className="text-xs text-gray-500">{formatTimeAgo(action.timestamp)}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Zap className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No actions found. Try adjusting your filters.</p>
              </div>
            )}
          </div>
          
          {recentActions.length > 50 * feedPage && (
            <button
              onClick={() => setFeedPage(prev => prev + 1)}
              className="mt-4 w-full py-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Load More ({recentActions.length - 50 * feedPage} more)
            </button>
          )}
        </div>

        {/* Top Contributors Leaderboard - Using New Leaderboard Service */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-emerald-600" />
              <h2 className="text-xl font-bold text-gray-900">Top Contributors</h2>
              {globalStats && (
                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  LIVE
                </span>
              )}
            </div>
            <select
              value={leaderboardPeriod}
              onChange={(e) => setLeaderboardPeriod(e.target.value as any)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="all_time">All-time</option>
              <option value="yearly">This Year</option>
              <option value="monthly">This Month</option>
              <option value="weekly">This Week</option>
            </select>
          </div>
          <div className="space-y-3">
            {leaderboardData?.entries && leaderboardData.entries.length > 0 ? (
              leaderboardData.entries.map((entry) => (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    entry.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                    entry.rank === 2 ? 'bg-gray-100 text-gray-700' :
                    entry.rank === 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {entry.username}
                    </p>
                    <p className="text-xs text-gray-500">
                      {entry.action_count} actions • Updated {new Date(entry.last_update_timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">
                      {entry.total_emissions_lbs.toFixed(2)} lbs
                    </p>
                  </div>
                </div>
              ))
            ) : topContributors.length > 0 ? (
              topContributors.map((contributor, index) => (
                <div
                  key={contributor.username}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700' :
                    index === 1 ? 'bg-gray-100 text-gray-700' :
                    index === 2 ? 'bg-orange-100 text-orange-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {contributor.username}
                    </p>
                    <p className="text-xs text-gray-500">
                      {contributor.actionCount} actions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">
                      {contributor.totalEmissionsLbs.toFixed(1)} lbs
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Trophy className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No contributors yet</p>
              </div>
            )}
          </div>
          {leaderboardData && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Active Users: {leaderboardData.activeUsers} • Global Total: {leaderboardData.globalTotal.toFixed(2)} lbs
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Impact Equivalents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Our Collective Impact
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-emerald-50 rounded-lg">
            <div className="text-3xl font-bold text-emerald-600 mb-1">
              {Math.floor(stats.totalEmissionsLbs / TREE_EQUIVALENT_LBS_PER_TREE).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Trees planted</div>
          </div>
          <div className="text-center p-4 bg-teal-50 rounded-lg">
            <div className="text-3xl font-bold text-teal-600 mb-1">
              {Math.floor(stats.totalEmissionsLbs / 120).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Car-free days</div>
          </div>
          <div className="text-center p-4 bg-cyan-50 rounded-lg">
            <div className="text-3xl font-bold text-cyan-600 mb-1">
              {Math.floor(stats.totalEmissionsLbs / 250).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Flights offset</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-3xl font-bold text-blue-600 mb-1">
              {Math.floor(stats.totalEmissionsLbs / 1000).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Homes powered (days)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
