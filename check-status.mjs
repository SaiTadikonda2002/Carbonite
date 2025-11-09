// Quick status check
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

console.log('📊 ACTIVE USERS STATUS\n');
console.log('═'.repeat(50));

// Check actions
const { count: actionsCount } = await supabase
  .from('user_actions')
  .select('*', { count: 'exact', head: true });

// Check if schema exists
const { error: statsError } = await supabase
  .from('user_stats')
  .select('user_id', { count: 'exact', head: true });

console.log(`\n📋 Database Status:`);
console.log(`   • User Actions: ${actionsCount || 0}`);
console.log(`   • Schema Setup: ${statsError ? '❌ Not Set Up' : '✅ Ready'}`);

if (statsError) {
  console.log(`\n⚠️  ACTION REQUIRED:`);
  console.log(`   Run FINAL_SIMPLE_SOLUTION.sql in Supabase SQL Editor`);
  console.log(`\n📝 Steps:`);
  console.log(`   1. Open Supabase Dashboard → SQL Editor`);
  console.log(`   2. Copy/paste FINAL_SIMPLE_SOLUTION.sql`);
  console.log(`   3. Click "Run"`);
  console.log(`   4. Run this script again\n`);
} else if (actionsCount === 0) {
  console.log(`\n📭 No active users yet.`);
  console.log(`   Users need to log actions first.\n`);
} else {
  console.log(`\n✅ Ready to display active users!`);
  console.log(`   Run: node list-active-users.mjs\n`);
}

