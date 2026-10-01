/* Plan week model. Sessions and meals come from the active AI plan (see
   aiPlan.ts) or, when there is none yet, from the built-in rules week below.
   Completion state (the `done` rows) comes from the database via the plan
   store. A fresh week starts with everything unchecked.

   Pure module: no React, no native imports, so it runs in unit tests. */

import { addDays, isoDay, mondayIndex, weekStartDate } from './lib/dates';
import type { Allergy, DietType, MealSlot as SlotV2, PlanDayV2, PlanExerciseV2, PlanMealV2, PlanRestV2, PlanV2, PlanWorkoutV2 } from './types';
import { availableEquipment, type Equipment, findExercise, type InjuryArea, injuriesFromText, INJURY_AREAS, variantFor } from './data/exercises';
import type { TrainLocation } from './data/exercises';

export { isoDay } from './lib/dates';

export const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/** Shown instead of a fixed load: the right weight depends on the person. */
export const LOAD_NOTE = 'Choose a weight you can lift for every rep with 2 in reserve.';

export type PlanExercise = {
  name: string;
  sets: number;
  reps: number;
  /** Suggested load. Absent when the lifter should pick their own (see note). */
  kg?: number;
  unit?: 'reps' | 's' | 'm';
  rest?: number; // seconds of rest after each set
  /** Coaching note for this exercise, e.g. how to choose the load. */
  note?: string;
};

export const DEFAULT_REST = 90;

export function restFor(e: { rest?: number }): number {
  return e.rest ?? DEFAULT_REST;
}

export type PlanWorkout = {
  kind: 'workout';
  focus: string;
  minutes: number;
  exercises: PlanExercise[];
};

export type PlanRest = {
  kind: 'rest';
  focus: 'Recovery';
  minutes: number;
  note: string;
};

export type PlanSession = PlanWorkout | PlanRest;
export type SessionKind = PlanSession['kind'];

/** Which weekdays are training days, Monday first (7 entries). */
export type WeekSchedule = readonly SessionKind[];

export type PlanMeal = {
  slot: MealSlot;
  label: string;
  kcal: number;
  protein: number;
};

export type PlanDayDone = {
  workout: boolean;
  exercises: number[][]; // per exercise index: list of completed set indices
  meals: string[]; // completed meal slots
};

/** One saved day of completion state, keyed by day id in a DoneMap. */
export type DoneRow = PlanDayDone;
export type DoneMap = Record<string, DoneRow>;

export const EMPTY_DONE: DoneRow = Object.freeze({ workout: false, exercises: [], meals: [] }) as DoneRow;

export type PlanDay = {
  id: string; // yyyy-mm-dd
  index: number; // 0 = Monday
  session: PlanSession;
  meals: PlanMeal[];
  done: PlanDayDone;
};

const lift = (name: string, sets: number, reps: number, rest?: number): PlanExercise => ({
  name,
  sets,
  reps,
  note: LOAD_NOTE,
  ...(rest != null ? { rest } : {}),
});

const SESSIONS: PlanSession[] = [
  {
    kind: 'workout',
    focus: 'Upper body · Strength',
    minutes: 45,
    exercises: [
      lift('Incline dumbbell press', 4, 10),
      lift('Seated row', 4, 12),
      lift('Lateral raise', 3, 15),
      lift('Cable triceps push-down', 3, 12),
    ],
  },
  {
    kind: 'workout',
    focus: 'Lower body · Strength',
    minutes: 50,
    exercises: [
      lift('Back squat', 4, 8),
      lift('Romanian deadlift', 3, 10),
      lift('Walking lunge', 3, 12),
      lift('Standing calf raise', 3, 15),
    ],
  },
  {
    kind: 'rest',
    focus: 'Recovery',
    minutes: 0,
    note: 'Easy 20-minute walk, 10 minutes of stretching, in bed by 23:00.',
  },
  {
    kind: 'workout',
    focus: 'Full body · Conditioning',
    minutes: 40,
    exercises: [
      lift('Kettlebell swing', 4, 15),
      { name: 'Rowing intervals', sets: 5, reps: 250, unit: 'm', rest: 60 },
      { name: 'Push-up ladder', sets: 3, reps: 12 },
      { name: 'Plank', sets: 3, reps: 45, unit: 's', rest: 45 },
    ],
  },
  {
    kind: 'workout',
    focus: 'Upper body · Hypertrophy',
    minutes: 45,
    exercises: [
      lift('Bench press', 4, 10),
      lift('Lat pulldown', 4, 12),
      lift('Arnold press', 3, 12),
      lift('Face pull', 3, 15),
    ],
  },
  { kind: 'rest', focus: 'Recovery', minutes: 0, note: 'Full rest day. Hydrate, sleep 8 hours, no screens after 22:30.' },
  {
    kind: 'workout',
    focus: 'Lower body · Strength',
    minutes: 50,
    exercises: [
      lift('Deadlift', 4, 6),
      lift('Leg press', 4, 10),
      lift('Leg curl', 3, 12),
      lift('Standing calf raise', 3, 15),
    ],
  },
];

