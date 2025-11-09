import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { parseActionWithAI, ParsedAction } from '../lib/aiParser';
import { Sparkles, Check, Loader2, X } from 'lucide-react';

interface AIActionParserProps {
  onActionLogged?: () => void;
}

export default function AIActionParser({ onActionLogged }: AIActionParserProps) {
  const { profile, refreshProfile } = useAuth();
  const [input, setInput] = useState('');
  const [parsedAction, setParsedAction] = useState<ParsedAction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleParse = async () => {
    if (!input.trim()) {
      setError('Please describe your action');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setParsedAction(null);

    try {
      const parsed = await parseActionWithAI(input);
      setParsedAction(parsed);
    } catch (err) {
      setError('Failed to parse action. Please try again.');
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogAction = async () => {
    if (!parsedAction || !profile) return;

    setIsLogging(true);
    try {
      // Calculate points based on CO2 saved (1 point per 0.1 lbs CO2, minimum 10 points)
      const points = Math.max(10, Math.round(parsedAction.co2SavedLbs * 10));

      // Insert custom action
      const { error: actionError } = await supabase.from('user_actions').insert({
        user_id: profile.id,
        custom_title: parsedAction.action,
        custom_emissions_saved: parsedAction.co2SavedLbs,
        notes: parsedAction.description,
      });

      if (actionError) throw actionError;

      // Update profile points
      await supabase
        .from('profiles')
        .update({
          total_points: profile.total_points + points,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      await refreshProfile();
      
      // Reset form
      setInput('');
      setParsedAction(null);
      
      if (onActionLogged) {
        onActionLogged();
      }
      
      alert(`Action logged! You saved ${parsedAction.co2SavedLbs.toFixed(1)} lbs CO₂ and earned ${points} points!`);
    } catch (err) {
      setError('Failed to log action. Please try again.');
      console.error(err);
    } finally {
      setIsLogging(false);
    }
  };

  const handleCancel = () => {
    setParsedAction(null);
    setInput('');
    setError(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-4">
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-900">AI Action Parser</h3>
          <p className="text-sm text-gray-600">Describe your action in natural language</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Example: 'Biked 10 miles instead of driving' or 'Ate a plant-based meal'"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            rows={3}
            disabled={isProcessing || isLogging}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {!parsedAction ? (
          <button
            onClick={handleParse}
            disabled={isProcessing || !input.trim()}
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg font-semibold hover:from-purple-600 hover:to-pink-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Parse Action</span>
              </>
            )}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">{parsedAction.action}</h4>
                  <p className="text-sm text-gray-600">{parsedAction.description}</p>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                  {parsedAction.category}
                </span>
              </div>
              <div className="pt-3 border-t border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">CO₂ Saved:</span>
                  <span className="text-2xl font-bold text-emerald-600">
                    {parsedAction.co2SavedLbs.toFixed(1)} lbs
                  </span>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={handleCancel}
                disabled={isLogging}
                className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <X className="w-5 h-5" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleLogAction}
                disabled={isLogging}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isLogging ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Logging...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Confirm & Log</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

