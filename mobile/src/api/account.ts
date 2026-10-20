/* Deleting an account, or the data a device-only person keeps on this
   phone (Profile, Delete account).

   Account: the delete-account function removes the plan, logs, chats,
   coach memory and body photos on the server, then the person's copy on
   this phone is cleared too. Device-only: there is nothing on the server,
   so only this phone is cleared, and the device identity with it, so the
   next "Continue without an account" starts fresh.

   The caller signs out afterwards (auth.signOut) and routes to sign-in. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearLocal } from '../lib/localFallback';
import { forgetOutbox } from '../lib/outbox';
import { cancelBuiltReminders } from '../lib/notify';
import { clearFoodCache } from '../lib/foodCache';
import { ApiError, MESSAGES } from './errors';
import { invoke, requireAccount } from './client';

/** What the person types to confirm. */
export const DELETE_WORD = 'DELETE';

export function deleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_WORD;
}

/** Device keys kept for one person outside the `fallback:<id>:` mirror. */
const personKeys = (userId: string) => [
  `coach:lastThread:${userId}`,
  `coach:remaining:${userId}`,
  `built.signupPhotoSet:${userId}`,
];

// The device-only identity and its "open without an account" flag
// (auth.tsx; the names predate BUILT).
const LOCAL_USER_KEY = 'vital.localUser';
const LOCAL_MODE_KEY = 'vital.localMode';

export type DeleteResult = { ok: true; removed: Record<string, unknown> };

/** Delete the signed-in account on the server. Throws ApiError with the
    server's message; nothing on the phone is touched when it fails. */
export async function deleteAccount(userId: string): Promise<DeleteResult> {
  requireAccount(userId);
  const data = await invoke<{ ok?: boolean; removed?: Record<string, unknown> }>('delete-account', { confirm: DELETE_WORD });
  if (!data?.ok) throw new ApiError('server_error', MESSAGES.generic, 500);
  return { ok: true, removed: data.removed ?? {} };
}

/** Clear everything this phone keeps for one person: the local mirror
    (plan, logs, chats, memory, the outbox), the per-person keys, the
    in-memory food cache and every scheduled BUILT reminder. */
export async function clearPersonOnDevice(userId: string): Promise<void> {
  await forgetOutbox(userId).catch(() => {});
  await clearLocal(userId);
  await AsyncStorage.multiRemove(personKeys(userId)).catch(() => {});
  clearFoodCache();
  await cancelBuiltReminders().catch(() => {});
}

/** Forget the device-only identity, so the next "Continue without an
    account" is a new person with an empty phone. */
export async function forgetDeviceIdentity(): Promise<void> {
  await AsyncStorage.multiRemove([LOCAL_USER_KEY, LOCAL_MODE_KEY]).catch(() => {});
}
