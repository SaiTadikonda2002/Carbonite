import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Challenge } from '../lib/supabase';
import { Trophy, Calendar, Target, Users, Filter, TrendingUp, Award } from 'lucide-react';

interface ChallengeParticipant {
  user_id: string;
  profiles: {
    full_name: string;
    total_points: number;
  };
}

interface ChallengeWithStats extends Challenge {
  participantCount?: number;
  isJoined?: boolean;
}

export default function Challenges() {
  const { profile } = useAuth();
  const [challenges, setChallenges] = useState<ChallengeWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<string>('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('All');
  const [selectedDuration, setSelectedDuration] = useState<string>('All');
  const [leaderboard, setLeaderboard] = useState<ChallengeParticipant[]>([]);
  const [selectedChallengeForLeaderboard, setSelectedChallengeForLeaderboard] = useState<string | null>(null);

  // Sample challenges to display if database is empty
  const sampleChallenges: ChallengeWithStats[] = [
    {
      id: 'sample-1',
      title: '30-Day Plant-Based Challenge',
      description: 'Eat plant-based meals for 30 days and save 300+ lbs CO2',
      challenge_type: 'Food',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      target_metric: 'lbs CO2',
      target_value: 300,
      points_reward: 500,
      badge_icon: '🥗',
      is_active: true,
      created_at: new Date().toISOString(),
      participantCount: 1247,
      isJoined: false,
    },
    {
      id: 'sample-2',
      title: 'Zero-Waste Weekend',
      description: 'Avoid single-use plastics and reduce waste for a weekend',
      challenge_type: 'Waste',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      target_metric: 'items',
      target_value: 0,
      points_reward: 200,
      badge_icon: '♻️',
      is_active: true,
      created_at: new Date().toISOString(),
      participantCount: 892,
      isJoined: false,
    },
    {
      id: 'sample-3',
      title: 'Commute Green Challenge',
      description: 'Use public transport or bike for 14 days instead of driving',
      challenge_type: 'Transportation',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      target_metric: 'days',
      target_value: 14,
      points_reward: 350,
      badge_icon: '🚲',
      is_active: true,
      created_at: new Date().toISOString(),
      participantCount: 2156,
      isJoined: false,
    },
    {
      id: 'sample-4',
      title: 'Energy Saver Month',
      description: 'Reduce home energy consumption by 20% this month',
      challenge_type: 'Home',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      target_metric: 'reduction',
      target_value: 20,
      points_reward: 400,
      badge_icon: '💡',
      is_active: true,
      created_at: new Date().toISOString(),
      participantCount: 1834,
      isJoined: false,
    },
  ];

  useEffect(() => {
    loadChallenges();
  }, []);

  const loadChallenges = async () => {
    try {
      const { data } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .order('end_date');

      if (data && data.length > 0) {
        // Check which challenges user has joined
        const challengeIds = data.map(c => c.id);
        const { data: joinedChallenges } = await supabase
          .from('challenge_participants')
          .select('challenge_id')
          .eq('user_id', profile?.id || '')
          .in('challenge_id', challengeIds);

        const joinedIds = new Set(joinedChallenges?.map(j => j.challenge_id) || []);

        // Get participant counts
        const challengesWithStats = await Promise.all(
          data.map(async (challenge) => {
            const { count } = await supabase
              .from('challenge_participants')
              .select('*', { count: 'exact', head: true })
              .eq('challenge_id', challenge.id);

            return {
              ...challenge,
              participantCount: count || 0,
              isJoined: joinedIds.has(challenge.id),
            };
          })
        );

        setChallenges(challengesWithStats);
      } else {
        // Use sample challenges if database is empty
        setChallenges(sampleChallenges);
      }
    } catch (error) {
      console.error('Error loading challenges:', error);
      // Fallback to sample challenges
      setChallenges(sampleChallenges);
    } finally {
      setLoading(false);
    }
  };

  const joinChallenge = async (challengeId: string) => {
    if (!profile) return;

    try {
      const { error } = await supabase.from('challenge_participants').insert({
        challenge_id: challengeId,
        user_id: profile.id,
      });

      if (error) throw error;

      // Update local state
      setChallenges(prev =>
        prev.map(c =>
          c.id === challengeId
            ? { ...c, isJoined: true, participantCount: (c.participantCount || 0) + 1 }
            : c
        )
      );

      alert('Joined challenge successfully!');
    } catch (error) {
      console.error('Error joining challenge:', error);
      alert('Failed to join challenge');
    }
  };

  const loadLeaderboard = async (challengeId: string) => {
    try {
      const { data } = await supabase
        .from('challenge_participants')
        .select(`
          user_id,
          profiles (
            full_name,
            total_points
          )
        `)
        .eq('challenge_id', challengeId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setLeaderboard(data as ChallengeParticipant[]);
        setSelectedChallengeForLeaderboard(challengeId);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    }
  };

  const getDifficulty = (challenge: ChallengeWithStats): string => {
    const days = Math.ceil(
      (new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (days <= 3) return 'Easy';
    if (days <= 14) return 'Medium';
    return 'Hard';
  };

  const getDuration = (challenge: ChallengeWithStats): string => {
    const days = Math.ceil(
      (new Date(challenge.end_date).getTime() - new Date(challenge.start_date).getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (days <= 7) return 'Week';
    if (days <= 30) return 'Month';
    return 'Long-term';
  };

  const filteredChallenges = challenges.filter((challenge) => {
    const typeMatch = selectedType === 'All' || challenge.challenge_type === selectedType;
    const difficultyMatch =
      selectedDifficulty === 'All' || getDifficulty(challenge) === selectedDifficulty;
    const durationMatch = selectedDuration === 'All' || getDuration(challenge) === selectedDuration;
    return typeMatch && difficultyMatch && durationMatch;
  });

  const challengeTypes = ['All', 'Transportation', 'Food', 'Home', 'Waste', 'Water', 'Materials'];
  const difficulties = ['All', 'Easy', 'Medium', 'Hard'];
  const durations = ['All', 'Week', 'Month', 'Long-term'];

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
          Join Global Challenges
        </h1>
        <p className="text-gray-600 mt-1">
          Compete with others and make an impact together
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {challengeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Difficulty</label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {difficulties.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {difficulty}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            >
              {durations.map((duration) => (
                <option key={duration} value={duration}>
                  {duration}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Challenges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredChallenges.map((challenge) => (
          <div
            key={challenge.id}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <span className="text-4xl">{challenge.badge_icon || '🏆'}</span>
              <div className="flex flex-col items-end space-y-2">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
                  {challenge.challenge_type}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                  {getDifficulty(challenge)}
                </span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">{challenge.title}</h3>
            <p className="text-sm text-gray-600 mb-4">{challenge.description}</p>

            <div className="space-y-2 mb-4">
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="w-4 h-4 mr-2" />
                <span>
                  Ends: {new Date(challenge.end_date).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <Target className="w-4 h-4 mr-2" />
                <span>
                  Target: {challenge.target_value} {challenge.target_metric}
                </span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <Trophy className="w-4 h-4 mr-2" />
                <span className="font-semibold text-teal-600">
                  Reward: {challenge.points_reward} points
                </span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <Users className="w-4 h-4 mr-2" />
                <span>{challenge.participantCount || 0} participants</span>
              </div>
            </div>

            <div className="flex space-x-2">
              {challenge.isJoined ? (
                <button
                  disabled
                  className="flex-1 bg-green-100 text-green-700 py-3 rounded-lg font-semibold cursor-not-allowed"
                >
                  ✓ Joined
                </button>
              ) : (
                <button
                  onClick={() => joinChallenge(challenge.id)}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md hover:shadow-lg"
                >
                  Join Challenge
                </button>
              )}
              <button
                onClick={() => loadLeaderboard(challenge.id)}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all"
              >
                <TrendingUp className="w-5 h-5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Leaderboard Modal */}
      {selectedChallengeForLeaderboard && leaderboard.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Leaderboard</h3>
              <button
                onClick={() => {
                  setSelectedChallengeForLeaderboard(null);
                  setLeaderboard([]);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {leaderboard.map((participant, index) => (
                <div
                  key={participant.user_id}
                  className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">
                        {participant.profiles?.full_name || 'Anonymous'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Award className="w-5 h-5 text-yellow-500" />
                    <span className="font-bold text-teal-600">
                      {participant.profiles?.total_points || 0} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
