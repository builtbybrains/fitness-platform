/* The weekly plan (v2): read it, build it, change it, move days, replace
   exercises.

   Storage (docs/API.md, "Plan v2"):
   - ai_plans.plan holds the plan: a generic week, Monday first. Permanent
     changes (replaceExercise with scope 'always') are written into it.
   - plan_overrides holds per-calendar-week changes: moved days
     (day_order) and this-week-only exercise swaps. weekView() applies
     them; every screen should render the week through weekView().
   No account: the plan and overrides live on the device ('aiPlan',
   'planOverrides:<monday>'); building a plan with AI needs an account. */

import { supabase } from '../lib/supabase';
import { isCloudUser } from '../lib/cloud';
import { loadLocal, saveLocal, updateLocal } from '../lib/localFallback';
import { writeThrough } from '../lib/outbox';
import { addDays, mondayIndex, parseDay, todayId, weekStartId } from '../lib/dates';
import { alternativesFor, availableEquipment, type Exercise, findExercise, type InjuryArea, injuriesFromText, INJURY_AREAS, type Level, variantFor } from '../data/exercises';
import { invoke, requireAccount } from './client';
import { ApiError } from './errors';
import { ageOn, ageRule } from './rules';
import { rememberFact } from './memory';
import type { MealSlot, PlanDayV2, PlanExerciseV2, PlanMealV2, PlanOverrides, PlanResult, PlanV2, ProfileV2, TrainLocation } from '../types';

export const LOAD_NOTE = 'Choose a weight you can lift for every rep with 2 in reserve.';
export const MINOR_LOAD_NOTE = 'Choose a weight you can lift for every rep with 3 in reserve. Technique first.';
const SLOTS: MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// ─────────────────────────────── reading ───────────────────────────────

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Any stored plan (v1 or v2) as a PlanV2, or null when it isn't a plan.
    v1 plans get empty variants, zero carbs/fat and a 'rules' source. */
export function upgradePlan(raw: unknown): PlanV2 | null {
  const p = raw as Partial<PlanV2> & { days?: unknown[] } | null;
  if (!p || !Array.isArray(p.days) || p.days.length !== 7) return null;
  if (p.version === 2) return p as PlanV2;
  const days: PlanDayV2[] = p.days.map((d) => {
    const day = (d ?? {}) as { session?: Record<string, unknown>; meals?: Record<string, unknown>[] };
    const s = day.session ?? {};
    const meals: PlanMealV2[] = (Array.isArray(day.meals) ? day.meals : []).map((m, i) => ({
      slot: (SLOTS as string[]).includes(String(m.slot)) ? (m.slot as MealSlot) : SLOTS[i] ?? 'Snack',
      label: String(m.label ?? 'Meal'),
      kcal: Math.round(num(m.kcal, 0)),
      protein: Math.round(num(m.protein, 0)),
      carbs: Math.round(num(m.carbs, 0)),
      fat: Math.round(num(m.fat, 0)),
    }));
    if (s.kind === 'rest') return { session: { kind: 'rest', focus: 'Recovery', minutes: 0, note: String(s.note ?? 'Easy walk, stretching, early night.') }, meals };
    const exercises: PlanExerciseV2[] = (Array.isArray(s.exercises) ? (s.exercises as Record<string, unknown>[]) : []).map((e) => {
      const lib = findExercise(String(e.name ?? ''));
      return {
        id: lib?.id ?? null,
        name: String(e.name ?? 'Exercise'),
        muscle: lib?.muscle ?? null,
        sets: Math.max(1, Math.round(num(e.sets, 3))),
        reps: Math.max(1, Math.round(num(e.reps, 10))),
        unit: e.unit === 's' || e.unit === 'm' ? e.unit : 'reps',
        rest: Math.round(num(e.rest, 90)),
        kg: null,
        ...(typeof e.note === 'string' && e.note ? { note: e.note } : {}),
        variants: {},
      };
    });
    return { session: { kind: 'workout', focus: String(s.focus ?? 'Training'), minutes: Math.round(num(s.minutes, 45)), time: 'evening', exercises }, meals };
  });
  return {
    version: 2,
    generated_at: '',
    source: 'rules',
    model: '',
    days,
    kcal_target: Math.round(num(p.kcal_target, 2200)),
    water_target: Math.round(num(p.water_target, 8)),
    macros: { protein_g: 0, carbs_g: 0, fat_g: 0 },
    location: 'gym',
    equipment: [],
    training_days: days.map((d, i) => (d.session.kind === 'workout' ? (i + 1) % 7 : -1)).filter((x) => x >= 0),
    training_time: 'evening',
    pace: null,
    minor: false,
    summary: '',
    changes: '',
    instruction: null,
  };
}

