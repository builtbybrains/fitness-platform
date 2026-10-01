import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { inQuietHours, minutesOf, outOfQuiet, planReminders, type ReminderInput } from '../lib/notify';
import { DEFAULT_REMINDERS } from '../api/profile';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

// Wednesday 1 October 2026, 09:00 local.
const NOW = new Date(2026, 9, 1, 9, 0, 0);

function input(over: Partial<ReminderInput> = {}): ReminderInput {
  return {
    prefs: { ...DEFAULT_REMINDERS },
    quietStart: '22:00',
    quietEnd: '07:00',
    trainingDays: [1, 2, 3, 4, 5, 6],
    trainingClock: '18:00',
    monthlyDueDay: '2026-10-20',
    now: NOW,
    ...over,
  };
}

describe('quiet hours', () => {
  it('wraps midnight', () => {
    expect(minutesOf('22:00:00')).toBe(1320);
    expect(inQuietHours(23 * 60, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(6 * 60 + 59, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(7 * 60, '22:00', '07:00')).toBe(false);
    expect(inQuietHours(12 * 60, '13:00', '14:00')).toBe(false);
    expect(inQuietHours(13 * 60 + 30, '13:00', '14:00')).toBe(true);
    expect(inQuietHours(3 * 60, '00:00', '00:00')).toBe(false);
  });

  it('moves a time to the end of quiet hours', () => {
    expect(outOfQuiet(6 * 60, '22:00', '07:00')).toEqual({ min: 7 * 60, dayShift: 0 });
    expect(outOfQuiet(23 * 60, '22:00', '07:00')).toEqual({ min: 7 * 60, dayShift: 1 });
    expect(outOfQuiet(18 * 60, '22:00', '07:00')).toEqual({ min: 18 * 60, dayShift: 0 });
  });
});

describe('planReminders', () => {
  it('schedules every type by default, Sunday rest respected', () => {
    const list = planReminders(input());
    const kinds = new Set(list.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(['checkin', 'meals', 'streak', 'water', 'weigh_in', 'workout']);
    const workouts = list.filter((r) => r.kind === 'workout');
    expect(workouts).toHaveLength(6);
    // weekday 1 = Sunday in expo-notifications: never scheduled.
    expect(workouts.some((r) => r.trigger.type === 'weekly' && r.trigger.weekday === 1)).toBe(false);
    expect(workouts[0].trigger).toMatchObject({ type: 'weekly', weekday: 2, hour: 18, minute: 0 });
    expect(list.every((r) => r.id.startsWith('built-'))).toBe(true);
    expect(list.length).toBeLessThan(64);
  });

  it('turns each type off on its own', () => {
    for (const k of ['workout', 'meals', 'water', 'weigh_in', 'checkin', 'streak'] as const) {
      const list = planReminders(input({ prefs: { ...DEFAULT_REMINDERS, [k]: false } }));
      expect(list.some((r) => r.kind === k)).toBe(false);
    }
  });

  it('keeps everything out of quiet hours', () => {
    const list = planReminders(input({ quietStart: '19:00', quietEnd: '09:00', trainingClock: '06:30' }));
    for (const r of list) {
      if (r.trigger.type === 'date') expect(inQuietHours(r.trigger.date.getHours() * 60 + r.trigger.date.getMinutes(), '19:00', '09:00')).toBe(false);
      else expect(inQuietHours(r.trigger.hour * 60 + r.trigger.minute, '19:00', '09:00')).toBe(false);
    }
    // The 06:30 workout moves to 09:00; the 19:30 dinner and 20:00 streak are skipped.
    expect(list.find((r) => r.kind === 'workout')?.trigger).toMatchObject({ hour: 9, minute: 0 });
    expect(list.some((r) => r.id === 'built-meal-dinner')).toBe(false);
    expect(list.some((r) => r.kind === 'streak')).toBe(false);
  });

  it('moves a late workout past midnight onto the next weekday', () => {
    const list = planReminders(input({ trainingDays: [6], trainingClock: '23:00' }));
    expect(list.find((r) => r.kind === 'workout')?.trigger).toMatchObject({ type: 'weekly', weekday: 1, hour: 7 });
  });

  it('skips tonight\'s streak reminder once the workout is done', () => {
    const today = planReminders(input()).filter((r) => r.id === 'built-streak-2026-10-01');
    expect(today).toHaveLength(1);
    expect(planReminders(input({ workoutDoneToday: true })).some((r) => r.id === 'built-streak-2026-10-01')).toBe(false);
  });

  it('puts the monthly check-in on its due day, or the next morning when overdue', () => {
    const due = planReminders(input()).find((r) => r.kind === 'checkin')!;
    expect(due.trigger.type === 'date' && due.trigger.date.toDateString()).toBe(new Date(2026, 9, 20).toDateString());
    const late = planReminders(input({ monthlyDueDay: '2026-09-01' })).find((r) => r.kind === 'checkin')!;
    expect(late.trigger.type === 'date' && late.trigger.date.getTime()).toBe(new Date(2026, 9, 2, 9, 0).getTime());
    expect(planReminders(input({ monthlyDueDay: null })).some((r) => r.kind === 'checkin')).toBe(false);
  });
});
