/* Rest-timer: a 1 Hz countdown. Completion buzzes via the core Vibration API
   (no asset, no extra dependency, works in Expo Go). */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';

export function useRestTimer() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [total, setTotal] = useState<number>(0);
  const totalRef = useRef(0);

  const stop = useCallback(() => {
    setRemaining(null);
    setTotal(0);
    totalRef.current = 0;
  }, []);

  const start = useCallback((seconds: number) => {
    totalRef.current = seconds;
    setTotal(seconds);
    setRemaining(seconds);
  }, []);

  const add = useCallback((seconds: number) => {
    setRemaining((r) => (r == null ? r : Math.min(r + seconds, 600)));
    setTotal((t) => (t == null ? t : t + seconds));
  }, []);

  // tick while running
  useEffect(() => {
    if (remaining === null || remaining === 0) return;
    const t = setInterval(() => {
      setRemaining((r) => (r == null ? null : Math.max(0, r - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [remaining]);

  // completion buzz (fire once when the countdown reaches zero)
  const buzzed = useRef(false);
  useEffect(() => {
    if (remaining === 0 && !buzzed.current) {
      buzzed.current = true;
      Vibration.vibrate([0, 250, 150, 250]);
    }
    if (remaining !== 0) buzzed.current = false;
  }, [remaining]);

  return { remaining, total, start, stop, add, running: remaining !== null };
}
