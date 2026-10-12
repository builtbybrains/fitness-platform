// The planner core, shared by the `planner` and `checkin` functions.
//
// How a plan is built (docs/API.md, "Plan v2"):
//   1. A change request ("my knee hurts", "only 3 days this week", "no
//      equipment this week") is applied to a copy of the person first:
//      injury areas, training days, location, session length, volume.
//   2. Targets come from rules.ts (calorie floors, age rules, safe pace).
//   3. A skeleton week is built in code: training days from the profile
//      (Sunday rest by default), a split by number of days, and exercises
//      from the library that fit the equipment, injuries and level.
//   4. With an AI key, the model rewrites exercises (choosing only from the
//      allowed library ids) and writes the meals. Everything it returns is
//      checked again in code; anything unsafe or unknown is replaced.
//   5. Every exercise gets home and gym variants from the library.
//   6. "What changed and why" is computed by diffing the old and new plan,
//      plus the model's one-line reason when there is one.

import { aiProvider, chat, clampInt, extractJson, str } from './ai.ts';
import {
  alternativesFor,
  availableEquipment,
  type Equipment,
  type Exercise,
  exercisesFor,
  findExercise,
  fitsEquipment,
  type InjuryArea,
  injuriesFromText,
  type Level,
  type Muscle,
  type Pattern,
  safeFor,
  type TrainLocation,
  variantFor,
} from './exercises.ts';
import { cleanMeal, type DietRules, fitDay, libraryDay, libraryOptions, MEAL_SLOTS, type MealSlot, type PlanMeal, scaleMeal, violates } from './food.ts';
import { memoryForPrompt, type MemoryFact } from './memory.ts';
import { describePerson, type Person } from './profile.ts';
import { activityFactor, dailyTargets, type DailyTargets, kcalFloor, paceCheck, type PaceCheck, trainingSchedule, WEEKDAY_NAMES, weekdayOfPlanIndex } from './rules.ts';
import { MINOR_RULES, SAFETY_RULES } from './safety.ts';

export type PlanExerciseV2 = {
  id: string | null;
  name: string;
  muscle: Muscle | null;
  sets: number;
  reps: number;
  unit: 'reps' | 's' | 'm';
  rest: number;
  kg: null;
  note?: string;
  variants: Partial<Record<TrainLocation, { id: string; name: string }>>;
  replaced_from?: string;
};
export type PlanWorkoutV2 = { kind: 'workout'; focus: string; minutes: number; time: string; exercises: PlanExerciseV2[] };
export type PlanRestV2 = { kind: 'rest'; focus: 'Recovery'; minutes: 0; note: string };
export type PlanDayV2 = { session: PlanWorkoutV2 | PlanRestV2; meals: PlanMeal[] };
export type PlanV2 = {
  version: 2;
  generated_at: string;
  source: 'ai' | 'rules';
  model: string;
  days: PlanDayV2[];
  kcal_target: number;
  water_target: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number };
  location: TrainLocation;
  equipment: Equipment[];
  training_days: number[];
  training_time: string;
  pace: PaceCheck | null;
  minor: boolean;
  summary: string;
  changes: string;
  instruction: string | null;
};

export type BodyAnalysisResult = {
  body_fat_range: [number, number];
  build: string;
  posture_notes: string[];
  training_focus: string[];
  confidence: 'low' | 'medium' | 'high';
  summary: string;
};

export type PlanContext = {
  person: Person;
  memory: MemoryFact[];
  analysis: BodyAnalysisResult | null;
  previous: unknown;
  instruction: string | null;
  /** Extra facts for the model (a check-in review, recent behaviour). */
  extra?: string;
  /** Calorie change from a check-in review (kcal a day, + or -). The safety
      floors are applied again after it. */
  kcalDelta?: number;
  today: string;
};

/** Move the calorie target by `delta`, then re-apply every floor: the
    gender floor, resting energy × 1.1 when below maintenance, and never
    below maintenance for a minor. Macros follow the new total. */
