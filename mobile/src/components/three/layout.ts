/* Pure layout and motion math for the data-driven 3D scenes: the Today ring
   arc, the macro donut segments, the workout plate stack, the trophy shelf
   and the questionnaire object swap. No three.js here, so it runs in tests
   and on any platform. Angles are radians measured clockwise from 12
   o'clock (the way the 2D ring fills); times are seconds. */

import { clamp01, easeOutQuart } from './pose';

export const TAU = Math.PI * 2;

// ─────────────────────────────── tween ───────────────────────────────

/** A value easing toward a target (ease-out quart), stepped by frame time. */
export type Tween = { from: number; to: number; elapsed: number; duration: number };

export const tween = (value: number): Tween => ({ from: value, to: value, elapsed: 0, duration: 0 });

/** Head for `to` over `duration` seconds, starting from wherever it is now. */
export function retarget(t: Tween, to: number, duration: number): Tween {
  if (to === t.to && tweenDone(t)) return t;
  return { from: tweenValue(t), to, elapsed: 0, duration };
}

export function tweenValue(t: Tween): number {
  if (t.duration <= 0) return t.to;
  return t.from + (t.to - t.from) * easeOutQuart(t.elapsed / t.duration);
}

export const tweenDone = (t: Tween) => t.duration <= 0 || t.elapsed >= t.duration;

export function stepTween(t: Tween, dt: number): Tween {
  if (tweenDone(t)) return t;
  return { ...t, elapsed: Math.min(t.duration, t.elapsed + dt) };
}

/** Jump straight to the target (Reduce Motion stills, first frames). */
export const settle = (t: Tween): Tween => ({ from: t.to, to: t.to, elapsed: 0, duration: 0 });

// ─────────────────────────────── ring ───────────────────────────────

/** The angle a progress share sweeps, clamped to one full turn. */
export const arcSweep = (progress: number) => TAU * clamp01(progress);

/** Length of the filled arc along a ring of `radius`. */
export const arcLength = (progress: number, radius: number) => arcSweep(progress) * radius;

/** A point on a circle of radius `r`, `theta` clockwise from 12 o'clock, y up. */
export function clockPoint(theta: number, r: number): [number, number] {
  return [r * Math.sin(theta), r * Math.cos(theta)];
}

/** `segments + 1` evenly spaced angles from 12 o'clock to the end of the arc. */
export function arcAngles(progress: number, segments: number): number[] {
  const sweep = arcSweep(progress);
  return Array.from({ length: segments + 1 }, (_, i) => (sweep * i) / segments);
}

/** Drag tilt for the ring: follows the finger, never past `max` radians. */
export const softClamp = (x: number, max: number) => max * Math.tanh(x / max);

// ─────────────────────────────── donut ───────────────────────────────

export type MacroKey = 'protein' | 'carbs' | 'fat';
export const MACRO_KEYS: readonly MacroKey[] = ['protein', 'carbs', 'fat'];
/** Calories per gram: the donut is sized by each macro's share of calories. */
export const KCAL_PER_G: Record<MacroKey, number> = { protein: 4, carbs: 4, fat: 9 };

export type DonutSegment = { key: MacroKey; grams: number; share: number; start: number; end: number; mid: number };

/**
 * The donut's segments, clockwise from 12 o'clock, sized by share of
 * calories with `gap` radians between neighbours. A macro at zero has no
 * segment; one macro alone is a full ring with no gap. A sliver is held at
 * `minSweep` so it stays tappable; the others give up the difference.
 */
export function donutSegments(m: Record<MacroKey, number>, gap = 0.08, minSweep = 0.12): DonutSegment[] {
  const kcal = MACRO_KEYS.map((k) => Math.max(0, m[k] || 0) * KCAL_PER_G[k]);
  const total = kcal.reduce((a, x) => a + x, 0);
  if (total <= 0) return [];
  const present = MACRO_KEYS.map((key, i) => ({ key, grams: Math.max(0, m[key] || 0), share: kcal[i] / total })).filter((x) => x.share > 0);
  const n = present.length;
  const avail = TAU - (n > 1 ? gap * n : 0);
  // Hold slivers at the minimum and share what is left among the rest.
  let sweeps = present.map((p) => p.share * avail);
  const small = sweeps.map((s) => n > 1 && s < minSweep);
  if (small.some(Boolean)) {
    const held = small.filter(Boolean).length * minSweep;
    const restShare = present.reduce((a, p, i) => a + (small[i] ? 0 : p.share), 0);
    sweeps = present.map((p, i) => (small[i] ? minSweep : ((avail - held) * p.share) / restShare));
  }
  const out: DonutSegment[] = [];
  let a = n > 1 ? gap / 2 : 0;
  present.forEach((p, i) => {
    const start = a;
    const end = a + sweeps[i];
    out.push({ ...p, start, end, mid: (start + end) / 2 });
    a = end + gap;
  });
  return out;
}

