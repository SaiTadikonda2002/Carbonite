import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, UserAction, ActionTemplate } from '../lib/supabase';
import {
  User,
  Edit2,
  Mail,
  MapPin,
  Calendar,
  Phone,
  FileText,
  TrendingDown,
  Flame,
  Award,
  Target,
  BarChart3,
  Settings,
  Lock,
  Bell,
  Globe,
  Trash2,
  Save,
  X,
} from 'lucide-react';

export default function Profile() {
  const { profile, user, refreshProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    full_name: '',
    email: '',
    country: '',
    age: '',
    phone: '',
    bio: '',
  });
  const [actions, setActions] = useState<UserAction[]>([]);
  const [stats, setStats] = useState({
    totalLbsSaved: 0,
    monthlyLbsSaved: 0,
    yearlyLbsSaved: 0,
    currentStreak: 0,
    longestStreak: 0,
    mostImpactfulAction: '',
    bestDay: '',
    bestMonth: '',
    challengesJoined: 0,
  });
  const [categoryBreakdown, setCategoryBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      setEditData({
        full_name: profile.full_name || '',
        email: user?.email || '',
        country: profile.location || '',
        age: '',
        phone: '',
        bio: '',
      });
      loadProfileData();
    }
  }, [profile, user]);

  const loadProfileData = async () => {
    if (!profile) return;

    try {
      // Load user actions
      const { data: actionsData } = await supabase
        .from('user_actions')
        .select(`
          *,
          action_templates (*)
        `)
        .eq('user_id', profile.id)
        .order('logged_at', { ascending: false });

      if (actionsData) {
        setActions(actionsData);

        // Calculate stats
        const now = new Date();
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisYear = new Date(now.getFullYear(), 0, 1);

        const categoryTotals: Record<string, number> = {};
        let totalLbs = 0;
        let monthlyLbs = 0;
        let yearlyLbs = 0;
        let maxAction = { title: '', lbs: 0 };

        actionsData.forEach((action) => {
          const template = action.action_templates as ActionTemplate;
          const lbs = action.custom_emissions_saved || (template?.emissions_saved || 0) * 2.20462;
          const category = template?.category || 'Other';

          totalLbs += lbs;
          categoryTotals[category] = (categoryTotals[category] || 0) + lbs;

          const actionDate = new Date(action.logged_at);
          if (actionDate >= thisMonth) monthlyLbs += lbs;
          if (actionDate >= thisYear) yearlyLbs += lbs;

          if (lbs > maxAction.lbs) {
            maxAction = {
              title: action.custom_title || template?.title || 'Action',
              lbs,
            };
          }
        });

        // Find best day and month
        const dayTotals: Record<string, number> = {};
        const monthTotals: Record<string, number> = {};

        actionsData.forEach((action) => {
          const template = action.action_templates as ActionTemplate;
          const lbs = action.custom_emissions_saved || (template?.emissions_saved || 0) * 2.20462;
          const date = new Date(action.logged_at);
          const dayKey = date.toLocaleDateString();
          const monthKey = `${date.getFullYear()}-${date.getMonth()}`;

          dayTotals[dayKey] = (dayTotals[dayKey] || 0) + lbs;
          monthTotals[monthKey] = (monthTotals[monthKey] || 0) + lbs;
        });

        const bestDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        const bestMonth = Object.entries(monthTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

        // Count challenges joined
        const { count } = await supabase
          .from('challenge_participants')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id);

        setStats({
          totalLbsSaved: totalLbs,
          monthlyLbsSaved: monthlyLbs,
          yearlyLbsSaved: yearlyLbs,
          currentStreak: profile.current_streak,
          longestStreak: profile.longest_streak,
          mostImpactfulAction: maxAction.title,
          bestDay,
          bestMonth,
          challengesJoined: count || 0,
        });

        setCategoryBreakdown(categoryTotals);
      }
    } catch (error) {
      console.error('Error loading profile data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    try {
      await supabase
        .from('profiles')
        .update({
          full_name: editData.full_name,
          location: editData.country,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      await refreshProfile();
      setIsEditing(false);
      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile');
    }
  };

  const getLevelBadge = (level: number) => {
    if (level >= 10) return { text: 'Master', color: 'from-purple-500 to-pink-500' };
    if (level >= 5) return { text: 'Expert', color: 'from-blue-500 to-cyan-500' };
    if (level >= 3) return { text: 'Advanced', color: 'from-emerald-500 to-teal-500' };
    return { text: 'Beginner', color: 'from-green-400 to-emerald-500' };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  const badge = getLevelBadge(profile?.level || 1);

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-3xl font-bold">
              {profile?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{profile?.full_name || 'User'}</h1>
              <div className="flex items-center space-x-2 mt-2">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold text-white bg-gradient-to-r ${badge.color}`}
                >
                  {badge.text} • Level {profile?.level || 1}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
          >
            <Edit2 className="w-4 h-4" />
            <span>{isEditing ? 'Cancel' : 'Edit'}</span>
          </button>
        </div>
      </div>

      {/* Personal Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Personal Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-3">
            <User className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <label className="text-sm text-gray-500">Name</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.full_name}
                  onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <div className="font-semibold text-gray-900">{profile?.full_name || 'N/A'}</div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Mail className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <label className="text-sm text-gray-500">Email</label>
              <div className="font-semibold text-gray-900">{user?.email || 'N/A'}</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <MapPin className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <label className="text-sm text-gray-500">Country</label>
              {isEditing ? (
                <input
                  type="text"
                  value={editData.country}
                  onChange={(e) => setEditData({ ...editData, country: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <div className="font-semibold text-gray-900">{profile?.location || 'N/A'}</div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <label className="text-sm text-gray-500">Age</label>
              {isEditing ? (
                <input
                  type="number"
                  value={editData.age}
                  onChange={(e) => setEditData({ ...editData, age: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <div className="font-semibold text-gray-900">{editData.age || 'N/A'}</div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Phone className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <label className="text-sm text-gray-500">Phone</label>
              {isEditing ? (
                <input
                  type="tel"
                  value={editData.phone}
                  onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              ) : (
                <div className="font-semibold text-gray-900">{editData.phone || 'N/A'}</div>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-3 md:col-span-2">
            <FileText className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <label className="text-sm text-gray-500">Bio</label>
              {isEditing ? (
                <textarea
                  value={editData.bio}
                  onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  rows={3}
                />
              ) : (
                <div className="font-semibold text-gray-900">{editData.bio || 'No bio yet'}</div>
              )}
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="mt-4 flex justify-end space-x-3">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        )}
      </div>

      {/* Emissions Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Emissions Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-lg border border-emerald-200">
            <div className="flex items-center space-x-2 mb-2">
              <TrendingDown className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-600">Total Saved</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.totalLbsSaved.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">lbs CO₂</div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-medium text-blue-600">This Month</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.monthlyLbsSaved.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">lbs CO₂</div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-600">This Year</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {stats.yearlyLbsSaved.toFixed(1)}
            </div>
            <div className="text-sm text-gray-600">lbs CO₂</div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-lg border border-orange-200">
            <div className="flex items-center space-x-2 mb-2">
              <Flame className="w-5 h-5 text-orange-600" />
              <span className="text-sm font-medium text-orange-600">Current Streak</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.currentStreak}</div>
            <div className="text-sm text-gray-600">days</div>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Category Breakdown</h2>
        <div className="space-y-3">
          {Object.entries(categoryBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([category, lbs]) => {
              const percentage = stats.totalLbsSaved > 0 ? (lbs / stats.totalLbsSaved) * 100 : 0;
              return (
                <div key={category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{category}</span>
                    <span className="text-sm font-semibold text-emerald-600">
                      {lbs.toFixed(1)} lbs ({percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          {Object.keys(categoryBreakdown).length === 0 && (
            <p className="text-gray-500 text-center py-4">No actions logged yet</p>
          )}
        </div>
      </div>

      {/* Activity Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Activity Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="text-sm text-gray-600 mb-1">Most Impactful Action</div>
            <div className="font-semibold text-gray-900">{stats.mostImpactfulAction || 'N/A'}</div>
          </div>
          <div className="p-4 bg-teal-50 rounded-lg border border-teal-200">
            <div className="text-sm text-gray-600 mb-1">Best Day</div>
            <div className="font-semibold text-gray-900">{stats.bestDay || 'N/A'}</div>
          </div>
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="text-sm text-gray-600 mb-1">Best Month</div>
            <div className="font-semibold text-gray-900">{stats.bestMonth || 'N/A'}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="text-sm text-gray-600 mb-1">Challenges Joined</div>
            <div className="font-semibold text-gray-900">{stats.challengesJoined}</div>
          </div>
        </div>
      </div>

      {/* Badges & Achievements */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Badges & Achievements</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {profile && profile.level >= 1 && (
            <div className="text-center p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <div className="text-4xl mb-2">🌱</div>
              <div className="text-sm font-semibold text-gray-900">Starter</div>
            </div>
          )}
          {profile && profile.level >= 3 && (
            <div className="text-center p-4 bg-teal-50 rounded-lg border border-teal-200">
              <div className="text-4xl mb-2">⭐</div>
              <div className="text-sm font-semibold text-gray-900">Rising Star</div>
            </div>
          )}
          {profile && profile.level >= 5 && (
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-4xl mb-2">🏆</div>
              <div className="text-sm font-semibold text-gray-900">Champion</div>
            </div>
          )}
          {stats.currentStreak >= 7 && (
            <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-4xl mb-2">🔥</div>
              <div className="text-sm font-semibold text-gray-900">7-Day Streak</div>
            </div>
          )}
          {stats.currentStreak >= 30 && (
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-4xl mb-2">💪</div>
              <div className="text-sm font-semibold text-gray-900">30-Day Streak</div>
            </div>
          )}
          {stats.totalLbsSaved >= 100 && (
            <div className="text-center p-4 bg-pink-50 rounded-lg border border-pink-200">
              <div className="text-4xl mb-2">🌍</div>
              <div className="text-sm font-semibold text-gray-900">100+ lbs Saved</div>
            </div>
          )}
        </div>
      </div>

      {/* Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Settings</h2>
        <div className="space-y-3">
          <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3">
              <Lock className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Change Password</span>
            </div>
            <span className="text-gray-400">→</span>
          </button>
          <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3">
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Notifications</span>
            </div>
            <span className="text-gray-400">→</span>
          </button>
          <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
            <div className="flex items-center space-x-3">
              <Globe className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Language & Privacy</span>
            </div>
            <span className="text-gray-400">→</span>
          </button>
          <button className="w-full flex items-center justify-between p-4 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
            <div className="flex items-center space-x-3">
              <Trash2 className="w-5 h-5 text-red-600" />
              <span className="font-medium text-red-600">Delete Account</span>
            </div>
            <span className="text-red-400">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

