/* Daily water counter, saved through the data layer (server for accounts,
   device for device-only identities). Rows are keyed by local day, and the
   hook reloads when the day rolls over at midnight or on app resume, and
   on `refresh()` (pull to refresh).

   Nothing is written until the day's saved count has loaded: taps (and
   notification actions) that arrive earlier are queued and applied on top
   of the loaded count, so the stored number is never reset to 1.

   Notification actions: the water reminder's "+1 glass" button logs one
   glass. Each notification response is handled exactly once, even across
   restarts (ids of handled responses are remembered on the device), and
   the "last response" the OS keeps is cleared once handled. */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchWater, saveWater } from './data';
import { useAuth } from './auth';
import { useToday } from './lib/useToday';
import { getNotifications, WATER_ACTION } from './lib/notify';

const MAX_GLASSES = 20;
const HANDLED_KEY = 'built.water.handledResponses';

type ResponseLike = {
  actionIdentifier: string;
  notification: { date: number; request: { identifier: string } };
};

function responseKey(r: ResponseLike): string {
  return `${r.notification.request.identifier}:${r.notification.date}:${r.actionIdentifier}`;
}

// Handled response ids, shared by every mounted hook and persisted.
let handled: Set<string> | null = null;
let handledLoad: Promise<Set<string>> | null = null;
function loadHandled(): Promise<Set<string>> {
  if (handled) return Promise.resolve(handled);
  if (!handledLoad) {
    handledLoad = AsyncStorage.getItem(HANDLED_KEY)
      .then((raw) => new Set<string>(raw ? (JSON.parse(raw) as string[]) : []))
      .catch(() => new Set<string>())
      .then((s) => (handled = s));
  }
  return handledLoad;
}

/** Resolves true the first time a response is seen, false afterwards. */
async function claimResponse(r: ResponseLike): Promise<boolean> {
  const set = await loadHandled();
  const key = responseKey(r);
  if (set.has(key)) return false;
  set.add(key);
  void AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...set].slice(-30))).catch(() => {});
  return true;
}

export function useWater() {
  const { userId, profile } = useAuth();
  const today = useToday();
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const countRef = useRef(0);
  const loadedRef = useRef(false);
  const pendingRef = useRef(0); // glasses to add once the count has loaded
  const dayRef = useRef(today);
  const userRef = useRef(userId);
  userRef.current = userId;

  const writes = useRef(0); // bumps on every change, so a refresh never undoes a tap
  const commit = useCallback((next: number) => {
    writes.current += 1;
    const clamped = Math.max(0, Math.min(MAX_GLASSES, next));
    countRef.current = clamped;
    setCount(clamped);
    const uid = userRef.current;
    if (uid) void saveWater(uid, dayRef.current, clamped);
  }, []);

  const addGlasses = useCallback(
    (n: number) => {
      if (!loadedRef.current) {
        pendingRef.current += n;
        return;
      }
      commit(countRef.current + n);
    },
    [commit],
  );

  // Load the day's count (per user and per day).
  useEffect(() => {
    loadedRef.current = false;
    setLoaded(false);
    dayRef.current = today;
    if (!userId) return;
    let alive = true;
    fetchWater(userId, today).then(({ count: c }) => {
      if (!alive) return;
      countRef.current = c;
      setCount(c);
      loadedRef.current = true;
      setLoaded(true);
      if (pendingRef.current) {
        const n = pendingRef.current;
        pendingRef.current = 0;
        commit(c + n);
      }
    });
    return () => {
      alive = false;
    };
  }, [userId, today, commit]);

  // Pull to refresh: read the day's count again (another device may have
  // logged a glass). A tap while the read is out wins over what it returns.
  const refresh = useCallback(async () => {
    const uid = userRef.current;
    const day = dayRef.current;
    if (!uid || !loadedRef.current) return;
    const seen = writes.current;
    const { count: c } = await fetchWater(uid, day);
    if (userRef.current !== uid || dayRef.current !== day || writes.current !== seen) return;
    countRef.current = c;
    setCount(c);
  }, []);

  // "+1 glass" from the reminder notification, including cold starts.
  const addRef = useRef(addGlasses);
  addRef.current = addGlasses;
  useEffect(() => {
    const N = getNotifications();
    if (!N) return;

    const handle = async (response: ResponseLike | null | undefined) => {
      if (!response || response.actionIdentifier !== WATER_ACTION) return;
      if (!(await claimResponse(response))) return;
      try {
        N.clearLastNotificationResponse?.();
      } catch {
        /* not supported on this platform */
      }
      addRef.current(1);
    };

    const sub = N.addNotificationResponseReceivedListener((r) => void handle(r));
    try {
      void handle(N.getLastNotificationResponse?.() ?? null);
    } catch {
      /* not supported on this platform */
    }
    return () => {
      sub.remove();
    };
  }, []);

  return {
    count,
    target: profile?.water_target ?? 8,
    loaded,
    refresh,
    add: () => addGlasses(1),
    sub: () => {
      if (loadedRef.current) commit(countRef.current - 1);
    },
  };
}
