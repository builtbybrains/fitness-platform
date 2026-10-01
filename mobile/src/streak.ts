/* Workout streak from real history, across weeks.

   Walk forward day by day through saved completion rows:
   - a day with its workout done adds one;
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

/** Running streak value at the end of every day from the start of `done`'s
    history (bounded by the horizon) up to and including `todayId`. */
export function streakSeries(
  done: DoneMap,
  schedule: WeekSchedule = RULES_SCHEDULE,
  todayId: string = isoDay(new Date()),
): Map<string, number> {
  const out = new Map<string, number>();
  const floor = addDays(todayId, -STREAK_HORIZON_DAYS);
  let first: string | null = null;
  for (const id of Object.keys(done)) {
    if (!done[id]?.workout || id > todayId || id < floor) continue;
    if (first === null || id < first) first = id;
  }
  if (first === null) return out;

  let running = 0;
  for (let id = first; id <= todayId; id = addDays(id, 1)) {
    const didWorkout = !!done[id]?.workout;
    if (didWorkout) running += 1;
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
): number {
  return streakSeries(done, schedule, todayId).get(todayId) ?? 0;
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
