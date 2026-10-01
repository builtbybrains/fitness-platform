/* Data layer: the app reads and writes the Supabase Postgres tables directly
   (no custom API), and mirrors everything to AsyncStorage.

   Three cases, decided per user id (see lib/cloud.ts):
   - device-only identity (no account, or no backend configured): the
     on-device mirror is the only store; Supabase is never called.
   - account, server reachable: writes go to Postgres and the mirror.
   - account, server unreachable: writes land in the mirror and the outbox,
     and upload on the next successful read or write (lib/outbox.ts).

   Writes always send the full intended state of a row (upserts), never a
   read-then-write, and writes to the same row run strictly in order. */

import { supabase } from './lib/supabase';
import { loadLocal, updateLocal } from './lib/localFallback';
import { isCloudUser } from './lib/cloud';
import { flushOutbox, pendingEntries, writeThrough } from './lib/outbox';
import { todayId } from './lib/dates';
import { DoneMap, DoneRow as PlanDoneRow, EMPTY_DONE } from './planData';

export type DoneRow = PlanDoneRow;

export type WeightEntry = { date: string; kg: number };

/** `offline`: an account whose server could not be reached (data came from
    the device). `local`: a device-only identity that never syncs. */
export type Source = { offline: boolean; local: boolean };

const LOCAL: Source = { offline: true, local: true };
const OFFLINE: Source = { offline: true, local: false };
const ONLINE: Source = { offline: false, local: false };

function dayOf(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, 10) : String(v).slice(0, 10);
}

function toDone(r: { workout_done?: unknown; exercises_done?: unknown; meals_done?: unknown }): DoneRow {
  return {
    workout: Boolean(r.workout_done),
    exercises: Array.isArray(r.exercises_done) ? (r.exercises_done as number[][]) : [],
    meals: Array.isArray(r.meals_done) ? (r.meals_done as string[]) : [],
  };
}

function inRange(map: DoneMap | null, startId: string, endId: string): DoneMap {
  const out: DoneMap = {};
  for (const [id, row] of Object.entries(map ?? {})) if (id >= startId && id <= endId) out[id] = row;
  return out;
}

// ─────────────────────── plan days (workout + meals) ───────────────────────

/** Completion rows for every day in [startId, endId]. Works for any range
    (a week, or a year of history for the streak). */
export async function fetchDoneRange(
  userId: string,
  startId: string,
  endId: string,
): Promise<{ done: DoneMap; offline: boolean; local: boolean }> {
  if (!isCloudUser(userId)) {
    return { done: inRange(await loadLocal<DoneMap>(userId, 'week'), startId, endId), ...LOCAL };
  }
  await flushOutbox(userId);
  const { data, error } = await supabase
    .from('plan_days')
    .select('day, workout_done, exercises_done, meals_done')
    .eq('user_id', userId)
    .gte('day', startId)
    .lte('day', endId)
    .limit(2000);
  if (error) {
    return { done: inRange(await loadLocal<DoneMap>(userId, 'week'), startId, endId), ...OFFLINE };
  }
  const done: DoneMap = {};
  for (const r of data ?? []) done[dayOf(r.day)] = toDone(r);
  // Writes still waiting in the outbox are newer than the server's copy.
  for (const [, e] of await pendingEntries(userId, 'plan_days:')) {
    const id = dayOf(e.op === 'upsert' ? e.row.day : e.match.day);
    if (id < startId || id > endId) continue;
    if (e.op === 'upsert') done[id] = toDone(e.row);
    else delete done[id];
  }
  await updateLocal<DoneMap>(userId, 'week', (prev) => ({ ...(prev ?? {}), ...done }));
  return { done, ...ONLINE };
}

/** Kept for existing callers; same as fetchDoneRange. */
export async function fetchWeekDone(
  userId: string,
  startId: string,
  endId: string,
): Promise<{ done: DoneMap | null; offline: boolean }> {
  return fetchDoneRange(userId, startId, endId);
}

export async function fetchDayDone(
  userId: string,
  dayId: string,
): Promise<{ done: DoneRow | null; offline: boolean }> {
  const { done, offline } = await fetchDoneRange(userId, dayId, dayId);
  return { done: done[dayId] ?? EMPTY_DONE, offline };
}

/** Save the full completion state of one day. Resolves true when it reached
    the server (false for device-only identities and while offline). */
