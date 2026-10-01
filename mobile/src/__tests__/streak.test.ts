import { describe, expect, it } from 'vitest';

import { addDays } from '../lib/dates';
import { buildWeek, DoneMap, RULES_SCHEDULE, WeekSchedule, withDone } from '../planData';
import { currentStreak, workoutStreak } from '../streak';
import { streakHistory, tdeeSuggestion, weeklyHistory } from '../stats';

// Rules week: Mon W, Tue W, Wed rest, Thu W, Fri W, Sat rest, Sun W.
// 2026-09-21 and 2026-09-28 are Mondays.
const TUE = new Date(2026, 8, 29, 18); // Tuesday 2026-09-29
const done = (...ids: string[]): DoneMap =>
  Object.fromEntries(ids.map((id) => [id, { workout: true, exercises: [], meals: [] }]));

describe('currentStreak', () => {
  it('carries across the Monday week boundary', () => {
    // Thu, Fri, Sun of last week, then Monday of this week.
    const d = done('2026-09-24', '2026-09-25', '2026-09-27', '2026-09-28');
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-28')).toBe(4);
  });

  it('treats rest days as neutral and today as still in progress', () => {
    const d = done('2026-09-24', '2026-09-25', '2026-09-27', '2026-09-28');
    // Tuesday is a training day, not done yet: the streak holds at 4.
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-29')).toBe(4);
    // Done: 5.
    expect(currentStreak({ ...d, ...done('2026-09-29') }, RULES_SCHEDULE, '2026-09-29')).toBe(5);
  });

  it('resets after a missed scheduled training day', () => {
    // Monday 09-28 skipped.
    const d = done('2026-09-24', '2026-09-25', '2026-09-27');
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-29')).toBe(0);
    expect(currentStreak({ ...d, ...done('2026-09-29') }, RULES_SCHEDULE, '2026-09-29')).toBe(1);
  });

  it('follows the plan in use, not the rules week', () => {
    // An AI plan that trains Mon, Wed, Fri only.
    const mwf: WeekSchedule = ['workout', 'rest', 'workout', 'rest', 'workout', 'rest', 'rest'];
    const d = done('2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28');
    expect(currentStreak(d, mwf, '2026-09-29')).toBe(4);
    // Under the rules week the same history breaks on Tuesday 09-22.
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-29')).toBeLessThan(4);
  });

  it('counts a workout done on what is now a rest day', () => {
    const d = done('2026-09-23'); // Wednesday, a rest day in the rules week
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-23')).toBe(1);
  });

  it('is zero with no history', () => {
    expect(currentStreak({}, RULES_SCHEDULE, '2026-09-29')).toBe(0);
  });

  it('follows a long streak over many weeks', () => {
    const ids: string[] = [];
    for (let id = '2026-06-01'; id <= '2026-09-28'; id = addDays(id, 1)) ids.push(id);
    expect(currentStreak(done(...ids), RULES_SCHEDULE, '2026-09-28')).toBe(ids.length);
  });

  it('legacy workoutStreak agrees within one week', () => {
    const week = withDone(buildWeek(TUE), done('2026-09-28', '2026-09-29'));
    expect(workoutStreak(week, 1)).toBe(2);
  });
});

describe('stats', () => {
  it('Progress and the Today chip agree', () => {
    const d = done('2026-09-10', '2026-09-11', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-24', '2026-09-25', '2026-09-27', '2026-09-28');
    const history = streakHistory(d, 8, TUE, RULES_SCHEDULE);
    expect(history).toHaveLength(8);
    expect(history[history.length - 1]).toBe(currentStreak(d, RULES_SCHEDULE, '2026-09-29'));
    expect(history[history.length - 1]).toBe(14);
  });

  it('snapshots each week at its Sunday', () => {
    const d = done('2026-09-24', '2026-09-25', '2026-09-27');
    const h = streakHistory(d, 2, TUE, RULES_SCHEDULE);
    // Last Sunday: 3. This Monday (a training day) was missed, so today: 0.
    expect(h).toEqual([3, 0]);
  });

  it('weekly history counts planned days from the plan in use, skipping the future', () => {
    const mwf: WeekSchedule = ['workout', 'rest', 'workout', 'rest', 'workout', 'rest', 'rest'];
    const d = done('2026-09-21', '2026-09-23', '2026-09-28');
    const weeks = weeklyHistory(d, 2, TUE, mwf);
    expect(weeks[0]).toMatchObject({ weekStartId: '2026-09-21', label: 'Last wk', workoutsDone: 2, workoutsPlanned: 3 });
    // This week up to Tuesday: only Monday is a planned training day so far.
    expect(weeks[1]).toMatchObject({ weekStartId: '2026-09-28', label: 'This wk', workoutsDone: 1, workoutsPlanned: 1 });
  });

  it('never suggests calories below the safe floor', () => {
    expect(tdeeSuggestion({ gender: 'female', age: 80, height_cm: 140, latestKg: 35 })).toBe(1200);
    expect(tdeeSuggestion({ gender: 'male', age: 90, height_cm: 150, latestKg: 40 })).toBe(1500);
    expect(tdeeSuggestion({ gender: 'male', age: 30, height_cm: 180, latestKg: 80 })).toBe(2760);
  });
});
