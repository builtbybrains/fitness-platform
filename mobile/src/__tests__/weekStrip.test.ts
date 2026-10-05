import { describe, expect, it } from 'vitest';

import { weekDayIds } from '../lib/dates';
import { stripState, weekCounts, weekStrip, StripInput } from '../lib/weekStrip';
import { COACH_TIPS, tipFor } from '../lib/coachTips';

// 2026-09-28 is a Monday. Rules-like week: Mon W, Tue W, Wed rest, Thu W,
// Fri W, Sat rest, Sun W.
const IDS = weekDayIds(new Date(2026, 8, 30, 12));
const KINDS = ['workout', 'workout', 'rest', 'workout', 'workout', 'rest', 'workout'];

function week(done: string[] = []): StripInput[] {
  return IDS.map((id, i) => ({ id, index: i, session: { kind: KINDS[i] }, done: { workout: done.includes(id) } }));
}

describe('weekStrip', () => {
  it('keeps the plan week order, Monday first', () => {
    const s = weekStrip(week(), '2026-09-30');
    expect(s.map((d) => d.letter).join('')).toBe('MTWTFSS');
    expect(s[0].id).toBe('2026-09-28');
    expect(s[6].id).toBe('2026-10-04');
  });

  it('gives every day its state around today (Thursday)', () => {
    const s = weekStrip(week(['2026-09-28']), '2026-10-01');
    expect(s.map((d) => d.state)).toEqual(['done', 'missed', 'rest', 'today', 'planned', 'rest', 'planned']);
    expect(s.filter((d) => d.isToday).map((d) => d.id)).toEqual(['2026-10-01']);
  });

  it('shows today as done once the workout is finished', () => {
    const s = weekStrip(week(['2026-10-01']), '2026-10-01');
    expect(s[3].state).toBe('done');
    expect(s[3].isToday).toBe(true);
  });

  it('keeps a rest day as rest, today included', () => {
    const s = weekStrip(week(), '2026-09-30');
    expect(s[2]).toMatchObject({ state: 'rest', isToday: true });
  });

  it('counts a workout done on a rest day (a moved session) as done', () => {
    expect(stripState({ id: '2026-10-03', index: 5, session: { kind: 'rest' }, done: { workout: true } }, '2026-10-04')).toBe('done');
  });

  it('marks every earlier training day missed on Sunday, quietly', () => {
    const s = weekStrip(week(['2026-09-28', '2026-10-01']), '2026-10-04');
    expect(s.map((d) => d.state)).toEqual(['done', 'missed', 'rest', 'done', 'missed', 'rest', 'today']);
    expect(s[1].label).toBe('Tuesday, workout not logged');
  });

  it('writes plain screen-reader labels', () => {
    const s = weekStrip(week(['2026-09-28']), '2026-09-30');
    expect(s[0].label).toBe('Monday, workout done');
    expect(s[2].label).toBe('Wednesday, today, rest day');
    expect(s[3].label).toBe('Thursday, workout planned');
  });

  it('counts workouts done and planned, rest days aside', () => {
    expect(weekCounts(weekStrip(week(['2026-09-28', '2026-10-01']), '2026-10-01'))).toEqual({ done: 2, planned: 5 });
  });
});

describe('tipFor', () => {
  it('holds one tip all day and moves on the next', () => {
    expect(tipFor('2026-10-05')).toBe(tipFor('2026-10-05'));
    expect(tipFor('2026-10-05')).not.toBe(tipFor('2026-10-06'));
    expect(COACH_TIPS).toContain(tipFor('1999-01-01'));
  });

  it('has short tips in the BUILT voice: no em dashes, no emoji', () => {
    expect(COACH_TIPS.length).toBeGreaterThanOrEqual(20);
    for (const t of COACH_TIPS) {
      expect(t.length).toBeLessThanOrEqual(120);
      expect(t).not.toMatch(/[—–]/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
