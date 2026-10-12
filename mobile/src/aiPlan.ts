/* AI plan client: loads the stored plan (ai_plans), asks the planner Edge
   Function to generate a fresh one, and keeps a copy on the device so the
   plan still shows offline. Mapping the plan onto a calendar week lives in
   planData.ts (pure, unit tested). Callers keep the rules week whenever no
   AI plan exists yet, so the app never shows an empty plan. */

import { supabase } from './lib/supabase';
import { isCloudUser } from './lib/cloud';
import { loadLocal, saveLocal } from './lib/localFallback';
import { callFunction } from './lib/functions';
import { isStoredPlan, StoredPlan } from './planData';

export { applyPlanToWeek } from './planData';
export type { StoredPlan } from './planData';
export { weekStartId } from './lib/dates';

/** The user's stored AI plan, or null when none exists yet. Device-only
    identities never have one (the planner needs an account). */
export async function fetchStoredPlan(userId: string): Promise<StoredPlan | null> {
  if (!isCloudUser(userId)) return null;
  const { data, error } = await supabase
    .from('ai_plans')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    const cached = await loadLocal<StoredPlan>(userId, 'aiPlan');
    return isStoredPlan(cached) ? cached : null;
  }
  const plan = isStoredPlan(data?.plan) ? (data.plan as StoredPlan) : null;
  await saveLocal(userId, 'aiPlan', plan);
  return plan;
}

/** Ask the planner Edge Function for a fresh AI plan. Throws an Error whose
    message is safe to show (including the daily limit). */
export async function generateAiPlan(goal?: string, userId?: string): Promise<StoredPlan> {
  const data = await callFunction<{ plan?: unknown }>('planner', { goal: goal ?? '' });
  if (!isStoredPlan(data?.plan)) {
    throw new Error("Your plan couldn't be built right now. Try again in a moment.");
  }
  if (userId) await saveLocal(userId, 'aiPlan', data.plan);
  return data.plan;
}
