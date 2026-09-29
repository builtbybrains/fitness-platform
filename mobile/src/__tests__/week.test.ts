import { describe, expect, it } from 'vitest';

import { addDays, isoDay, mondayIndex, msUntilNextMidnight, parseDay, weekDayIds, weekStartId } from '../lib/dates';
import {
  applyPlanToWeek,
  buildWeek,
  composeWeek,
  daysToClearOnRegenerate,
  DoneMap,
  LOAD_NOTE,
  StoredPlan,
} from '../planData';
import { remainingSeconds } from '../lib/timer';
import { runSerial } from '../lib/serial';
import { mergeFoodLogs, FoodLog } from '../lib/foodCache';

// Local-time dates (month is 0-based): 2026-09-27 is a Sunday, 09-28 a Monday.
const SUN_2359 = new Date(2026, 8, 27, 23, 59, 30);
const MON_0000 = new Date(2026, 8, 28, 0, 0, 0);

describe('dates', () => {
  it('round-trips day ids', () => {
    expect(isoDay(parseDay('2026-02-28'))).toBe('2026-02-28');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('puts Sunday 23:59 and Monday 00:00 in different weeks', () => {
    expect(weekStartId(SUN_2359)).toBe('2026-09-21');
    expect(weekStartId(MON_0000)).toBe('2026-09-28');
    expect(mondayIndex(SUN_2359)).toBe(6);
    expect(mondayIndex(MON_0000)).toBe(0);
  });

  it('lists the seven days Monday first', () => {
    expect(weekDayIds(new Date(2026, 8, 30, 12))).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('knows how long until midnight', () => {
    expect(msUntilNextMidnight(SUN_2359)).toBe(30_000);
    expect(msUntilNextMidnight(new Date(2026, 8, 29, 12, 0, 0))).toBe(12 * 3600 * 1000);
    expect(msUntilNextMidnight(MON_0000)).toBe(24 * 3600 * 1000);
  });
});

describe('buildWeek / composeWeek', () => {
  it('builds Mon..Sun ids for the week containing today', () => {
    const week = buildWeek(new Date(2026, 8, 30, 9));
    expect(week.map((d) => d.id)).toEqual(weekDayIds(new Date(2026, 8, 30, 9)));
    expect(week.map((d) => d.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('rolls over to the new week at midnight and keeps history', () => {
    const done: DoneMap = {
      '2026-09-27': { workout: true, exercises: [], meals: ['Breakfast'] },
      '2026-09-28': { workout: false, exercises: [[0]], meals: [] },
    };
    const before = composeWeek(SUN_2359, null, done);
    const after = composeWeek(MON_0000, null, done);

    expect(before[6].id).toBe('2026-09-27');
    expect(before[mondayIndex(SUN_2359)].done.workout).toBe(true);

    expect(after[0].id).toBe('2026-09-28');
    expect(after[mondayIndex(MON_0000)].done.exercises).toEqual([[0]]);
    // The new week starts clean apart from what was saved for it.
    expect(after.slice(1).every((d) => !d.done.workout && d.done.meals.length === 0)).toBe(true);
  });

  it('never prescribes a fixed load in the rules week', () => {
    for (const d of buildWeek(MON_0000)) {
      if (d.session.kind !== 'workout') continue;
      for (const e of d.session.exercises) {
        expect(e.kg).toBeUndefined();
        if (!e.unit || e.unit === 'reps') {
          if (!/push-up/i.test(e.name)) expect(e.note).toBe(LOAD_NOTE);
        }
      }
    }
  });

  it('applies an AI plan and keeps its notes and null loads', () => {
    const rest = { session: { kind: 'rest' as const, focus: 'Recovery', minutes: 0, note: 'Walk' }, meals: [] };
    const plan: StoredPlan = {
      days: [
        {
          session: {
            kind: 'workout',
            focus: 'Legs',
            minutes: 40,
            exercises: [{ name: 'Goblet squat', sets: 3, reps: 10, kg: null, note: LOAD_NOTE }],
          },
          meals: [{ slot: 'Breakfast', label: 'Oats', kcal: 400, protein: 20 }],
        },
        rest,
        rest,
        rest,
        rest,
        rest,
        rest,
      ],
      kcal_target: 2000,
      water_target: 8,
    };
    const week = applyPlanToWeek(plan, buildWeek(MON_0000));
    const mon = week[0];
    expect(mon.session.kind).toBe('workout');
    if (mon.session.kind === 'workout') {
      expect(mon.session.exercises[0].kg).toBeUndefined();
      expect(mon.session.exercises[0].note).toBe(LOAD_NOTE);
    }
    expect(week[1].session.kind).toBe('rest');
  });
});

describe('regenerate', () => {
  const done: DoneMap = {
    '2026-09-21': { workout: true, exercises: [], meals: [] }, // last week
    '2026-09-28': { workout: true, exercises: [], meals: ['Lunch'] }, // Monday, past
    '2026-09-29': { workout: false, exercises: [[0, 1]], meals: [] }, // today, unfinished
    '2026-09-30': { workout: false, exercises: [], meals: ['Breakfast'] }, // future
  };

  it('keeps past days and clears today and the future', () => {
    const clear = daysToClearOnRegenerate(done, '2026-09-29').sort();
    expect(clear).toEqual(['2026-09-29', '2026-09-30']);
    expect(clear).not.toContain('2026-09-28');
    expect(clear).not.toContain('2026-09-21');
  });

  it('keeps today when its workout is already finished', () => {
    const finished = { ...done, '2026-09-29': { workout: true, exercises: [[0, 1]], meals: [] } };
    expect(daysToClearOnRegenerate(finished, '2026-09-29')).toEqual(['2026-09-30']);
  });
});

describe('rest timer math', () => {
  it('counts from the end timestamp, including after a background pause', () => {
    const end = 1_000_000 + 90_000;
    expect(remainingSeconds(end, 1_000_000)).toBe(90);
    expect(remainingSeconds(end, 1_000_000 + 250)).toBe(90);
    expect(remainingSeconds(end, 1_000_000 + 60_000)).toBe(30); // 60 s in background
    expect(remainingSeconds(end, 1_000_000 + 500_000)).toBe(0);
  });
});

describe('serial writes', () => {
  it('runs work for one key strictly in order', async () => {
    const order: number[] = [];
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await Promise.all([
      runSerial('day', async () => {
        await wait(20);
        order.push(1);
      }),
      runSerial('day', async () => {
        order.push(2);
      }),
      runSerial('day', async () => {
        await wait(5);
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('keeps going after a failed task', async () => {
    const failed = runSerial('k', async () => {
      throw new Error('offline');
    });
    await expect(failed).rejects.toThrow('offline');
    await expect(runSerial('k', async () => 'next')).resolves.toBe('next');
  });
});

describe('food log merge', () => {
  const row = (id: string, t: string, pending?: boolean): FoodLog => ({
    id,
    day: '2026-09-29',
    label: id,
    kcal: 100,
    protein: 5,
    confidence: 'medium',
    created_at: t,
    pending,
  });

  it('keeps rows logged offline when the server list arrives', () => {
    const server = [row('a', '2026-09-29T08:00:00Z')];
    const local = [row('a', '2026-09-29T08:00:00Z'), row('b', '2026-09-29T09:00:00Z', true), row('local-c', '2026-09-29T07:00:00Z')];
    expect(mergeFoodLogs(server, local).map((r) => r.id)).toEqual(['local-c', 'a', 'b']);
  });

  it('drops rows deleted on another device and rows being deleted', () => {
    const server = [row('a', '1')];
    const local = [row('gone', '0'), row('b', '2', true)];
    expect(mergeFoodLogs(server, local, new Set(['b'])).map((r) => r.id)).toEqual(['a']);
  });
});