export function applyKcalDelta(t: DailyTargets, delta: number, p: Person): DailyTargets {
  if (!delta) return t;
  const bmrValue = t.maintenance != null ? t.maintenance / activityFactor(p.activity_level, p.job_activity) : null;
  let kcal = t.kcal + Math.max(-300, Math.min(300, Math.round(delta)));
  const floor = Math.max(
    kcalFloor(p.gender),
    t.maintenance != null && kcal < t.maintenance && bmrValue != null ? bmrValue * 1.1 : 0,
    p.minor && t.maintenance != null ? t.maintenance : 0,
  );
  const floorApplied = kcal < floor;
  kcal = Math.min(6000, Math.round(Math.max(kcal, floor) / 10) * 10);
  const carbs_g = Math.max(0, Math.round((kcal - t.protein_g * 4 - t.fat_g * 9) / 4));
  return { ...t, kcal, carbs_g, adjustment: t.maintenance != null ? kcal - t.maintenance : t.adjustment, floorApplied: t.floorApplied || floorApplied };
}

export const LOAD_NOTE = 'Choose a weight you can lift for every rep with 2 in reserve.';
export const MINOR_LOAD_NOTE = 'Choose a weight you can lift for every rep with 3 in reserve. Technique first.';

// ───────────────────────────── change requests ─────────────────────────────

export type Adjusted = {
  person: Person;
  maxMinutes: number | null;
  volumeDelta: number;
  notes: string[];
};

const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/** Apply a free-text change request to a copy of the person. */
export function applyInstruction(person: Person, instruction: string | null): Adjusted {
  const p: Person = { ...person, schedule: [...person.schedule], injuryAreas: [...person.injuryAreas], available: [...person.available] };
  const out: Adjusted = { person: p, maxMinutes: null, volumeDelta: 0, notes: [] };
  const text = (instruction ?? '').toLowerCase();
  if (!text) return out;

  const hurt = injuriesFromText(text).filter((a) => !p.injuryAreas.includes(a));
  if (hurt.length && /(hurt|pain|sore|injur|ache|tweak|strain|sprain|careful|avoid|protect|bad)/.test(text)) {
    p.injuryAreas.push(...hurt);
    out.notes.push(`Exercises that load your ${hurt.map((h) => h.replace('_', ' ')).join(' and ')} are swapped for safer ones.`);
  }

  const days = /only\s+(\d|one|two|three|four|five|six)\s+(training\s+)?days?|(\d|one|two|three|four|five|six)\s+days?\s+(a|per|this)\s+week/.exec(text);
  if (days) {
    const n = Math.min(7, Math.max(1, Number(days[1] ?? days[3]) || NUM_WORDS[days[1] ?? days[3]] || 3));
    const current = p.schedule.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
    let chosen: number[];
    if (n <= current.length) {
      chosen = Array.from({ length: n }, (_, k) => current[Math.floor((k * current.length) / n)]);
    } else {
      const extra = [0, 2, 4, 1, 3, 5, 6].filter((i) => !current.includes(i));
      chosen = [...current, ...extra.slice(0, n - current.length)];
    }
    p.schedule = p.schedule.map((_, i) => chosen.includes(i));
    p.training_days = p.schedule.map((on, i) => (on ? weekdayOfPlanIndex(i) : -1)).filter((d) => d >= 0);
    out.notes.push(`${n} training day${n === 1 ? '' : 's'} this week.`);
  }

  if (/(no equipment|bodyweight|body weight|hotel|travel|away from home|no gym)/.test(text)) {
    p.train_location = p.train_location === 'home_equipment' && !/(no equipment|hotel|travel|away)/.test(text) ? 'home_equipment' : 'home_none';
    p.available = availableEquipment(p.train_location, p.equipment);
    out.notes.push(p.train_location === 'home_none' ? 'Every workout now needs no equipment.' : 'Workouts use your home equipment.');
  } else if (/\b(back (at|to) the gym|at the gym|in the gym|joined a gym|gym this week)\b/.test(text)) {
    p.train_location = 'gym';
    p.available = availableEquipment('gym', p.equipment);
    out.notes.push('Workouts are set up for the gym.');
  }

  const mins = /(\d{2,3})\s*(min|minutes)/.exec(text);
  if (mins) {
    out.maxMinutes = Math.min(120, Math.max(15, Number(mins[1])));
    out.notes.push(`Sessions fit in about ${out.maxMinutes} minutes.`);
  } else if (/(short(er)?|less time|busy|quick)/.test(text)) {
    out.maxMinutes = 35;
    out.notes.push('Shorter sessions.');
  }

  if (/(too hard|easier|lighter|exhausted|too much|tired|sore all)/.test(text)) {
    out.volumeDelta = -1;
    out.notes.push('Slightly less volume so you can recover.');
  } else if (/(too easy|harder|more challenging|push me|step it up)/.test(text)) {
    out.volumeDelta = 1;
    out.notes.push('A bit more volume to keep you progressing.');
  }
  return out;
}