/** Training days of the built-in rules week. */
export const RULES_SCHEDULE: WeekSchedule = SESSIONS.map((s) => s.kind);

const TRAINING_MEALS: PlanMeal[] = [
  { slot: 'Breakfast', label: 'Greek yogurt bowl, berries, oats', kcal: 430, protein: 38 },
  { slot: 'Lunch', label: 'Grilled chicken bowl', kcal: 612, protein: 48 },
  { slot: 'Dinner', label: 'Salmon, sweet potato, salad', kcal: 590, protein: 42 },
  { slot: 'Snack', label: 'Whey shake + banana', kcal: 260, protein: 24 },
];

const REST_MEALS: PlanMeal[] = [
  { slot: 'Breakfast', label: 'Eggs on rye, avocado', kcal: 380, protein: 24 },
  { slot: 'Lunch', label: 'Tuna wrap, mixed greens', kcal: 520, protein: 40 },
  { slot: 'Dinner', label: 'Turkey chili, rice', kcal: 560, protein: 44 },
  { slot: 'Snack', label: 'Cottage cheese + apple', kcal: 220, protein: 18 },
];

export function exerciseLabel(e: { sets: number; reps: number; unit?: 'reps' | 's' | 'm'; kg?: number | null }): string {
  const rep = e.unit === 's' ? `${e.reps}s` : e.unit === 'm' ? `${e.reps}m` : `${e.reps}`;
  return `${e.sets} × ${rep}${e.kg != null ? ` · ${e.kg} kg` : ''}`;
}

export function todayIndexInWeek(today = new Date()): number {
  return mondayIndex(today);
}

/** The Mon..Sun week containing `today`, from the rules plan, unchecked. */
export function buildWeek(today = new Date()): PlanDay[] {
  const start = isoDay(weekStartDate(today));
  return SESSIONS.map((session, i) => ({
    id: addDays(start, i),
    index: i,
    session,
    meals: session.kind === 'workout' ? TRAINING_MEALS : REST_MEALS,
    done: { workout: false, exercises: [], meals: [] },
  }));
}

/** Overlay saved completion rows onto a week. */
export function withDone(days: PlanDay[], done: DoneMap): PlanDay[] {
  return days.map((d) => ({ ...d, done: done[d.id] ?? EMPTY_DONE }));
}

export function scheduleOf(days: readonly { session: { kind: SessionKind } }[]): WeekSchedule {
  return days.map((d) => d.session.kind);
}

// ─────────────────────────── stored AI plan ───────────────────────────

export type StoredPlan = {
  days: {
    session:
      | { kind: 'workout'; focus: string; minutes: number; exercises: (Partial<Omit<PlanExercise, 'kg'>> & { kg?: number | null })[] }
      | { kind: 'rest'; focus: string; minutes: number; note: string };
    meals: PlanMeal[];
  }[];
  kcal_target: number;
  water_target: number;
};

export function isStoredPlan(p: unknown): p is StoredPlan {
  return !!p && Array.isArray((p as StoredPlan).days) && (p as StoredPlan).days.length === 7;
}

