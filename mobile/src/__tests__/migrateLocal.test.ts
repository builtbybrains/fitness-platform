import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory AsyncStorage and a Supabase client with one profiles row, a
// session each test sets, and a log of every write.
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
    getAllKeys: async () => [...store.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)),
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

const db = vi.hoisted(() => ({
  session: null as null | { access_token: string },
  profile: null as Record<string, unknown> | null,
  updateError: null as null | { code: string; message: string },
  updates: [] as Record<string, unknown>[],
  upserts: [] as { table: string; rows: unknown; opts: unknown }[],
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: db.session }, error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === 'profiles' ? db.profile : null, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              db.updates.push(patch);
              if (db.updateError) return { data: null, error: db.updateError };
              db.profile = { ...(db.profile ?? {}), ...patch };
              return { data: db.profile, error: null };
            },
          }),
        }),
      }),
      upsert: async (rows: unknown, opts: unknown) => {
        db.upserts.push({ table, rows, opts });
        return { error: null, status: 201 };
      },
      delete: () => ({ match: async () => ({ error: null, status: 204 }) }),
    }),
  },
}));

import { migrateLocalPerson } from '../api/migrateLocal';
import { logActivity } from '../api/activities';
import { saveDayProgress, saveWeight } from '../data';
import { loadLocal } from '../lib/localFallback';
import { forgetOutbox, pendingCount, pendingEntries } from '../lib/outbox';
import type { Activity } from '../types';

const LOCAL = 'local-ab12cd34';
const NEW = '11111111-2222-4333-8444-555555555555';

const answers = {
  name: 'Rami',
  birth_date: '1995-04-02',
  gender: 'male',
  height_cm: 180,
  weight_kg: 84,
  goal: 'lose_fat',
  timeline_months: 6,
  target_weight_kg: 78,
  train_location: 'gym',
  training_days: [1, 3, 5],
  waiver_version: '2026-09',
  waiver_accepted_at: '2026-09-01T08:00:00.000Z',
  onboarding_step: 'done',
  onboarding_done_at: '2026-09-01T08:05:00.000Z',
};

/** A person who used the app for weeks without an account. */
async function deviceOnlyPerson() {
  store.set('vital.localUser', JSON.stringify({ userId: LOCAL, name: 'Rami', profile: answers }));
  store.set('vital.localMode', '1');
  await saveWeight(LOCAL, '2026-10-05', 85.2);
  await saveWeight(LOCAL, '2026-10-12', 84.6);
  await saveWeight(LOCAL, '2026-10-19', 84.1);
  await logActivity(LOCAL, { kind: 'football', minutes: 45, effort: 'moderate', day: '2026-10-14' }, 84);
  await logActivity(LOCAL, { kind: 'padel', minutes: 60, effort: 'hard', day: '2026-10-17' }, 84);
  await saveDayProgress(LOCAL, '2026-10-19', { workout: true, exercises: [[0, 1, 2]], meals: ['Breakfast'] });
}

const localKeys = () => [...store.keys()].filter((k) => k.startsWith(`fallback:${LOCAL}:`));
const rowsOf = async (prefix: string) =>
  (await pendingEntries(NEW, prefix)).map(([, e]) => (e.op === 'upsert' ? e.row : null)) as Record<string, unknown>[];

beforeEach(async () => {
  await forgetOutbox(NEW);
  store.clear();
  db.session = null;
  db.profile = { id: NEW, name: '', onboarding_done_at: null };
  db.updateError = null;
  db.updates.length = 0;
  db.upserts.length = 0;
});