// ───────────────────────────── skeleton ─────────────────────────────

type Slot = { muscle: Muscle; pattern?: Pattern };
type Template = { focus: string; slots: Slot[] };

const T: Record<string, Template> = {
  full_a: { focus: 'Full body', slots: [{ muscle: 'quads', pattern: 'squat' }, { muscle: 'chest', pattern: 'push_horizontal' }, { muscle: 'back', pattern: 'pull_horizontal' }, { muscle: 'hamstrings', pattern: 'hinge' }, { muscle: 'shoulders', pattern: 'push_vertical' }, { muscle: 'core' }] },
  full_b: { focus: 'Full body', slots: [{ muscle: 'quads', pattern: 'lunge' }, { muscle: 'back', pattern: 'pull_vertical' }, { muscle: 'chest', pattern: 'push_horizontal' }, { muscle: 'glutes', pattern: 'hinge' }, { muscle: 'shoulders', pattern: 'isolation' }, { muscle: 'core' }] },
  upper: { focus: 'Upper body', slots: [{ muscle: 'chest', pattern: 'push_horizontal' }, { muscle: 'back', pattern: 'pull_vertical' }, { muscle: 'shoulders', pattern: 'push_vertical' }, { muscle: 'back', pattern: 'pull_horizontal' }, { muscle: 'biceps' }, { muscle: 'triceps' }] },
  lower: { focus: 'Lower body', slots: [{ muscle: 'quads', pattern: 'squat' }, { muscle: 'hamstrings', pattern: 'hinge' }, { muscle: 'quads', pattern: 'lunge' }, { muscle: 'glutes' }, { muscle: 'calves' }, { muscle: 'core' }] },
  push: { focus: 'Push', slots: [{ muscle: 'chest', pattern: 'push_horizontal' }, { muscle: 'shoulders', pattern: 'push_vertical' }, { muscle: 'chest' }, { muscle: 'shoulders', pattern: 'isolation' }, { muscle: 'triceps' }] },
  pull: { focus: 'Pull', slots: [{ muscle: 'back', pattern: 'pull_vertical' }, { muscle: 'back', pattern: 'pull_horizontal' }, { muscle: 'shoulders', pattern: 'pull_horizontal' }, { muscle: 'biceps' }, { muscle: 'core' }] },
  legs: { focus: 'Legs', slots: [{ muscle: 'quads', pattern: 'squat' }, { muscle: 'hamstrings', pattern: 'hinge' }, { muscle: 'glutes' }, { muscle: 'quads', pattern: 'lunge' }, { muscle: 'calves' }] },
  recovery: { focus: 'Active recovery', slots: [{ muscle: 'core' }, { muscle: 'glutes' }, { muscle: 'cardio' }, { muscle: 'back', pattern: 'core' }] },
};

export function splitFor(n: number): string[] {
  switch (n) {
    case 1: return ['full_a'];
    case 2: return ['full_a', 'full_b'];
    case 3: return ['full_a', 'full_b', 'full_a'];
    case 4: return ['upper', 'lower', 'upper', 'lower'];
    case 5: return ['upper', 'lower', 'push', 'pull', 'legs'];
    case 6: return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
    default: return ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'recovery'];
  }
}

function maxLevel(p: Person): Level {
  if (p.minor) return 'intermediate';
  if (p.activity_level === 'very' || p.activity_level === 'athlete') return 'advanced';
  if (p.activity_level === 'sedentary') return 'beginner';
  return 'intermediate';
}

