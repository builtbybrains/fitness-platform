/* Apple Health / Health Connect, WEB version: not available. Metro picks
   health.ios.ts (HealthKit) and health.android.ts (Health Connect) on
   phones. The web build hides the health option (PRODUCT.md), so screens
   should check healthPlatform() before showing it.

   Import as `import { healthPlatform, … } from '../src/api/device/health'`;
   for syncing use syncHealth() from api/health.ts. */

import type { ActivityKind, HealthDayRead, HealthWorkout } from '../../types';

export type HealthPlatform = 'apple_health' | 'health_connect';

export type WorkoutToWrite = { start: Date; end: Date; kcal?: number | null; title?: string; kind?: ActivityKind };

/** Which health app this platform uses, or null (web). */
export function healthPlatform(): HealthPlatform | null {
  return null;
}

/** True when the health app is installed and usable (always false on web). */
export async function healthAvailable(): Promise<boolean> {
  return false;
}

/** Ask for read (steps, active calories, workouts, weight, sleep) and
    write (workouts) access. Resolves true when the request was shown. */
export async function requestHealthPermissions(): Promise<boolean> {
  return false;
}

/** Daily totals for each local day in [fromDay, toDay]. */
export async function readHealthDays(_fromDay: string, _toDay: string): Promise<HealthDayRead[]> {
  return [];
}

/** Workouts recorded in the health app in [fromDay, toDay]. */
export async function readHealthWorkouts(_fromDay: string, _toDay: string): Promise<HealthWorkout[]> {
  return [];
}

/** Save a finished BUILT workout to the health app. */
export async function writeHealthWorkout(_w: WorkoutToWrite): Promise<boolean> {
  return false;
}

/** Open the health app's settings for BUILT (to change access). */
export function openHealthSettings(): void {}
