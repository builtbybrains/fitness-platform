import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const invoked = vi.hoisted(() => ({ calls: [] as { name: string; body: unknown }[], result: { data: null as unknown, error: null as unknown } }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: async (name: string, opts: { body: unknown }) => {
        invoked.calls.push({ name, body: opts.body });
        return invoked.result;
      },
    },
  },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { clearPersonOnDevice, deleteAccount, deleteConfirmed, forgetDeviceIdentity } from '../api/account';
import { ApiError, errorBody } from '../api/errors';

const USER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-2222-4333-8444-555555555555';

beforeEach(() => {
  store.clear();
  invoked.calls.length = 0;
  invoked.result = { data: null, error: null };
});

describe('delete confirmation', () => {
  it('needs DELETE exactly, ignoring spaces around it', () => {
    expect(deleteConfirmed('DELETE')).toBe(true);
    expect(deleteConfirmed('  DELETE ')).toBe(true);
    expect(deleteConfirmed('delete')).toBe(false);
    expect(deleteConfirmed('DELET')).toBe(false);
    expect(deleteConfirmed('')).toBe(false);
  });
});

describe('function error bodies', () => {
  it('reads the flat and the nested shape', () => {
    expect(errorBody({ error: 'Add your date of birth in Profile to use the coach and plans.', code: 'age_required' })).toEqual({
      message: 'Add your date of birth in Profile to use the coach and plans.',
      code: 'age_required',
    });
    expect(errorBody({ error: { code: 'delete_failed', message: 'Try again.' } })).toEqual({ message: 'Try again.', code: 'delete_failed' });
    expect(errorBody({ ok: true })).toEqual({});
  });
});

function httpError(status: number, body: unknown) {
  const res = new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  return { data: null, error: { name: 'FunctionsHttpError', context: res } };
}

describe('deleteAccount', () => {
  it('posts the confirmation and resolves on ok', async () => {
    invoked.result = { data: { ok: true, removed: { plans: 1 } }, error: null };
    await expect(deleteAccount(USER)).resolves.toEqual({ ok: true, removed: { plans: 1 } });
    expect(invoked.calls).toEqual([{ name: 'delete-account', body: { confirm: 'DELETE' } }]);
  });

  it("throws the server's message from either error shape", async () => {
    invoked.result = httpError(500, { error: { code: 'delete_failed', message: "We couldn't delete everything. Try again." } });
    await expect(deleteAccount(USER)).rejects.toMatchObject({ message: "We couldn't delete everything. Try again.", status: 500 });
    invoked.result = httpError(401, { error: 'Your session has ended. Sign in again to continue.', code: 'session_expired' });
    await expect(deleteAccount(USER)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('shows the age message on a 403 age_required', async () => {
    invoked.result = httpError(403, { error: 'Add your date of birth in Profile to use the coach and plans.', code: 'age_required' });
    const e = await deleteAccount(USER).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: 'age_required', message: 'Add your date of birth in Profile to use the coach and plans.', status: 403 });
  });

  it('never calls the server for a device-only identity', async () => {
    await expect(deleteAccount('local-abc12345')).rejects.toMatchObject({ code: 'needs_account' });
    expect(invoked.calls).toHaveLength(0);
  });
});

describe('clearing the phone', () => {
  it("removes this person's keys and keeps everyone else's", async () => {
    for (const k of [`fallback:${USER}:aiPlan`, `fallback:${USER}:outbox`, `coach:lastThread:${USER}`, `coach:remaining:${USER}`, `built.signupPhotoSet:${USER}`]) store.set(k, '1');
    store.set(`fallback:${OTHER}:aiPlan`, '1');
    store.set('built.vibration', '1');
    await clearPersonOnDevice(USER);
    expect([...store.keys()].sort()).toEqual(['built.vibration', `fallback:${OTHER}:aiPlan`]);
  });

  it('forgets the device-only identity and its flag', async () => {
    store.set('vital.localUser', JSON.stringify({ userId: 'local-abc12345', name: '' }));
    store.set('vital.localMode', '1');
    await forgetDeviceIdentity();
    expect(store.size).toBe(0);
  });
});
