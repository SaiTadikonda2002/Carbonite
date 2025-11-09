// Check all registered users and their status
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

let supabaseUrl, supabaseKey;
try {
  const envContent = readFileSync('.env.local', 'utf-8');
  supabaseUrl = envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
  supabaseKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
} catch (e) {
  try {
    const envContent = readFileSync('.env', 'utf-8');
    supabaseUrl = envContent.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
    supabaseKey = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  } catch (e2) {}
}

if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing Supabase credentials\n');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('👥 REGISTERED USERS ANALYSIS\n');
console.log('═'.repeat(70));

// Get all profiles
const { data: profiles, error: profilesError } = await supabase
  .from('profiles')
  .select('id, username, full_name, created_at')
  .order('created_at', { ascending: false });

if (profilesError) {
  console.log(`❌ Error loading profiles: ${profilesError.message}\n`);
  process.exit(1);
}

console.log(`\n📋 Found ${profiles?.length || 0} registered users:\n`);

if (!profiles || profiles.length === 0) {
  console.log('   No users found in profiles table\n');
  process.exit(0);
}

// For each user, check their actions and stats
for (const profile of profiles) {
  const userId = profile.id;
  const name = profile.username || profile.full_name || userId.substring(0, 8) + '...';
  
  // Check actions
  const { data: actions, count: actionsCount } = await supabase
    .from('user_actions')
    .select('id, custom_emissions_saved, action_template_id, logged_at', { count: 'exact' })
    .eq('user_id', userId);

  // Check user_stats
  const { data: stats } = await supabase
    .from('user_stats')
    .select('total_lbs, total_emissions_lbs, last_updated')
    .eq('user_id', userId)
    .single();

  const totalLbs = stats?.total_lbs || stats?.total_emissions_lbs || 0;
  const hasActions = (actionsCount || 0) > 0;
  const hasStats = !!stats;
  const isActive = totalLbs > 0;

  console.log(`\n👤 ${name}`);
  console.log(`   ID: ${userId.substring(0, 20)}...`);
  console.log(`   Actions: ${actionsCount || 0}`);
  console.log(`   In user_stats: ${hasStats ? '✅' : '❌'}`);
  console.log(`   Total (lbs): ${totalLbs}`);
  console.log(`   Status: ${isActive ? '✅ ACTIVE' : '⚠️  INACTIVE'}`);

  if (hasActions && !isActive) {
    console.log(`   ⚠️  Has actions but not in user_stats!`);
    console.log(`   💡 Run: SELECT backfill_totals(); in SQL Editor`);
    
    // Show sample actions
    if (actions && actions.length > 0) {
      console.log(`   📝 Sample actions:`);
      actions.slice(0, 3).forEach((action, i) => {
        const emissions = action.custom_emissions_saved || 'N/A';
        console.log(`      ${i + 1}. Emissions: ${emissions} lbs | Date: ${action.logged_at?.substring(0, 10) || 'N/A'}`);
      });
    }
  } else if (!hasActions) {
    console.log(`   ℹ️  No actions logged yet`);
  }
}

// Summary
console.log('\n' + '═'.repeat(70));
console.log('\n📊 SUMMARY:\n');

const activeCount = profiles.filter(async (p) => {
  const { data: stats } = await supabase
    .from('user_stats')
    .select('total_lbs, total_emissions_lbs')
    .eq('user_id', p.id)
    .single();
  const total = stats?.total_lbs || stats?.total_emissions_lbs || 0;
  return total > 0;
}).length;

// Count users with actions
let usersWithActions = 0;
let usersWithActionsButNoStats = 0;

for (const profile of profiles) {
  const { count: actionsCount } = await supabase
    .from('user_actions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.id);
  
  if ((actionsCount || 0) > 0) {
    usersWithActions++;
    
    const { data: stats } = await supabase
      .from('user_stats')
      .select('total_lbs, total_emissions_lbs')
      .eq('user_id', profile.id)
      .single();
    
    const total = stats?.total_lbs || stats?.total_emissions_lbs || 0;
    if (total === 0) {
      usersWithActionsButNoStats++;
    }
  }
}

console.log(`   • Total Registered: ${profiles.length}`);
console.log(`   • Users with Actions: ${usersWithActions}`);
console.log(`   • Active Users (in user_stats): ${profiles.length - usersWithActionsButNoStats - (profiles.length - usersWithActions)}`);

if (usersWithActionsButNoStats > 0) {
  console.log(`\n⚠️  ${usersWithActionsButNoStats} user(s) have actions but aren't in user_stats!`);
  console.log(`\n💡 SOLUTION:`);
  console.log(`   Run this in Supabase SQL Editor:`);
  console.log(`   SELECT backfill_totals();\n`);
} else if (usersWithActions === 0) {
  console.log(`\n💡 No users have logged actions yet.`);
  console.log(`   Once users log actions through the app, they'll appear.\n`);
} else {
  console.log(`\n✅ All users with actions are properly tracked!\n`);
}

