// Saving a new plan (planner and check-in): ai_plans with a change_log
// entry, the targets mirrored onto the profile, and this week's and later
// exercise swaps cleared (they pointed at the old plan's exercises; moved
// days are kept). Runs with the person's own client.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import type { PlanV2 } from './plan.ts';

export type ChangeLogEntry = { at: string; instruction: string | null; changes: string; kcal_target: number; source: string };

export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function storePlan(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanV2,
  previousLog: unknown,
  today: string,
): Promise<boolean> {
  const log = Array.isArray(previousLog) ? previousLog : [];
  const entry: ChangeLogEntry = { at: plan.generated_at, instruction: plan.instruction, changes: plan.changes, kcal_target: plan.kcal_target, source: plan.source };
  const { error: upErr } = await supabase.from('ai_plans').upsert({
    user_id: userId,
    plan,
    kcal_target: plan.kcal_target,
    water_target: plan.water_target,
    change_log: [entry, ...log].slice(0, 20),
    updated_at: new Date().toISOString(),
  });
  if (upErr) {
    console.error('[plan] storing plan failed:', upErr.message);
    return false;
  }
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ kcal_target: plan.kcal_target, water_target: plan.water_target })
    .eq('id', userId);
  if (profErr) console.error('[plan] updating targets failed:', profErr.message);
  const { error: ovErr } = await supabase
    .from('plan_overrides')
    .update({ exercise_swaps: {}, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .gte('week_start', mondayOf(today));
  if (ovErr) console.warn('[plan] clearing swaps failed:', ovErr.message);
  return true;
}