/** The active plan, or null when there is none yet (show the built-in
    week then). Cloud: the server copy, device copy when offline. */
export async function getPlan(userId: string): Promise<PlanV2 | null> {
  if (!isCloudUser(userId)) return upgradePlan(await loadLocal<unknown>(userId, 'aiPlan'));
  const { data, error } = await supabase.from('ai_plans').select('plan').eq('user_id', userId).maybeSingle();
  if (error) return upgradePlan(await loadLocal<unknown>(userId, 'aiPlan'));
  await saveLocal(userId, 'aiPlan', data?.plan ?? null);
  return upgradePlan(data?.plan);
}

/** Build a new plan from the questionnaire, or change it with a request in
    the person's words ("my knee hurts", "only 3 days this week"). The
    result says what changed and why (`changes`). Needs an account. */
export async function generatePlan(userId: string, instruction?: string | null): Promise<PlanResult> {
  requireAccount(userId, 'Your AI plan needs an account. Sign up free to get one built for you.');
  const data = await invoke<PlanResult>('planner', { instruction: instruction ?? '', localDay: todayId() });
  const plan = upgradePlan(data?.plan);
  if (!plan) throw new ApiError('server_error', "Your plan couldn't be built right now. Try again in a moment.", 500);
  await saveLocal(userId, 'aiPlan', plan);
  return { ...data, plan };
}

/** The last 20 "what changed" notes, newest first. */
export async function planHistory(userId: string): Promise<{ at: string; instruction: string | null; changes: string; kcal_target: number }[]> {
  if (!isCloudUser(userId)) return [];
  const { data } = await supabase.from('ai_plans').select('change_log').eq('user_id', userId).maybeSingle();
  return Array.isArray(data?.change_log) ? data!.change_log : [];
}

// ─────────────────────────────── week view ───────────────────────────────

export const IDENTITY_ORDER: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

export function emptyOverrides(weekStart: string): PlanOverrides {
  return { week_start: weekStart, day_order: [...IDENTITY_ORDER], exercise_swaps: {} };
}

/** Monday of the week containing `day`. */
export function weekStartOf(day: string = todayId()): string {
  return weekStartId(parseDay(day));
}

export type WeekDayView = {
  /** Calendar day id, yyyy-mm-dd. */
  id: string;
  /** 0 = Monday … 6 = Sunday (position in this calendar week). */
  weekday: number;
  /** Which plan day is shown here (pass to replaceExercise). */
  planIndex: number;
  /** True when this day shows a different plan day than usual. */
  moved: boolean;
  day: PlanDayV2;
};

/** The calendar week with moved days and this-week swaps applied. */
export function weekView(plan: PlanV2, overrides: PlanOverrides | null, weekStart: string): WeekDayView[] {
  const order = overrides && isPermutation(overrides.day_order) ? overrides.day_order : IDENTITY_ORDER;
  const swaps = overrides?.exercise_swaps ?? {};
  return order.map((planIndex, weekday) => {
    const src = plan.days[planIndex];
    const day: PlanDayV2 =
      src.session.kind === 'workout'
        ? {
            ...src,
            session: {
              ...src.session,
              exercises: src.session.exercises.map((e, i) => swaps[`${planIndex}:${i}`] ?? e),
            },
          }
        : src;
    return { id: addDays(weekStart, weekday), weekday, planIndex, moved: planIndex !== weekday, day };
  });
}

export function isPermutation(order: readonly number[] | null | undefined): order is number[] {
  return !!order && order.length === 7 && IDENTITY_ORDER.every((i) => order.includes(i));
}

