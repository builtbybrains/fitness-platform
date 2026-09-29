// BUILT planner: generates the user's weekly plan and daily targets with AI.
// Deploy: supabase functions deploy planner --project-ref <ref>
// AI provider and model: see ../_shared/ai.ts (OPENROUTER_API_KEY or
// OPENAI_API_KEY; AI_MODEL overrides the default model). With no key it
// builds a rules-based plan from the user's stats.
//
// The client calls this with the user's Supabase JWT. Everything runs
// through the user's OWN client, so row-level security applies to every read
// and write: reading the profile and weights, upserting ai_plans, mirroring
// kcal/water targets onto the profile, and counting the daily limit. No
// service-role key is used anywhere in this function. The schema (tables,
// grants, policies) is owned by supabase/schema.sql; this function never
// changes it.
//
// Safety: the system prompt carries the shared safety rules, and the
// calorie target is clamped in code: never below 1200 kcal (women) or
// 1500 kcal (men, or gender not given), and never below BMR × 1.1 for a
// weight-loss goal. Under-18s get maintenance calories, never a deficit.
//
// Limit: 5 plan generations per person per UTC day (public.ai_usage).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { CORS, json, serverError } from '../_shared/http.ts';
import { aiConfig, chat } from '../_shared/ai.ts';
import { isUnder18, kcalFloor, SAFETY_RULES } from '../_shared/safety.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

type PlanExercise = {
  name: string;
  sets: number;
  reps: number;
  kg: number | null;
  unit?: 'reps' | 's' | 'm';
  rest?: number;
  note?: string;
};
type PlanWorkout = { kind: 'workout'; focus: string; minutes: number; exercises: PlanExercise[] };
type PlanRest = { kind: 'rest'; focus: 'Recovery'; minutes: number; note: string };
type PlanMeal = { slot: string; label: string; kcal: number; protein: number };
export type PlanDay = { session: PlanWorkout | PlanRest; meals: PlanMeal[] };
export type WeekPlan = { days: PlanDay[]; kcal_target: number; water_target: number };

type Stats = {
  height_cm: number | null;
  age: number | null;
  gender: string;
  weight_kg: number | null;
  kcal_target: number;
  water_target: number;
  goal: string;
};

const LOAD_NOTE = 'Choose a weight you can lift for every rep with 2 in reserve.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sign in to build a plan.' }, 401);

    if (!(await takeQuota(supabase, 'plan'))) {
      return limitReached(`You've built ${LIMITS.plan} plans today, the daily limit. Try again tomorrow.`);
    }

    // Regenerating with a different goal? The client passes intent text.
    const { goal } = await req.json().catch(() => ({ goal: '' }));
    const goalText = String(goal ?? '').trim().slice(0, 300);

    // ── the user's stats (RLS-scoped read through their own token) ──
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('kcal_target, water_target, height_cm, age, gender, weight_kg')
      .eq('id', user.id)
      .maybeSingle();
    if (profileErr) throw new Error(`read profile: ${profileErr.message}`);

    const stats: Stats = {
      height_cm: profile?.height_cm ?? null,
      age: profile?.age ?? null,
      gender: profile?.gender || '',
      weight_kg: profile?.weight_kg ?? null,
      kcal_target: profile?.kcal_target ?? 2200,
      water_target: profile?.water_target ?? 8,
      goal: goalText,
    };

    // ── recent weight history so the plan can react to progress ──
    const { data: weights } = await supabase
      .from('weights')
      .select('day, kg')
      .eq('user_id', user.id)
      .order('day', { ascending: false })
      .limit(10);
    const weightLog = (weights ?? []).map((w) => `${w.day}: ${w.kg}kg`);

    const plan = await generatePlan(stats, weightLog);

    // ── persist: one active plan per user + mirror targets to the profile ──
    const { error: upErr } = await supabase.from('ai_plans').upsert({
      user_id: user.id,
      plan,
      kcal_target: plan.kcal_target,
      water_target: plan.water_target,
      updated_at: new Date().toISOString(),
    });
    if (upErr) {
      console.error('[planner] storing plan failed:', upErr.message);
    } else {
      const { error: profErr } = await supabase
        .from('profiles')
        .update({ kcal_target: plan.kcal_target, water_target: plan.water_target })
        .eq('id', user.id);
      if (profErr) console.error('[planner] updating targets failed:', profErr.message);
    }

    return json({ plan, stored: !upErr });
  } catch (e) {
    return serverError('planner', e);
  }
});