export async function saveDayProgress(userId: string, dayId: string, next: DoneRow): Promise<boolean> {
  const row: DoneRow = { workout: next.workout, exercises: next.exercises, meals: next.meals };
  await updateLocal<DoneMap>(userId, 'week', (prev) => ({ ...(prev ?? {}), [dayId]: row }));
  if (!isCloudUser(userId)) return false;
  return writeThrough(userId, `plan_days:${dayId}`, {
    op: 'upsert',
    table: 'plan_days',
    onConflict: 'user_id,day',
    row: {
      user_id: userId,
      day: dayId,
      workout_done: row.workout,
      exercises_done: row.exercises,
      meals_done: row.meals,
    },
  });
}

/** Reset the given days to unchecked (used when a new plan replaces the
    old one; see planData.daysToClearOnRegenerate). Past days stay intact. */
export async function clearDaysProgress(userId: string, dayIds: string[]): Promise<boolean> {
  if (!dayIds.length) return true;
  await updateLocal<DoneMap>(userId, 'week', (prev) => {
    const next = { ...(prev ?? {}) };
    for (const id of dayIds) delete next[id];
    return next;
  });
  if (!isCloudUser(userId)) return false;
  const results = await Promise.all(
    dayIds.map((id) =>
      writeThrough(userId, `plan_days:${id}`, {
        op: 'delete',
        table: 'plan_days',
        match: { user_id: userId, day: id },
      }),
    ),
  );
  return results.every(Boolean);
}

// ─────────────────────────────── water ───────────────────────────────

export async function fetchWater(
  userId: string,
  dayId: string,
): Promise<{ count: number; offline: boolean; local: boolean }> {
  const localCount = async () => (await loadLocal<number>(userId, `water:${dayId}`)) ?? 0;
  if (!isCloudUser(userId)) return { count: await localCount(), ...LOCAL };
  await flushOutbox(userId);
  const { data, error } = await supabase
    .from('water')
    .select('count')
    .eq('user_id', userId)
    .eq('day', dayId)
    .maybeSingle();
  if (error) return { count: await localCount(), ...OFFLINE };
  let count = Number(data?.count ?? 0);
  for (const [, e] of await pendingEntries(userId, `water:${dayId}`)) {
    if (e.op === 'upsert') count = Number(e.row.count) || 0;
  }
  await updateLocal<number>(userId, `water:${dayId}`, () => count);
  return { count, ...ONLINE };
}

export async function saveWater(userId: string, dayId: string, count: number): Promise<boolean> {
  await updateLocal<number>(userId, `water:${dayId}`, () => count);
  if (!isCloudUser(userId)) return false;
  return writeThrough(userId, `water:${dayId}`, {
    op: 'upsert',
    table: 'water',
    onConflict: 'user_id,day',
    row: { user_id: userId, day: dayId, count },
  });
}

// ─────────────────────────────── weights ───────────────────────────────

function sortWeights(list: WeightEntry[]): WeightEntry[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export async function fetchWeights(
  userId: string,
): Promise<{ entries: WeightEntry[] | null; offline: boolean; local: boolean }> {
  if (!isCloudUser(userId)) {
    return { entries: (await loadLocal<WeightEntry[]>(userId, 'weights')) ?? [], ...LOCAL };
  }
  await flushOutbox(userId);
  const { data, error } = await supabase
    .from('weights')
    .select('day, kg')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(365);
  if (error) return { entries: (await loadLocal<WeightEntry[]>(userId, 'weights')) ?? [], ...OFFLINE };
  const byDay = new Map<string, number>();
  for (const r of data ?? []) byDay.set(dayOf(r.day), Number(r.kg));
  for (const [, e] of await pendingEntries(userId, 'weights:')) {
    if (e.op === 'upsert') byDay.set(dayOf(e.row.day), Number(e.row.kg));
  }
  const entries = sortWeights([...byDay].map(([date, kg]) => ({ date, kg })));
  await updateLocal<WeightEntry[]>(userId, 'weights', () => entries);
  return { entries, ...ONLINE };
}

export const WEIGHT_MIN_KG = 30;
export const WEIGHT_MAX_KG = 300;

/** Log a body weight for a day (one entry per day; a second save that day
    replaces the first). Works for accounts and device-only identities.
    Resolves true when it reached the server. Throws on an out-of-range kg. */
export async function saveWeight(userId: string, dayId: string, kg: number): Promise<boolean> {
  if (!Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
    throw new Error(`Weight should be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.`);
  }
  const value = Math.round(kg * 10) / 10;
  await updateLocal<WeightEntry[]>(userId, 'weights', (prev) =>
    sortWeights([...(prev ?? []).filter((e) => e.date !== dayId), { date: dayId, kg: value }]),
  );
  if (!isCloudUser(userId)) return false;
  return writeThrough(userId, `weights:${dayId}`, {
    op: 'upsert',
    table: 'weights',
    onConflict: 'user_id,day',
    row: { user_id: userId, day: dayId, kg: value },
  });
}

export { todayId };
