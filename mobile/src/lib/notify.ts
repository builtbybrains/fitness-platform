/* expo-notifications, loaded lazily and wrapped so Expo Go on Android
   (SDK 53+) degrades gracefully instead of throwing at import time. Every
   call no-ops when notifications are unavailable (Expo Go Android, web).

   Also the reminder planner (planReminders): a pure function that turns
   the profile (training days and time, reminder switches, quiet hours) into
   the list of local notifications to schedule. useReminders.ts applies it. */

import { Platform } from 'react-native';

import type { ReminderPrefs } from '../types';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

export const WATER_CATEGORY = 'WATER_REMINDER';
export const WATER_ACTION = 'ADD_GLASS';

/* A category with an action button: Android shows it on the notification,
   iOS in the expanded view. Tapping it reaches the response listener in
   useWater as actionIdentifier === WATER_ACTION. */
export function ensureCategories(): void {
  const N = getNotifications();
  if (!N) return;
  N.setNotificationCategoryAsync(WATER_CATEGORY, [
    { identifier: WATER_ACTION, buttonTitle: '+1 glass', options: { opensAppToForeground: true } },
  ]).catch(() => {});
}

export function notificationsAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (Platform.OS !== 'android') return true; // iOS Expo Go still supports local notifications
  return getNotifications() !== null;
}

