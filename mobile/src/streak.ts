/* Workout streak from real history, across weeks.

   One rule decides a trained day everywhere (the streak, the week ring,
   the day strips, Progress, the coach and the server's user_streak):
   the workout is done, OR the sport logged that day adds up to
   SPORT_COUNTS_MINUTES (30) or more. Walking is not a sport: a daily walk
   (often imported from a health app) never counts. A sport never ticks
   the generated workout itself; that stays open to do.

   Walk forward day by day through saved completion rows:
   - a trained day adds one;
   - a PAST scheduled training day left undone resets the streak to zero;
   - rest days are neutral (they never break a streak);
   - today is still in progress: done adds one, not done yet changes nothing.

   "Scheduled" follows the plan actually in use (the active AI plan's
   weekday pattern, or the rules week when there is none). The Today chip
   (currentStreak) and the Progress tab (stats.streakHistory) both use
   streakSeries, so they always agree.

   Pure module: no React, no native imports. */

import { addDays, isoDay, mondayIndex, parseDay } from './lib/dates';
import { DoneMap, PlanDay, RULES_SCHEDULE, WeekSchedule, scheduleOf } from './planData';

/** How far back a streak is followed (days). */
export const STREAK_HORIZON_DAYS = 366;

/** Minutes of logged sport or activity that make a day count as trained
    (owner's decision). The server uses the same number (user_streak). */
export const SPORT_COUNTS_MINUTES = 30;

/** Sport minutes per day id. */
export type MinutesByDay = Readonly<Record<string, number>>;

/** Activity kinds that never count toward a trained day. */
export const NOT_SPORT_KINDS: readonly string[] = ['walking'];

/** True when an activity of this kind counts toward the 30 minutes. */
export function countsAsSport(kind: string): boolean {
  return !NOT_SPORT_KINDS.includes(kind);
}

/** Sport minutes per day from a list of logged activities (walking left out). */
export function minutesByDay(list: readonly { day: string; minutes: number; kind: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of list) {
    if (!countsAsSport(a.kind)) continue;
    out[a.day] = (out[a.day] ?? 0) + (Number(a.minutes) || 0);
  }
  return out;
}

/** True when that much sport counts as the day's workout. */
export function sportCounts(minutes: number | null | undefined): boolean {
  return (minutes ?? 0) >= SPORT_COUNTS_MINUTES;
}

/** The one rule: the workout is done, or the day's sport reaches 30 minutes. */
export function isTrainedDay(done: { workout?: boolean } | null | undefined, sportMinutes?: number | null): boolean {
  return !!done?.workout || sportCounts(sportMinutes);
}

/** Running streak value at the end of every day from the start of `done`'s
    history (bounded by the horizon) up to and including `todayId`. */
export function streakSeries(
  done: DoneMap,
  schedule: WeekSchedule = RULES_SCHEDULE,
  todayId: string = isoDay(new Date()),
  sport: MinutesByDay = {},
): Map<string, number> {
  const out = new Map<string, number>();
  const floor = addDays(todayId, -STREAK_HORIZON_DAYS);
  let first: string | null = null;
  for (const id of [...Object.keys(done), ...Object.keys(sport)]) {
    if (!isTrainedDay(done[id], sport[id]) || id > todayId || id < floor) continue;
    if (first === null || id < first) first = id;
  }
  if (first === null) return out;

  let running = 0;
  for (let id = first; id <= todayId; id = addDays(id, 1)) {
    const trained = isTrainedDay(done[id], sport[id]);
    if (trained) running += 1;
    else if (id < todayId && schedule[mondayIndex(parseDay(id))] === 'workout') running = 0;
    out.set(id, running);
  }
  return out;
}

/** The streak as of today. */
export function currentStreak(
  done: DoneMap,
  schedule: WeekSchedule = RULES_SCHEDULE,
  todayId: string = isoDay(new Date()),
  sport: MinutesByDay = {},
): number {
  return streakSeries(done, schedule, todayId, sport).get(todayId) ?? 0;
}

/** @deprecated Only sees the week it is given. Use `usePlan().streak`,
    which follows the whole history. Kept so older screens still compile. */
export function workoutStreak(days: PlanDay[], todayIdx: number): number {
  const today = days[todayIdx];
  if (!today) return 0;
  const done: DoneMap = {};
  for (const d of days) done[d.id] = d.done;
  return currentStreak(done, scheduleOf(days), today.id);
}
