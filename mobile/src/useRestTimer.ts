/* Rest timer. Remaining time is computed from an end timestamp, not by
   counting ticks, so it stays right after the app was in the background
   (JS timers pause there) and on slow devices. Completion buzzes via the
   core Vibration API, only when the end is noticed on time (not minutes
   later on resume). */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';

import { remainingSeconds } from './lib/timer';

const MAX_SECONDS = 600;
const LATE_BUZZ_MS = 3000;

export function useRestTimer() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [total, setTotal] = useState<number>(0);
  const endRef = useRef<number | null>(null);
  const buzzed = useRef(false);

  const tick = useCallback(() => {
    const end = endRef.current;
    if (end == null) return;
    const now = Date.now();
    const r = remainingSeconds(end, now);
    setRemaining(r);
    if (r === 0 && !buzzed.current) {
      buzzed.current = true;
      if (now - end < LATE_BUZZ_MS) Vibration.vibrate([0, 250, 150, 250]);
    }
  }, []);

  const stop = useCallback(() => {
    endRef.current = null;
    buzzed.current = false;
    setRemaining(null);
    setTotal(0);
  }, []);

  const start = useCallback((seconds: number) => {
    const s = Math.max(1, Math.min(MAX_SECONDS, Math.round(seconds)));
    endRef.current = Date.now() + s * 1000;
    buzzed.current = false;
    setTotal(s);
    setRemaining(s);
  }, []);

  const add = useCallback(
    (seconds: number) => {
      const end = endRef.current;
      if (end == null) return;
      const now = Date.now();
      const before = remainingSeconds(end, now);
      const after = Math.min(before + seconds, MAX_SECONDS);
      endRef.current = now + after * 1000;
      buzzed.current = false;
      setTotal((t) => t + (after - before));
      tick();
    },
    [tick],
  );

  // Refresh a few times a second while counting down.
  const counting = remaining !== null && remaining > 0;
  useEffect(() => {
    if (!counting) return;
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [counting, tick]);

  // Catch up immediately when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') tick();
    });
    return () => sub.remove();
  }, [tick]);

  return { remaining, total, start, stop, add, running: remaining !== null };
}
