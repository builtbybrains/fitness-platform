/* Streak computation from completed plan days. A streak counts consecutive
   *scheduled workout days* (rest days don't break it — that's how real
   training streaks work). Days before today must be complete; today counts
   once its workout is done, so the streak never reads as broken mid-day. */

import { PlanDay } from './planData';

export function workoutStreak(days: PlanDay[], todayIdx: number): number {
  let streak = 0;

  // Today: counts only when its workout is done.
  const today = days[todayIdx];
  if (today && today.session.kind === 'workout' && today.done.workout) {
    streak += 1;
  }

  // Walk backwards through previous scheduled workout days.
  for (let i = todayIdx - 1; i >= 0; i--) {
    const d = days[i];
    if (!d) break;
    if (d.session.kind !== 'workout') continue; // rest day: skip, don't break
    if (!d.done.workout) break;
    streak += 1;
  }

  return streak;
}
