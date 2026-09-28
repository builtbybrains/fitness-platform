// VITAL planner — generates the user's weekly plan + goals with AI.
// Deploy: supabase functions deploy planner --project-ref <ref>
// Uses the same OpenRouter/OpenAI key as the coach (first set wins);
// with no key it builds a solid rules-based plan from the user's stats.
//
// The client calls this with the user's Supabase JWT. The function reads the
// profile (RLS applies through the user's token), asks the model for a JSON
// plan, validates it, stores it in ai_plans, and mirrors kcal/water targets
// onto the profile so every other screen keeps working unchanged.
//
// First-run note: some newer Supabase projects don't grant table privileges
// to anon/authenticated when tables are created via the SQL Editor, and this
// function needs ai_plans to exist. It installs both on its first call
// (idempotent) so fresh projects work with zero manual SQL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PlanExercise = { name: string; sets: number; reps: number; kg?: number | null; unit?: 'reps' | 's' | 'm'; rest?: number };
type PlanWorkout = { kind: 'workout'; focus: string; minutes: number; exercises: PlanExercise[] };
type PlanRest = { kind: 'rest'; focus: 'Recovery'; minutes: number; note: string };
type PlanMeal = { slot: string; label: string; kcal: number; protein: number };
export type PlanDay = { session: PlanWorkout | PlanRest; meals: PlanMeal[] };
export type WeekPlan = { days: PlanDay[]; kcal_target: number; water_target: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401,
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }

    await ensureSchema(admin);

    // Regenerating with a different goal? The client passes intent text.
    const { goal } = await req.json().catch(() => ({ goal: '' }));
    const goalText = String(goal ?? '').trim().slice(0, 300);

    // ── the user's stats (RLS-scoped read through their own token) ──
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, kcal_target, water_target, height_cm, age, gender, weight_kg')
      .eq('id', user.id)
      .maybeSingle();

    const stats = {
      name: profile?.name || 'athlete',
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
      .order('day', { ascending: false })
      .limit(10);
    const weightLog = (weights ?? []).map((w) => `${w.day}: ${w.kg}kg`);

    const plan = await generatePlan(stats, weightLog);
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Planner unavailable' }), {
        status: 503,
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }

    // ── persist: one active plan per user + mirror targets to the profile ──
    const { error: upErr } = await admin.from('ai_plans').upsert({
      user_id: user.id,
      plan,
      kcal_target: plan.kcal_target,
      water_target: plan.water_target,
      updated_at: new Date().toISOString(),
    });
    if (!upErr) {
      await admin.from('profiles').update({
        kcal_target: plan.kcal_target,
        water_target: plan.water_target,
      }).eq('id', user.id);
    }

    return new Response(JSON.stringify({ plan, stored: !upErr, storeError: upErr?.message ?? null }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  }
});

// ─────────────────────────── schema bootstrap ───────────────────────────

let schemaReady = false;

async function ensureSchema(admin: ReturnType<typeof createClient>): Promise<void> {
  if (schemaReady) return;
  try {
    const sql = `
      create table if not exists public.ai_plans (
        user_id uuid primary key references auth.users (id) on delete cascade,
        plan jsonb not null,
        kcal_target int,
        water_target int,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table public.ai_plans enable row level security;
      do $$ begin
        if not exists (select 1 from pg_policies where tablename = 'ai_plans' and policyname = 'own ai plan') then
          create policy "own ai plan" on public.ai_plans
            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
        end if;
      end $$;
      alter table public.profiles add column if not exists weight_kg real;
      grant usage on schema public to anon, authenticated;
      grant all on public.ai_plans to anon, authenticated;
    `;
    const { error } = await admin.rpc('exec_sql', { sql_string: sql });
    if (error) {
      // exec_sql doesn't exist by default — fall back to table existence check.
      const probe = await admin.from('ai_plans').select('user_id').limit(1);
      if (probe.error) throw new Error(`ai_plans unavailable: ${probe.error.message}`);
    }
    schemaReady = true;
  } catch {
    // Never block plan generation on bootstrap; storage happens below.
  }
}

// ─────────────────────────── AI generation ───────────────────────────