export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === 'web') return cached;
  if (Platform.OS !== 'android') {
    cached = require('expo-notifications') as NotificationsModule;
    return cached;
  }
  try {
    // On Android, merely touching this module can throw inside Expo Go.
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/* Probe: calling anything on the module can still throw on Android Expo Go. */
export function probeNotifications(): boolean {
  const N = getNotifications();
  if (!N) return false;
  try {
    void N.getPermissionsAsync();
    return true;
  } catch {
    cached = null;
    return false;
  }
}

// ───────────────────────────── reminder planner ─────────────────────────────

export type ReminderKind = 'workout' | 'meals' | 'water' | 'weigh_in' | 'checkin' | 'streak';

export type ReminderTrigger =
  | { type: 'daily'; hour: number; minute: number }
  /** weekday: 1 = Sunday … 7 = Saturday (expo-notifications). */
  | { type: 'weekly'; weekday: number; hour: number; minute: number }
  | { type: 'date'; date: Date };

export type PlannedReminder = {
  /** Every BUILT reminder id starts with "built-" so a reschedule can
      clear exactly ours. */
  id: string;
  kind: ReminderKind;
  title: string;
  body: string;
  trigger: ReminderTrigger;
  category?: string;
  /** Where a tap opens. */
  url?: string;
};

export type ReminderInput = {
  prefs: ReminderPrefs;
  /** "HH:MM" or "HH:MM:SS". */
  quietStart: string;
  quietEnd: string;
  /** 0 = Sunday … 6 = Saturday. */
  trainingDays: readonly number[];
  /** "HH:MM" clock time of training. */
  trainingClock: string;
  /** The day the monthly check-in falls due (yyyy-mm-dd), or null. */
  monthlyDueDay: string | null;
  now: Date;
  /** Today's workout is already done: no "streak at risk" tonight. */
  workoutDoneToday?: boolean;
};

export const DEFAULT_MEAL_TIMES = { Breakfast: '08:00', Lunch: '13:00', Dinner: '19:30' } as const;
export const STREAK_CLOCK = '20:00';
export const WEIGH_IN_CLOCK = '08:00';
export const CHECKIN_CLOCK = '09:00';
const WATER_FROM = 10;
const WATER_TO = 20;

/** Minutes after midnight for "HH:MM" or "HH:MM:SS" (NaN when malformed). */
export function minutesOf(clock: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(clock ?? '');
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** True when `min` (minutes after midnight) is inside quiet hours. Quiet
    hours may wrap midnight (22:00 to 07:00). Equal start and end: none. */
export function inQuietHours(min: number, start: string, end: string): boolean {
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s === e) return false;
  return s < e ? min >= s && min < e : min >= s || min < e;
}

/** Move a time out of quiet hours to the moment they end. `dayShift` is 1
    when that moment is the next calendar day. */
export function outOfQuiet(min: number, start: string, end: string): { min: number; dayShift: number } {
  if (!inQuietHours(min, start, end)) return { min, dayShift: 0 };
  const e = minutesOf(end);
  return { min: e, dayShift: e < min ? 1 : 0 };
}

function hm(min: number): { hour: number; minute: number } {
  const m = ((min % 1440) + 1440) % 1440;
  return { hour: Math.floor(m / 60), minute: m % 60 };
}

function dayDate(day: string, min: number): Date {
  const [y, mo, d] = day.split('-').map(Number);
  const { hour, minute } = hm(min);
  return new Date(y, (mo || 1) - 1, d || 1, hour, minute, 0, 0);
}

function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Every local reminder to schedule, honouring each switch and quiet
    hours. Pure: the same input always gives the same list. */
export function planReminders(input: ReminderInput): PlannedReminder[] {
  const { prefs, quietStart, quietEnd, now } = input;
  const out: PlannedReminder[] = [];
  const quiet = (min: number) => inQuietHours(min, quietStart, quietEnd);
  const days = [...new Set(input.trainingDays)].filter((d) => d >= 0 && d <= 6).sort();

  // Workout, at the chosen time on each training day. A time inside quiet
  // hours moves to when they end.
  if (prefs.workout) {
    const base = minutesOf(input.trainingClock);
    const at = Number.isFinite(base) ? base : 18 * 60;
    for (const d of days) {
      const { min, dayShift } = outOfQuiet(at, quietStart, quietEnd);
      out.push({
        id: `built-workout-${d}`,
        kind: 'workout',
        title: 'Training time',
        body: "Today's workout is ready. One set gets you going.",
        trigger: { type: 'weekly', weekday: ((d + dayShift) % 7) + 1, ...hm(min) },
        url: '/(tabs)',
      });
    }
  }

  // Meals: breakfast, lunch, dinner (and a snack when a time is set).
  if (prefs.meals) {
    const times: Record<string, string> = { ...DEFAULT_MEAL_TIMES, ...(prefs.meal_times ?? {}) };
    for (const [slot, clock] of Object.entries(times)) {
      const min = minutesOf(clock);
      if (!Number.isFinite(min) || quiet(min)) continue;
      out.push({
        id: `built-meal-${slot.toLowerCase()}`,
        kind: 'meals',
        title: slot,
        body: `Time for ${slot.toLowerCase()}. Follow your plan or log what you have.`,
        trigger: { type: 'daily', ...hm(min) },
        url: '/(tabs)',
      });
    }
  }

  // Water through the day, skipping quiet hours.
  if (prefs.water) {
    const every = Math.min(6, Math.max(1, Math.round(prefs.water_every_hours ?? 2)));
    for (let h = WATER_FROM; h <= WATER_TO; h += every) {
      if (quiet(h * 60)) continue;
      out.push({
        id: `built-water-${h}`,
        kind: 'water',
        title: 'Water check',
        body: 'Time for a glass of water.',
        trigger: { type: 'daily', hour: h, minute: 0 },
        category: WATER_CATEGORY,
      });
    }
  }

  // Weekly weigh-in, Monday morning.
  if (prefs.weigh_in) {
    const { min, dayShift } = outOfQuiet(minutesOf(WEIGH_IN_CLOCK), quietStart, quietEnd);
    out.push({
      id: 'built-weigh-in',
      kind: 'weigh_in',
      title: 'Weekly weigh-in',
      body: 'Step on the scale before breakfast and log it in BUILT.',
      trigger: { type: 'weekly', weekday: ((1 + dayShift) % 7) + 1, ...hm(min) },
      url: '/checkin/weekly',
    });
  }

  // Monthly check-in, on the day it falls due (or the next morning when
  // that day has passed).
  if (prefs.checkin && input.monthlyDueDay) {
    const { min, dayShift } = outOfQuiet(minutesOf(CHECKIN_CLOCK), quietStart, quietEnd);
    let when = dayDate(input.monthlyDueDay, min);
    if (dayShift) when.setDate(when.getDate() + 1);
    if (when.getTime() <= now.getTime()) {
      when = dayDate(isoOf(now), min);
      if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1);
    }
    out.push({
      id: 'built-checkin',
      kind: 'checkin',
      title: 'Monthly check-in',
      body: 'Weight, photos and how the month felt. Your coach updates your plan from it.',
      trigger: { type: 'date', date: when },
      url: '/checkin/monthly',
    });
  }

  // Streak at risk: 20:00 on the next week's training days, unless today's
  // workout is done. Inside quiet hours it is skipped (too late to help).
  if (prefs.streak) {
    const min = minutesOf(STREAK_CLOCK);
    if (!quiet(min)) {
      for (let i = 0; i < 7; i++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
        if (!days.includes(day.getDay())) continue;
        const when = dayDate(isoOf(day), min);
        if (when.getTime() <= now.getTime()) continue;
        if (i === 0 && input.workoutDoneToday) continue;
        out.push({
          id: `built-streak-${isoOf(day)}`,
          kind: 'streak',
          title: 'Streak at risk',
          body: "Today's workout is still open. Ten minutes keeps your streak going.",
          trigger: { type: 'date', date: when },
          url: '/(tabs)',
        });
      }
    }
  }

  return out;
}

/** The id of tonight's "streak at risk" reminder for a day. */
export function streakReminderId(day: string): string {
  return `built-streak-${day}`;
}

/** Cancel the "streak at risk" reminder for a day (call when that day's
    workout is marked done). Safe everywhere; no-op on the web. */
export async function cancelStreakReminder(day: string): Promise<void> {
  const N = getNotifications();
  if (!N) return;
  await N.cancelScheduledNotificationAsync(streakReminderId(day)).catch(() => {});
}
