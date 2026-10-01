/* Plan week model. Sessions and meals come from the active AI plan (see
   aiPlan.ts) or, when there is none yet, from the built-in rules week below.
   Completion state (the `done` rows) comes from the database via the plan
   store. A fresh week starts with everything unchecked.

   Pure module: no React, no native imports, so it runs in unit tests. */

import { addDays, isoDay, mondayIndex, weekStartDate } from './lib/dates';

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

export function restFor(e: PlanExercise): number {
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

export function exerciseLabel(e: PlanExercise): string {
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

export function scheduleOf(days: PlanDay[]): WeekSchedule {
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
