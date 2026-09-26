/* Daily water counter: Supabase-backed via the data layer, local mirror when
   offline. Reset happens naturally per day (rows are keyed by date).

   Notification actions: when the water reminder's "+1 glass" button is
   tapped (or the notification body on iOS), the response listener logs a
   glass through the same data layer — it even fires from a cold app start,
   where the write lands before the Today screen mounts. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchWater, saveWater, todayId } from './data';
import { useAuth } from './auth';
import { getNotifications, WATER_ACTION } from './lib/notify';

export function useWater() {
  const { userId, profile } = useAuth();
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const countRef = useRef(0);

  const set = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(20, next));
      countRef.current = clamped;
      setCount(clamped);
      if (userId) saveWater(userId, todayId(), clamped);
    },
    [userId],
  );

  const logGlass = useCallback(() => {
    set(countRef.current + 1);
  }, [set]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchWater(userId, todayId()).then(({ count: c }) => {
      if (!alive) return;
      countRef.current = c;
      setCount(c);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // "+1 glass" from the reminder notification — including cold starts.
  useEffect(() => {
    const N = getNotifications();
    if (!N) return;

    let gotOne = false;
    const sub = N.addNotificationResponseReceivedListener((response) => {
      const action = response.actionIdentifier;
      const isWater =
        action === WATER_ACTION ||
        // iOS body-taps surface the default action under the category id.
        (action === 'default' &&
          (response.notification?.request?.content as { categoryIdentifier?: string } | undefined)
            ?.categoryIdentifier === 'WATER_REMINDER');
      if (isWater) {
        gotOne = true;
        logGlass();
      }
    });

    N.getLastNotificationResponseAsync?.()
      .then((response) => {
        if (!response || gotOne) return;
        const action = response.actionIdentifier;
        const isWater =
          action === WATER_ACTION ||
          (action === 'default' &&
            (response.notification?.request?.content as { categoryIdentifier?: string } | undefined)
              ?.categoryIdentifier === 'WATER_REMINDER');
        if (isWater) logGlass();
      })
      .catch(() => {});

    return () => {
      sub.remove();
    };
  }, [logGlass]);

  return {
    count,
    target: profile?.water_target ?? 8,
    loaded,
    add: logGlass,
    sub: () => set(countRef.current - 1),
  };
}
