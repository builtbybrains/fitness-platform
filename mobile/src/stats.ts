/* Stats helpers for the Progress tab: weekly workout history and streak
   history, both judged against the plan actually in use (pass the plan
   store's `schedule`; the rules week is only the default), plus a calorie
   suggestion from personal stats.

   Pure module: no React, no native imports. */

import { addDays, isoDay, mondayIndex, weekStartDate } from './lib/dates';
import { buildWeek, DoneMap, PlanSession, RULES_SCHEDULE, WeekSchedule } from './planData';
import { streakSeries } from './streak';

/** Rules-plan session for any date (not just the current week). */
export function sessionForDate(date: Date): PlanSession {
  return buildWeek(date)[mondayIndex(date)].session;
}

export type WeekBucket = {
  weekStartId: string; // Monday of that week
  label: string; // "This wk", "Last wk", "3w ago", …
  workoutsDone: number; // workouts completed that week
  workoutsPlanned: number; // training days scheduled up to today (current week) or the whole week
};

/** Workout history over the past N weeks (oldest first, current week last).
    Future days of the current week don't count against `planned`. A workout
    done on a day that is now a rest day (an older plan) counts as both
    planned and done. */
export function weeklyHistory(
  done: DoneMap,
  weeks = 8,
  today = new Date(),
  schedule: WeekSchedule = RULES_SCHEDULE,
): WeekBucket[] {
  const todayId = isoDay(today);
  const thisMonday = isoDay(weekStartDate(today));
  const out: WeekBucket[] = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(thisMonday, -7 * w);
    let planned = 0;
    let completed = 0;
    for (let i = 0; i < 7; i++) {
      const id = addDays(ws, i);
      if (id > todayId) continue; // future day of the current week
      const didWorkout = !!done[id]?.workout;
      if (schedule[i] === 'workout' || didWorkout) planned += 1;
      if (didWorkout) completed += 1;
    }
    out.push({
      weekStartId: ws,
      label: w === 0 ? 'This wk' : w === 1 ? 'Last wk' : `${w}w ago`,
      workoutsDone: completed,
      workoutsPlanned: planned,
    });
  }
  return out;
}

/** Streak snapshots per week, oldest first (aligned with weeklyHistory):
    the running streak at each week's Sunday, or today for the current week.
    The last value always equals streak.currentStreak for the same inputs. */
export function streakHistory(
  done: DoneMap,
  weeks = 8,
  today = new Date(),
  schedule: WeekSchedule = RULES_SCHEDULE,
): number[] {
  const todayId = isoDay(today);
  const series = streakSeries(done, schedule, todayId);
  const thisMonday = isoDay(weekStartDate(today));

  // The series is contiguous from the first workout in history to today;
  // days before that first workout have no entry and mean 0.
  const valueOn = (id: string): number => series.get(id) ?? 0;

  const out: number[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const sunday = addDays(thisMonday, -7 * w + 6);
    out.push(valueOn(sunday > todayId ? todayId : sunday));
  }
  return out;
}

export function tdeeSuggestion(p: {
  gender: string;
  age: number | null;
  height_cm: number | null;
  latestKg?: number | null;
}): number | null {
  const { gender, age, height_cm, latestKg } = p;
  if (!age || !height_cm || !latestKg) return null;

  // Mifflin-St Jeor BMR with a moderate-activity multiplier (plan: ~4 sessions/wk).
  const bmr =
    10 * latestKg + 6.25 * height_cm - 5 * age + (gender === 'male' ? 5 : gender === 'female' ? -161 : 0);
  const floor = gender === 'female' ? 1200 : 1500;
  return Math.max(floor, Math.round((bmr * 1.55) / 10) * 10);
}

// ═══════════════════════════════ v2: the day and the weeks ═══════════════════════════════

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

export const ZERO_MACROS: Macros = Object.freeze({ kcal: 0, protein: 0, carbs: 0, fat: 0 }) as Macros;

export function addMacros(a: Macros, b: Partial<Macros>): Macros {
  return {
    kcal: a.kcal + (b.kcal || 0),
    protein: a.protein + (b.protein || 0),
    carbs: a.carbs + (b.carbs || 0),
    fat: a.fat + (b.fat || 0),
  };
}

export type DaySummaryInput = {
  day: {
    session: { kind: string; exercises?: { sets: number }[] };
    meals: { slot: string; kcal: number; protein: number; carbs?: number; fat?: number }[];
    done: { workout: boolean; exercises: number[][]; meals: string[] };
  };
  /** Food logged outside the plan (photo, typed, generated). */
  logs: readonly Partial<Macros>[];
  activityKcal: number;
  activityMinutes: number;
  water: { count: number; target: number };
  targets: Macros;
};

export type DaySummary = {
  /** Checked plan meals plus off-plan food. */
  eaten: Macros;
  planEaten: Macros;
  offPlan: Macros;
  burned: number;
  kcalLeft: number;
  /** 0..1, the Today ring. */
  progress: number;
  parts: { train: number | null; food: number; water: number };
};

/** Everything the Today ring and numbers show. Training counts on workout
    days (sets done); on a rest day a logged activity counts as training.
    Food is calories and protein against target (off-plan food included);
    water is glasses. */
