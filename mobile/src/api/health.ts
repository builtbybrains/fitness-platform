/* Health app sync: pulls the last few days from Apple Health or Health
   Connect into BUILT (daily steps, active calories and sleep into
   health_daily; workouts into activities, never twice; the latest weight
   into the weight history) and records the sync time on the profile.
   Native builds only: on the web it resolves { ok: false, reason: 'web' }.
   Opt-in: call enableHealthSync() from the Profile toggle or onboarding. */

import { Platform } from 'react-native';

import { supabase } from '../lib/supabase';
import { isCloudUser } from '../lib/cloud';
import { loadLocal, updateLocal } from '../lib/localFallback';
import { addDays, todayId } from '../lib/dates';
import { saveWeight } from '../data';
import { healthAvailable, healthPlatform, readHealthDays, readHealthWorkouts, requestHealthPermissions } from './device/health';
import { logActivity } from './activities';
import { getProfile, saveProfilePatch } from './profile';
import type { HealthDaily, HealthSyncResult, ProfileV2 } from '../types';

/** Ask for access and turn sync on. Resolves false when the health app
    isn't available or access wasn't given. */
export async function enableHealthSync(userId: string, profile?: ProfileV2): Promise<boolean> {
  if (Platform.OS === 'web' || !(await healthAvailable())) return false;
  const granted = await requestHealthPermissions();
  if (!granted) return false;
  const p = profile ?? (await getProfile(userId));
  await saveProfilePatch(userId, { health_sync: { ...p.health_sync, enabled: true, provider: healthPlatform() ?? undefined, write_workouts: true } }, p);
  return true;
}

export async function disableHealthSync(userId: string, profile?: ProfileV2): Promise<void> {
  const p = profile ?? (await getProfile(userId));
  await saveProfilePatch(userId, { health_sync: { ...p.health_sync, enabled: false } }, p);
}

/** Pull the last `days` days (default 7). Safe to call on every app open. */
export async function syncHealth(userId: string, opts: { days?: number; weightKg?: number | null } = {}): Promise<HealthSyncResult> {
  if (Platform.OS === 'web') return { ok: false, days: 0, workouts: 0, weights: 0, reason: 'web' };
  if (!(await healthAvailable())) return { ok: false, days: 0, workouts: 0, weights: 0, reason: 'unavailable' };
  const today = todayId();
  const from = addDays(today, -Math.max(0, Math.min(30, (opts.days ?? 7) - 1)));
  const source = healthPlatform() ?? '';
  const [days, workouts] = await Promise.all([readHealthDays(from, today), readHealthWorkouts(from, today)]);

  const rows: HealthDaily[] = days.map((d) => ({ day: d.day, steps: d.steps, active_kcal: d.activeKcal, sleep_minutes: d.sleepMinutes, source }));
  await updateLocal<HealthDaily[]>(userId, 'healthDaily', (prev) => {
    const keep = (prev ?? []).filter((r) => !rows.some((x) => x.day === r.day));
    return [...rows, ...keep].sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 120);
  });
  if (isCloudUser(userId) && rows.length) {
    const { error } = await supabase.from('health_daily').upsert(
      rows.map((r) => ({ user_id: userId, ...r, updated_at: new Date().toISOString() })),
      { onConflict: 'user_id,day' },
    );
    if (error) console.warn('[health] health_daily:', error.message);
  }

  let imported = 0;
  for (const w of workouts) {
    // BUILT's own workouts written to the health app come back here; skip them.
    if (/^BUILT/i.test(w.label)) continue;
    await logActivity(
      userId,
      { kind: w.kind, minutes: Math.min(720, w.minutes), effort: 'moderate', day: w.start.slice(0, 10), label: w.label, externalId: w.externalId, source: 'health', kcal: w.kcal, createdAt: w.start },
      opts.weightKg,
    ).then(() => imported++).catch(() => undefined);
  }

  let weights = 0;
  for (const d of days) {
    if (d.weightKg != null && d.weightKg >= 30 && d.weightKg <= 300) {
      if (await saveWeight(userId, d.day, d.weightKg).catch(() => false)) weights++;
    }
  }

  try {
    const p = await getProfile(userId);
    await saveProfilePatch(userId, { health_sync: { ...p.health_sync, last_sync_at: new Date().toISOString() } }, p);
  } catch {
    /* the sync itself worked */
  }
  return { ok: true, days: rows.length, workouts: imported, weights };
}

/** Daily health totals between two days, newest first. */
export async function getHealthDays(userId: string, fromDay: string, toDay: string): Promise<HealthDaily[]> {
  const local = ((await loadLocal<HealthDaily[]>(userId, 'healthDaily')) ?? []).filter((r) => r.day >= fromDay && r.day <= toDay);
  if (!isCloudUser(userId)) return local;
  const { data, error } = await supabase
    .from('health_daily')
    .select('day, steps, active_kcal, sleep_minutes, source')
    .eq('user_id', userId)
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('day', { ascending: false });
  return error ? local : ((data ?? []) as HealthDaily[]);
}
