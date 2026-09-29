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