function dose(e: Exercise, p: Person, delta: number): { sets: number; reps: number; rest: number } {
  if (e.unit !== 'reps') return { sets: Math.min(6, Math.max(1, e.sets + delta)), reps: e.reps, rest: e.rest };
  const compound = e.pattern !== 'isolation' && e.pattern !== 'core';
  let [sets, reps, rest] = (() => {
    switch (p.goal) {
      case 'build_muscle': return compound ? [4, 8, 120] : [3, 12, 60];
      case 'lose_fat': return compound ? [3, 12, 75] : [3, 15, 45];
      case 'sports_performance': return compound ? [4, 6, 120] : [3, 10, 60];
      case 'tone_up': return compound ? [3, 10, 90] : [3, 12, 60];
      default: return compound ? [3, 10, 90] : [3, 12, 60];
    }
  })();
  if (e.pattern === 'core' || e.reps > 15) reps = e.reps;
  if (p.minor) {
    reps = Math.max(8, reps);
    sets = Math.min(3, sets);
  }
  sets = Math.min(5, Math.max(2, sets + delta));
  return { sets, reps, rest };
}

function noteFor(e: Exercise, p: Person): string {
  const loaded = e.equipment.some((k) => k === 'dumbbells' || k === 'barbell' || k === 'kettlebell' || k === 'machines');
  if (loaded && e.unit === 'reps') return p.minor ? MINOR_LOAD_NOTE : LOAD_NOTE;
  return e.cue;
}

function toPlanExercise(e: Exercise, p: Person, delta: number, overrides?: Partial<{ sets: number; reps: number; rest: number; note: string }>): PlanExerciseV2 {
  const d = dose(e, p, delta);
  const reps = overrides?.reps ?? d.reps;
  const base = noteFor(e, p);
  // Minors always get the 3-in-reserve note; a model note that names a load
  // ("use 20 kg") is dropped for the standard one.
  const aiNote = overrides?.note && !/\d+\s*(kg|kilo|lb|pound)/i.test(overrides.note) ? overrides.note : '';
  return {
    id: e.id,
    name: e.name,
    muscle: e.muscle,
    sets: overrides?.sets ?? d.sets,
    reps: p.minor && e.unit === 'reps' ? Math.max(8, reps) : reps,
    unit: e.unit,
    rest: overrides?.rest ?? d.rest,
    kg: null,
    note: base === MINOR_LOAD_NOTE ? base : aiNote || base,
    variants: variantsOf(e, p),
  };
}

export function variantsOf(e: Exercise, p: Person): PlanExerciseV2['variants'] {
  const out: PlanExerciseV2['variants'] = {};
  const locs: TrainLocation[] = p.equipment.some((x) => x !== 'other') ? ['home_none', 'home_equipment', 'gym'] : ['home_none', 'gym'];
  for (const loc of locs) {
    const v = variantFor(e, availableEquipment(loc, p.equipment), p.injuryAreas);
    if (v) out[loc] = { id: v.id, name: v.name };
  }
  return out;
}

/** Prefer what the place offers: barbells and machines in a gym, the
    person's own equipment at home, bodyweight last. */
function equipmentScore(e: Exercise, p: Person): number {
  const bodyweight = e.equipment.every((k) => k === 'none');
  if (p.train_location === 'gym') {
    if (e.equipment.some((k) => k === 'barbell' || k === 'machines')) return 3;
    if (e.equipment.some((k) => k === 'dumbbells' || k === 'kettlebell')) return 2;
    return bodyweight ? 0 : 1;
  }
  if (p.train_location === 'home_equipment') return bodyweight ? 0 : 2;
  return 0;
}

function pick(slot: Slot, p: Person, used: Set<string>, weekUsed: Set<string>, variation: number): Exercise | null {
  const base = { available: p.available, injuries: p.injuryAreas, maxLevel: maxLevel(p) };
  let options = exercisesFor({ ...base, muscle: slot.muscle, pattern: slot.pattern });
  if (!options.length) options = exercisesFor({ ...base, muscle: slot.muscle });
  options = options.filter((e) => !used.has(e.id)).sort((a, b) => equipmentScore(b, p) - equipmentScore(a, p));
  if (!options.length) return null;
  const fresh = options.filter((e) => !weekUsed.has(e.id));
  const list = fresh.length > variation ? fresh : options;
  return list[variation % list.length];
}

