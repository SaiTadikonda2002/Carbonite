// Quick script to list active users
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listActiveUsers() {
  try {
    console.log('📊 Fetching active users...\n');

    // Query active users from user_stats
    const { data: userStats, error: statsError } = await supabase
      .from('user_stats')
      .select(`
        user_id,
        total_lbs,
        total_emissions_lbs,
        last_updated,
        profiles:user_id (
          username,
          full_name,
          email
        )
      `)
      .or('total_lbs.gt.0,total_emissions_lbs.gt.0')
      .order('total_lbs', { ascending: false, nullsFirst: false })
      .order('total_emissions_lbs', { ascending: false, nullsFirst: false });

    if (statsError) {
      console.error('❌ Error fetching user stats:', statsError.message);
      
      // Fallback: try just user_stats without join
      const { data: simpleStats, error: simpleError } = await supabase
        .from('user_stats')
        .select('user_id, total_lbs, total_emissions_lbs, last_updated')
        .or('total_lbs.gt.0,total_emissions_lbs.gt.0')
        .order('total_lbs', { ascending: false });

      if (simpleError) {
        console.error('❌ Error:', simpleError.message);
        return;
      }

      displayUsers(simpleStats || []);
      return;
    }

    displayUsers(userStats || []);

    // Also get count
    const { count } = await supabase
      .from('user_stats')
      .select('*', { count: 'exact', head: true })
      .or('total_lbs.gt.0,total_emissions_lbs.gt.0');

    console.log(`\n✅ Total Active Users: ${count || userStats?.length || 0}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

function displayUsers(users) {
  if (!users || users.length === 0) {
    console.log('📭 No active users found.');
    return;
  }

  console.log('┌─────────────────────────────────────────────────────────────────────────┐');
  console.log('│                         ACTIVE USERS                                     │');
  console.log('├──────────────┬──────────────────────┬──────────────┬────────────────────┤');
  console.log('│ Rank         │ Username/Email       │ Total (lbs)  │ Last Updated       │');
  console.log('├──────────────┼──────────────────────┼──────────────┼────────────────────┤');

  users.forEach((user, index) => {
    const rank = (index + 1).toString().padEnd(12);
    const username = getUserName(user).padEnd(20);
    const total = getTotal(user).toFixed(2).padStart(12);
    const lastUpdated = formatDate(user.last_updated).padEnd(18);

    console.log(`│ ${rank}│ ${username}│ ${total}│ ${lastUpdated}│`);
  });

  console.log('└──────────────┴──────────────────────┴──────────────┴────────────────────┘');
}

function getUserName(user) {
  if (user.profiles) {
    return user.profiles.username || user.profiles.full_name || user.profiles.email || 'Anonymous';
  }
  return user.user_id.substring(0, 8) + '...';
}

function getTotal(user) {
  return parseFloat(user.total_lbs || user.total_emissions_lbs || 0);
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString().slice(0, 5);
}

listActiveUsers();

