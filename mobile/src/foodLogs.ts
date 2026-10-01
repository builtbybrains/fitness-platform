/* Food-photo calorie logs: the analyze-meal Edge Function (vision model)
   estimates {label, kcal, protein, confidence} from a photo; the confirmed
   row lands in the food_logs table (RLS-scoped) and in the on-device
   mirror.

   Every row gets its id on the device, so an upload can be retried safely
   (the same id never becomes two rows). Rows logged while offline stay
   marked `pending` and upload on the next read; a server read MERGES with
   the mirror instead of replacing it, so nothing logged offline is lost.

   State lives in lib/foodCache.ts, keyed by user and day, so a log added in
   the Coach tab instantly shows up in the Today tab. */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from './lib/supabase';
import { loadLocal, updateLocal } from './lib/localFallback';
import { isCloudUser, newId } from './lib/cloud';
import { flushOutbox, pendingEntries, writeThrough } from './lib/outbox';
import { runSerial } from './lib/serial';
import { callFunction } from './lib/functions';
import { todayId } from './lib/dates';
import {
  cacheKey,
  Confidence,
  Estimate,
  FoodLog,
  FoodState,
  getFoodCache,
  mergeFoodLogs,
  publishFood,
  subscribeFood,
} from './lib/foodCache';
import { useAuth } from './auth';

export type { Estimate, FoodLog } from './lib/foodCache';
export { clearFoodCache } from './lib/foodCache';

const CONFIDENCE: Confidence[] = ['low', 'medium', 'high'];

function localKey(dayId: string) {
  return `foodLogs:${dayId}`;
}

function toLog(row: Record<string, unknown>): FoodLog {
  const confidence = CONFIDENCE.includes(row.confidence as Confidence) ? (row.confidence as Confidence) : 'medium';
  return {
    id: String(row.id),
    day: String(row.day ?? '').slice(0, 10),
    label: String(row.label ?? ''),
    kcal: Math.max(0, Math.round(Number(row.kcal) || 0)),
    protein: Math.max(0, Math.round(Number(row.protein) || 0)),
    confidence,
    created_at: String(row.created_at ?? ''),
  };
}

function toRow(userId: string, l: FoodLog) {
  return {
    id: l.id,
    user_id: userId,
    day: l.day,
    label: l.label,
    kcal: l.kcal,
    protein: l.protein,
    confidence: l.confidence,
    created_at: l.created_at || new Date().toISOString(),
  };
}

// ─────────────────────── vision estimate (Edge Function) ───────────────────────

export async function analyzeMealImage(imageBase64: string): Promise<Estimate> {
  const data = await callFunction<{ estimate?: Partial<Estimate> }>('analyze-meal', { imageBase64 });
  const est = data?.estimate;
  if (!est?.label) throw new Error("Couldn't read that photo. Try again in a moment.");
  const confidence = CONFIDENCE.includes(est.confidence as Confidence) ? (est.confidence as Confidence) : 'medium';
  return {
    label: String(est.label).slice(0, 120),
    kcal: Math.min(5000, Math.max(0, Math.round(Number(est.kcal) || 0))),
    protein: Math.min(300, Math.max(0, Math.round(Number(est.protein) || 0))),
    confidence,
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

export async function fetchFoodLogs(
  userId: string,
  dayId: string,
): Promise<{ logs: FoodLog[]; offline: boolean }> {
  if (!isCloudUser(userId)) {
    return { logs: (await loadLocal<FoodLog[]>(userId, localKey(dayId))) ?? [], offline: true };
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
      const stored = await upload(userId, l);
      if (stored) {
        await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) =>
          (prev ?? []).map((x) => (x.id === l.id ? stored : x)),
        );
      }
    }

    const { data, error } = await supabase
      .from('food_logs')
      .select('id, day, label, kcal, protein, confidence, created_at')
      .eq('user_id', userId)
      .eq('day', dayId)
      .order('created_at', { ascending: true });
    const mirror = (await loadLocal<FoodLog[]>(userId, localKey(dayId))) ?? [];
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

export async function saveFoodLog(userId: string, est: Estimate, dayId = todayId()): Promise<FoodLog> {
  const draft: FoodLog = {
    id: newId(),
    day: dayId,
    ...est,
    created_at: new Date().toISOString(),
    pending: isCloudUser(userId) ? true : undefined,
  };
  return runSerial(`food:${userId}:${dayId}`, async () => {
    await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) => [...(prev ?? []), draft]);
    if (!isCloudUser(userId)) return draft;
    const stored = await upload(userId, draft);
    if (!stored) return draft; // stays pending; uploads on the next read
    await updateLocal<FoodLog[]>(userId, localKey(dayId), (prev) =>
      (prev ?? []).map((x) => (x.id === draft.id ? stored : x)),
    );
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

// ─────────────────────── shared state (cross-tab) ───────────────────────────────

export async function refreshFoodLogs(userId: string, dayId: string): Promise<void> {
  const { logs } = await fetchFoodLogs(userId, dayId);
  publishFood({ key: cacheKey(userId, dayId), logs, loaded: true });
}

const EMPTY_STATE = (key: string): FoodState => ({ key, logs: [], loaded: false });

export function useFoodLogs(dayId = todayId()) {
  const { userId } = useAuth();
  const key = userId ? cacheKey(userId, dayId) : '';
  const [state, setState] = useState<FoodState>(() => getFoodCache(key) ?? EMPTY_STATE(key));

  // Follow the shared cache so Coach-tab adds update this screen live; only
  // accept state for this user and day.
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
    async (est: Estimate) => {
      if (!userId) return;
      const row = await saveFoodLog(userId, est, dayId);
      const k = cacheKey(userId, dayId);
      const current = getFoodCache(k)?.logs ?? [];
      publishFood({ key: k, logs: [...current.filter((l) => l.id !== row.id), row], loaded: true });
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
    add,
    remove,
  };
}