function minutesFor(ex: PlanExerciseV2[]): number {
  const secs = ex.reduce((a, e) => {
    const work = e.unit === 'reps' ? e.reps * 4 : e.unit === 's' ? e.reps : e.reps / 3;
    return a + e.sets * (work + e.rest);
  }, 0);
  return Math.min(120, Math.max(15, Math.round((secs / 60 + 8) / 5) * 5));
}

function fitMinutes(ex: PlanExerciseV2[], max: number | null): PlanExerciseV2[] {
  if (!max) return ex;
  const out = [...ex];
  while (out.length > 3 && minutesFor(out) > max) out.pop();
  return out;
}

const REST_NOTES = [
  'Easy 20-minute walk, 10 minutes of stretching, in bed by 23:00.',
  'Full rest. Water, protein at every meal, 8 hours of sleep.',
  'Light mobility for hips, shoulders and upper back, about 15 minutes.',
];

function dietRules(p: Person): DietRules {
  return { diet: p.diet_type, allergies: p.allergies, allergiesOther: p.allergies_other, dislikes: p.dislikes, minor: p.minor };
}

/** The complete rules week (no AI). Also the skeleton the AI fills. */
export function rulesWeek(adj: Adjusted, targets: DailyTargets): PlanDayV2[] {
  const p = adj.person;
  const n = p.schedule.filter(Boolean).length;
  const split = splitFor(n);
  const weekUsed = new Set<string>();
  const seen: Record<string, number> = {};
  let k = 0;
  let restCount = 0;
  const rules = dietRules(p);
  return p.schedule.map((training, i) => {
    if (!training) {
      return {
        session: { kind: 'rest', focus: 'Recovery', minutes: 0, note: REST_NOTES[restCount++ % REST_NOTES.length] },
        meals: fitDay(libraryDay(targets.kcal * 0.95, rules, i), targets.kcal * 0.95, kcalFloor(p.gender)),
      };
    }
    const key = split[k++] ?? 'full_a';
    const tpl = T[key];
    const variation = seen[key] ?? 0;
    seen[key] = variation + 1;
    const used = new Set<string>();
    const exercises: PlanExerciseV2[] = [];
    const slots = [...tpl.slots];
    if ((p.goal === 'lose_fat' || p.goal === 'sports_performance') && key !== 'recovery') slots.push({ muscle: 'cardio' });
    for (const slot of slots) {
      const e = pick(slot, p, used, weekUsed, variation);
      if (!e) continue;
      used.add(e.id);
      weekUsed.add(e.id);
      exercises.push(toPlanExercise(e, p, adj.volumeDelta));
    }
    const fitted = fitMinutes(exercises, adj.maxMinutes);
    return {
      session: { kind: 'workout', focus: tpl.focus, minutes: minutesFor(fitted), time: p.training_time, exercises: fitted },
      meals: fitDay(libraryDay(targets.kcal * 1.05, rules, i), targets.kcal * 1.05, kcalFloor(p.gender)),
    };
  });
}

// ───────────────────────────── AI fill ─────────────────────────────

function allowedList(p: Person): string {
  const list = exercisesFor({ available: p.available, injuries: p.injuryAreas, maxLevel: maxLevel(p) });
  const byMuscle = new Map<string, string[]>();
  for (const e of list) byMuscle.set(e.muscle, [...(byMuscle.get(e.muscle) ?? []), `${e.id} (${e.name})`]);
  return [...byMuscle.entries()].map(([m, xs]) => `${m}: ${xs.join(', ')}`).join('\n');
}

