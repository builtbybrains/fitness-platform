/* Local fallback: when Supabase isn't configured (or the network is down),
   data mirrors to AsyncStorage under a `fallback:<userId>` namespace. The app
   keeps working; values sync to Postgres the moment the cloud is back. */

import AsyncStorage from '@react-native-async-storage/async-storage';

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
    /* storage full or unavailable — ignore */
  }
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
