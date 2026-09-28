/* Food-photo calorie logs: the analyze-meal Edge Function (vision model)
   estimates {label, kcal, protein, confidence} from a photo; the confirmed
   row lands in the food_logs table (RLS-scoped), mirrored locally for
   offline — same pattern as the rest of the data layer.

   State lives in a module-level cache with listeners so a log added in the
   Coach tab instantly shows up in the Today tab's ring and photo log card. */

import { useCallback, useEffect, useState } from 'react';

import { supabase } from './lib/supabase';
import { loadLocal, saveLocal } from './lib/localFallback';
import { supabaseConfigured } from '../supabase.config';
import { todayId } from './data';
import { useAuth } from './auth';

export type Estimate = {
  label: string;
  kcal: number;
  protein: number;
  confidence: 'low' | 'medium' | 'high';
};

export type FoodLog = Estimate & {
  id: string;
  day: string;
  created_at: string;
};

const CONFIDENCE: Estimate['confidence'][] = ['low', 'medium', 'high'];

function localKey(dayId: string) {
  return `foodLogs:${dayId}`;
}

function toLog(row: Record<string, unknown>): FoodLog {
  const confidence = CONFIDENCE.includes(row.confidence as Estimate['confidence'])
    ? (row.confidence as Estimate['confidence'])
    : 'medium';
  return {
    id: String(row.id),
    day: typeof row.day === 'string' ? row.day.slice(0, 10) : String(row.day).slice(0, 10),
    label: String(row.label ?? ''),
    kcal: Math.max(0, Math.round(Number(row.kcal) || 0)),
    protein: Math.max(0, Math.round(Number(row.protein) || 0)),
    confidence,
    created_at: String(row.created_at ?? ''),
  };
}

// ─────────────────────── vision estimate (Edge Function) ───────────────────────

export async function analyzeMealImage(imageBase64: string): Promise<Estimate> {
  const { data, error } = await supabase.functions.invoke('analyze-meal', {
    body: { imageBase64 },
  });
  if (error) throw new Error(error.message || 'The vision model is busy right now — try again in a moment.');
  if (data?.error) throw new Error(String(data.error));
  const est = data?.estimate;
  if (!est?.label) throw new Error('Could not read that photo — try again in a moment.');
  const confidence = CONFIDENCE.includes(est.confidence) ? est.confidence : 'medium';
  return {
    label: String(est.label).slice(0, 120),
    kcal: Math.min(5000, Math.max(0, Math.round(Number(est.kcal) || 0))),
    protein: Math.min(300, Math.max(0, Math.round(Number(est.protein) || 0))),
    confidence,
  };
}

// ─────────────────────────────── data layer ───────────────────────────────

export async function fetchFoodLogs(
  userId: string,
  dayId: string,
): Promise<{ logs: FoodLog[]; offline: boolean }> {
  if (!supabaseConfigured) {
    const local = await loadLocal<FoodLog[]>(userId, localKey(dayId));
    return { logs: local ?? [], offline: true };
  }
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('day', dayId)
    .order('created_at', { ascending: true });
  if (error) {
    const local = await loadLocal<FoodLog[]>(userId, localKey(dayId));
    return { logs: local ?? [], offline: true };
  }
  const logs = (data ?? []).map((r) => toLog(r as Record<string, unknown>));
  await saveLocal(userId, localKey(dayId), logs);
  return { logs, offline: false };
}

export async function saveFoodLog(
  userId: string,
  est: Estimate,
  dayId = todayId(),
): Promise<FoodLog> {
  const localRow: FoodLog = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    day: dayId,
    ...est,
    created_at: new Date().toISOString(),
  };
  const list = (await loadLocal<FoodLog[]>(userId, localKey(dayId))) ?? [];
  list.push(localRow);
  await saveLocal(userId, localKey(dayId), list);

  if (!supabaseConfigured) return localRow;
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
      user_id: userId,
      day: dayId,
      label: est.label,
      kcal: est.kcal,
      protein: est.protein,
      confidence: est.confidence,
    })
    .select()
    .maybeSingle();
  if (error || !data) return localRow;
  const row = toLog(data as Record<string, unknown>);
  // Mirror holds the cloud row (real id) once the insert lands.
  await saveLocal(
    userId,
    localKey(dayId),
    list.map((l) => (l.id === localRow.id ? row : l)),
  );
  return row;
}

export async function deleteFoodLog(userId: string, id: string, dayId: string): Promise<boolean> {
  const list = (await loadLocal<FoodLog[]>(userId, localKey(dayId))) ?? [];
  await saveLocal(userId, localKey(dayId), list.filter((l) => l.id !== id));
  if (!supabaseConfigured || id.startsWith('local-')) return false;
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  return !error;
}

// ─────────────────────── shared state (cross-tab) ───────────────────────────────

type FoodState = { logs: FoodLog[]; loaded: boolean };

let cache: FoodState | null = null;
const listeners = new Set<(s: FoodState) => void>();

function publish(s: FoodState) {
  cache = s;
  for (const l of listeners) l(s);
}

export async function refreshFoodLogs(userId: string, dayId: string): Promise<void> {
  const { logs } = await fetchFoodLogs(userId, dayId);
  publish({ logs, loaded: true });
}

export function useFoodLogs(dayId = todayId()) {
  const { userId } = useAuth();
  const [state, setState] = useState<FoodState>(() => cache ?? { logs: [], loaded: false });

  // Subscribe to the shared cache so Coach-tab adds update this screen live.
  useEffect(() => {
    const listener = (s: FoodState) => setState(s);
    listeners.add(listener);
    setState(cache ?? { logs: [], loaded: false });
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refreshFoodLogs(userId, dayId);
  }, [userId, dayId]);

  const add = useCallback(
    async (est: Estimate) => {
      if (!userId) return;
      const row = await saveFoodLog(userId, est, dayId);
      publish({ logs: [...(cache?.logs ?? []), row], loaded: true });
    },
    [userId, dayId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!userId) return;
      publish({ logs: (cache?.logs ?? []).filter((l) => l.id !== id), loaded: true });
      await deleteFoodLog(userId, id, dayId);
    },
    [userId, dayId],
  );

  const logs = state.logs;
  return {
    logs,
    loaded: state.loaded,
    kcal: logs.reduce((a, l) => a + l.kcal, 0),
    protein: logs.reduce((a, l) => a + l.protein, 0),
    add,
    remove,
  };
}