function systemPrompt(p: Person): string {
  return [
    'You are BUILT\'s planning engine: a certified strength and conditioning coach and a registered sports dietitian.',
    'You fill in a weekly plan whose training days, rest days and calorie targets are already fixed. Never change which days are rest days.',
    SAFETY_RULES,
    p.minor ? MINOR_RULES : '',
    'Exercises: use ONLY ids from the ALLOWED EXERCISES list (they already fit the person\'s equipment and injuries). 4 to 7 exercises per workout, sensible sets and reps for the goal. Never prescribe absolute loads.',
    'Meals: Breakfast, Lunch, Dinner and Snack every day. Everyday food the person can get in Lebanon is welcome (labneh, foul, hummus, shish taouk, mujadara, fattoush, grilled fish, rice, bulgur, fruit). Respect diet, allergies and dislikes strictly. Each meal has kcal, protein, carbs and fat (grams) that agree with each other (4/4/9). Each day adds up to the day\'s kcal target. Vary meals across the week.',
    'Answer with ONLY valid JSON, no markdown:',
    '{"summary":"2 sentences: the approach and why it suits them","why":"1 sentence: what changed from the previous plan and why (empty if first plan)","days":[{"focus":"Upper body","exercises":[{"id":"db_row","sets":3,"reps":10,"rest":90,"note":"short cue"}],"note":"rest-day note if rest","meals":[{"slot":"Breakfast","label":"...","kcal":450,"protein":30,"carbs":45,"fat":15}]}]}',
    'The days array has exactly 7 entries, Monday first. Rest days have "exercises":[].',
  ].filter(Boolean).join(' ');
}

function userPrompt(ctx: PlanContext, adj: Adjusted, targets: DailyTargets, skeleton: PlanDayV2[], previous: PlanV2 | null): string {
  const p = adj.person;
  const days = skeleton.map((d, i) => {
    const name = WEEKDAY_NAMES[weekdayOfPlanIndex(i)];
    if (d.session.kind === 'rest') return `${name}: REST (meals about ${Math.round(targets.kcal * 0.95)} kcal)`;
    return `${name}: ${d.session.focus} workout, about ${d.session.minutes} min, at ${p.training_time} (suggested: ${d.session.exercises.map((e) => e.id).join(', ')}; meals about ${Math.round(targets.kcal * 1.05)} kcal)`;
  });
  const a = ctx.analysis;
  return [
    `PERSON: ${describePerson(p)}`,
    `TARGETS: ${targets.kcal} kcal a day on average, protein ${targets.protein_g} g, carbs ${targets.carbs_g} g, fat ${targets.fat_g} g. ${targets.reason}`,
    a ? `PHOTO ESTIMATE (rough): body fat ${a.body_fat_range[0]} to ${a.body_fat_range[1]}%, build ${a.build}. Focus: ${a.training_focus.join('; ')}. Posture: ${a.posture_notes.join('; ') || 'nothing notable'}.` : '',
    memoryForPrompt(ctx.memory),
    ctx.extra ? `RECENT: ${ctx.extra}` : '',
    previous ? `PREVIOUS PLAN: ${previous.days.map((d, i) => `${WEEKDAY_NAMES[weekdayOfPlanIndex(i)].slice(0, 3)} ${d.session.kind === 'rest' ? 'rest' : d.session.focus}`).join(', ')}; ${previous.kcal_target} kcal.` : 'This is their first plan.',
    ctx.instruction ? `CHANGE REQUEST FROM THE USER: "${ctx.instruction}". Already applied in code: ${adj.notes.join(' ') || 'nothing automatic'}. Honour the rest of the request where it is safe.` : '',
    `WEEK (fixed):\n${days.join('\n')}`,
    `ALLOWED EXERCISES (id (name)):\n${allowedList(p)}`,
  ].filter(Boolean).join('\n\n');
}

export type AiFill = { summary: string; why: string; days: Record<string, unknown>[] };

function parseFill(text: string): AiFill | null {
  const j = extractJson(text);
  if (!j || !Array.isArray(j.days) || j.days.length !== 7) return null;
  return { summary: str(j.summary, 400), why: str(j.why, 300), days: j.days.map((d) => (d && typeof d === 'object' ? (d as Record<string, unknown>) : {})) };
}