/** Swap what two weekdays show. Pure. */
export function swapDays(order: readonly number[], a: number, b: number): number[] {
  const next = isPermutation(order) ? [...order] : [...IDENTITY_ORDER];
  if (a < 0 || a > 6 || b < 0 || b > 6) throw new ApiError('bad_request', 'Pick a day of this week.', 400);
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

// ─────────────────────────────── overrides ───────────────────────────────

function localKey(weekStart: string) {
  return `planOverrides:${weekStart}`;
}

function cleanOverrides(row: Partial<PlanOverrides> | null, weekStart: string): PlanOverrides {
  return {
    week_start: weekStart,
    day_order: isPermutation(row?.day_order) ? row!.day_order : [...IDENTITY_ORDER],
    exercise_swaps: row?.exercise_swaps && typeof row.exercise_swaps === 'object' ? row.exercise_swaps : {},
    ...(row?.updated_at ? { updated_at: row.updated_at } : {}),
  };
}

export async function getWeekOverrides(userId: string, weekStart: string): Promise<PlanOverrides> {
  const monday = weekStartOf(weekStart);
  const local = await loadLocal<PlanOverrides>(userId, localKey(monday));
  if (!isCloudUser(userId)) return cleanOverrides(local, monday);
  const { data, error } = await supabase.from('plan_overrides').select('week_start, day_order, exercise_swaps, updated_at').eq('user_id', userId).eq('week_start', monday).maybeSingle();
  if (error) return cleanOverrides(local, monday);
  // A newer local write that hasn't uploaded yet wins.
  if (local?.updated_at && (!data?.updated_at || local.updated_at > data.updated_at)) return cleanOverrides(local, monday);
  const o = cleanOverrides(data as PlanOverrides | null, monday);
  await saveLocal(userId, localKey(monday), o);
  return o;
}

async function saveOverrides(userId: string, o: PlanOverrides): Promise<PlanOverrides> {
  const next = { ...o, updated_at: new Date().toISOString() };
  await updateLocal<PlanOverrides>(userId, localKey(o.week_start), () => next);
  if (isCloudUser(userId)) {
    await writeThrough(userId, `plan_overrides:${o.week_start}`, {
      op: 'upsert',
      table: 'plan_overrides',
      onConflict: 'user_id,week_start',
      row: { user_id: userId, week_start: o.week_start, day_order: next.day_order, exercise_swaps: next.exercise_swaps, updated_at: next.updated_at },
    });
  }
  return next;
}

/** Move a workout to another day of this week (drag or swap): the two
    weekdays (0 = Monday … 6 = Sunday) trade what they show. Works offline
    and without an account. */
export async function moveWorkoutDay(userId: string, weekStart: string, fromWeekday: number, toWeekday: number): Promise<PlanOverrides> {
  const current = await getWeekOverrides(userId, weekStart);
  const moved = await saveOverrides(userId, { ...current, day_order: swapDays(current.day_order, fromWeekday, toWeekday) });
  if (isCloudUser(userId)) {
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    void rememberFact(userId, `Moved a workout from ${names[fromWeekday]} to ${names[toWeekday]} (week of ${current.week_start})`, 'schedule', 'behaviour').catch(() => undefined);
  }
  return moved;
}

/** Undo every change to this week (moves and this-week swaps). */
export async function resetWeek(userId: string, weekStart: string): Promise<PlanOverrides> {
  return saveOverrides(userId, emptyOverrides(weekStartOf(weekStart)));
}

// ─────────────────────────────── replace an exercise ───────────────────────────────

function injuriesOf(profile: Pick<ProfileV2, 'injury_areas' | 'injuries'>): InjuryArea[] {
  return [...new Set([...profile.injury_areas.filter((a) => (INJURY_AREAS as readonly string[]).includes(a)), ...injuriesFromText(profile.injuries)])];
}

function isMinor(profile: Pick<ProfileV2, 'birth_date' | 'age'>): boolean {
  return ageRule(ageOn(profile.birth_date, todayId()) ?? profile.age) === 'minor';
}

/** Three alternatives for the same muscle group that fit where the person
    trains (or `location` for a one-off, e.g. 'home_none' when travelling)
    and avoid their injuries. Instant, offline. */
export function exerciseOptions(
  exercise: Pick<PlanExerciseV2, 'id' | 'name'>,
  profile: Pick<ProfileV2, 'train_location' | 'equipment' | 'injury_areas' | 'injuries' | 'birth_date' | 'age'>,
  opts: { location?: TrainLocation; count?: number } = {},
): Exercise[] {
  const lib = findExercise(exercise.id ?? '') ?? findExercise(exercise.name);
  if (!lib) return [];
  const available = availableEquipment(opts.location ?? profile.train_location ?? 'home_none', profile.equipment);
  const maxLevel: Level | undefined = isMinor(profile) ? 'intermediate' : undefined;
  return alternativesFor(lib, available, injuriesOf(profile), { count: opts.count ?? 3, maxLevel });
}

/** A plan exercise for `replacement`, keeping the sets, reps and rest of
    the one it replaces when they use the same unit. */
export function toPlanExercise(
  replacement: Exercise,
  original: PlanExerciseV2,
  profile: Pick<ProfileV2, 'train_location' | 'equipment' | 'injury_areas' | 'injuries' | 'birth_date' | 'age'>,
): PlanExerciseV2 {
  const sameUnit = original.unit === replacement.unit;
  const minor = isMinor(profile);
  const loaded = replacement.equipment.some((k) => k === 'dumbbells' || k === 'barbell' || k === 'kettlebell' || k === 'machines');
  const injuries = injuriesOf(profile);
  const variants: PlanExerciseV2['variants'] = {};
  for (const loc of ['home_none', 'home_equipment', 'gym'] as TrainLocation[]) {
    if (loc === 'home_equipment' && !profile.equipment.some((e) => e !== 'other')) continue;
    const v = variantFor(replacement, availableEquipment(loc, profile.equipment), injuries);
    if (v) variants[loc] = { id: v.id, name: v.name };
  }
  const reps = sameUnit ? original.reps : replacement.reps;
  return {
    id: replacement.id,
    name: replacement.name,
    muscle: replacement.muscle,
    sets: sameUnit ? original.sets : replacement.sets,
    reps: minor && replacement.unit === 'reps' ? Math.max(8, reps) : reps,
    unit: replacement.unit,
    rest: sameUnit ? original.rest : replacement.rest,
    kg: null,
    note: loaded && replacement.unit === 'reps' ? (minor ? MINOR_LOAD_NOTE : LOAD_NOTE) : replacement.cue,
    variants,
    replaced_from: original.replaced_from ?? original.name,
  };
}

/** Replace one exercise. scope 'week': only this calendar week
    (plan_overrides). scope 'always': written into the plan itself. The
    coach remembers the swap. Resolves the updated plan and overrides. */
export async function replaceExercise(
  userId: string,
  args: {
    plan: PlanV2;
    weekStart: string;
    planIndex: number;
    exerciseIndex: number;
    replacement: Exercise;
    scope: 'week' | 'always';
    profile: Pick<ProfileV2, 'train_location' | 'equipment' | 'injury_areas' | 'injuries' | 'birth_date' | 'age'>;
  },
): Promise<{ plan: PlanV2; overrides: PlanOverrides }> {
  const day = args.plan.days[args.planIndex];
  if (!day || day.session.kind !== 'workout' || !day.session.exercises[args.exerciseIndex]) {
    throw new ApiError('bad_request', 'Pick an exercise from your plan.', 400);
  }
  const monday = weekStartOf(args.weekStart);
  const overrides = await getWeekOverrides(userId, monday);
  const key = `${args.planIndex}:${args.exerciseIndex}`;
  const original = overrides.exercise_swaps[key] ?? day.session.exercises[args.exerciseIndex];
  const next = toPlanExercise(args.replacement, original, args.profile);

  let plan = args.plan;
  let o = overrides;
  if (args.scope === 'week') {
    o = await saveOverrides(userId, { ...overrides, exercise_swaps: { ...overrides.exercise_swaps, [key]: next } });
  } else {
    plan = {
      ...args.plan,
      days: args.plan.days.map((d, i) =>
        i === args.planIndex && d.session.kind === 'workout'
          ? { ...d, session: { ...d.session, exercises: d.session.exercises.map((e, k) => (k === args.exerciseIndex ? next : e)) } }
          : d,
      ),
    };
    await savePlan(userId, plan);
    if (overrides.exercise_swaps[key]) {
      const { [key]: _drop, ...rest } = overrides.exercise_swaps;
      o = await saveOverrides(userId, { ...overrides, exercise_swaps: rest });
    }
  }
  if (isCloudUser(userId)) {
    void rememberFact(userId, `Swapped ${original.name} for ${next.name}${args.scope === 'always' ? ' for good' : ' for a week'}`, 'training', 'behaviour').catch(() => undefined);
  }
  return { plan, overrides: o };
}

/** Write a plan the person edited (permanent swaps). */
async function savePlan(userId: string, plan: PlanV2): Promise<void> {
  await saveLocal(userId, 'aiPlan', plan);
  if (!isCloudUser(userId)) return;
  await writeThrough(userId, 'ai_plans', {
    op: 'upsert',
    table: 'ai_plans',
    onConflict: 'user_id',
    row: { user_id: userId, plan, kcal_target: plan.kcal_target, water_target: plan.water_target, updated_at: new Date().toISOString() },
  });
}

/** The variant of every exercise for a location (switching to home or gym
    for a week): returns the plan with names swapped where a variant
    exists. Pure; save it with replaceExercise or show it as is. */
export function planForLocation(plan: PlanV2, location: TrainLocation): PlanV2 {
  return {
    ...plan,
    days: plan.days.map((d) =>
      d.session.kind === 'workout'
        ? {
            ...d,
            session: {
              ...d.session,
              exercises: d.session.exercises.map((e) => {
                const v = e.variants[location];
                if (!v || v.id === e.id) return e;
                const lib = findExercise(v.id);
                return lib ? { ...e, id: lib.id, name: lib.name, muscle: lib.muscle, unit: lib.unit, reps: lib.unit === e.unit ? e.reps : lib.reps, note: e.note } : e;
              }),
            },
          }
        : d,
    ),
  };
}

/** Today's position in its week (0 = Monday). */
export function weekdayOf(day: string = todayId()): number {
  return mondayIndex(parseDay(day));
}
