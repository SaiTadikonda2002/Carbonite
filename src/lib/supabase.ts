import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Profile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  location: string | null;
  household_size: number;
  baseline_emissions: number;
  monthly_goal: number;
  total_points: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  created_at: string;
  updated_at: string;
}

export interface ActionTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  difficulty_level: string;
  time_commitment: string;
  cost_impact: string;
  emissions_saved: number;
  how_to_guide: string | null;
  tips: string | null;
  icon: string | null;
  points_reward: number;
  is_active: boolean;
  created_at: string;
}

export interface UserAction {
  id: string;
  user_id: string;
  action_template_id: string | null;
  custom_title: string | null;
  custom_emissions_saved: number | null;
  notes: string | null;
  photo_url: string | null;
  logged_at: string;
  created_at: string;
  action_templates?: ActionTemplate;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  challenge_type: string;
  start_date: string;
  end_date: string;
  target_metric: string;
  target_value: number;
  points_reward: number;
  badge_icon: string | null;
  is_active: boolean;
  created_at: string;
}

export interface GlobalStats {
  id: string;
  stat_date: string;
  total_users: number;
  active_users: number;
  total_actions: number;
  total_emissions_saved: number;
  total_points: number;
  countries_represented: number;
  updated_at: string;
}
