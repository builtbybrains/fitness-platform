/* Motion helpers. Reduce Motion (the OS setting; prefers-reduced-motion on
   web) turns every animation off. Fills use ease-out quart. */

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let cached: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();

function publish(v: boolean) {
  cached = v;
  listeners.forEach((l) => l(v));
}

// Ask once at startup so the first frame already knows the answer.
AccessibilityInfo.isReduceMotionEnabled?.()
  .then(publish)
  .catch(() => {});
try {
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', publish);
} catch {
  /* not supported on this platform */
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(cached ?? false);
  useEffect(() => {
    listeners.add(setReduce);
    if (cached !== null) setReduce(cached);
    return () => {
      listeners.delete(setReduce);
    };
  }, []);
  return reduce;
}

export const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);

/** A number that fills to `target`: slowly on first view, briefly after
    that, instantly when Reduce Motion is on. */
export function useTween(target: number, first = 700, later = 250): number {
  const reduce = useReduceMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const current = useRef(reduce ? target : 0);
  const started = useRef(false);

  useEffect(() => {
    if (reduce) {
      current.current = target;
      setValue(target);
      started.current = true;
      return;
    }
    const from = current.current;
    const duration = started.current ? later : first;
    started.current = true;
    if (from === target) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const x = from + (target - from) * easeOutQuart(p);
      current.current = x;
      setValue(x);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, first, later]);

  return value;
}