/** Map a stored plan (a generic Mon..Sun week) onto a calendar week. */
export function applyPlanToWeek(plan: StoredPlan, base: PlanDay[]): PlanDay[] {
  return base.map((day, i) => {
    const src = plan.days[i];
    if (!src?.session) return day;
    const session: PlanSession =
      src.session.kind === 'rest'
        ? {
            kind: 'rest',
            focus: 'Recovery',
            minutes: 0,
            note: src.session.note ?? 'Easy walk, stretching, early night.',
          }
        : {
            kind: 'workout',
            focus: String(src.session.focus ?? 'Training'),
            minutes: src.session.minutes ?? 45,
            exercises: (src.session.exercises ?? []).map((e) => {
              const kg = e.kg != null && Number.isFinite(Number(e.kg)) ? Number(e.kg) : undefined;
              return {
                name: String(e.name ?? 'Exercise'),
                sets: Math.max(1, Math.round(Number(e.sets) || 3)),
                reps: Math.max(1, Math.round(Number(e.reps) || 10)),
                kg,
                unit: e.unit ?? 'reps',
                rest: e.rest,
                note: typeof e.note === 'string' && e.note ? e.note : undefined,
              };
            }),
          };
    const meals: PlanMeal[] = Array.isArray(src.meals)
      ? src.meals.map((m, mi) => ({
          slot: (MEAL_SLOTS as readonly string[]).includes(m.slot) ? m.slot : MEAL_SLOTS[mi] ?? 'Snack',
          label: String(m.label ?? 'Meal'),
          kcal: Math.round(Number(m.kcal) || 0),
          protein: Math.round(Number(m.protein) || 0),
        }))
      : day.meals;
    return { ...day, session, meals };
  });
}

/** The week the app shows: rules or AI sessions, plus saved completion. */
export function composeWeek(today: Date, plan: StoredPlan | null, done: DoneMap): PlanDay[] {
  const base = buildWeek(today);
  return withDone(plan ? applyPlanToWeek(plan, base) : base, done);
}

// ─────────────────────────── regenerate ───────────────────────────

/** Which saved days a newly generated plan invalidates. Old checkmarks
    don't map onto new exercises, so future days are cleared, and today is
    cleared unless its workout is already finished. Past days are history
    and are never touched, so the streak survives a new plan. */
export function daysToClearOnRegenerate(done: DoneMap, today: string): string[] {
  return Object.keys(done).filter((id) => id > today || (id === today && !done[id]?.workout));
}

// ═══════════════════════════════ v2 week ═══════════════════════════════
// The app renders the week through api/plan weekView(); these pure helpers
// turn that view into the days the screens show, build the starter plan
// (used until the person has an AI plan, and always without an account),
// and hold the everyday meal library for starter meals and offline swaps.


/** A plan meal as shown on a day, possibly swapped for this day only. */
export type DayMeal = PlanMealV2 & { swapped?: boolean };

/** One calendar day of the week as every screen shows it. */
export type WeekDay = {
  /** yyyy-mm-dd */
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  index: number;
  /** Which plan day is shown here (moves and swaps key on it). */
  planIndex: number;
  /** True when this weekday shows a different plan day than usual. */
  moved: boolean;
  session: PlanWorkoutV2 | PlanRestV2;
  meals: DayMeal[];
  done: DoneRow;
};

/** Structural copy of api/plan's WeekDayView (kept here so this module stays pure). */
export type WeekViewEntry = { id: string; weekday: number; planIndex: number; moved: boolean; day: PlanDayV2 };

/** Meal swaps for this week, by day id then slot. */
export type MealSwaps = Record<string, Partial<Record<SlotV2, PlanMealV2>>>;

export function composeWeekV2(view: readonly WeekViewEntry[], done: DoneMap, swaps: MealSwaps = {}): WeekDay[] {
  return view.map((v) => ({
    id: v.id,
    index: v.weekday,
    planIndex: v.planIndex,
    moved: v.moved,
    session: v.day.session,
    meals: v.day.meals.map((m) => {
      const s = swaps[v.id]?.[m.slot];
      return s ? { ...s, slot: m.slot, swapped: true } : m;
    }),
    done: done[v.id] ?? EMPTY_DONE,
  }));
}