export function mergeFill(skeleton: PlanDayV2[], fill: AiFill, adj: Adjusted, targets: DailyTargets): PlanDayV2[] {
  const p = adj.person;
  const rules = dietRules(p);
  const floor = kcalFloor(p.gender);
  return skeleton.map((day, i) => {
    const raw = fill.days[i] ?? {};
    const dayKcal = day.session.kind === 'rest' ? targets.kcal * 0.95 : targets.kcal * 1.05;

    // meals: clean, check against diet and allergies, fill gaps, fit kcal
    const rawMeals = Array.isArray(raw.meals) ? raw.meals.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
    const meals: PlanMeal[] = [];
    for (const slot of MEAL_SLOTS) {
      const r = rawMeals.find((x) => x.slot === slot);
      const cleaned = r ? cleanMeal(r, slot) : null;
      if (cleaned && !violates(cleaned.label, rules) && !(cleaned.items ?? []).some((it) => violates(it, rules))) {
        meals.push(cleaned);
      } else {
        const fallback = day.meals.find((x) => x.slot === slot);
        if (fallback) meals.push(fallback);
      }
    }
    const fittedMeals = fitDay(meals, dayKcal, floor);

    if (day.session.kind === 'rest') {
      return { session: { ...day.session, note: str(raw.note, 200, day.session.note) }, meals: fittedMeals };
    }

    // exercises: only library ids that fit; keep the skeleton when too few
    const rawEx = Array.isArray(raw.exercises) ? raw.exercises.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
    const used = new Set<string>();
    const exercises: PlanExerciseV2[] = [];
    for (const r of rawEx.slice(0, 8)) {
      const e = findExercise(str(r.id, 60)) ?? findExercise(str(r.name, 60));
      if (!e || used.has(e.id) || !fitsEquipment(e, p.available) || !safeFor(e, p.injuryAreas)) continue;
      if (p.minor && e.level === 'advanced') continue;
      used.add(e.id);
      const unitMax = e.unit === 'reps' ? 30 : 1200;
      exercises.push(
        toPlanExercise(e, p, adj.volumeDelta, {
          sets: clampInt(r.sets, 1, 6, dose(e, p, adj.volumeDelta).sets),
          reps: clampInt(r.reps, p.minor && e.unit === 'reps' ? 8 : 1, unitMax, e.reps),
          rest: clampInt(r.rest, 30, 180, e.rest),
          note: str(r.note, 160),
        }),
      );
    }
    const finalEx = exercises.length >= 3 ? fitMinutes(exercises, adj.maxMinutes) : day.session.exercises;
    return {
      session: {
        kind: 'workout',
        focus: str(raw.focus, 60, day.session.focus),
        minutes: minutesFor(finalEx),
        time: p.training_time,
        exercises: finalEx,
      },
      meals: fittedMeals,
    };
  });
}

// ───────────────────────────── diff ─────────────────────────────

/** Read any stored plan (v1 or v2) loosely, for diffing. */
export function asPlanV2(plan: unknown): PlanV2 | null {
  const p = plan as Partial<PlanV2> | null;
  if (!p || !Array.isArray(p.days) || p.days.length !== 7) return null;
  return p as PlanV2;
}

function dayList(days: PlanDayV2[]): string {
  const names = days.map((d, i) => (d.session.kind === 'workout' ? WEEKDAY_NAMES[weekdayOfPlanIndex(i)].slice(0, 3) : '')).filter(Boolean);
  return names.length ? names.join(', ') : 'none';
}

function n(v: number): string {
  return v.toLocaleString('en-US');
}

export function describeChanges(previous: PlanV2 | null, next: PlanV2, notes: string[], why: string): string {
  if (!previous) return [why, ...notes].filter(Boolean).join(' ') || 'Your first plan, built from your answers.';
  const out: string[] = [];
  const before = dayList(previous.days);
  const after = dayList(next.days);
  if (before !== after) out.push(`Training days: ${after} (was ${before}).`);
  if (previous.kcal_target && previous.kcal_target !== next.kcal_target) out.push(`Daily calories: ${n(next.kcal_target)} kcal (was ${n(previous.kcal_target)}).`);
  if (previous.location && previous.location !== next.location) {
    out.push(next.location === 'gym' ? 'Workouts are set up for the gym.' : next.location === 'home_equipment' ? 'Workouts use your home equipment.' : 'Workouts need no equipment.');
  }
  const names = (p: PlanV2) => new Set(p.days.flatMap((d) => (d.session.kind === 'workout' ? d.session.exercises.map((e) => e.name) : [])));
  const a = names(previous);
  const b = names(next);
  const added = [...b].filter((x) => !a.has(x));
  const dropped = [...a].filter((x) => !b.has(x));
  if (added.length && dropped.length) out.push(`New exercises: ${added.slice(0, 4).join(', ')}${added.length > 4 ? ' and more' : ''}. Dropped: ${dropped.slice(0, 4).join(', ')}${dropped.length > 4 ? ' and more' : ''}.`);
  else if (added.length) out.push(`Added: ${added.slice(0, 4).join(', ')}.`);
  return [...notes, why, ...out].filter(Boolean).join(' ') || 'Same structure, fresh meals and exercise order.';
}