// ─────────────────────────── targets and safety ───────────────────────────

function bmrOf(stats: Stats): number | null {
  const { weight_kg: w, height_cm: h, age } = stats;
  if (!w || !h || !age) return null;
  const sex = stats.gender === 'male' ? 5 : stats.gender === 'female' ? -161 : -78;
  return 10 * w + 6.25 * h - 5 * age + sex;
}

function wantsToLose(goal: string): boolean {
  return /\b(lose|losing|lost|cut|cutting|fat[- ]?loss|slim|lean(er)? out|drop|shred|weight[- ]?loss|deficit)\b/i.test(goal);
}

function wantsToGain(goal: string): boolean {
  return /\b(gain|bulk|build muscle|put on|mass)\b/i.test(goal);
}

/** The lowest calorie target this person may be given. */
function safeKcalMin(stats: Stats): number {
  const bmr = bmrOf(stats);
  const floor = kcalFloor(stats.gender);
  // Under 18: maintenance, never a deficit, whatever the goal says.
  if (isUnder18(stats.age) && bmr) return Math.max(floor, Math.round(bmr * 1.55));
  if (wantsToLose(stats.goal) && bmr) return Math.max(floor, Math.round(bmr * 1.1));
  return floor;
}

function clampKcal(kcal: number, stats: Stats): number {
  return Math.min(6000, Math.max(safeKcalMin(stats), Math.round(kcal / 10) * 10));
}

/** Scale a day's meals up when they add up to less than the safe floor. */
function lift(meals: PlanMeal[], min: number): PlanMeal[] {
  const total = meals.reduce((a, m) => a + m.kcal, 0);
  if (!total || total >= min) return meals;
  const f = min / total;
  return meals.map((m) => ({ ...m, kcal: Math.round((m.kcal * f) / 5) * 5 }));
}

// ─────────────────────────── AI generation ───────────────────────────

const SYSTEM = [
  'You are BUILT\'s planning engine: a certified strength and conditioning coach and a registered sports dietitian.',
  'Design a realistic weekly training + nutrition plan for one person.',
  SAFETY_RULES,
  'If the stats say the person is under 18, plan maintenance calories only (no deficit) and keep training general and technique-focused.',
  'Rules: 4 workout days (upper/lower/full-body split), 3 rest days with short recovery notes.',
  'Workout exercises: real gym movements, sensible sets/reps. Do NOT prescribe absolute loads: set "kg" to null and add "note":"' + LOAD_NOTE + '" on loaded lifts.',
  'Meals: 4 slots (Breakfast, Lunch, Dinner, Snack), everyday foods, protein anchored. The snack is the smallest meal (about 10 to 15% of the day).',
  'Heavier meal calories on workout days; lighter on rest days. Each day\'s meals should add up to roughly kcal_target.',
  'kcal_target: Mifflin-St Jeor BMR × 1.55, adjusted toward the user\'s goal (at most 500 kcal below maintenance for weight loss). water_target in glasses: bodyweight(kg)/30, min 6, max 12, rounded.',
  'Answer with ONLY valid JSON, no markdown, matching exactly:',
  '{"days":[{"session":{"kind":"workout","focus":"...","minutes":45,"exercises":[{"name":"...","sets":4,"reps":10,"kg":null,"note":"..."}]},',
  '"meals":[{"slot":"Breakfast","label":"...","kcal":430,"protein":38}]} | {"session":{"kind":"rest","focus":"Recovery","minutes":0,"note":"..."},"meals":[...]}',
  '],"kcal_target":2200,"water_target":8}',
  'The days array must have exactly 7 entries, Monday first.',
].join(' ');