/** Sets done and planned on a day. */
export function setsOf(day: { session: { kind: string; exercises?: { sets: number }[] }; done: DoneRow }): { done: number; total: number } {
  if (day.session.kind !== 'workout' || !day.session.exercises) return { done: 0, total: 0 };
  const ex = day.session.exercises;
  return {
    total: ex.reduce((a, e) => a + e.sets, 0),
    done: ex.reduce((a, e, i) => a + Math.min(e.sets, (day.done.exercises[i] ?? []).filter((x) => x < e.sets).length), 0),
  };
}

/** "3 × 10", "3 × 40s", "5 × 250m". */
export function setsLabel(e: { sets: number; reps: number; unit?: 'reps' | 's' | 'm' }): string {
  const rep = e.unit === 's' ? `${e.reps}s` : e.unit === 'm' ? `${e.reps}m` : `${e.reps}`;
  return `${e.sets} × ${rep}`;
}

export const LOCATION_LABEL: Record<TrainLocation, string> = {
  home_none: 'Home',
  home_equipment: 'Home + kit',
  gym: 'Gym',
};

/** Where this person can train: home always, home with kit when they own
    some, and the gym. */
export function locationsFor(equipment: readonly string[] | null | undefined): TrainLocation[] {
  const own = (equipment ?? []).some((e) => e !== 'other' && e !== 'none');
  return own ? ['home_none', 'home_equipment', 'gym'] : ['home_none', 'gym'];
}

// ─────────────────────────── meal library ───────────────────────────

type Tag = 'meat' | 'poultry' | 'fish' | 'dairy' | 'eggs' | 'gluten' | 'nuts' | 'peanuts' | 'sesame' | 'soy' | 'shellfish';

export type LibraryMeal = { slot: SlotV2; label: string; kcal: number; protein: number; carbs: number; fat: number; items: string[]; tags: Tag[] };

const m = (slot: SlotV2, label: string, kcal: number, protein: number, carbs: number, fat: number, items: string[], tags: Tag[]): LibraryMeal => ({
  slot, label, kcal, protein, carbs, fat, items, tags,
});

