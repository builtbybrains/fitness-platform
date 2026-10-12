/* Motion helpers. Reduce Motion (the OS setting; prefers-reduced-motion on
   web) turns every animation off. Fills use ease-out quart. */

import { RefObject, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

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
export function useTween(target: number, first = 400, later = 250): number {
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

/** Milliseconds since `play` turned true, frame by frame, until `total`
    has passed (then Infinity). For staggered entrances and drawn lines that
    play once on first view. Before `play`: 0 (waiting to start). Reduce
    Motion: Infinity from the start, so everything shows finished. */
export function useElapsed(total: number, play = true): number {
  const reduce = useReduceMotion();
  const [elapsed, setElapsed] = useState(0);
  const run = play && !reduce;
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const e = Date.now() - t0;
      if (e >= total) {
        setElapsed(Infinity);
        return;
      }
      setElapsed(e);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // Plays once: a later change of `total` does not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  return reduce ? Infinity : elapsed;
}

/** True once a third of the view has been on screen (web), so a chart
    further down a screen plays when it is scrolled to, not while it is
    out of sight. Phones: true from the start. */
export function useInView(ref: RefObject<unknown>): boolean {
  const [seen, setSeen] = useState(() => Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (typeof Element === 'undefined' || !(el instanceof Element)) {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, ref]);
  return seen;
}
