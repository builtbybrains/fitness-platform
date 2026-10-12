import { describe, expect, it } from 'vitest';

import { addDays } from '../lib/dates';
import { milestones, newlyEarned, nextMilestone, type Milestone, type MilestoneId } from '../lib/milestones';
import type { DoneMap, DoneRow } from '../planData';

// Rules week: Mon W, Tue W, Wed rest, Thu W, Fri W, Sat rest, Sun W.
// 2026-09-21 and 2026-09-28 are Mondays.
const TODAY = '2026-09-29'; // Tuesday

const row = (sets: number[] = [3, 3, 3], workout = true): DoneRow => ({
  workout,
  exercises: sets.map((n) => Array.from({ length: n }, (_, s) => s)),
  meals: [],
});
const done = (...ids: string[]): DoneMap => Object.fromEntries(ids.map((id) => [id, row()]));
const byId = (list: Milestone[]) => Object.fromEntries(list.map((m) => [m.id, m])) as Record<MilestoneId, Milestone>;

describe('milestones', () => {
  it('starts with nothing earned and counts at zero', () => {
    const m = byId(milestones({ history: {}, todayId: TODAY, checkinDays: [] }));
    expect(Object.values(m).every((x) => !x.earned && x.earnedAt === null)).toBe(true);
    expect(m.workouts_10.progress).toEqual({ value: 0, target: 10 });
    expect(m.streak_30.progress).toEqual({ value: 0, target: 30 });
    expect(m.first_workout.progress).toBeNull();
    expect(m.first_checkin.progress).toBeNull();
    expect(m.personal_best.progress).toBeNull();
  });

  it('keeps a fixed order with short titles and one-line descriptions', () => {
    const list = milestones({ history: {}, todayId: TODAY, checkinDays: [] });
    expect(list.map((x) => x.id)).toEqual(['first_workout', 'streak_3', 'streak_7', 'streak_30', 'workouts_10', 'workouts_50', 'first_checkin', 'personal_best']);
    for (const x of list) {
      expect(x.title.length).toBeLessThanOrEqual(16);
      expect(x.description).not.toMatch(/\n|—/);
    }
  });

  it('dates the first workout and a 3-workout streak', () => {
    // Thu, Fri, Sun of last week, then Monday.
    const m = byId(milestones({ history: done('2026-09-24', '2026-09-25', '2026-09-27', '2026-09-28'), todayId: TODAY, checkinDays: [] }));
    expect(m.first_workout).toMatchObject({ earned: true, earnedAt: '2026-09-24', progress: null });
    expect(m.streak_3).toMatchObject({ earned: true, earnedAt: '2026-09-27' });
    expect(m.streak_7.progress).toEqual({ value: 4, target: 7 });
    expect(m.workouts_10.progress).toEqual({ value: 4, target: 10 });
  });

  it('keeps a streak badge after the streak breaks, and progress shows the current streak', () => {
    // Thu, Fri, Sun, then Monday 09-28 missed.
    const m = byId(milestones({ history: done('2026-09-24', '2026-09-25', '2026-09-27'), todayId: TODAY, checkinDays: [] }));
    expect(m.streak_3.earned).toBe(true);
    expect(m.streak_7.progress).toEqual({ value: 0, target: 7 });
  });

  it('earns 10 workouts on the tenth one', () => {
    const ids = Array.from({ length: 12 }, (_, i) => addDays('2026-09-01', i));
    const m = byId(milestones({ history: done(...ids), todayId: '2026-09-20', checkinDays: [] }));
    expect(m.workouts_10).toMatchObject({ earned: true, earnedAt: ids[9], progress: null });
    expect(m.streak_7.earnedAt).toBe(ids[6]);
    expect(m.workouts_50.progress).toEqual({ value: 12, target: 50 });
  });

  it('ignores days after today and rows without a finished workout', () => {
    const history: DoneMap = { '2026-09-28': row([2], false), '2026-10-01': row() };
    const m = byId(milestones({ history, todayId: TODAY, checkinDays: ['2026-10-02'] }));
    expect(m.first_workout.earned).toBe(false);
    expect(m.first_checkin.earned).toBe(false);
  });

  it('dates the first check-in from the earliest day', () => {
    const m = byId(milestones({ history: {}, todayId: TODAY, checkinDays: ['2026-09-20', '2026-09-06', '2026-09-13'] }));
    expect(m.first_checkin).toMatchObject({ earned: true, earnedAt: '2026-09-06' });
  });

  describe('personal best', () => {
    it('needs a session that beats every earlier one', () => {
      const same: DoneMap = { '2026-09-21': row([3, 3]), '2026-09-22': row([3, 3]), '2026-09-24': row([2, 3]) };
      expect(byId(milestones({ history: same, todayId: TODAY, checkinDays: [] })).personal_best.earned).toBe(false);

      const beat: DoneMap = { ...same, '2026-09-25': row([3, 3, 1], false), '2026-09-28': row([4, 4]) };
      expect(byId(milestones({ history: beat, todayId: TODAY, checkinDays: [] })).personal_best).toMatchObject({ earned: true, earnedAt: '2026-09-25' });
    });

    it('never counts the very first session', () => {
      const m = byId(milestones({ history: { '2026-09-28': row([5, 5, 5]) }, todayId: TODAY, checkinDays: [] }));
      expect(m.personal_best.earned).toBe(false);
    });

    it('counts a heavier lift than any earlier session, lift by lift', () => {
      const history: DoneMap = { '2026-09-21': row([3]), '2026-09-22': row([3]) };
      const lifts = [
        { day: '2026-09-21', exercise: 'Goblet squat', kg: 16 },
        { day: '2026-09-22', exercise: 'Dumbbell row', kg: 20 },
        { day: '2026-09-24', exercise: 'goblet squat ', kg: 16 },
        { day: '2026-09-25', exercise: 'Goblet squat', kg: 18 },
        { day: '2026-10-01', exercise: 'Dumbbell row', kg: 30 },
      ];
      const m = byId(milestones({ history, todayId: TODAY, checkinDays: [], lifts }));
      expect(m.personal_best).toMatchObject({ earned: true, earnedAt: '2026-09-25' });
    });
  });
});

describe('newlyEarned and nextMilestone', () => {
  const list = milestones({ history: done('2026-09-24', '2026-09-25', '2026-09-27', '2026-09-28'), todayId: TODAY, checkinDays: ['2026-09-26'] });

  it('returns earned ones not seen yet, most recent first', () => {
    expect(newlyEarned(list, []).map((m) => m.id)).toEqual(['streak_3', 'first_checkin', 'first_workout']);
    expect(newlyEarned(list, ['first_workout', 'streak_3']).map((m) => m.id)).toEqual(['first_checkin']);
    expect(newlyEarned(list, list.map((m) => m.id))).toEqual([]);
  });

  it('points at the closest unearned milestone', () => {
    expect(nextMilestone(list)?.id).toBe('streak_7');
    const fresh = milestones({ history: {}, todayId: TODAY, checkinDays: [] });
    expect(nextMilestone(fresh)?.id).toBe('first_workout');
    expect(nextMilestone(list.map((m) => ({ ...m, earned: true })))).toBeNull();
  });
});