/** Everyday Lebanese meals with full macros (per standard serving). */
export const MEAL_LIBRARY: readonly LibraryMeal[] = [
  m('Breakfast', 'Labneh, two eggs, cucumber, tomato and pita', 510, 30, 44, 22, ['3 tbsp labneh', '2 eggs', '1 small whole-wheat pita', 'Cucumber and tomato'], ['dairy', 'eggs', 'gluten']),
  m('Breakfast', 'Foul with olive oil, lemon and vegetables', 470, 22, 62, 14, ['1 cup foul mudammas', '1 tbsp olive oil', '1 small pita', 'Mint, tomato, radish'], ['gluten']),
  m('Breakfast', 'Oats with Greek yogurt, banana and walnuts', 480, 28, 62, 13, ['50 g oats', '150 g Greek yogurt', '1 banana', '10 g walnuts'], ['dairy', 'nuts', 'gluten']),
  m('Breakfast', 'Half a zaatar manousheh with eggs and vegetables', 520, 24, 50, 24, ['Half a zaatar manousheh', '2 eggs', 'Cucumber, tomato, mint'], ['gluten', 'eggs', 'sesame']),
  m('Breakfast', 'Tofu scramble with tomato, pepper and pita', 430, 26, 40, 18, ['150 g firm tofu', 'Tomato and pepper', '1 small pita'], ['soy', 'gluten']),
  m('Breakfast', 'Eggs with sauteed vegetables and potatoes', 450, 24, 40, 21, ['3 eggs', '150 g potatoes', 'Peppers and onion'], ['eggs']),
  m('Lunch', 'Chicken shawarma plate with rice and fattoush', 680, 48, 70, 21, ['150 g chicken shawarma', '1 cup rice', 'Fattoush with a few pita chips'], ['poultry', 'gluten']),
  m('Lunch', 'Mujaddara with yogurt and salad', 620, 26, 92, 15, ['1.5 cups mujaddara', '150 g yogurt', 'Green salad'], ['dairy']),
  m('Lunch', 'Chicken taouk with batata harra and salad', 650, 46, 58, 24, ['150 g chicken taouk', '150 g batata harra', 'Garlic sauce, light', 'Salad'], ['poultry']),
  m('Lunch', 'Lentil soup and a chicken taouk wrap', 580, 42, 64, 15, ['1 bowl shorbet adas', '1 taouk wrap'], ['poultry', 'gluten']),
  m('Lunch', 'Grilled halloumi, chickpea and quinoa salad', 600, 28, 58, 28, ['60 g halloumi', '1 cup chickpeas', '1 cup quinoa', 'Vegetables'], ['dairy']),
  m('Lunch', 'Green bean stew with rice', 560, 20, 88, 13, ['1.5 cups loubieh bi zeit', '1 cup rice', 'Lemon and onion'], []),
  m('Dinner', 'Grilled fish, freekeh and tabbouleh', 600, 44, 58, 20, ['150 g grilled fish', '1 cup freekeh', 'Tabbouleh'], ['fish', 'gluten']),
  m('Dinner', 'Kafta with grilled vegetables and hummus', 580, 40, 32, 31, ['150 g kafta', 'Grilled vegetables', '3 tbsp hummus'], ['meat', 'sesame']),
  m('Dinner', 'Chicken and vegetable stew with rice', 590, 44, 66, 15, ['150 g chicken', 'Vegetable stew', '1 cup rice'], ['poultry']),
  m('Dinner', 'Stuffed zucchini with rice and lentils', 520, 20, 80, 13, ['4 small kousa', 'Rice and lentil filling', 'Tomato sauce'], []),
  m('Dinner', 'Salmon with roasted potatoes and salad', 620, 40, 50, 28, ['150 g salmon', '200 g potatoes', 'Green salad'], ['fish']),
  m('Dinner', 'Beef and green bean stew with rice', 610, 40, 62, 21, ['120 g lean beef', 'Green beans in tomato', '1 cup rice'], ['meat']),
  m('Snack', 'Greek yogurt with honey and almonds', 280, 20, 26, 11, ['170 g Greek yogurt', '1 tsp honey', '10 almonds'], ['dairy', 'nuts']),
  m('Snack', 'Cottage cheese with an apple', 220, 18, 24, 5, ['150 g cottage cheese', '1 apple'], ['dairy']),
  m('Snack', 'Hummus with carrots and cucumber', 240, 9, 26, 12, ['4 tbsp hummus', 'Carrot and cucumber sticks'], ['sesame']),
  m('Snack', 'Two boiled eggs and a piece of fruit', 230, 13, 20, 10, ['2 eggs', '1 orange or apple'], ['eggs']),
  m('Snack', 'Dates and a handful of mixed nuts', 260, 6, 30, 14, ['3 dates', '20 g mixed nuts'], ['nuts']),
  m('Snack', 'Roasted chickpeas and an orange', 230, 10, 38, 5, ['40 g roasted chickpeas', '1 orange'], []),
];

const DIET_EXCLUDES: Record<DietType, Tag[]> = {
  none: [],
  halal: [],
  vegetarian: ['meat', 'poultry', 'fish', 'shellfish'],
  vegan: ['meat', 'poultry', 'fish', 'shellfish', 'dairy', 'eggs'],
  pescatarian: ['meat', 'poultry'],
  lactose_free: ['dairy'],
  gluten_free: ['gluten'],
};

const ALLERGY_TAG: Partial<Record<Allergy, Tag>> = {
  nuts: 'nuts', peanuts: 'peanuts', dairy: 'dairy', eggs: 'eggs', gluten: 'gluten', shellfish: 'shellfish', fish: 'fish', soy: 'soy', sesame: 'sesame',
};

export type DietPrefs = { diet_type?: DietType | null; allergies?: readonly Allergy[] | null; dislikes?: string | null };

