// Quick script to list active users using Supabase
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Try to load env vars from .env.local
let supabaseUrl, supabaseKey;

try {
  const envContent = readFileSync('.env.local', 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseKey = keyMatch[1].trim();
} catch (e) {
  // Try .env file
  try {
    const envContent = readFileSync('.env', 'utf-8');
    const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
    const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
    
    if (urlMatch) supabaseUrl = urlMatch[1].trim();
    if (keyMatch) supabaseKey = keyMatch[1].trim();
  } catch (e2) {
    console.error('❌ Could not load .env or .env.local file');
    console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listActiveUsers() {
  console.log('📊 Fetching active users...\n');

  try {
    // Try using the leaderboard RPC function first
    const { data: leaderboardData, error: rpcError } = await supabase
      .rpc('get_leaderboard_simple', { limit_count: 100 });

    if (!rpcError && leaderboardData && leaderboardData.length > 0) {
      displayLeaderboardResults(leaderboardData);
      return;
    }

    // Fallback: Try querying user_stats table directly
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, total_lbs, total_emissions_lbs, last_updated')
      .or('total_lbs.gt.0,total_emissions_lbs.gt.0')
      .order('total_lbs', { ascending: false })
      .limit(100);

    if (error) {
      // Try querying user_actions to get active users
      console.log('⚠️  Trying alternative method...\n');
      const { data: actionsData, error: actionsError } = await supabase
        .from('user_actions')
        .select('user_id, custom_emissions_saved, action_template_id, logged_at')
        .limit(1000);

      if (actionsError) {
        console.error('❌ Error:', actionsError.message);
        console.error('\n💡 Tip: Make sure you have run FINAL_SIMPLE_SOLUTION.sql in your Supabase SQL Editor');
        return;
      }

      // Group by user_id and calculate totals
      const userMap = new Map();
      (actionsData || []).forEach(action => {
        if (!userMap.has(action.user_id)) {
          userMap.set(action.user_id, {
            user_id: action.user_id,
            total_lbs: 0,
            last_updated: action.logged_at
          });
        }
        const user = userMap.get(action.user_id);
        if (action.custom_emissions_saved) {
          user.total_lbs += parseFloat(action.custom_emissions_saved) || 0;
        }
        if (new Date(action.logged_at) > new Date(user.last_updated)) {
          user.last_updated = action.logged_at;
        }
      });

      const users = Array.from(userMap.values())
        .filter(u => u.total_lbs > 0)
        .sort((a, b) => b.total_lbs - a.total_lbs);

      displayResults(users);
      return;
    }

    displayResults(data || []);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Tip: Make sure you have run FINAL_SIMPLE_SOLUTION.sql in your Supabase SQL Editor');
  }
}

function displayLeaderboardResults(users) {
  if (!users || users.length === 0) {
    console.log('📭 No active users found.\n');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    ACTIVE USERS                               ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Rank │ Username            │ Total (lbs) │ Global Total (lbs)');
  console.log('─────┼─────────────────────┼─────────────┼─────────────────────');

  users.forEach((user) => {
    const rank = String(user.rank || 0).padEnd(4);
    const username = (user.username || 'Anonymous').padEnd(19);
    const total = parseFloat(user.total_emissions_lbs || 0).toFixed(2);
    const global = parseFloat(user.global_total_lbs || 0).toFixed(2);
    
    console.log(` ${rank} │ ${username}│ ${total.padStart(11)} │ ${global.padStart(18)}`);
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n✅ Total Active Users: ${users.length}`);
  if (users.length > 0 && users[0].global_total_lbs) {
    console.log(`🌍 Global Total: ${parseFloat(users[0].global_total_lbs).toFixed(2)} lbs\n`);
  }
}

function displayResults(users) {
  if (!users || users.length === 0) {
    console.log('📭 No active users found.');
    console.log('\n💡 This means:');
    console.log('   • Database schema is set up ✅');
    console.log('   • No users have logged actions yet');
    console.log('   • Once users log actions, they will appear here\n');
    return;
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                    ACTIVE USERS                               ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Rank │ User ID (first 8) │ Total (lbs) │ Last Updated');
  console.log('─────┼───────────────────┼─────────────┼─────────────────────');

  users.forEach((user, index) => {
    const rank = String(index + 1).padEnd(4);
    const userId = user.user_id.substring(0, 8) + '...';
    const total = parseFloat(user.total_lbs || user.total_emissions_lbs || 0).toFixed(2);
    const date = user.last_updated ? new Date(user.last_updated).toLocaleDateString() : 'N/A';
    
    console.log(` ${rank} │ ${userId.padEnd(17)} │ ${total.padStart(11)} │ ${date}`);
  });

  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n✅ Total Active Users: ${users.length}\n`);
}

listActiveUsers();

