/* Stats helpers: date-keyed plan sessions, workout/streak history for the
   Progress tab, and a calorie-target suggestion from personal stats. */

import { buildWeek, isoDay, PlanSession } from './planData';
import { DoneRow } from './data';

/** Deterministic session for any date (not just the current week). */
export function sessionForDate(date: Date): PlanSession {
  const week = buildWeek(date);
  const offset = (date.getDay() + 6) % 7;
  return week[offset].session;
}

function mondayStart(d: Date): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export type WeekBucket = {
  weekStartId: string; // Monday of that week
  label: string; // "This wk", "Last wk", "3w ago", …
  workoutsDone: number; // completed scheduled workouts that week
  workoutsPlanned: number; // scheduled workouts up to now (current week) or 7-day total
};

/** Workout history over the past N weeks (oldest first, current week last).
    Future days of the current week don't count against `planned`. */
export function weeklyHistory(
  done: Record<string, DoneRow>,
  weeks = 8,
  today = new Date(),
): WeekBucket[] {
  const tIdx = (today.getDay() + 6) % 7;
  const out: WeekBucket[] = [];

  for (let w = weeks - 1; w >= 0; w--) {
    const ws = mondayStart(today);
    ws.setDate(ws.getDate() - w * 7);

    let planned = 0;
    let completed = 0;
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(ws);
      dayDate.setDate(ws.getDate() + i);
      if (sessionForDate(dayDate).kind !== 'workout') continue;
      if (w === 0 && i > tIdx) continue; // future day of the current week
      planned += 1;
      if (done[isoDay(dayDate)]?.workout) completed += 1;
    }

    out.push({
      weekStartId: isoDay(ws),
      label: w === 0 ? 'This wk' : w === 1 ? 'Last wk' : `${w}w ago`,
      workoutsDone: completed,
      workoutsPlanned: planned,
    });
  }

  return out;
}

/** Streak snapshots per week, oldest first (aligned with weeklyHistory's
    labels): the running streak as of each week's end — today for the current
    week. Only scheduled workout days move the streak; rest days are neutral. */
export function streakHistory(
  done: Record<string, DoneRow>,
  weeks = 8,
  today = new Date(),
): number[] {
  const start = mondayStart(today);
  start.setDate(start.getDate() - (weeks - 1) * 7);

  // Daily running streak from the oldest Monday to today.
  const streakOn = new Map<string, number>();
  let running = 0;
  for (let d = new Date(start); isoDay(d) <= isoDay(today); d.setDate(d.getDate() + 1)) {
    const id = isoDay(d);
    if (sessionForDate(d).kind === 'workout') {
      running = done[id]?.workout ? running + 1 : 0;
    }
    streakOn.set(id, running);
  }

  const out: number[] = [];
  for (let w = 0; w < weeks; w++) {
    const ws = mondayStart(today);
    ws.setDate(ws.getDate() - (weeks - 1 - w) * 7);
    const sunday = new Date(ws);
    sunday.setDate(ws.getDate() + 6);
    const snapId = isoDay(sunday) > isoDay(today) ? isoDay(today) : isoDay(sunday);
    out.push(streakOn.get(snapId) ?? 0);
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

  // Mifflin-St Jeor BMR with a moderate-activity multiplier (plan: ~5 sessions/wk).
  const bmr =
    10 * latestKg + 6.25 * height_cm - 5 * age + (gender === 'male' ? 5 : gender === 'female' ? -161 : 0);
  return Math.round((bmr * 1.55) / 10) * 10;
}
