/* Moving a device-only person into an account.

   "Continue without an account" keeps everything on the phone under a
   `local-…` id (the profile in 'vital.localUser', every log in the
   `fallback:<id>:<kind>` mirror). When that person then creates an
   account, or signs into one that has not finished the questionnaire, the
   whole history comes with them instead of starting over:

   1. The profile answers go through saveProfilePatch, so the same rules
      as the database apply. onboarding_done_at, the waiver and the
      guardian consent come along, so the questionnaire is skipped.
   2. Every log becomes the row the cloud path already writes, under the
      new id, queued in the outbox (persisted before anything is deleted):
      plan_days, water, weights, activities, food_logs, checkins,
      coach_memory, ai_plans, plan_overrides and health_daily.
   3. The mirror is copied to the new id, so every screen shows the data
      at once, before the upload lands.
   4. Only then are the old person's keys and the device identity removed.
   5. The queue is uploaded in bulk (a few requests, not one per row).
      Whatever can't be sent now stays queued and uploads later.

   An account that already finished the questionnaire is never touched,
   and if the profile can't be saved nothing is moved or deleted, so the
   person can try again. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isCloudUser, isUuid, newId } from '../lib/cloud';
import { loadLocal, clearLocal, updateLocal } from '../lib/localFallback';
import { enqueue, flushOutboxBatched, type OutboxEntry } from '../lib/outbox';
import { foodLogRow, type FoodLog } from '../lib/foodCache';
import { weekStartOf, isPermutation, upgradePlan } from './plan';
import { activityRow } from './activities';
import { personKeys } from './account';
import { asApiError } from './errors';
import { emptyProfile, getProfile, saveProfilePatch } from './profile';
import type { DoneMap } from '../planData';
import type { WeightEntry } from '../data';
import type { Activity, Checkin, HealthDaily, MemoryFact, PlanOverrides, ProfilePatchV2, ProfileV2 } from '../types';

// The device-only identity (auth.tsx; the names predate BUILT).
const LOCAL_USER_KEY = 'vital.localUser';
const LOCAL_MODE_KEY = 'vital.localMode';
type StoredLocalUser = { userId: string; name: string; profile?: Partial<ProfileV2> };

export type MigrateResult =
  | { migrated: true; profile: ProfileV2; queued: number }
  | {
      migrated: false;
      /** no_local: nobody used the app without an account on this phone.
          nothing: they did, but saved nothing. account_onboarded: the
          account already has its own answers (never overwritten).
          failed: the profile couldn't be saved; nothing was moved. */
      reason: 'not_cloud' | 'no_local' | 'nothing' | 'account_onboarded' | 'failed';
      error?: string;
    };

/** Profile fields a person can set (everything but the id and the values
    the server derives). */
const PATCH_KEYS = Object.keys(emptyProfile('x')).filter((k) => !['id', 'age', 'last_active_at'].includes(k)) as (keyof ProfilePatchV2)[];

async function readLocalUser(): Promise<StoredLocalUser | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_USER_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredLocalUser) : null;
    return parsed?.userId && !isCloudUser(parsed.userId) ? parsed : null;
  } catch {
    return null;
  }
}

/** Every mirror kind stored for this person ('week', 'water:2026-10-20' …). */
async function localKinds(userId: string): Promise<string[]> {
  const prefix = `fallback:${userId}:`;
  try {
    return (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
  } catch {
    return [];
  }
}

function profilePatch(u: StoredLocalUser): ProfilePatchV2 {
  const src: Partial<ProfileV2> = { ...(u.profile ?? {}) };
  if (src.name == null && u.name) src.name = u.name;
  const patch: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) if (src[k] !== undefined) patch[k] = src[k];
  return patch as ProfilePatchV2;
}

const upsert = (table: string, onConflict: string, row: Record<string, unknown>, ignoreDuplicates = false): OutboxEntry =>
  ignoreDuplicates ? { op: 'upsert', table, onConflict, row, ignoreDuplicates } : { op: 'upsert', table, onConflict, row };

const factKey = (fact: string) => fact.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();

type Plan = { entries: [string, OutboxEntry][]; mirror: [string, (prev: unknown) => unknown][] };

/** The outbox rows and mirror writes for one mirror kind. Rows use the
    same shapes as the cloud write paths (data.ts, activities.ts,
    foodLogs.ts, plan.ts, health.ts), with user_id set to the new id. */
