/* General activities (walking, football, padel …) with calories burned
   (MET × weight × hours, data/activities.ts). Works with and without an
   account, and offline: rows get their id on the device, are kept in the
   on-device mirror, and upload through the outbox. Activity calories show
   on Today and in Progress. */

import { supabase } from '../lib/supabase';
import { isCloudUser, newId } from '../lib/cloud';
import { loadLocal, updateLocal } from '../lib/localFallback';
import { flushOutbox, pendingEntries, writeThrough } from '../lib/outbox';
import { todayId } from '../lib/dates';
import { type ActivityKind, type Effort, isActivityKind, kcalFor, MAX_ACTIVITY_MINUTES } from '../data/activities';
import { ApiError } from './errors';
import type { Activity, ActivityInput } from '../types';

const LOCAL = 'activities';
const KEEP = 500;

function toRow(userId: string, a: Activity) {
  return {
    id: a.id,
    user_id: userId,
    day: a.day,
    kind: a.kind,
    label: a.label,
    minutes: a.minutes,
    effort: a.effort,
    kcal: a.kcal,
    source: a.source,
    external_id: a.external_id,
    created_at: a.created_at,
  };
}

function fromRow(r: Record<string, unknown>): Activity {
  return {
    id: String(r.id),
    day: String(r.day ?? '').slice(0, 10),
    kind: (isActivityKind(String(r.kind)) ? r.kind : 'other') as ActivityKind,
    label: String(r.label ?? ''),
    minutes: Math.round(Number(r.minutes) || 0),
    effort: (['easy', 'moderate', 'hard'].includes(String(r.effort)) ? r.effort : 'moderate') as Effort,
    kcal: Math.round(Number(r.kcal) || 0),
    source: r.source === 'health' ? 'health' : 'manual',
    external_id: r.external_id == null ? null : String(r.external_id),
    created_at: String(r.created_at ?? ''),
  };
}

function byNewest(a: Activity, b: Activity): number {
  return a.day === b.day ? (a.created_at < b.created_at ? 1 : -1) : a.day < b.day ? 1 : -1;
}

/** Log an activity. `weightKg` is the person's current weight (70 kg is
    used when unknown). Resolves the saved row (pending: true while it
    exists only on this device). */
export async function logActivity(
  userId: string,
  input: ActivityInput & { externalId?: string | null; source?: 'manual' | 'health'; kcal?: number | null; createdAt?: string },
  weightKg?: number | null,
): Promise<Activity> {
  if (!isActivityKind(input.kind)) throw new ApiError('bad_request', 'Pick an activity.', 400);
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > MAX_ACTIVITY_MINUTES) throw new ApiError('bad_request', 'Enter between 1 and 720 minutes.', 400);
  const effort: Effort = ['easy', 'moderate', 'hard'].includes(input.effort) ? input.effort : 'moderate';
  const draft: Activity = {
    id: newId(),
    day: input.day ?? todayId(),
    kind: input.kind,
    label: (input.label ?? '').trim().slice(0, 80),
    minutes,
    effort,
    kcal: input.kcal != null && input.kcal >= 0 ? Math.min(5000, Math.round(input.kcal)) : kcalFor(input.kind, minutes, effort, weightKg),
    source: input.source ?? 'manual',
    external_id: input.externalId ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
    pending: isCloudUser(userId) ? true : undefined,
  };
  const existing = draft.external_id ? ((await loadLocal<Activity[]>(userId, LOCAL)) ?? []).find((a) => a.external_id === draft.external_id) : undefined;
  if (existing) draft.id = existing.id;
  await updateLocal<Activity[]>(userId, LOCAL, (prev) => [draft, ...(prev ?? []).filter((a) => a.id !== draft.id)].sort(byNewest).slice(0, KEEP));
  if (!isCloudUser(userId)) return draft;
  const ok = await writeThrough(userId, `activities:${draft.id}`, {
    op: 'upsert',
    table: 'activities',
    onConflict: draft.external_id ? 'user_id,external_id' : 'id',
    row: toRow(userId, draft),
  });
  if (!ok) return draft;
  const stored = { ...draft, pending: undefined };
  await updateLocal<Activity[]>(userId, LOCAL, (prev) => (prev ?? []).map((a) => (a.id === draft.id ? stored : a)));
  return stored;
}

/** Activities between two local days (inclusive), newest first. */
export async function listActivities(userId: string, fromDay: string, toDay: string): Promise<{ activities: Activity[]; offline: boolean }> {
  const local = ((await loadLocal<Activity[]>(userId, LOCAL)) ?? []).filter((a) => a.day >= fromDay && a.day <= toDay);
  if (!isCloudUser(userId)) return { activities: local.sort(byNewest), offline: true };
  await flushOutbox(userId);
  const { data, error } = await supabase
    .from('activities')
    .select('id, day, kind, label, minutes, effort, kcal, source, external_id, created_at')
    .eq('user_id', userId)
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('day', { ascending: false })
    .limit(1000);
  if (error) return { activities: local.sort(byNewest), offline: true };
  const deleting = new Set<string>();
  for (const [, e] of await pendingEntries(userId, 'activities:')) if (e.op === 'delete' && e.match.id) deleting.add(e.match.id);
  const server = (data ?? []).map((r) => fromRow(r as Record<string, unknown>)).filter((a) => !deleting.has(a.id));
  const ids = new Set(server.map((a) => a.id));
  const merged = [...server, ...local.filter((a) => a.pending && !ids.has(a.id) && !deleting.has(a.id))].sort(byNewest);
  await updateLocal<Activity[]>(userId, LOCAL, (prev) => {
    const outside = (prev ?? []).filter((a) => a.day < fromDay || a.day > toDay);
    return [...merged, ...outside].sort(byNewest).slice(0, KEEP);
  });
  return { activities: merged, offline: false };
}

export async function deleteActivity(userId: string, id: string): Promise<void> {
  await updateLocal<Activity[]>(userId, LOCAL, (prev) => (prev ?? []).filter((a) => a.id !== id));
  if (!isCloudUser(userId)) return;
  await writeThrough(userId, `activities:${id}`, { op: 'delete', table: 'activities', match: { id, user_id: userId } });
}

/** Calories burned per day from a list. */
export function activityKcalByDay(list: readonly Activity[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of list) out[a.day] = (out[a.day] ?? 0) + a.kcal;
  return out;
}
