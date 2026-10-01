/* Food logs: everything eaten outside the plan (a photo, typed food, a meal
   made from what's at home) with all macros. The person confirms or edits
   the estimate first (api/food.ts makes it); the confirmed row lands in
   the food_logs table (RLS-scoped, v2 columns: carbs, fat, source, slot,
   items, follow_up) and in the on-device mirror. Off-plan food counts
   toward the day's calories.

   Every row gets its id on the device, so an upload can be retried safely
   (the same id never becomes two rows). Rows logged while offline stay
   marked `pending` and upload on the next read; a server read MERGES with
   the mirror instead of replacing it, so nothing logged offline is lost.

   State lives in lib/foodCache.ts, keyed by user and day, so a log added on
   the Food screens instantly shows up on Today. */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from './lib/supabase';
import { loadLocal, updateLocal } from './lib/localFallback';
import { isCloudUser, newId } from './lib/cloud';
import { flushOutbox, pendingEntries, writeThrough } from './lib/outbox';
import { runSerial } from './lib/serial';
import { addDays, todayId } from './lib/dates';
import {
  cacheKey,
  Confidence,
  Estimate,
  FoodLog,
  FoodSource,
  FoodState,
  getFoodCache,
  MealSlot,
  mergeFoodLogs,
  publishFood,
  subscribeFood,
} from './lib/foodCache';
import { useAuth } from './auth';

export type { Estimate, FoodLog } from './lib/foodCache';
export { clearFoodCache } from './lib/foodCache';

const CONFIDENCE: Confidence[] = ['low', 'medium', 'high'];
const SOURCES: FoodSource[] = ['photo', 'text', 'plan', 'generated'];
const SLOTS: MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const COLUMNS = 'id, day, label, kcal, protein, carbs, fat, confidence, source, slot, items, follow_up, created_at';

function localKey(dayId: string) {
  return `foodLogs:${dayId}`;
}

function n(v: unknown, hi: number): number {
  return Math.min(hi, Math.max(0, Math.round(Number(v) || 0)));
}

function toLog(row: Record<string, unknown>): FoodLog {
  const confidence = CONFIDENCE.includes(row.confidence as Confidence) ? (row.confidence as Confidence) : 'medium';
  return {
    id: String(row.id),
    day: String(row.day ?? '').slice(0, 10),
    label: String(row.label ?? ''),
    kcal: n(row.kcal, 5000),
    protein: n(row.protein, 300),
    carbs: n(row.carbs, 1000),
    fat: n(row.fat, 500),
    confidence,
    source: SOURCES.includes(row.source as FoodSource) ? (row.source as FoodSource) : 'photo',
    slot: SLOTS.includes(row.slot as MealSlot) ? (row.slot as MealSlot) : '',
    items: Array.isArray(row.items) ? (row.items as FoodLog['items']) : [],
    followUp: Array.isArray(row.follow_up) ? (row.follow_up as FoodLog['followUp']) : Array.isArray(row.followUp) ? (row.followUp as FoodLog['followUp']) : [],
    created_at: String(row.created_at ?? ''),
  };
}

function toRow(userId: string, l: FoodLog) {
  return {
    id: l.id,
    user_id: userId,
    day: l.day,
    label: l.label.slice(0, 120),
    kcal: n(l.kcal, 5000),
    protein: n(l.protein, 300),
    carbs: n(l.carbs, 1000),
    fat: n(l.fat, 500),
    confidence: l.confidence,
    source: l.source ?? 'photo',
    slot: l.slot ?? '',
    follow_up: (l.followUp ?? []).slice(0, 5),
    items: (l.items ?? []).slice(0, 15),
    created_at: l.created_at || new Date().toISOString(),
  };
}

// ─────────────────────────────── data layer ───────────────────────────────

/** Upload one pending row. Resolves the stored row, or null if offline. */
async function upload(userId: string, l: FoodLog): Promise<FoodLog | null> {
  const row = toRow(userId, l);
  const ok = await writeThrough(userId, `food_logs:${row.id}`, {
    op: 'upsert',
    table: 'food_logs',
    onConflict: 'id',
    row,
  });
  return ok ? { ...toLog(row), pending: undefined } : null;
}

function fromMirror(rows: FoodLog[] | null): FoodLog[] {
  return (rows ?? []).map((r) => ({ ...toLog(r as unknown as Record<string, unknown>), pending: r.pending }));
}

export async function fetchFoodLogs(userId: string, dayId: string): Promise<{ logs: FoodLog[]; offline: boolean }> {
  if (!isCloudUser(userId)) {
    return { logs: fromMirror(await loadLocal<FoodLog[]>(userId, localKey(dayId))), offline: true };
  }
  return runSerial(`food:${userId}:${dayId}`, async () => {
    await flushOutbox(userId);
    // Rows saved by older builds carry a `local-…` id; give them a real id
    // once, before uploading, so a retry can never create a second row.
    const local = await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) =>
      (prev ?? []).map((x) => (x.id.startsWith('local-') ? { ...x, id: newId(), pending: true } : x)),
    );
    // Upload rows that were logged while offline (or whose upload failed).
    for (const l of local) {
      if (!l.pending) continue;
      const stored = await upload(userId, toLog(l as unknown as Record<string, unknown>));
      if (stored) {
        await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) => (prev ?? []).map((x) => (x.id === l.id ? stored : x)));
      }
    }

    const { data, error } = await supabase.from('food_logs').select(COLUMNS).eq('user_id', userId).eq('day', dayId).order('created_at', { ascending: true });
    const mirror = fromMirror(await loadLocal<FoodLog[]>(userId, localKey(dayId)));
    if (error) return { logs: mirror, offline: true };

    const deleting = new Set<string>();
    for (const [, e] of await pendingEntries(userId, 'food_logs:')) {
      if (e.op === 'delete' && e.match.id) deleting.add(e.match.id);
    }
    const server = (data ?? []).map((r) => toLog(r as Record<string, unknown>));
    const logs = mergeFoodLogs(server, mirror, deleting);
    await updateLocal<FoodLog[]>(userId, localKey(dayId), () => logs);
    return { logs, offline: false };
  });
}