function aiConfig(): { url: string; key: string; model: string; extra: Record<string, string> } | null {
  const orKey = Deno.env.get('OPENROUTER_API_KEY');
  const oaKey = Deno.env.get('OPENAI_API_KEY');
  if (orKey) {
    return {
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: orKey,
      model: Deno.env.get('AI_MODEL') ?? 'openai/gpt-4o-mini',
      extra: { 'HTTP-Referer': 'https://vital.app', 'X-Title': 'VITAL' },
    };
  }
  if (oaKey) {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      key: oaKey,
      model: Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini',
      extra: {},
    };
  }
  return null;
}

const SYSTEM = [
  'You are VITAL\'s planning engine: a certified S&C coach and sports dietitian.',
  'Design a realistic weekly training + nutrition plan for one person.',
  'Rules: 4 workout days (upper/lower/full-body split), 3 rest days with short recovery notes.',
  'Workout exercises: real gym movements, sensible sets/reps, optional starting loads in kg.',
  'Meals: 4 slots — Breakfast, Lunch, Dinner, Snack — everyday foods, protein anchored.',
  'Heavier meal calories on workout days; lighter on rest days.',
  'kcal_target: use Mifflin-St Jeor ×1.55 (adjust toward the user\'s goal). water_target in glasses: bodyweight(kg)/30, min 6, max 12, rounded.',
  'Answer with ONLY valid JSON, no markdown, matching exactly:',
  '{"days":[{"session":{"kind":"workout","focus":"...","minutes":45,"exercises":[{"name":"...","sets":4,"reps":10,"kg":16}]},',
  '"meals":[{"slot":"Breakfast","label":"...","kcal":430,"protein":38}]} | {"session":{"kind":"rest","focus":"Recovery","minutes":0,"note":"..."},"meals":[...]}',
  '],"kcal_target":2200,"water_target":8}',
  'The days array must have exactly 7 entries, Monday first.',
].join(' ');

