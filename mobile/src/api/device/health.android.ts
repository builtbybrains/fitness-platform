/* Health Connect on Android through react-native-health-connect (needs a
   development or production build and Android 8+, minSdk 26 is set in
   app.json; on Android 13 and older the Health Connect app must be
   installed). Same API as health.ts (web). Reads steps, active calories,
   exercise sessions, weight and sleep; writes exercise sessions. Every
   call degrades to "not available" instead of throwing. */

import type { ActivityKind, HealthDayRead, HealthWorkout } from '../../types';
import { dayRange, daysBetween, nightRange, overlapMinutes } from './healthDays';
import type * as WebHealth from './health';
import type { HealthPlatform, WorkoutToWrite } from './health';

export type { HealthPlatform, WorkoutToWrite } from './health';

type HC = typeof import('react-native-health-connect');

let hc: HC | null | undefined;
let ready = false;

function lib(): HC | null {
  if (hc !== undefined) return hc;
  try {
    hc = require('react-native-health-connect') as HC;
  } catch {
    hc = null;
  }
  return hc;
}

async function init(): Promise<HC | null> {
  const h = lib();
  if (!h) return null;
  if (ready) return h;
  try {
    const status = await h.getSdkStatus();
    if (status !== h.SdkAvailabilityStatus.SDK_AVAILABLE) return null;
    ready = await h.initialize();
    return ready ? h : null;
  } catch {
    return null;
  }
}

// Health Connect ExerciseType values.
const TYPE_TO_KIND: Record<number, ActivityKind> = {
  79: 'walking', 56: 'running', 64: 'football', 5: 'basketball', 74: 'swimming', 73: 'swimming', 8: 'cycling', 9: 'cycling',
  50: 'padel', 76: 'padel', 37: 'hiking', 16: 'dancing', 70: 'strength', 81: 'strength',
};
const KIND_TO_TYPE: Record<ActivityKind, number> = {
  walking: 79, running: 56, football: 64, basketball: 5, swimming: 74, cycling: 8, padel: 50,
  hiking: 37, dancing: 16, strength: 70, other: 0,
};

export function healthPlatform(): HealthPlatform | null {
  return lib() ? 'health_connect' : null;
}

export async function healthAvailable(): Promise<boolean> {
  return (await init()) !== null;
}

export async function requestHealthPermissions(): Promise<boolean> {
  const h = await init();
  if (!h) return false;
  try {
    const granted = await h.requestPermission([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'ExerciseSession' },
      { accessType: 'read', recordType: 'Weight' },
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'write', recordType: 'ExerciseSession' },
      { accessType: 'write', recordType: 'ActiveCaloriesBurned' },
    ]);
    return granted.length > 0;
  } catch {
    return false;
  }
}

function between(start: Date, end: Date) {
  return { operator: 'between' as const, startTime: start.toISOString(), endTime: end.toISOString() };
}

export async function readHealthDays(fromDay: string, toDay: string): Promise<HealthDayRead[]> {
  const h = await init();
  if (!h) return [];
  const out: HealthDayRead[] = [];
  for (const day of daysBetween(fromDay, toDay)) {
    const { start, end } = dayRange(day);
    const night = nightRange(day);
    const [steps, kcal, sleep, weight] = await Promise.all([
      h.aggregateRecord({ recordType: 'Steps', timeRangeFilter: between(start, end) }).then((r) => r.COUNT_TOTAL ?? null).catch(() => null),
      h.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: between(start, end) }).then((r) => (r.ACTIVE_CALORIES_TOTAL ? Math.round(r.ACTIVE_CALORIES_TOTAL.inKilocalories) : null)).catch(() => null),
      h.readRecords('SleepSession', { timeRangeFilter: between(night.start, night.end) })
        .then((r) => (r.records.length ? r.records.reduce((a, s) => a + overlapMinutes(new Date(s.startTime), new Date(s.endTime), night.start, night.end), 0) : null))
        .catch(() => null),
      h.readRecords('Weight', { timeRangeFilter: between(start, end), ascendingOrder: false, pageSize: 1 })
        .then((r) => (r.records[0] ? Math.round(r.records[0].weight.inKilograms * 10) / 10 : null))
        .catch(() => null),
    ]);
    out.push({ day, steps: steps == null ? null : Math.round(steps), activeKcal: kcal, sleepMinutes: sleep, weightKg: weight });
  }
  return out;
}

export async function readHealthWorkouts(fromDay: string, toDay: string): Promise<HealthWorkout[]> {
  const h = await init();
  if (!h) return [];
  try {
    const { records } = await h.readRecords('ExerciseSession', { timeRangeFilter: between(dayRange(fromDay).start, dayRange(toDay).end) });
    return records.map((r) => {
      const s = new Date(r.startTime);
      const e = new Date(r.endTime);
      const kind = TYPE_TO_KIND[r.exerciseType] ?? 'other';
      return {
        externalId: `hc:${r.metadata?.id ?? `${r.startTime}-${r.exerciseType}`}`,
        kind,
        label: r.title ?? (kind === 'other' ? 'Workout' : ''),
        start: s.toISOString(),
        end: e.toISOString(),
        minutes: Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
        kcal: null,
      };
    });
  } catch {
    return [];
  }
}

export async function writeHealthWorkout(w: WorkoutToWrite): Promise<boolean> {
  const h = await init();
  if (!h) return false;
  try {
    const startTime = w.start.toISOString();
    const endTime = w.end.toISOString();
    await h.insertRecords([
      { recordType: 'ExerciseSession', startTime, endTime, exerciseType: KIND_TO_TYPE[w.kind ?? 'strength'], title: w.title ?? 'BUILT workout' },
      ...(w.kcal ? [{ recordType: 'ActiveCaloriesBurned' as const, startTime, endTime, energy: { value: w.kcal, unit: 'kilocalories' as const } }] : []),
    ]);
    return true;
  } catch {
    return false;
  }
}

export function openHealthSettings(): void {
  try {
    lib()?.openHealthConnectSettings();
  } catch {
    /* nothing to open */
  }
}

const _parity: typeof WebHealth = { healthPlatform, healthAvailable, requestHealthPermissions, readHealthDays, readHealthWorkouts, writeHealthWorkout, openHealthSettings };
void _parity;