/** The segment under `theta` (any angle, wrapped), or null in a gap. */
export function segmentAt(segs: readonly DonutSegment[], theta: number): MacroKey | null {
  const t = ((theta % TAU) + TAU) % TAU;
  return segs.find((s) => t >= s.start && t <= s.end)?.key ?? null;
}

/** Whole percents of calories that add up to exactly 100 (largest remainder). */
export function sharePercents(segs: readonly DonutSegment[]): Partial<Record<MacroKey, number>> {
  if (!segs.length) return {};
  const raw = segs.map((s) => s.share * 100);
  const floor = raw.map(Math.floor);
  let left = 100 - floor.reduce((a, x) => a + x, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floor[i] })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return Object.fromEntries(segs.map((s, i) => [s.key, floor[i]]));
}

// ─────────────────────────────── plates ───────────────────────────────

export const PLATE_CAP = 12;

/** How many plate places the stack has for a session: one per set, at most the cap. */
export const plateSlots = (total: number, cap = PLATE_CAP) => Math.max(0, Math.min(cap, Math.floor(total)));

/**
 * Plates on the stack after `done` of `total` sets. One a set up to the
 * cap; past it each plate stands for more than one set, rounded up, so
 * the first tick always drops a plate and the last one fills the stack.
 */
export function visiblePlates(done: number, total: number, cap = PLATE_CAP): number {
  if (total <= 0 || done <= 0) return 0;
  const slots = plateSlots(total, cap);
  const d = Math.min(done, total);
  return Math.min(slots, Math.ceil((d * slots) / total - 1e-9));
}

/** Plate thickness so a full stack fits `height`, never thicker than `max`. */
export function plateThickness(total: number, height: number, max: number, cap = PLATE_CAP): number {
  const slots = Math.max(1, plateSlots(total, cap));
  return Math.min(max, height / slots);
}

/** Centre height of plate `i` (0 at the bottom) with `gap` between plates. */
export const plateY = (i: number, thickness: number, gap: number) => i * (thickness + gap) + thickness / 2;

/** A plate dropping in: height above its rest place, 0 once landed. */
export const plateDrop = (t: number, duration = 0.35, from = 1.2) => from * (1 - easeOutQuart(t / duration));

// ─────────────────────────────── shelf ───────────────────────────────

/** Centre x of each of `count` medals spread along a shelf `span` wide, at most `spacing` apart. */
export function shelfSlots(count: number, span: number, spacing: number): number[] {
  if (count <= 0) return [];
  const step = Math.min(spacing, span / count);
  const first = -((count - 1) * step) / 2;
  return Array.from({ length: count }, (_, i) => first + i * step);
}

/** Medals on the shelf: one per earned milestone, all alike, so only the
    count matters. They stand oldest to newest, and the newest (the one
    lit) is the last, on the right. */
export function shelfOrder(items: readonly { earned: boolean; earnedAt: string | null }[]): { count: number; newest: number } {
  const count = items.filter((m) => m.earned).length;
  return { count, newest: count - 1 };
}

// ─────────────────────────────── object swap ───────────────────────────────

export type SwapPose = { phase: 'out' | 'in' | 'rest'; scale: number; spin: number };

/**
 * The questionnaire object changing: the old one shrinks and spins away
 * (`out` seconds, ease-in), the new one grows and spins in (`inn` seconds,
 * ease-out quart, no overshoot). `t` is seconds since the change; with
 * `skipOut` (first mount) only the way in plays.
 */
export function swapPose(t: number, skipOut = false, out = 0.25, inn = 0.3): SwapPose {
  const o = skipOut ? 0 : out;
  if (t < o) {
    const p = clamp01(t / o);
    const e = p * p * p; // ease-in cubic: leaves gently, then goes
    return { phase: 'out', scale: Math.max(0.001, 1 - e), spin: e * (Math.PI / 2) };
  }
  if (t < o + inn) {
    const e = easeOutQuart((t - o) / inn);
    return { phase: 'in', scale: Math.max(0.001, e), spin: -(1 - e) * (Math.PI / 2) };
  }
  return { phase: 'rest', scale: 1, spin: 0 };
}
