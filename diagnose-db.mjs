// Diagnostic script to check database state
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

let supabaseUrl, supabaseKey;

try {
  const envContent = readFileSync('.env.local', 'utf-8');
  const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
  const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  
  if (urlMatch) supabaseUrl = urlMatch[1].trim();
  if (keyMatch) supabaseKey = keyMatch[1].trim();
} catch (e) {
  try {
    const envContent = readFileSync('.env', 'utf-8');
    const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
    const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
    
    if (urlMatch) supabaseUrl = urlMatch[1].trim();
    if (keyMatch) supabaseKey = keyMatch[1].trim();
  } catch (e2) {
    console.error('❌ Could not load .env files');
    process.exit(1);
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function diagnose() {
  console.log('🔍 Database Diagnosis\n');
  console.log('═'.repeat(60));

  // Check user_actions table
  console.log('\n1️⃣ Checking user_actions table...');
  const { data: actions, error: actionsError, count: actionsCount } = await supabase
    .from('user_actions')
    .select('*', { count: 'exact', head: false })
    .limit(5);

  if (actionsError) {
    console.log(`   ❌ Error: ${actionsError.message}`);
  } else {
    console.log(`   ✅ Found ${actionsCount || 0} total actions`);
    if (actions && actions.length > 0) {
      console.log(`   📋 Sample actions:`);
      actions.forEach((action, i) => {
        console.log(`      ${i + 1}. User: ${action.user_id?.substring(0, 8)}... | Emissions: ${action.custom_emissions_saved || 'N/A'} lbs`);
      });
    }
  }

  // Check user_stats table
  console.log('\n2️⃣ Checking user_stats table...');
  const { data: stats, error: statsError, count: statsCount } = await supabase
    .from('user_stats')
    .select('*', { count: 'exact', head: false })
    .limit(10);

  if (statsError) {
    console.log(`   ❌ Error: ${statsError.message}`);
    console.log(`   💡 Table may not exist. Run FINAL_SIMPLE_SOLUTION.sql`);
  } else {
    console.log(`   ✅ Found ${statsCount || 0} users in user_stats`);
    if (stats && stats.length > 0) {
      console.log(`   📋 User stats:`);
      stats.forEach((stat, i) => {
        const total = stat.total_lbs || stat.total_emissions_lbs || 0;
        console.log(`      ${i + 1}. User: ${stat.user_id?.substring(0, 8)}... | Total: ${total} lbs`);
      });
    } else {
      console.log(`   ⚠️  No users in user_stats table`);
    }
  }

  // Check global_emissions table
  console.log('\n3️⃣ Checking global_emissions table...');
  const { data: global, error: globalError } = await supabase
    .from('global_emissions')
    .select('*')
    .eq('id', 1)
    .single();

  if (globalError) {
    console.log(`   ❌ Error: ${globalError.message}`);
    console.log(`   💡 Table may not exist. Run FINAL_SIMPLE_SOLUTION.sql`);
  } else {
    console.log(`   ✅ Global emissions found`);
    console.log(`   📊 Total: ${global.total_lbs || global.total_lbs_saved || 0} lbs`);
  }

  // Check profiles table
  console.log('\n4️⃣ Checking profiles table...');
  const { data: profiles, error: profilesError, count: profilesCount } = await supabase
    .from('profiles')
    .select('id, username, full_name, email', { count: 'exact', head: false })
    .limit(5);

  if (profilesError) {
    console.log(`   ❌ Error: ${profilesError.message}`);
  } else {
    console.log(`   ✅ Found ${profilesCount || 0} profiles`);
    if (profiles && profiles.length > 0) {
      console.log(`   📋 Sample profiles:`);
      profiles.forEach((profile, i) => {
        const name = profile.username || profile.full_name || profile.email || 'Anonymous';
        console.log(`      ${i + 1}. ${name} (${profile.id?.substring(0, 8)}...)`);
      });
    }
  }

  // Check RPC functions
  console.log('\n5️⃣ Checking RPC functions...');
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_leaderboard_simple', { limit_count: 10 });
  
  if (rpcError) {
    console.log(`   ❌ get_leaderboard_simple: ${rpcError.message}`);
    console.log(`   💡 Function may not exist. Run FINAL_SIMPLE_SOLUTION.sql`);
  } else {
    console.log(`   ✅ get_leaderboard_simple works`);
    console.log(`   📊 Returns ${rpcData?.length || 0} users`);
  }

  const { data: globalTotal, error: globalTotalError } = await supabase.rpc('get_global_total');
  
  if (globalTotalError) {
    console.log(`   ❌ get_global_total: ${globalTotalError.message}`);
  } else {
    console.log(`   ✅ get_global_total works`);
    console.log(`   📊 Global total: ${globalTotal || 0} lbs`);
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 SUMMARY:');
  
  if (actionsCount > 0 && (statsCount === 0 || !stats)) {
    console.log('   ⚠️  You have actions but no user_stats. Run backfill_totals()');
  } else if (actionsCount === 0) {
    console.log('   ⚠️  No actions found. Users need to log actions first.');
  } else if (statsCount > 0) {
    console.log(`   ✅ Database is set up. ${statsCount} active users found.`);
  } else {
    console.log('   ⚠️  Database may need setup. Run FINAL_SIMPLE_SOLUTION.sql');
  }
  
  console.log('');
}

diagnose();

