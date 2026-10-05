/* Milestones for the Progress tab, computed from what the app already
   keeps: completion rows (workouts, sets), the streak, and check-ins.

   - Workouts count days with the workout done, up to today.
   - Streaks follow streak.streakSeries (rest days never break one), so a
     badge and the streak number on screen always agree.
   - A personal best is a session that beats every earlier one. BUILT
     never prescribes a load and set rows carry no weight, so by default
     that means the most sets done in one session; when lift loads are
     passed in, a heavier lift than any earlier session counts too.

   Pure module: no React, no native imports. */

import type { DoneMap, WeekSchedule } from '../planData';
import { RULES_SCHEDULE } from '../planData';
import { streakSeries } from '../streak';

export type MilestoneId =
  | 'first_workout'
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  | 'workouts_10'
  | 'workouts_50'
  | 'first_checkin'
  | 'personal_best';

export type Milestone = {
  id: MilestoneId;
  title: string;
  description: string;
  earned: boolean;
  /** Day id it was earned on, when the history shows it. */
  earnedAt: string | null;
  /** How far along an unearned count is ("6 of 10"); null otherwise. */
  progress: { value: number; target: number } | null;
};

/** The heaviest load on one lift on one day. */
export type LiftLog = { day: string; exercise: string; kg: number };

export type MilestoneInput = {
  history: DoneMap;
  schedule?: WeekSchedule;
  todayId: string;
  /** Days with a saved check-in, weekly or monthly, any order. */
  checkinDays: readonly string[];
  lifts?: readonly LiftLog[];
};

const COPY: Record<MilestoneId, { title: string; description: string }> = {
  first_workout: { title: 'Day one', description: 'Finish your first workout.' },
  streak_3: { title: 'Streak of 3', description: 'Three workouts in a row, no missed days.' },
  streak_7: { title: 'Streak of 7', description: 'Seven in a row. This is a habit now.' },
  streak_30: { title: 'Streak of 30', description: 'Thirty in a row. Built.' },
  workouts_10: { title: '10 workouts', description: 'Ten sessions done.' },
  workouts_50: { title: '50 workouts', description: 'Fifty sessions done.' },
  first_checkin: { title: 'First check-in', description: 'Log your first weigh-in.' },
  personal_best: { title: 'New best', description: 'Beat your best session.' },
};

function make(id: MilestoneId, earnedAt: string | null, progress: { value: number; target: number } | null = null): Milestone {
  const earned = earnedAt !== null;
  return { id, ...COPY[id], earned, earnedAt, progress: earned ? null : progress };
}

/** First day a running series reaches `n`, or null. */
function firstAt(series: Map<string, number>, n: number): string | null {
  for (const [id, v] of series) if (v >= n) return id;
  return null;
}

/** The first session that beats every earlier one, or null. */
function firstBest(sessions: readonly { day: string; value: number }[]): string | null {
  let best = -Infinity;
  for (const s of sessions) {
    if (best > -Infinity && s.value > best) return s.day;
    best = Math.max(best, s.value);
  }
  return null;
}

function earliest(...days: (string | null)[]): string | null {
  const real = days.filter((d): d is string => d !== null).sort();
  return real[0] ?? null;
}

export function milestones(input: MilestoneInput): Milestone[] {
  const { history, todayId } = input;
  const schedule = input.schedule ?? RULES_SCHEDULE;
  const past = Object.keys(history)
    .filter((id) => id <= todayId)
    .sort();

  const workouts = past.filter((id) => history[id]?.workout);
  const series = streakSeries(history, schedule, todayId);
  const streakNow = series.get(todayId) ?? 0;

  // Sets done per session, in day order.
  const sessions = past
    .map((day) => ({ day, value: (history[day]?.exercises ?? []).reduce((a, row) => a + (row?.length ?? 0), 0) }))
    .filter((s) => s.value > 0);
  // Heaviest load per lift per day, judged lift by lift.
  const byLift = new Map<string, Map<string, number>>();
  for (const l of input.lifts ?? []) {
    if (l.day > todayId || !(l.kg > 0)) continue;
    const key = l.exercise.trim().toLowerCase();
    const days = byLift.get(key) ?? new Map<string, number>();
    days.set(l.day, Math.max(days.get(l.day) ?? 0, l.kg));
    byLift.set(key, days);
  }
  const liftBests = [...byLift.values()].map((days) =>
    firstBest(
      [...days.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([day, value]) => ({ day, value })),
    ),
  );

  const checkins = input.checkinDays.filter((d) => d <= todayId).sort();
  const count = (n: number) => ({ value: Math.min(workouts.length, n), target: n });
  const streak = (n: number) => ({ value: Math.min(streakNow, n), target: n });

  return [
    make('first_workout', workouts[0] ?? null),
    make('streak_3', firstAt(series, 3), streak(3)),
    make('streak_7', firstAt(series, 7), streak(7)),
    make('streak_30', firstAt(series, 30), streak(30)),
    make('workouts_10', workouts[9] ?? null, count(10)),
    make('workouts_50', workouts[49] ?? null, count(50)),
    make('first_checkin', checkins[0] ?? null),
    make('personal_best', earliest(firstBest(sessions), ...liftBests)),
  ];
}

/** Earned milestones whose ids aren't in `seen`, most recent first. */
export function newlyEarned(list: readonly Milestone[], seen: readonly string[]): Milestone[] {
  return list
    .filter((m) => m.earned && !seen.includes(m.id))
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (b.m.earnedAt ?? '').localeCompare(a.m.earnedAt ?? '') || b.i - a.i)
    .map(({ m }) => m);
}

/** The unearned milestone closest to done (by share done; ties go to the
    earlier one in the list), or null when every one is earned. */
export function nextMilestone(list: readonly Milestone[]): Milestone | null {
  const open = list.filter((m) => !m.earned);
  if (!open.length) return null;
  const share = (m: Milestone) => (m.progress ? m.progress.value / m.progress.target : 0);
  return open.reduce((best, m) => (share(m) > share(best) ? m : best), open[0]);
}
