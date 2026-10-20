import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory AsyncStorage and a Supabase client whose session and write
// result each test sets.
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

type WriteResult = { error: { code?: string; message?: string } | null; status: number };
const state = vi.hoisted(() => ({
  session: null as null | { access_token: string },
  result: { error: null, status: 201 } as WriteResult,
  sent: [] as { table: string; op: string; payload: unknown }[],
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: state.session }, error: null }) },
    from: (table: string) => ({
      upsert: async (row: unknown) => {
        state.sent.push({ table, op: 'upsert', payload: row });
        return state.result;
      },
      delete: () => ({
        match: async (m: unknown) => {
          state.sent.push({ table, op: 'delete', payload: m });
          return state.result;
        },
      }),
    }),
  },
}));

import { flushOutbox, forgetOutbox, pendingCount, pendingEntries, writeThrough, type OutboxEntry } from '../lib/outbox';

const USER = '11111111-2222-4333-8444-555555555555';
const entry: OutboxEntry = { op: 'upsert', table: 'plan_days', row: { user_id: USER, day: '2026-10-20', done: true }, onConflict: 'user_id,day' };

async function queueOne() {
  // Offline first: a thrown fetch keeps the entry.
  state.session = { access_token: 't' };
  const prev = state.result;
  state.result = { error: { message: 'TypeError: Failed to fetch' }, status: 0 };
  expect(await writeThrough(USER, 'plan_days:2026-10-20', entry)).toBe(false);
  state.result = prev;
  expect(await pendingCount(USER)).toBe(1);
  state.sent.length = 0;
}

beforeEach(async () => {
  await forgetOutbox(USER);
  store.clear();
  state.session = null;
  state.result = { error: null, status: 201 };
  state.sent.length = 0;
});

describe('outbox', () => {
  it('keeps the entry and sends nothing when there is no session', async () => {
    await queueOne();
    state.session = null;
    await flushOutbox(USER);
    expect(state.sent).toHaveLength(0);
    expect(await pendingCount(USER)).toBe(1);

    // A direct write with no session is queued too, not sent unsigned.
    expect(await writeThrough(USER, 'plan_days:2026-10-21', { ...entry, row: { ...entry.row, day: '2026-10-21' } })).toBe(false);
    expect(state.sent).toHaveLength(0);
    expect(await pendingCount(USER)).toBe(2);
  });

  it('keeps the entry when the write is refused for permission (42501)', async () => {
    await queueOne();
    state.result = { error: { code: '42501', message: 'permission denied for table plan_days' }, status: 401 };
    await flushOutbox(USER);
    expect(state.sent).toHaveLength(1);
    expect(await pendingCount(USER)).toBe(1);
  });

  it('keeps the entry on PostgREST JWT errors and on HTTP 401', async () => {
    await queueOne();
    for (const code of ['PGRST301', 'PGRST302', 'PGRST303']) {
      state.result = { error: { code, message: 'JWT expired' }, status: 401 };
      await flushOutbox(USER);
      expect(await pendingCount(USER)).toBe(1);
    }
    state.result = { error: { message: 'Unauthorized' }, status: 401 };
    await flushOutbox(USER);
    expect(await pendingCount(USER)).toBe(1);
  });

  it('drops the entry when the row itself is refused (23514)', async () => {
    await queueOne();
    state.result = { error: { code: '23514', message: 'new row violates check constraint' }, status: 400 };
    await flushOutbox(USER);
    expect(state.sent).toHaveLength(1);
    expect(await pendingCount(USER)).toBe(0);
  });

  it('removes the entry once the write lands', async () => {
    await queueOne();
    state.result = { error: null, status: 201 };
    await flushOutbox(USER);
    expect(state.sent).toEqual([{ table: 'plan_days', op: 'upsert', payload: entry.row }]);
    expect(await pendingCount(USER)).toBe(0);
    expect(await pendingEntries(USER, 'plan_days:')).toEqual([]);
  });
});