async function generatePlan(
  stats: Record<string, unknown>,
  weightLog: string[],
): Promise<WeekPlan | null> {
  const ai = aiConfig();
  const userMsg =
    `Stats: ${JSON.stringify(stats)}.` +
    (weightLog.length ? ` Recent weights: ${weightLog.join(', ')}.` : '');

  if (ai) {
    try {
      const r = await fetch(ai.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${ai.key}`,
          ...ai.extra,
        },
        body: JSON.stringify({
          model: ai.model,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: userMsg },
          ],
          max_tokens: 2600,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      if (!r.ok) throw new Error(`AI ${r.status}`);
      const j = await r.json();
      const raw = String(j.choices?.[0]?.message?.content ?? '');
      const plan = parsePlan(raw, stats);
      if (plan) return plan;
    } catch {
      /* fall through to rules */
    }
  }
  return rulesPlan(stats);
}

function parsePlan(raw: string, stats: Record<string, unknown>): WeekPlan | null {
  try {
    const p = JSON.parse(raw);
    if (!Array.isArray(p?.days) || p.days.length !== 7) return null;
    const slots = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    const days: PlanDay[] = p.days.map((d: any) => {
      const s = d?.session ?? {};
      const meals: PlanMeal[] = Array.isArray(d?.meals)
        ? d.meals
            .filter((m: any) => m && typeof m.label === 'string')
            .map((m: any, i: number) => ({
              slot: slots.includes(m.slot) ? m.slot : slots[i] ?? 'Snack',
              label: String(m.label).slice(0, 120),
              kcal: clampInt(m.kcal, 80, 1600, 500),
              protein: clampInt(m.protein, 0, 120, 25),
            }))
        : [];
      if (s.kind === 'rest') {
        return {
          session: {
            kind: 'rest' as const,
            focus: 'Recovery',
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
            .map((e: any) => ({
              name: String(e.name).slice(0, 60),
              sets: clampInt(e.sets, 1, 6, 3),
              reps: clampInt(e.reps, 1, 30, 10),
              kg: e.kg != null && Number.isFinite(Number(e.kg)) ? Number(e.kg) : null,
              unit: e.unit === 's' || e.unit === 'm' ? e.unit : 'reps',
              rest: e.rest != null ? clampInt(e.rest, 30, 180, 90) : undefined,
            }))
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
      days,
      kcal_target: clampInt(p.kcal_target, 1200, 6000, Number(stats.kcal_target) || 2200),
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
// A complete, sane plan without any AI key — same shape as the AI output.

function rulesPlan(stats: Record<string, unknown>): WeekPlan {
  const age = Number(stats.age) || 30;
  const h = Number(stats.height_cm) || 175;
  const w = Number(stats.weight_kg) || 75;
  const male = stats.gender === 'male';
  const bmr = 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
  const goal = String(stats.goal ?? '').toLowerCase();
  const adj = goal.includes('lose') ? -400 : goal.includes('gain') ? 300 : 0;
  const kcal = Math.max(1400, Math.round((bmr * 1.55 + adj) / 10) * 10);
  const water = Math.min(12, Math.max(6, Math.round(w / 30)));

  const wo = (focus: string, minutes: number, exercises: PlanExercise[]): PlanDay => ({
    session: { kind: 'workout', focus, minutes, exercises },
    meals: [
      { slot: 'Breakfast', label: 'Greek yogurt bowl, berries, oats', kcal: Math.round(kcal * 0.2), protein: 38 },
      { slot: 'Lunch', label: 'Grilled chicken bowl, rice, veg', kcal: Math.round(kcal * 0.28), protein: 48 },
      { slot: 'Dinner', label: 'Salmon, potato, salad', kcal: Math.round(kcal * 0.27), protein: 42 },
      { slot: 'Snack', label: 'Whey shake + banana', kcal: Math.round(kcal * 0.25), protein: 24 },
    ],
  });
  const rest = (note: string): PlanDay => ({
    session: { kind: 'rest', focus: 'Recovery', minutes: 0, note },
    meals: [
      { slot: 'Breakfast', label: 'Eggs on rye, avocado', kcal: Math.round(kcal * 0.22), protein: 24 },
      { slot: 'Lunch', label: 'Tuna wrap, mixed greens', kcal: Math.round(kcal * 0.3), protein: 40 },
      { slot: 'Dinner', label: 'Turkey chili, rice', kcal: Math.round(kcal * 0.32), protein: 44 },
      { slot: 'Snack', label: 'Cottage cheese + apple', kcal: Math.round(kcal * 0.16), protein: 18 },
    ],
  });

  return {
    days: [
      wo('Upper body · Strength', 45, [
        { name: 'Incline dumbbell press', sets: 4, reps: 10, kg: 16 },
        { name: 'Seated row', sets: 4, reps: 12, kg: 40 },
        { name: 'Lateral raise', sets: 3, reps: 15, kg: 8 },
        { name: 'Cable triceps push-down', sets: 3, reps: 12, kg: 25 },
      ]),
      wo('Lower body · Strength', 50, [
        { name: 'Back squat', sets: 4, reps: 8, kg: 60 },
        { name: 'Romanian deadlift', sets: 3, reps: 10, kg: 50 },
        { name: 'Walking lunge', sets: 3, reps: 12, kg: 12 },
        { name: 'Standing calf raise', sets: 3, reps: 15, kg: 30 },
      ]),
      rest('Easy 20-minute walk, 10 minutes of stretching, in bed by 23:00.'),
      wo('Full body · Conditioning', 40, [
        { name: 'Kettlebell swing', sets: 4, reps: 15, kg: 16 },
        { name: 'Rowing intervals', sets: 5, reps: 250, unit: 'm', rest: 60 },
        { name: 'Push-up ladder', sets: 3, reps: 12 },
        { name: 'Plank', sets: 3, reps: 45, unit: 's', rest: 45 },
      ]),
      wo('Upper body · Hypertrophy', 45, [
        { name: 'Bench press', sets: 4, reps: 10, kg: 45 },
        { name: 'Lat pulldown', sets: 4, reps: 12, kg: 35 },
        { name: 'Arnold press', sets: 3, reps: 12, kg: 10 },
        { name: 'Face pull', sets: 3, reps: 15, kg: 20 },
      ]),
      rest('Full rest day. Hydrate, sleep 8 hours, no screens after 22:30.'),
      wo('Lower body · Strength', 50, [
        { name: 'Deadlift', sets: 4, reps: 6, kg: 70 },
        { name: 'Leg press', sets: 4, reps: 10, kg: 90 },
        { name: 'Leg curl', sets: 3, reps: 12, kg: 35 },
        { name: 'Standing calf raise', sets: 3, reps: 15, kg: 30 },
      ]),
    ],
    kcal_target: kcal,
    water_target: water,
  };
}