function planKind(kind: string, value: unknown, to: string, now: string): Plan {
  const entries: [string, OutboxEntry][] = [];
  const mirror: [string, (prev: unknown) => unknown][] = [];
  const day = kind.includes(':') ? kind.slice(kind.indexOf(':') + 1) : '';

  if (kind === 'week' && value && typeof value === 'object') {
    const done = value as DoneMap;
    for (const [id, row] of Object.entries(done)) {
      entries.push([
        `plan_days:${id}`,
        upsert('plan_days', 'user_id,day', { user_id: to, day: id, workout_done: !!row?.workout, exercises_done: row?.exercises ?? [], meals_done: row?.meals ?? [] }),
      ]);
    }
    mirror.push([kind, (prev) => ({ ...((prev as DoneMap | null) ?? {}), ...done })]);
  } else if (kind.startsWith('water:')) {
    const count = Math.round(Number(value) || 0);
    if (count > 0 && count <= 50) entries.push([kind, upsert('water', 'user_id,day', { user_id: to, day, count })]);
    mirror.push([kind, () => value]);
  } else if (kind === 'weights' && Array.isArray(value)) {
    const list = (value as WeightEntry[]).filter((w) => w?.date && Number.isFinite(w.kg) && w.kg >= 30 && w.kg <= 300);
    for (const w of list) entries.push([`weights:${w.date}`, upsert('weights', 'user_id,day', { user_id: to, day: w.date, kg: w.kg })]);
    mirror.push([
      kind,
      (prev) => {
        const mine = new Set(list.map((w) => w.date));
        return [...((prev as WeightEntry[] | null) ?? []).filter((w) => !mine.has(w.date)), ...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      },
    ]);
  } else if (kind === 'activities' && Array.isArray(value)) {
    const list = (value as Activity[]).map((a) => ({ ...a, id: isUuid(a.id) ? a.id : newId(), pending: true }));
    for (const a of list) {
      entries.push([`activities:${a.id}`, upsert('activities', a.external_id ? 'user_id,external_id' : 'id', activityRow(to, a))]);
    }
    mirror.push([kind, (prev) => mergeById(list, prev as Activity[] | null)]);
  } else if (kind.startsWith('foodLogs:') && Array.isArray(value)) {
    const list: FoodLog[] = (value as FoodLog[]).map((l) => ({ ...l, id: isUuid(l.id) ? l.id : newId(), pending: true }));
    for (const l of list) entries.push([`food_logs:${l.id}`, upsert('food_logs', 'id', foodLogRow(to, l))]);
    mirror.push([kind, (prev) => mergeById(list, prev as FoodLog[] | null)]);
  } else if (kind === 'checkins' && Array.isArray(value)) {
    const list = (value as Checkin[]).map((c) => ({ ...c, user_id: to }));
    for (const c of list) {
      // checkins makes its own id; one check-in per kind and day.
      entries.push([
        `checkins:${c.kind}:${c.day}`,
        upsert('checkins', 'user_id,kind,day', {
          user_id: to,
          kind: c.kind,
          day: c.day,
          weight_kg: c.weight_kg,
          measurements: c.measurements ?? {},
          answers: c.answers ?? {},
          photo_set_id: null,
          photo_ids: [],
          ai_summary: (c.ai_summary ?? '').slice(0, 4000),
          plan_changes: c.plan_changes ?? null,
          created_at: c.created_at || now,
          updated_at: c.updated_at || now,
        }),
      ]);
    }
    mirror.push([kind, (prev) => mergeById(list, prev as Checkin[] | null)]);
  } else if (kind === 'memory' && Array.isArray(value)) {
    const list = value as MemoryFact[];
    for (const m of list) {
      // coach_memory makes its own id and can't be updated: insert only.
      entries.push([`coach_memory:${factKey(m.fact)}`, upsert('coach_memory', 'user_id,fact_key', { user_id: to, fact: m.fact, category: m.category, source: m.source }, true)]);
    }
    mirror.push([kind, (prev) => mergeById(list, prev as MemoryFact[] | null)]);
  } else if (kind === 'aiPlan') {
    const plan = upgradePlan(value);
    if (plan) {
      entries.push(['ai_plans', upsert('ai_plans', 'user_id', { user_id: to, plan, kcal_target: plan.kcal_target, water_target: plan.water_target, updated_at: now })]);
      mirror.push([kind, () => plan]);
    }
  } else if (kind.startsWith('planOverrides:')) {
    const o = value as Partial<PlanOverrides> | null;
    if (o && isPermutation(o.day_order) && weekStartOf(day) === day) {
      const updated_at = o.updated_at || now;
      const swaps = o.exercise_swaps && typeof o.exercise_swaps === 'object' ? o.exercise_swaps : {};
      entries.push([`plan_overrides:${day}`, upsert('plan_overrides', 'user_id,week_start', { user_id: to, week_start: day, day_order: o.day_order, exercise_swaps: swaps, updated_at })]);
      mirror.push([kind, () => ({ week_start: day, day_order: o.day_order, exercise_swaps: swaps, updated_at })]);
    }
  } else if (kind === 'healthDaily' && Array.isArray(value)) {
    const list = value as HealthDaily[];
    for (const r of list) {
      entries.push([`health_daily:${r.day}`, upsert('health_daily', 'user_id,day', { user_id: to, day: r.day, steps: r.steps, active_kcal: r.active_kcal, sleep_minutes: r.sleep_minutes, source: r.source ?? '', updated_at: now })]);
    }
    mirror.push([kind, (prev) => [...list, ...((prev as HealthDaily[] | null) ?? []).filter((x) => !list.some((r) => r.day === x.day))]]);
  } else if (kind !== 'outbox' && kind !== 'profile') {
    // Device-only state with no table (meal swaps, the week's location,
    // milestones seen, the coach's note, chat copies): copy as is.
    mirror.push([kind, () => value]);
  }
  return { entries, mirror };
}

function mergeById<T extends { id: string }>(mine: readonly T[], prev: readonly T[] | null): T[] {
  const ids = new Set(mine.map((x) => x.id));
  return [...mine, ...(prev ?? []).filter((x) => !ids.has(x.id))];
}

/** Move the device-only person on this phone into the account `toUserId`
    (just created, or just signed into). See the header for the rules. */
export async function migrateLocalPerson(toUserId: string, opts: { upload?: boolean } = {}): Promise<MigrateResult> {
  if (!isCloudUser(toUserId)) return { migrated: false, reason: 'not_cloud' };
  const u = await readLocalUser();
  if (!u) return { migrated: false, reason: 'no_local' };
  const from = u.userId;
  const patch = profilePatch(u);
  const kinds = await localKinds(from);
  const answered = Object.entries(patch).some(([k, v]) => k !== 'name' || !!v);
  if (!answered && !kinds.length) return { migrated: false, reason: 'nothing' };

  // Never overwrite an account that has its own answers.
  let current: ProfileV2;
  try {
    current = await getProfile(toUserId);
  } catch (e) {
    return { migrated: false, reason: 'failed', error: asApiError(e).message };
  }
  if (current.onboarding_done_at) return { migrated: false, reason: 'account_onboarded' };

  // 1. The answers, validated. The weight history moves below, so the
  //    current weight isn't logged again as a weigh-in today.
  let profile = current;
  if (Object.keys(patch).length) {
    try {
      profile = await saveProfilePatch(toUserId, patch, { ...current, weight_kg: patch.weight_kg ?? current.weight_kg });
    } catch (e) {
      return { migrated: false, reason: 'failed', error: asApiError(e).message };
    }
  }

  // 2. Every log, queued under the new id (saved before anything is deleted).
  const now = new Date().toISOString();
  const entries: [string, OutboxEntry][] = [];
  const mirror: [string, (prev: unknown) => unknown][] = [];
  for (const kind of kinds) {
    const value = await loadLocal<unknown>(from, kind);
    if (value == null) continue;
    const p = planKind(kind, value, toUserId, now);
    entries.push(...p.entries);
    mirror.push(...p.mirror);
  }
  await enqueue(toUserId, entries);

  // 3. The same data on this phone under the new id, so screens show it now.
  for (const [kind, fn] of mirror) await updateLocal<unknown>(toUserId, kind, fn);

  // 4. Forget the device-only person.
  await clearLocal(from);
  await AsyncStorage.multiRemove([...personKeys(from), LOCAL_USER_KEY, LOCAL_MODE_KEY]).catch(() => {});

  // 5. Upload in bulk; anything left over stays queued for later.
  if (opts.upload !== false) await flushOutboxBatched(toUserId).catch(() => undefined);

  return { migrated: true, profile, queued: entries.length };
}
