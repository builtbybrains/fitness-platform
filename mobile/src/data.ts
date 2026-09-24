/* Data layer: the app reads and writes the Supabase Postgres tables directly
   (no custom API). Every write mirrors to AsyncStorage, and reads fall back
   to that mirror when the cloud is unreachable or unconfigured — the app
   keeps working offline and catches up when the cloud returns. */

import { supabase } from './lib/supabase';
import { loadLocal, saveLocal } from './lib/localFallback';
import { supabaseConfigured } from '../supabase.config';

export type DoneRow = {
  workout: boolean;
  exercises: number[][]; // per exercise: list of completed set indices
  meals: string[]; // completed meal slots
};

export type WeightEntry = { date: string; kg: number };

const EMPTY: DoneRow = { workout: false, exercises: [], meals: [] };

function todayId(): string {
  const d = new Date();
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─────────────────────── plan days (workout + meals) ───────────────────────

export async function fetchWeekDone(
  userId: string,
  startId: string,
  endId: string,
): Promise<{ done: Record<string, DoneRow> | null; offline: boolean }> {
  if (!supabaseConfigured) {
    const local = await loadLocal<Record<string, DoneRow>>(userId, 'week');
    return { done: local ?? {}, offline: true };
  }
  const { data, error } = await supabase
    .from('plan_days')
    .select('day, workout_done, exercises_done, meals_done')
    .eq('user_id', userId)
    .gte('day', startId)
    .lte('day', endId);
  if (error) {
    const local = await loadLocal<Record<string, DoneRow>>(userId, 'week');
    return { done: local ?? null, offline: true };
  }
  const done: Record<string, DoneRow> = {};
  for (const r of data ?? []) {
    const day = typeof r.day === 'string' ? r.day : String(r.day).slice(0, 10);
    done[day] = {
      workout: Boolean(r.workout_done),
      exercises: Array.isArray(r.exercises_done) ? r.exercises_done : [],
      meals: Array.isArray(r.meals_done) ? r.meals_done : [],
    };
  }
  return { done, offline: false };
}

export async function fetchDayDone(
  userId: string,
  dayId: string,
): Promise<{ done: DoneRow | null; offline: boolean }> {
  if (!supabaseConfigured) {
    const week = await loadLocal<Record<string, DoneRow>>(userId, 'week');
    return { done: week?.[dayId] ?? EMPTY, offline: true };
  }
  const { data, error } = await supabase
    .from('plan_days')
    .select('workout_done, exercises_done, meals_done')
    .eq('user_id', userId)
    .eq('day', dayId)
    .maybeSingle();
  if (error) {
    const week = await loadLocal<Record<string, DoneRow>>(userId, 'week');
    return { done: week?.[dayId] ?? null, offline: true };
  }
  if (!data) return { done: EMPTY, offline: false };
  return {
    done: {
      workout: Boolean(data.workout_done),
      exercises: Array.isArray(data.exercises_done) ? data.exercises_done : [],
      meals: Array.isArray(data.meals_done) ? data.meals_done : [],
    },
    offline: false,
  };
}

/** Read-modify-write so partial updates never wipe sibling fields. */
export async function saveDayProgress(
  userId: string,
  dayId: string,
  patch: { workout?: boolean; exercises?: number[][]; meals?: string[] },
): Promise<boolean> {
  const current = (await fetchDayDone(userId, dayId)).done ?? EMPTY;
  const next: DoneRow = {
    workout: patch.workout ?? current.workout,
    exercises: patch.exercises ?? current.exercises,
    meals: patch.meals ?? current.meals,
  };

  const week = (await loadLocal<Record<string, DoneRow>>(userId, 'week')) ?? {};
  week[dayId] = next;
  await saveLocal(userId, 'week', week);

  if (!supabaseConfigured) return false;
  const { error } = await supabase.from('plan_days').upsert(
    {
      user_id: userId,
      day: dayId,
      workout_done: next.workout,
      exercises_done: next.exercises,
      meals_done: next.meals,
    },
    { onConflict: 'user_id,day' },
  );
  return !error;
}

// ─────────────────────────────── water ───────────────────────────────

export async function fetchWater(userId: string, dayId: string): Promise<{ count: number; offline: boolean }> {
  if (!supabaseConfigured) {
    const local = await loadLocal<number>(userId, `water:${dayId}`);
    return { count: local ?? 0, offline: true };
  }
  const { data, error } = await supabase
    .from('water')
    .select('count')
    .eq('user_id', userId)
    .eq('day', dayId)
    .maybeSingle();
  if (error) {
    const local = await loadLocal<number>(userId, `water:${dayId}`);
    return { count: local ?? 0, offline: true };
  }
  return { count: data?.count ?? 0, offline: false };
}

export async function saveWater(userId: string, dayId: string, count: number): Promise<boolean> {
  await saveLocal(userId, `water:${dayId}`, count);
  if (!supabaseConfigured) return false;
  const { error } = await supabase
    .from('water')
    .upsert({ user_id: userId, day: dayId, count }, { onConflict: 'user_id,day' });
  return !error;
}

// ─────────────────────────────── weights ───────────────────────────────

export async function fetchWeights(userId: string): Promise<{ entries: WeightEntry[] | null; offline: boolean }> {
  if (!supabaseConfigured) {
    const local = await loadLocal<WeightEntry[]>(userId, 'weights');
    return { entries: local ?? [], offline: true };
  }
  const { data, error } = await supabase
    .from('weights')
    .select('day, kg')
    .eq('user_id', userId)
    .order('day', { ascending: true })
    .limit(365);
  if (error) {
    const local = await loadLocal<WeightEntry[]>(userId, 'weights');
    return { entries: local, offline: true };
  }
  const entries = (data ?? []).map((r) => ({
    date: typeof r.day === 'string' ? r.day : String(r.day).slice(0, 10),
    kg: Number(r.kg),
  }));
  return { entries, offline: false };
}

export async function saveWeight(userId: string, dayId: string, kg: number): Promise<boolean> {
  const { entries } = await fetchWeights(userId);
  const list = (entries ?? []).filter((e) => e.date !== dayId);
  list.push({ date: dayId, kg });
  list.sort((a, b) => (a.date < b.date ? -1 : 1));
  await saveLocal(userId, 'weights', list);

  if (!supabaseConfigured) return false;
  const { error } = await supabase
    .from('weights')
    .upsert({ user_id: userId, day: dayId, kg }, { onConflict: 'user_id,day' });
  return !error;
}

export { todayId };