async function generatePlan(stats: Stats, weightLog: string[]): Promise<WeekPlan> {
  const ai = aiConfig({
    modelEnv: 'AI_MODEL',
    // Default kept as it was; a paid-provider decision is pending.
    openRouterDefaults: ['openai/gpt-4o-mini'],
    openAiDefault: 'gpt-4o-mini',
  });
  if (ai) {
    const userMsg =
      `Stats: ${JSON.stringify({ ...stats, minimum_kcal_target: safeKcalMin(stats) })}.` +
      (weightLog.length ? ` Recent weights: ${weightLog.join(', ')}.` : '');
    const answer = await chat(
      ai,
      {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 3000,
        temperature: 0.7,
        timeoutMs: 60_000,
      },
      (text) => parsePlan(text, stats),
      'planner',
    );
    if (answer) return answer.value;
  }
  return rulesPlan(stats);
}

function parsePlan(raw: string, stats: Stats): WeekPlan | null {
  try {
    // Models sometimes wrap the JSON in prose or code fences: extract the
    // outermost object before parsing.
    const s = raw.indexOf('{');
    const e = raw.lastIndexOf('}');
    if (s === -1 || e <= s) return null;
    const p = JSON.parse(raw.slice(s, e + 1));
    if (!Array.isArray(p?.days) || p.days.length !== 7) return null;
    const kcalTarget = clampKcal(Number(p.kcal_target) || stats.kcal_target, stats);
    const minDay = kcalFloor(stats.gender);
    const slots = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    const days: (PlanDay | null)[] = p.days.map((d: any) => {
      const s = d?.session ?? {};
      const meals: PlanMeal[] = lift(
        Array.isArray(d?.meals)
          ? d.meals
              .filter((m: any) => m && typeof m.label === 'string')
              .slice(0, 6)
              .map((m: any, i: number) => ({
                slot: slots.includes(m.slot) ? m.slot : slots[i] ?? 'Snack',
                label: String(m.label).slice(0, 120),
                kcal: clampInt(m.kcal, 80, 1600, 500),
                protein: clampInt(m.protein, 0, 120, 25),
              }))
          : [],
        minDay,
      );
      if (s.kind === 'rest') {
        return {
          session: {
            kind: 'rest' as const,
            focus: 'Recovery' as const,
            minutes: 0,
            note: String(s.note ?? 'Easy walk, stretching, early night.').slice(0, 200),
          },
          meals,
        };
      }
      const exercises: PlanExercise[] = Array.isArray(s.exercises)
        ? s.exercises
            .filter((e: any) => e && typeof e.name === 'string')
            .slice(0, 8)
            .map((e: any) => {
              const unit = e.unit === 's' || e.unit === 'm' ? e.unit : 'reps';
              return {
                name: String(e.name).slice(0, 60),
                sets: clampInt(e.sets, 1, 6, 3),
                reps: clampInt(e.reps, 1, unit === 'reps' ? 30 : 600, 10),
                // No absolute loads: the right weight depends on the person.
                kg: null,
                unit,
                ...(e.rest != null ? { rest: clampInt(e.rest, 30, 180, 90) } : {}),
                ...(unit === 'reps' ? { note: typeof e.note === 'string' && e.note ? String(e.note).slice(0, 160) : LOAD_NOTE } : {}),
              };
            })
        : [];
      if (!exercises.length) return null;
      return {
        session: {
          kind: 'workout' as const,
          focus: String(s.focus ?? 'Training').slice(0, 60),
          minutes: clampInt(s.minutes, 15, 120, 45),
          exercises,
        },
        meals,
      };
    });
    if (days.some((d) => d === null)) return null;
    return {
      days: days as PlanDay[],
      kcal_target: kcalTarget,
      water_target: clampInt(p.water_target, 6, 12, 8),
    };
  } catch {
    return null;
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// ─────────────────────────── rules fallback ───────────────────────────
// A complete, sane plan without any AI key, same shape as the AI output.
// Loaded lifts carry no fixed kg: everyone picks a weight they can lift for
// every rep with 2 in reserve.

function rulesPlan(stats: Stats): WeekPlan {
  const w = Number(stats.weight_kg) || 75;
  const bmr = bmrOf(stats) ?? (10 * 75 + 6.25 * 175 - 5 * 30 - 78);
  const goal = stats.goal;
  const adj = isUnder18(stats.age) ? 0 : wantsToLose(goal) ? -400 : wantsToGain(goal) ? 300 : 0;
  const kcal = clampKcal(bmr * 1.55 + adj, stats);
  const water = Math.min(12, Math.max(6, Math.round(w / 30)));
  const pct = (p: number) => Math.round((kcal * p) / 5) * 5;

  const load = (name: string, sets: number, reps: number): PlanExercise => ({ name, sets, reps, kg: null, note: LOAD_NOTE });

  // Training days: snack is a small shake-and-fruit top-up (~13%).
  const wo = (focus: string, minutes: number, exercises: PlanExercise[]): PlanDay => ({
    session: { kind: 'workout', focus, minutes, exercises },
    meals: [
      { slot: 'Breakfast', label: 'Greek yogurt bowl, berries, oats', kcal: pct(0.25), protein: 38 },
      { slot: 'Lunch', label: 'Grilled chicken bowl, rice, veg', kcal: pct(0.3), protein: 48 },
      { slot: 'Dinner', label: 'Salmon, potato, salad', kcal: pct(0.32), protein: 42 },
      { slot: 'Snack', label: 'Whey shake + banana', kcal: pct(0.13), protein: 24 },
    ],
  });
  const rest = (note: string): PlanDay => ({
    session: { kind: 'rest', focus: 'Recovery', minutes: 0, note },
    meals: [
      { slot: 'Breakfast', label: 'Eggs on rye, avocado', kcal: pct(0.25), protein: 24 },
      { slot: 'Lunch', label: 'Tuna wrap, mixed greens', kcal: pct(0.3), protein: 40 },
      { slot: 'Dinner', label: 'Turkey chili, rice', kcal: pct(0.33), protein: 44 },
      { slot: 'Snack', label: 'Cottage cheese + apple', kcal: pct(0.12), protein: 18 },
    ],
  });

  return {
    days: [
      wo('Upper body · Strength', 45, [
        load('Incline dumbbell press', 4, 10),
        load('Seated row', 4, 12),
        load('Lateral raise', 3, 15),
        load('Cable triceps push-down', 3, 12),
      ]),
      wo('Lower body · Strength', 50, [
        load('Back squat', 4, 8),
        load('Romanian deadlift', 3, 10),
        load('Walking lunge', 3, 12),
        load('Standing calf raise', 3, 15),
      ]),
      rest('Easy 20-minute walk, 10 minutes of stretching, in bed by 23:00.'),
      wo('Full body · Conditioning', 40, [
        load('Kettlebell swing', 4, 15),
        { name: 'Rowing intervals', sets: 5, reps: 250, kg: null, unit: 'm', rest: 60 },
        { name: 'Push-up ladder', sets: 3, reps: 12, kg: null },
        { name: 'Plank', sets: 3, reps: 45, kg: null, unit: 's', rest: 45 },
      ]),
      wo('Upper body · Hypertrophy', 45, [
        load('Bench press', 4, 10),
        load('Lat pulldown', 4, 12),
        load('Arnold press', 3, 12),
        load('Face pull', 3, 15),
      ]),
      rest('Full rest day. Hydrate, sleep 8 hours, no screens after 22:30.'),
      wo('Lower body · Strength', 50, [
        load('Deadlift', 4, 6),
        load('Leg press', 4, 10),
        load('Leg curl', 3, 12),
        load('Standing calf raise', 3, 15),
      ]),
    ],
    kcal_target: kcal,
    water_target: water,
  };
}