export function daySummary(i: DaySummaryInput): DaySummary {
  const planEaten = i.day.meals.filter((m) => i.day.done.meals.includes(m.slot)).reduce<Macros>((a, m) => addMacros(a, m), { ...ZERO_MACROS });
  const offPlan = i.logs.reduce<Macros>((a, l) => addMacros(a, l), { ...ZERO_MACROS });
  const eaten = addMacros(planEaten, offPlan);

  let train: number | null = null;
  if (i.day.session.kind === 'workout') {
    const ex = i.day.session.exercises ?? [];
    const total = ex.reduce((a, e) => a + e.sets, 0);
    const done = ex.reduce((a, e, k) => a + Math.min(e.sets, (i.day.done.exercises[k] ?? []).filter((x) => x < e.sets).length), 0);
    train = i.day.done.workout ? 1 : total ? done / total : 0;
  } else if (i.activityMinutes > 0) {
    train = 1;
  }
  const kcalPart = i.targets.kcal > 0 ? Math.min(1, eaten.kcal / i.targets.kcal) : 0;
  const food = i.targets.protein > 0 ? (kcalPart + Math.min(1, eaten.protein / i.targets.protein)) / 2 : kcalPart;
  const water = i.water.target > 0 ? Math.min(1, i.water.count / i.water.target) : 0;
  const parts = [train, food, water].filter((x): x is number => x != null);
  return {
    eaten,
    planEaten,
    offPlan,
    burned: Math.max(0, Math.round(i.activityKcal)),
    kcalLeft: Math.max(0, Math.round(i.targets.kcal - eaten.kcal)),
    progress: parts.reduce((a, b) => a + b, 0) / parts.length,
    parts: { train, food, water },
  };
}

type ActivityLike = { day: string; kind: string; minutes: number; kcal: number };

/** Activities between two days (inclusive): totals. */
export function activityTotals(list: readonly ActivityLike[], from: string, to: string): { kcal: number; minutes: number; count: number } {
  let kcal = 0;
  let minutes = 0;
  let count = 0;
  for (const a of list) {
    if (a.day < from || a.day > to) continue;
    kcal += a.kcal;
    minutes += a.minutes;
    count += 1;
  }
  return { kcal, minutes, count };
}

/** Minutes and kcal per activity kind (most minutes first). */
export function activityByKind(list: readonly ActivityLike[], from: string, to: string): { kind: string; minutes: number; kcal: number; count: number }[] {
  const by = new Map<string, { kind: string; minutes: number; kcal: number; count: number }>();
  for (const a of list) {
    if (a.day < from || a.day > to) continue;
    const row = by.get(a.kind) ?? { kind: a.kind, minutes: 0, kcal: 0, count: 0 };
    row.minutes += a.minutes;
    row.kcal += a.kcal;
    row.count += 1;
    by.set(a.kind, row);
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes || b.kcal - a.kcal);
}

/** Activity minutes and kcal per week, oldest first (current week last). */
export function weeklyActivity(list: readonly ActivityLike[], weeks = 8, today = new Date()): { weekStartId: string; minutes: number; kcal: number }[] {
  const thisMonday = isoDay(weekStartDate(today));
  const out: { weekStartId: string; minutes: number; kcal: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(thisMonday, -7 * w);
    const t = activityTotals(list, ws, addDays(ws, 6));
    out.push({ weekStartId: ws, minutes: t.minutes, kcal: t.kcal });
  }
  return out;
}

export type DayCell = { id: string; state: 'done' | 'missed' | 'rest' | 'open' | 'future' | 'none' };

/** One cell per day for the last `weeks` weeks (Monday first, oldest week
    first): workout done, a missed training day, rest, today still open,
    or a day still to come. Days before `since` (default: the first day
    with a saved row) are 'none': nothing was expected yet. */
export function trainingCalendar(done: DoneMap, schedule: WeekSchedule, weeks = 8, today = new Date(), since?: string | null): DayCell[][] {
  const todayId = isoDay(today);
  const first = since ?? Object.keys(done).sort()[0] ?? todayId;
  const thisMonday = isoDay(weekStartDate(today));
  const rows: DayCell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(thisMonday, -7 * w);
    rows.push(
      Array.from({ length: 7 }, (_, i) => {
        const id = addDays(ws, i);
        const training = schedule[i] === 'workout';
        let state: DayCell['state'];
        if (done[id]?.workout) state = 'done';
        else if (id > todayId) state = 'future';
        else if (id < first) state = 'none';
        else if (id === todayId) state = training ? 'open' : 'rest';
        else state = training ? 'missed' : 'rest';
        return { id, state };
      }),
    );
  }
  return rows;
}

/** How close each day's calories came to target, 0..1.5 (capped), for the
    days given. */
export function kcalAdherence(days: readonly { id: string; kcal: number }[], target: number): { id: string; ratio: number }[] {
  return days.map((d) => ({ id: d.id, ratio: target > 0 ? Math.min(1.5, d.kcal / target) : 0 }));
}

/** Average of a list of day totals (days with nothing logged are skipped). */
export function averageMacros(days: readonly Macros[]): { avg: Macros; days: number } {
  const logged = days.filter((d) => d.kcal > 0);
  if (!logged.length) return { avg: { ...ZERO_MACROS }, days: 0 };
  const sum = logged.reduce<Macros>((a, d) => addMacros(a, d), { ...ZERO_MACROS });
  const n = logged.length;
  return { avg: { kcal: Math.round(sum.kcal / n), protein: Math.round(sum.protein / n), carbs: Math.round(sum.carbs / n), fat: Math.round(sum.fat / n) }, days: n };
}
