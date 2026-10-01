/* Apple Health on iOS through @kingstinct/react-native-healthkit (Nitro
   module; needs a development or production build, not Expo Go). Same API
   as health.ts (web). Reads steps, active energy, workouts, body mass and
   sleep; writes workouts. Every call degrades to "not available" instead
   of throwing. */

import type { ActivityKind, HealthDayRead, HealthWorkout } from '../../types';
import { dayRange, daysBetween, nightRange, overlapMinutes } from './healthDays';
import type * as WebHealth from './health';
import type { HealthPlatform, WorkoutToWrite } from './health';

export type { HealthPlatform, WorkoutToWrite } from './health';

type HK = typeof import('@kingstinct/react-native-healthkit');

let hk: HK | null | undefined;
function kit(): HK | null {
  if (hk !== undefined) return hk;
  try {
    hk = require('@kingstinct/react-native-healthkit') as HK;
    if (!hk.isHealthDataAvailable()) hk = null;
  } catch {
    hk = null;
  }
  return hk;
}

const READ = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;
const WRITE = ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierActiveEnergyBurned'] as const;

// HKWorkoutActivityType raw values.
const TYPE_TO_KIND: Record<number, ActivityKind> = {
  52: 'walking', 37: 'running', 41: 'football', 6: 'basketball', 46: 'swimming', 13: 'cycling',
  31: 'padel', 34: 'padel', 48: 'padel', 79: 'padel', 24: 'hiking', 77: 'dancing', 78: 'dancing',
  50: 'strength', 20: 'strength',
};
const KIND_TO_TYPE: Record<ActivityKind, number> = {
  walking: 52, running: 37, football: 41, basketball: 6, swimming: 46, cycling: 13, padel: 31,
  hiking: 24, dancing: 77, strength: 50, other: 3000,
};

export function healthPlatform(): HealthPlatform | null {
  return kit() ? 'apple_health' : null;
}

export async function healthAvailable(): Promise<boolean> {
  return kit() !== null;
}

export async function requestHealthPermissions(): Promise<boolean> {
  const k = kit();
  if (!k) return false;
  try {
    return await k.requestAuthorization({ toRead: READ, toShare: WRITE });
  } catch {
    return false;
  }
}

async function sum(k: HK, id: 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierActiveEnergyBurned', unit: 'count' | 'kcal', start: Date, end: Date): Promise<number | null> {
  try {
    const res = await k.queryStatisticsForQuantity(id, ['cumulativeSum'], { filter: { date: { startDate: start, endDate: end } }, unit });
    const q = res.sumQuantity?.quantity;
    return q == null ? null : Math.round(q);
  } catch {
    return null;
  }
}

export async function readHealthDays(fromDay: string, toDay: string): Promise<HealthDayRead[]> {
  const k = kit();
  if (!k) return [];
  const out: HealthDayRead[] = [];
  for (const day of daysBetween(fromDay, toDay)) {
    const { start, end } = dayRange(day);
    const night = nightRange(day);
    const [steps, activeKcal] = await Promise.all([
      sum(k, 'HKQuantityTypeIdentifierStepCount', 'count', start, end),
      sum(k, 'HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', start, end),
    ]);
    let sleepMinutes: number | null = null;
    try {
      const samples = await k.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter: { date: { startDate: night.start, endDate: night.end } } });
      // 1 asleep (unspecified), 3 core, 4 deep, 5 REM; 0 in bed, 2 awake.
      const asleep = samples.filter((s) => [1, 3, 4, 5].includes(Number(s.value)));
      if (asleep.length) sleepMinutes = asleep.reduce((a, s) => a + overlapMinutes(new Date(s.startDate), new Date(s.endDate), night.start, night.end), 0);
    } catch {
      sleepMinutes = null;
    }
    let weightKg: number | null = null;
    try {
      const w = await k.queryQuantitySamples('HKQuantityTypeIdentifierBodyMass', { limit: 1, ascending: false, unit: 'kg', filter: { date: { startDate: start, endDate: end } } });
      weightKg = w[0]?.quantity != null ? Math.round(w[0].quantity * 10) / 10 : null;
    } catch {
      weightKg = null;
    }
    out.push({ day, steps, activeKcal, sleepMinutes, weightKg });
  }
  return out;
}

export async function readHealthWorkouts(fromDay: string, toDay: string): Promise<HealthWorkout[]> {
  const k = kit();
  if (!k) return [];
  try {
    const start = dayRange(fromDay).start;
    const end = dayRange(toDay).end;
    const list = await k.queryWorkoutSamples({ limit: 0, ascending: false, filter: { date: { startDate: start, endDate: end } } });
    return list.map((w) => {
      const s = new Date(w.startDate);
      const e = new Date(w.endDate);
      const kind = TYPE_TO_KIND[Number(w.workoutActivityType)] ?? 'other';
      const kcal = w.totalEnergyBurned?.quantity;
      return {
        externalId: `hk:${w.uuid}`,
        kind,
        label: kind === 'other' ? 'Workout' : '',
        start: s.toISOString(),
        end: e.toISOString(),
        minutes: Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
        kcal: kcal == null ? null : Math.round(kcal),
      };
    });
  } catch {
    return [];
  }
}

export async function writeHealthWorkout(w: WorkoutToWrite): Promise<boolean> {
  const k = kit();
  if (!k) return false;
  try {
    await k.saveWorkoutSample(KIND_TO_TYPE[w.kind ?? 'strength'] as Parameters<HK['saveWorkoutSample']>[0], [], w.start, w.end, w.kcal ? { energyBurned: w.kcal } : undefined);
    return true;
  } catch {
    return false;
  }
}

/** iOS has no deep link to one app's Health access; open the app's own
    Settings page, where Health access is listed. */
export function openHealthSettings(): void {
  try {
    const { Linking } = require('react-native') as typeof import('react-native');
    void Linking.openSettings();
  } catch {
    /* nothing to open */
  }
}

const _parity: typeof WebHealth = { healthPlatform, healthAvailable, requestHealthPermissions, readHealthDays, readHealthWorkouts, writeHealthWorkout, openHealthSettings };
void _parity;
