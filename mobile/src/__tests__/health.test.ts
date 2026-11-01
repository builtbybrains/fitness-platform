import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Beirut is UTC+3 in October: a workout that starts at 22:30 UTC on the
// 19th starts at 01:30 on the 20th there.
const tz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'Asia/Beirut';
});
afterAll(() => {
  process.env.TZ = tz;
});

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
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../api/device/health', () => ({
  healthAvailable: async () => true,
  healthPlatform: () => 'apple_health',
  requestHealthPermissions: async () => true,
  readHealthDays: async () => [],
  readHealthWorkouts: async () => [
    { kind: 'running', minutes: 40, label: 'Running', externalId: 'hk-1', kcal: 420, start: '2026-10-19T22:30:00Z' },
  ],
}));

import { syncHealth } from '../api/health';
import { localDayOf } from '../lib/dates';
import { loadLocal } from '../lib/localFallback';
import type { Activity } from '../types';

describe('health workouts land on the local day', () => {
  it('reads an instant as the local calendar day', () => {
    expect(localDayOf('2026-10-19T22:30:00Z')).toBe('2026-10-20');
    expect(localDayOf('2026-10-19T20:30:00Z')).toBe('2026-10-19');
  });

  it('files an imported late-evening UTC workout under the Beirut day', async () => {
    const r = await syncHealth('local-health1');
    expect(r.workouts).toBe(1);
    const list = (await loadLocal<Activity[]>('local-health1', 'activities')) ?? [];
    expect(list.map((a) => a.day)).toEqual(['2026-10-20']);
  });
});