/** Food logs for every day in [from, to] (for Progress). Server first, the
    device mirror when offline or without an account. */
export async function fetchFoodRange(userId: string, from: string, to: string): Promise<{ logs: FoodLog[]; offline: boolean }> {
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 62; d = addDays(d, 1)) days.push(d);
  const mirror = async () => (await Promise.all(days.map((d) => loadLocal<FoodLog[]>(userId, localKey(d))))).flatMap((r) => fromMirror(r));
  if (!isCloudUser(userId)) return { logs: await mirror(), offline: true };
  const { data, error } = await supabase.from('food_logs').select(COLUMNS).eq('user_id', userId).gte('day', from).lte('day', to).limit(2000);
  if (error) return { logs: await mirror(), offline: true };
  const server = (data ?? []).map((r) => toLog(r as Record<string, unknown>));
  const ids = new Set(server.map((l) => l.id));
  const pending = (await mirror()).filter((l) => l.pending && !ids.has(l.id));
  return { logs: [...server, ...pending], offline: false };
}

export async function saveFoodLog(userId: string, est: Estimate, dayId = todayId()): Promise<FoodLog> {
  const draft: FoodLog = {
    ...est,
    id: newId(),
    day: dayId,
    label: est.label.trim().slice(0, 120) || 'Food',
    kcal: n(est.kcal, 5000),
    protein: n(est.protein, 300),
    carbs: n(est.carbs, 1000),
    fat: n(est.fat, 500),
    source: est.source ?? 'text',
    slot: est.slot ?? '',
    items: (est.items ?? []).slice(0, 15),
    followUp: (est.followUp ?? []).slice(0, 5),
    created_at: new Date().toISOString(),
    pending: isCloudUser(userId) ? true : undefined,
  };
  return runSerial(`food:${userId}:${dayId}`, async () => {
    await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) => [...(prev ?? []), draft]);
    if (!isCloudUser(userId)) return draft;
    const stored = await upload(userId, draft);
    if (!stored) return draft; // stays pending; uploads on the next read
    await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) => (prev ?? []).map((x) => (x.id === draft.id ? stored : x)));
    return stored;
  });
}

export async function deleteFoodLog(userId: string, id: string, dayId: string): Promise<boolean> {
  return runSerial(`food:${userId}:${dayId}`, async () => {
    await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) => (prev ?? []).filter((l) => l.id !== id));
    if (!isCloudUser(userId) || id.startsWith('local-')) return false;
    return writeThrough(userId, `food_logs:${id}`, {
      op: 'delete',
      table: 'food_logs',
      match: { id, user_id: userId },
    });
  });
}

// ─────────────────────── shared state (cross-screen) ───────────────────────

export async function refreshFoodLogs(userId: string, dayId: string): Promise<void> {
  const { logs } = await fetchFoodLogs(userId, dayId);
  publishFood({ key: cacheKey(userId, dayId), logs, loaded: true });
}

const EMPTY_STATE = (key: string): FoodState => ({ key, logs: [], loaded: false });

export function useFoodLogs(dayId = todayId()) {
  const { userId } = useAuth();
  const key = userId ? cacheKey(userId, dayId) : '';
  const [state, setState] = useState<FoodState>(() => getFoodCache(key) ?? EMPTY_STATE(key));

  // Follow the shared cache so adds on another screen update this one live;
  // only accept state for this user and day.
  useEffect(() => {
    setState(getFoodCache(key) ?? EMPTY_STATE(key));
    return subscribeFood((s) => {
      if (s === null) setState(EMPTY_STATE(key));
      else if (s.key === key) setState(s);
    });
  }, [key]);

  useEffect(() => {
    if (!userId) return;
    void refreshFoodLogs(userId, dayId);
  }, [userId, dayId]);

  const add = useCallback(
    async (est: Estimate): Promise<FoodLog | null> => {
      if (!userId) return null;
      const row = await saveFoodLog(userId, est, dayId);
      const k = cacheKey(userId, dayId);
      const current = getFoodCache(k)?.logs ?? [];
      publishFood({ key: k, logs: [...current.filter((l) => l.id !== row.id), row], loaded: true });
      return row;
    },
    [userId, dayId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!userId) return;
      const k = cacheKey(userId, dayId);
      publishFood({ key: k, logs: (getFoodCache(k)?.logs ?? []).filter((l) => l.id !== id), loaded: true });
      await deleteFoodLog(userId, id, dayId);
    },
    [userId, dayId],
  );

  const logs = state.key === key ? state.logs : [];
  return {
    logs,
    loaded: state.key === key && state.loaded,
    kcal: logs.reduce((a, l) => a + l.kcal, 0),
    protein: logs.reduce((a, l) => a + l.protein, 0),
    carbs: logs.reduce((a, l) => a + (l.carbs || 0), 0),
    fat: logs.reduce((a, l) => a + (l.fat || 0), 0),
    add,
    remove,
  };
}
