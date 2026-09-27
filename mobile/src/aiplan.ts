/* AI plan client: loads the stored plan (ai_plans), asks the planner Edge
   Function to generate a fresh one, and maps the wire format onto the app's
   PlanDay[] for the current week. Callers keep the deterministic rules plan
   whenever no AI plan exists yet — the app never shows an empty plan. */

import { supabase } from './lib/supabase';
import { isoDay, PlanDay, PlanExercise, PlanMeal } from './planData';

export type StoredPlan = {
  days: {
    session:
      | { kind: 'workout'; focus: string; minutes: number; exercises: Partial<PlanExercise>[] }
      | { kind: 'rest'; focus: string; minutes: number; note: string };
    meals: PlanMeal[];
  }[];
  kcal_target: number;
  water_target: number;
};

export function weekStartId(from = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return isoDay(d);
}

/** The user's stored AI plan, or null when none exists yet. */
export async function fetchStoredPlan(userId: string): Promise<StoredPlan | null> {
  const { data, error } = await supabase
    .from('ai_plans')
    .select('plan')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data?.plan) return null;
  const plan = data.plan as StoredPlan;
  return Array.isArray(plan?.days) && plan.days.length === 7 ? plan : null;
}

/** Ask the planner Edge Function for a fresh AI plan. Throws on failure. */
export async function generateAiPlan(goal?: string): Promise<StoredPlan> {
  const { data, error } = await supabase.functions.invoke('planner', {
    body: { goal: goal ?? '' },
  });
  if (error) throw new Error(error.message);
  const plan = (data as any)?.plan as StoredPlan | undefined;
  if (!plan || !Array.isArray(plan.days) || plan.days.length !== 7) {
    throw new Error('Planner returned an invalid plan');
  }
  return plan;
}

/** Map a stored plan onto the current calendar week (Mon–Sun). */
export function applyPlanToWeek(plan: StoredPlan, base: PlanDay[]): PlanDay[] {
  return base.map((day, i) => {
    const src = plan.days[i];
    if (!src) return day;
    const session =
      src.session.kind === 'rest'
        ? {
            kind: 'rest' as const,
            focus: 'Recovery' as const,
            minutes: 0,
            note: src.session.note ?? 'Easy walk, stretching, early night.',
          }
        : {
            kind: 'workout' as const,
            focus: src.session.focus,
            minutes: src.session.minutes ?? 45,
            exercises: (src.session.exercises ?? []).map((e) => ({
              name: String(e.name ?? 'Exercise'),
              sets: Math.max(1, Math.round(Number(e.sets) || 3)),
              reps: Math.max(1, Math.round(Number(e.reps) || 10)),
              kg: e.kg != null && Number.isFinite(Number(e.kg)) ? Number(e.kg) : undefined,
              unit: e.unit ?? 'reps',
              rest: e.rest,
            })),
          };
    const meals: PlanMeal[] = Array.isArray(src.meals)
      ? src.meals.map((m, mi) => ({
          slot: m.slot ?? ['Breakfast', 'Lunch', 'Dinner', 'Snack'][mi] ?? 'Snack',
          label: String(m.label ?? 'Meal'),
          kcal: Math.round(Number(m.kcal) || 0),
          protein: Math.round(Number(m.protein) || 0),
        }))
      : day.meals;
    return { ...day, id: day.id, session, meals };
  });
}
