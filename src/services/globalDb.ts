import { supabase } from '../lib/supabase';
import { VerificationRequestContext, VerificationResult } from '../types/verification';

/**
 * Database schema:
 * - user_actions: action_id (PK), user_id (FK), action_type, quantity, unit, emissions_saved_lbs, verified (boolean), created_at, verified_at
 * - Trigger: global_sync_trigger fires AFTER UPDATE on user_actions WHEN verified=true
 * - Trigger automatically updates: user_stats.total_emissions_lbs, global_emissions.total_lbs_saved and total_actions
 */

/**
 * Step 1: Insert action with verified=false
 */
export async function saveUserAction(ctx: VerificationRequestContext): Promise<string> {
  const { data, error } = await supabase
    .from('user_actions')
    .insert({
      user_id: ctx.user.id,
      action_type: ctx.action.actionType,
      quantity: ctx.action.quantity,
      unit: ctx.action.unit,
      emissions_saved_lbs: ctx.action.emissionsSavedLbs ?? 0,
      verified: false,
    })
    .select('action_id')
    .single();

  if (error) throw error;
  if (!data?.action_id) throw new Error('Failed to create action');
  return data.action_id;
}

/**
 * Step 2: Update action to verified=true (triggers global_sync_trigger)
 * The database trigger will automatically:
 * - UPDATE user_stats SET total_emissions_lbs += emissions_saved_lbs
 * - UPDATE global_emissions SET total_lbs_saved += emissions_saved_lbs, total_actions += 1
 */
export async function verifyAndSyncAction(
  actionId: string,
  ctx: VerificationRequestContext,
  result: VerificationResult
): Promise<void> {
  if (result.finalStatus !== 'verified') {
    // If not verified, just mark it (no global sync)
    console.log('❌ Action not verified, skipping global sync');
    await supabase
      .from('user_actions')
      .update({ verified: false })
      .eq('action_id', actionId);
    return;
  }

  console.log(`✅ Verifying action ${actionId} with ${ctx.action.emissionsSavedLbs} lbs`);
  
  // Update to verified=true - this triggers the database trigger
  const { data, error } = await supabase
    .from('user_actions')
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
    })
    .eq('action_id', actionId)
    .select();

  if (error) {
    console.error('❌ Error updating action:', error);
    throw error;
  }

  console.log('✅ Action verified, trigger should update global_emissions');
  console.log('📊 Updated action:', data);

  // The trigger has already updated global_emissions, so we can optionally fetch the new total
  // For real-time updates, rely on the Postgres subscription in GlobalImpact.tsx
}