/** True when a library meal fits the diet, allergies and dislikes. */
export function mealFits(meal: LibraryMeal, prefs: DietPrefs): boolean {
  const banned = new Set<Tag>(DIET_EXCLUDES[prefs.diet_type ?? 'none'] ?? []);
  for (const a of prefs.allergies ?? []) {
    const t = ALLERGY_TAG[a];
    if (t) banned.add(t);
  }
  if (meal.tags.some((t) => banned.has(t))) return false;
  const words = (prefs.dislikes ?? '')
    .toLowerCase()
    .split(/[,;\n]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
  const text = `${meal.label} ${meal.items.join(' ')}`.toLowerCase();
  return !words.some((w) => text.includes(w));
}

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/** A library meal scaled to a portion (1 = as written). */
export function scaledMeal(meal: LibraryMeal, portion: number): PlanMealV2 {
  const p = Math.round(portion * 20) / 20;
  return {
    slot: meal.slot,
    label: meal.label,
    kcal: round5(meal.kcal * p),
    protein: Math.round(meal.protein * p),
    carbs: Math.round(meal.carbs * p),
    fat: Math.round(meal.fat * p),
    items: meal.items,
    portion: p,
  };
}

/** Up to `count` alternatives for a meal from the library, for when the AI
    swap isn't available (no account, offline). Same slot, fits the diet,
    scaled to similar calories, at least about as much protein. */
export function localMealSwaps(meal: Pick<PlanMealV2, 'slot' | 'label' | 'kcal' | 'protein'>, prefs: DietPrefs, count = 3): PlanMealV2[] {
  const out: { meal: PlanMealV2; score: number }[] = [];
  for (const cand of MEAL_LIBRARY) {
    if (cand.slot !== meal.slot || cand.label === meal.label || !mealFits(cand, prefs)) continue;
    const portion = Math.min(1.5, Math.max(0.6, meal.kcal > 0 ? meal.kcal / cand.kcal : 1));
    const scaled = scaledMeal(cand, portion);
    if (Math.abs(scaled.kcal - meal.kcal) > Math.max(60, meal.kcal * 0.12)) continue;
    const score = Math.min(0, scaled.protein - meal.protein) * 3 - Math.abs(scaled.kcal - meal.kcal) / 10;
    out.push({ meal: scaled, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count).map((x) => x.meal);
}

// ─────────────────────────── starter plan ───────────────────────────

const TEMPLATES: { focus: string; minutes: number; exercises: [string, number, number][] }[] = [
  { focus: 'Upper body · Strength', minutes: 45, exercises: [['incline_db_press', 4, 10], ['seated_cable_row', 4, 12], ['lateral_raise', 3, 15], ['cable_pushdown', 3, 12]] },
  { focus: 'Lower body · Strength', minutes: 50, exercises: [['back_squat', 4, 8], ['barbell_rdl', 3, 10], ['walking_lunge', 3, 12], ['calf_raise', 3, 15]] },
  { focus: 'Full body · Conditioning', minutes: 40, exercises: [['kb_swing', 4, 15], ['rowing_intervals', 5, 250], ['push_up', 3, 12], ['plank', 3, 40]] },
  { focus: 'Upper body · Volume', minutes: 45, exercises: [['barbell_bench', 4, 10], ['lat_pulldown', 4, 12], ['arnold_press', 3, 12], ['cable_face_pull', 3, 15]] },
  { focus: 'Lower body · Power', minutes: 50, exercises: [['deadlift', 4, 6], ['leg_press', 4, 10], ['leg_curl', 3, 12], ['calf_raise', 3, 15]] },
];

const LOADED: Equipment[] = ['dumbbells', 'barbell', 'kettlebell', 'machines'];

export type StarterInput = {
  training_days?: readonly number[] | null;
  train_location?: TrainLocation | null;
  equipment?: readonly string[] | null;
  injury_areas?: readonly string[] | null;
  injuries?: string | null;
  kcal_target?: number | null;
  water_target?: number | null;
  macros?: { protein_g: number; carbs_g: number; fat_g: number } | null;
  training_time?: string | null;
  minor?: boolean;
} & DietPrefs;

function starterExercise(id: string, sets: number, reps: number, location: TrainLocation, equipment: readonly string[], injuries: InjuryArea[], minor: boolean): PlanExerciseV2 | null {
  const base = findExercise(id);
  if (!base) return null;
  const variants: PlanExerciseV2['variants'] = {};
  for (const loc of ['home_none', 'home_equipment', 'gym'] as TrainLocation[]) {
    if (loc === 'home_equipment' && !equipment.some((e) => e !== 'other' && e !== 'none')) continue;
    const v = variantFor(base, availableEquipment(loc, equipment), injuries);
    if (v) variants[loc] = { id: v.id, name: v.name };
  }
  const shown = findExercise(variants[location]?.id ?? '') ?? variantFor(base, availableEquipment(location, equipment), injuries);
  if (!shown) return null;
  const sameUnit = shown.unit === base.unit;
  const r = sameUnit ? reps : shown.reps;
  const loaded = shown.equipment.some((k) => LOADED.includes(k)) && shown.unit === 'reps';
  return {
    id: shown.id,
    name: shown.name,
    muscle: shown.muscle,
    sets,
    reps: minor && shown.unit === 'reps' ? Math.max(8, r) : r,
    unit: shown.unit,
    rest: shown.rest,
    kg: null,
    note: loaded ? (minor ? 'Choose a weight you can lift for every rep with 3 in reserve. Technique first.' : LOAD_NOTE) : shown.cue,
    variants,
  };
}

function starterMeals(dayIndex: number, prefs: DietPrefs, kcalTarget: number): PlanMealV2[] {
  const slots: SlotV2[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
  const picks = slots.map((slot) => {
    const pool = MEAL_LIBRARY.filter((x) => x.slot === slot);
    const fit = pool.filter((x) => mealFits(x, prefs));
    const list = fit.length ? fit : pool;
    return list[dayIndex % list.length];
  });
  const sum = picks.reduce((a, x) => a + x.kcal, 0);
  const portion = Math.min(1.8, Math.max(0.6, kcalTarget > 0 ? kcalTarget / sum : 1));
  return picks.map((x) => scaledMeal(x, portion));
}

/** The week used until the person has an AI plan (and always without an
    account): workouts on their training days (Sunday rest by default),
    exercises for where they train with home and gym variants, injuries
    avoided, and everyday meals that fit their diet, scaled to their
    calorie target. Monday first. */
export function starterPlan(input: StarterInput = {}): PlanV2 {
  const days = (input.training_days?.length ? input.training_days : [1, 2, 3, 4, 5, 6]).filter((d) => d >= 0 && d <= 6);
  const location: TrainLocation = input.train_location ?? 'gym';
  const equipment = input.equipment ?? [];
  const injuries = [
    ...new Set([...(input.injury_areas ?? []).filter((a): a is InjuryArea => (INJURY_AREAS as readonly string[]).includes(a)), ...injuriesFromText(input.injuries)]),
  ];
  const minor = !!input.minor;
  const kcal = input.kcal_target && input.kcal_target > 0 ? input.kcal_target : 2200;
  const time = input.training_time || 'evening';
  let rotation = 0;
  const planDays: PlanDayV2[] = Array.from({ length: 7 }, (_, i) => {
    const weekday = (i + 1) % 7; // 0 = Sunday
    const meals = starterMeals(i, input, kcal);
    if (!days.includes(weekday)) {
      return { session: { kind: 'rest', focus: 'Recovery', minutes: 0, note: 'Easy 20-minute walk, 10 minutes of stretching, early night.' }, meals };
    }
    const t = TEMPLATES[rotation++ % TEMPLATES.length];
    const exercises = t.exercises
      .map(([id, sets, reps]) => starterExercise(id, sets, reps, location, equipment, injuries, minor))
      .filter((e): e is PlanExerciseV2 => !!e);
    return { session: { kind: 'workout', focus: t.focus, minutes: t.minutes, time, exercises }, meals };
  });
  const protein = input.macros?.protein_g || Math.round((kcal * 0.3) / 4);
  const fat = input.macros?.fat_g || Math.round((kcal * 0.28) / 9);
  const carbs = input.macros?.carbs_g || Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    version: 2,
    generated_at: '',
    source: 'rules',
    model: '',
    days: planDays,
    kcal_target: kcal,
    water_target: input.water_target && input.water_target > 0 ? input.water_target : 8,
    macros: { protein_g: protein, carbs_g: carbs, fat_g: fat },
    location,
    equipment: availableEquipment(location, equipment),
    training_days: [...days].sort(),
    training_time: time,
    pace: null,
    minor,
    summary: '',
    changes: '',
    instruction: null,
  };
}

/** Day ids from `today` on that a workout can move to or from: not in the
    past and not already done. */
export function movableDays(days: readonly Pick<WeekDay, 'id' | 'session' | 'done'>[], today: string): Set<string> {
  return new Set(days.filter((d) => d.id >= today && !(d.session.kind === 'workout' && d.done.workout)).map((d) => d.id));
}
