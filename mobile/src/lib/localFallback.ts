/* On-device mirror. Every piece of user data is also kept in AsyncStorage
   under `fallback:<userId>:<kind>`. It is the only store for people using
   the app without an account, and the offline copy for signed-in people.
   Writes a signed-in person makes while offline are queued in the outbox
   (./outbox.ts) and uploaded the next time the app reaches the server.
   Nothing here is ever uploaded for a device-only (no account) identity. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { runSerial } from './serial';

const key = (userId: string, kind: string) => `fallback:${userId}:${kind}`;

export async function loadLocal<T>(userId: string, kind: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key(userId, kind));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveLocal(userId: string, kind: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId, kind), JSON.stringify(value));
  } catch {
    /* storage full or unavailable: ignore */
  }
}

/** Read-modify-write of one mirror entry, serialised per entry so two
    concurrent updates can never overwrite each other. Returns the new value. */
export function updateLocal<T>(
  userId: string,
  kind: string,
  fn: (prev: T | null) => T,
): Promise<T> {
  return runSerial(`local:${key(userId, kind)}`, async () => {
    const next = fn(await loadLocal<T>(userId, kind));
    await saveLocal(userId, kind, next);
    return next;
  });
}

export async function clearLocal(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(`fallback:${userId}:`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    /* ignore */
  }
}
