import { describe, expect, it } from 'vitest';

import { addDays } from '../lib/dates';
import { buildWeek, DoneMap, RULES_SCHEDULE, WeekSchedule, withDone } from '../planData';
import { countsAsSport, currentStreak, isTrainedDay, minutesByDay, SPORT_COUNTS_MINUTES, sportCounts, workoutStreak } from '../streak';
import { bestStreak, streakHistory, tdeeSuggestion, trainingCalendar, weeklyHistory } from '../stats';
import { stripState, weekCounts, weekStrip } from '../lib/weekStrip';
import { milestones } from '../lib/milestones';

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

  it('best streak sees a midweek peak that the Sunday snapshots miss', () => {
    // Last week: Mon, Tue, Thu done (3 in a row), Fri missed, Sun done.
    const d = done('2026-09-21', '2026-09-22', '2026-09-24', '2026-09-27');
    expect(Math.max(...streakHistory(d, 8, TUE, RULES_SCHEDULE))).toBe(1);
    expect(bestStreak(d, 8, TUE, RULES_SCHEDULE)).toBe(3);
  });

  it('best streak only looks inside the window', () => {
    // Four in a row in mid-July, long before an 8-week window opening 2026-08-10.
    const d = done('2026-07-13', '2026-07-14', '2026-07-16', '2026-07-17', '2026-09-28');
    expect(bestStreak(d, 8, TUE, RULES_SCHEDULE)).toBe(1);
    expect(bestStreak({}, 8, TUE, RULES_SCHEDULE)).toBe(0);
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

describe('sport counts as the day\'s workout (30 minutes or more)', () => {
  // Rules week again: Mon 09-28 W, Tue 09-29 W, Wed 09-30 rest, Thu 10-01 W.
  it('uses one named threshold of 30 minutes', () => {
    expect(SPORT_COUNTS_MINUTES).toBe(30);
    expect(sportCounts(30)).toBe(true);
    expect(sportCounts(29)).toBe(false);
    expect(sportCounts(undefined)).toBe(false);
    expect(isTrainedDay({ workout: true }, 0)).toBe(true);
    expect(isTrainedDay({ workout: false }, 45)).toBe(true);
    expect(isTrainedDay(undefined, 10)).toBe(false);
  });

  it('adds up every sport logged on a day', () => {
    expect(
      minutesByDay([
        { day: '2026-09-29', minutes: 20, kind: 'football' },
        { day: '2026-09-29', minutes: 15, kind: 'swimming' },
        { day: '2026-09-30', minutes: 60, kind: 'padel' },
      ]),
    ).toEqual({ '2026-09-29': 35, '2026-09-30': 60 });
  });

  it('never counts walking, not even 60 minutes of it', () => {
    expect(countsAsSport('walking')).toBe(false);
    expect(countsAsSport('football')).toBe(true);
    const sport = minutesByDay([
      { day: '2026-09-29', minutes: 60, kind: 'walking' },
      { day: '2026-09-30', minutes: 20, kind: 'walking' },
      { day: '2026-09-30', minutes: 20, kind: 'football' },
    ]);
    expect(sport).toEqual({ '2026-09-30': 20 });
    // Monday's workout done, Tuesday only an hour's walk: Tuesday is missed.
    expect(currentStreak(done('2026-09-28'), RULES_SCHEDULE, '2026-09-30', sport)).toBe(0);
    // A walk and a short game on the same day don't add up to a trained day either.
    expect(isTrainedDay(undefined, sport['2026-09-30'])).toBe(false);
  });

  it('keeps the streak going when a workout day is covered by 30+ minutes of sport', () => {
    // Monday's workout done, Tuesday football instead of the workout.
    const d = done('2026-09-28');
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-30')).toBe(0); // Tuesday missed
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-30', { '2026-09-29': 60 })).toBe(2);
  });

  it('extends the streak today, without needing the workout', () => {
    const d = done('2026-09-28');
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-29')).toBe(1);
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-29', { '2026-09-29': 30 })).toBe(2);
  });

  it('does not count less than 30 minutes', () => {
    const d = done('2026-09-28');
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-30', { '2026-09-29': 29 })).toBe(0);
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-29', { '2026-09-29': 20 })).toBe(1);
  });

  it('counts sport on a rest day as a trained day', () => {
    // Wednesday 09-30 is a rest day: a swim there adds one.
    const d = done('2026-09-28', '2026-09-29');
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-30')).toBe(2);
    expect(currentStreak(d, RULES_SCHEDULE, '2026-09-30', { '2026-09-30': 45 })).toBe(3);
    // Sport alone can start a streak.
    expect(currentStreak({}, RULES_SCHEDULE, '2026-09-30', { '2026-09-30': 45 })).toBe(1);
  });

  it('applies the same rule to Progress, the calendar and the milestones', () => {
    const d = done('2026-09-28');
    const sport = { '2026-09-29': 60 };
    expect(streakHistory(d, 1, TUE, RULES_SCHEDULE, sport)).toEqual([2]);
    expect(bestStreak(d, 1, TUE, RULES_SCHEDULE, sport)).toBe(2);
    expect(weeklyHistory(d, 1, TUE, RULES_SCHEDULE, sport)[0]).toMatchObject({ workoutsDone: 2, workoutsPlanned: 2 });
    const cal = trainingCalendar(d, RULES_SCHEDULE, 1, TUE, null, sport);
    expect(cal[0].slice(0, 2).map((c) => c.state)).toEqual(['done', 'done']);
    const streak3 = milestones({ history: d, schedule: RULES_SCHEDULE, todayId: '2026-09-29', checkinDays: [], sport }).find((m) => m.id === 'streak_3');
    expect(streak3?.progress?.value ?? 0).toBe(2);
  });

  it('fills the day strip and the week ring', () => {
    const day = { id: '2026-09-29', index: 1, session: { kind: 'workout' }, done: { workout: false } };
    expect(stripState({ ...day, sportMinutes: 60 }, '2026-09-30')).toBe('done');
    expect(stripState({ ...day, sportMinutes: 20 }, '2026-09-30')).toBe('missed');
    const rest = { id: '2026-09-30', index: 2, session: { kind: 'rest' }, done: { workout: false }, sportMinutes: 45 };
    expect(stripState(rest, '2026-09-30')).toBe('done');
    expect(weekCounts(weekStrip([{ ...day, sportMinutes: 60 }, rest], '2026-09-30'))).toEqual({ done: 2, planned: 2 });
  });
});