describe('moving a device-only person into a new account', () => {
  it('queues every log under the new id, carries the finished questionnaire and removes the old keys', async () => {
    await deviceOnlyPerson();
    expect(localKeys().length).toBeGreaterThan(0);

    // Offline right after sign-up (no session in the client yet): nothing
    // is sent, everything waits in the outbox.
    const res = await migrateLocalPerson(NEW);
    expect(res.migrated).toBe(true);

    // The profile patch went through saveProfilePatch with the answers that
    // skip the questionnaire.
    expect(db.updates).toHaveLength(1);
    const patch = db.updates[0];
    expect(patch.onboarding_done_at).toBe(answers.onboarding_done_at);
    expect(patch.waiver_accepted_at).toBe(answers.waiver_accepted_at);
    expect(patch.waiver_version).toBe(answers.waiver_version);
    expect(patch.birth_date).toBe(answers.birth_date);
    expect(patch.name).toBe('Rami');
    expect(patch).not.toHaveProperty('id');
    if (res.migrated) expect(res.profile.onboarding_done_at).toBe(answers.onboarding_done_at);

    // The outbox holds the rows the cloud path writes, under the new id.
    const weights = await rowsOf('weights:');
    expect(weights.map((r) => [r.day, r.kg]).sort()).toEqual([
      ['2026-10-05', 85.2],
      ['2026-10-12', 84.6],
      ['2026-10-19', 84.1],
    ]);
    const activities = await rowsOf('activities:');
    expect(activities.map((r) => [r.kind, r.minutes, r.day]).sort()).toEqual([
      ['football', 45, '2026-10-14'],
      ['padel', 60, '2026-10-17'],
    ]);
    const days = await rowsOf('plan_days:');
    expect(days).toEqual([{ user_id: NEW, day: '2026-10-19', workout_done: true, exercises_done: [[0, 1, 2]], meals_done: ['Breakfast'] }]);
    for (const r of [...weights, ...activities, ...days]) expect(r.user_id).toBe(NEW);
    // No weigh-in invented for today from the profile weight.
    expect(weights.every((r) => r.day !== new Date().toISOString().slice(0, 10) || r.kg !== 84)).toBe(true);
    expect(db.upserts).toHaveLength(0);

    // The queue is saved on the device, not only in memory.
    const saved = JSON.parse(store.get(`fallback:${NEW}:outbox`) ?? '{}');
    expect(Object.keys(saved)).toHaveLength(6);

    // Screens see the data at once under the new id.
    expect((await loadLocal<unknown[]>(NEW, 'weights'))?.length).toBe(3);
    const mirrored = (await loadLocal<Activity[]>(NEW, 'activities')) ?? [];
    expect(mirrored).toHaveLength(2);
    expect(mirrored.every((a) => a.pending)).toBe(true);
    expect((await loadLocal<Record<string, { workout: boolean }>>(NEW, 'week'))?.['2026-10-19']?.workout).toBe(true);

    // The old person is gone from the phone.
    expect(localKeys()).toEqual([]);
    expect(store.has('vital.localUser')).toBe(false);
    expect(store.has('vital.localMode')).toBe(false);
  });

  it('uploads the queue in one request per table once signed in', async () => {
    await deviceOnlyPerson();
    db.session = { access_token: 't' };
    const res = await migrateLocalPerson(NEW);
    expect(res.migrated).toBe(true);
    expect(db.upserts.map((u) => u.table).sort()).toEqual(['activities', 'plan_days', 'weights']);
    const weights = db.upserts.find((u) => u.table === 'weights');
    expect(weights?.rows).toHaveLength(3);
    expect(weights?.opts).toEqual({ onConflict: 'user_id,day' });
    expect(await pendingCount(NEW)).toBe(0);
  });

  it('moves nothing into an account that already finished the questionnaire', async () => {
    await deviceOnlyPerson();
    const before = localKeys().sort();
    db.session = { access_token: 't' };
    db.profile = { id: NEW, name: 'Maya', onboarding_done_at: '2026-01-10T10:00:00.000Z', weight_kg: 61 };

    const res = await migrateLocalPerson(NEW);
    expect(res).toEqual({ migrated: false, reason: 'account_onboarded' });
    expect(db.updates).toHaveLength(0);
    expect(db.upserts).toHaveLength(0);
    expect(await pendingCount(NEW)).toBe(0);
    expect([...store.keys()].some((k) => k.startsWith(`fallback:${NEW}:`) && !k.endsWith(':profile'))).toBe(false);
    // The device-only person keeps their data on the phone.
    expect(localKeys().sort()).toEqual(before);
    expect(store.has('vital.localUser')).toBe(true);
  });

  it('keeps everything on the phone when the profile cannot be saved', async () => {
    await deviceOnlyPerson();
    db.updateError = { code: 'BU014', message: 'Accept the waiver to finish.' };
    const res = await migrateLocalPerson(NEW);
    expect(res.migrated).toBe(false);
    expect(await pendingCount(NEW)).toBe(0);
    expect(localKeys().length).toBeGreaterThan(0);
    expect(store.has('vital.localUser')).toBe(true);
  });

  it('does nothing when nobody used the app without an account', async () => {
    expect(await migrateLocalPerson(NEW)).toEqual({ migrated: false, reason: 'no_local' });
    expect(db.updates).toHaveLength(0);
  });
});