// ───────────────────────────── build ─────────────────────────────

export async function buildPlan(ctx: PlanContext): Promise<{ plan: PlanV2; changes: string; model: string; notes: string[] }> {
  const adj = applyInstruction(ctx.person, ctx.instruction);
  const p = adj.person;
  const baseTargets = dailyTargets({
    weightKg: p.weight_kg,
    heightCm: p.height_cm,
    age: p.ageYears,
    gender: p.gender,
    activityLevel: p.activity_level,
    jobActivity: p.job_activity,
    goal: p.goal,
    targetKg: p.target_weight_kg,
    months: p.timeline_months,
  });
  const targets = applyKcalDelta(baseTargets, ctx.kcalDelta ?? 0, p);
  const pace = p.weight_kg && p.timeline_months
    ? paceCheck({ currentKg: p.weight_kg, targetKg: p.target_weight_kg, months: p.timeline_months, age: p.ageYears })
    : null;
  const previous = asPlanV2(ctx.previous);
  const skeleton = rulesWeek(adj, targets);

  let days = skeleton;
  let source: PlanV2['source'] = 'rules';
  let model = 'rules';
  let summary = '';
  let why = '';
  const ai = await aiProvider('text');
  if (ai) {
    const answer = await chat(
      ai,
      {
        messages: [
          { role: 'system', content: systemPrompt(p) },
          { role: 'user', content: userPrompt(ctx, adj, targets, skeleton, previous) },
        ],
        max_tokens: 6000,
        temperature: 0.6,
        timeoutMs: 75_000,
      },
      parseFill,
      'planner',
    );
    if (answer) {
      days = mergeFill(skeleton, answer.value, adj, targets);
      source = 'ai';
      model = answer.model;
      summary = answer.value.summary;
      why = answer.value.why;
    }
  }

  const trainingCount = p.schedule.filter(Boolean).length;
  const where = p.train_location === 'gym' ? 'in the gym' : p.train_location === 'home_equipment' ? 'at home with your equipment' : 'at home, no equipment needed';
  if (!summary) {
    summary = `${trainingCount} training day${trainingCount === 1 ? '' : 's'} a week ${where}, about ${n(targets.kcal)} kcal a day with ${targets.protein_g} g of protein. ${targets.reason}`;
  }

  const plan: PlanV2 = {
    version: 2,
    generated_at: new Date().toISOString(),
    source,
    model,
    days,
    kcal_target: targets.kcal,
    water_target: targets.water_glasses,
    macros: { protein_g: targets.protein_g, carbs_g: targets.carbs_g, fat_g: targets.fat_g },
    location: p.train_location ?? 'home_none',
    equipment: p.available,
    training_days: p.schedule.map((on, i) => (on ? weekdayOfPlanIndex(i) : -1)).filter((d) => d >= 0),
    training_time: p.training_time,
    pace,
    minor: p.minor,
    summary: str(summary, 400),
    changes: '',
    instruction: ctx.instruction,
  };
  plan.changes = str(describeChanges(previous, plan, adj.notes, why), 800);
  return { plan, changes: plan.changes, model, notes: adj.notes };
}

// ───────────────────────────── meal swaps (rules) ─────────────────────────────

/** Up to 3 library meals for the same slot with similar kcal and protein. */
export function rulesSwaps(meal: PlanMeal, p: Person): PlanMeal[] {
  const rules = dietRules(p);
  return libraryOptions(meal.slot, rules, [meal.label])
    .map((x) => scaleMeal(x, meal.kcal))
    .sort((a, b) => Math.abs(a.protein - meal.protein) - Math.abs(b.protein - meal.protein))
    .slice(0, 3);
}

export function dietRulesOf(p: Person): DietRules {
  return dietRules(p);
}

export { alternativesFor, trainingSchedule };
export type { InjuryArea, MealSlot };
