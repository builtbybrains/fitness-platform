/* The local calendar day as React state. Rolls over at midnight (a timer
   armed for the next midnight) and whenever the app returns to the
   foreground, because timers do not fire while the app is suspended. */

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { msUntilNextMidnight, todayId } from './dates';

export function useToday(): string {
  const [today, setToday] = useState(() => todayId());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => setToday((prev) => {
      const now = todayId();
      return now === prev ? prev : now;
    });
    const arm = () => {
      if (timer) clearTimeout(timer);
      // +1s so the timer lands safely after midnight, not a hair before it.
      timer = setTimeout(() => {
        sync();
        arm();
      }, msUntilNextMidnight() + 1000);
    };
    arm();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sync();
        arm();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, []);

  return today;
}
