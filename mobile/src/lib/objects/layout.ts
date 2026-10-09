/* Pure layout and motion math for the object views: the macro donut's
   slices, the workout plate stack, the trophy shelf and the questionnaire
   object swap. No React Native here, so it runs in tests and on any
   platform. Angles are radians measured clockwise from 12 o'clock (the
   way the ring fills); times are seconds. */

import { clamp01, easeOutQuart } from './pose';

export const TAU = Math.PI * 2;

// ─────────────────────────────── arcs ───────────────────────────────

/** The angle a share of the way round sweeps, clamped to one full turn. */
export const arcSweep = (progress: number) => TAU * clamp01(progress);

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

/** A point on screen (SVG, y down) `r` from (cx, cy), `theta` clockwise from 12 o'clock. */
function screenPoint(cx: number, cy: number, r: number, theta: number): string {
  const x = cx + r * Math.sin(theta);
  const y = cy - r * Math.cos(theta);
  return `${+x.toFixed(3)} ${+y.toFixed(3)}`;
}

/**
 * An SVG path for a ring slice from `start` to `end` between radii
 * `inner` and `outer`, centred on (cx, cy). A sweep of a full turn (or
 * more) is the whole ring, drawn as two circles filled even-odd. Empty
 * when the sweep is zero or less.
 */
export function slicePath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  const sweep = end - start;
  if (!(sweep > 1e-6)) return '';
  if (sweep >= TAU - 1e-6) {
    const circle = (r: number) => `M${screenPoint(cx, cy, r, 0)}A${r} ${r} 0 1 1 ${screenPoint(cx, cy, r, Math.PI)}A${r} ${r} 0 1 1 ${screenPoint(cx, cy, r, 0)}Z`;
    return circle(outer) + circle(inner);
  }
  const large = sweep > Math.PI ? 1 : 0;
  return (
    `M${screenPoint(cx, cy, outer, start)}` +
    `A${outer} ${outer} 0 ${large} 1 ${screenPoint(cx, cy, outer, end)}` +
    `L${screenPoint(cx, cy, inner, end)}` +
    `A${inner} ${inner} 0 ${large} 0 ${screenPoint(cx, cy, inner, start)}Z`
  );
}

/**
 * The slices as the donut sweeps in: everything clockwise of `sweep`
 * (radians from 12 o'clock) is not drawn yet. A slice the sweep has not
 * reached is left out; the one it is crossing is cut at the sweep.
 */
export function revealSegments(segs: readonly DonutSegment[], sweep: number): DonutSegment[] {
  if (sweep >= TAU) return segs.slice();
  return segs.filter((s) => s.start < sweep).map((s) => (s.end <= sweep ? s : { ...s, end: sweep, mid: (s.start + sweep) / 2 }));
}

/** How far a lifted slice moves on screen (SVG, y down): `px` out along its middle. */
export function liftOffset(mid: number, px: number): { dx: number; dy: number } {
  return { dx: px * Math.sin(mid) + 0, dy: -px * Math.cos(mid) + 0 };
}

/**
 * The slice under a tap at (x, y), measured in the donut's own box with
 * its centre at (cx, cy). Null in the hole, outside the ring (`slack` px
 * of grace either side, so a slice is easy to hit) or in a gap.
 */
export function sliceAt(segs: readonly DonutSegment[], x: number, y: number, cx: number, cy: number, inner: number, outer: number, slack = 8): MacroKey | null {
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.hypot(dx, dy);
  if (r < inner - slack || r > outer + slack) return null;
  return segmentAt(segs, Math.atan2(dx, -dy));
}

// ─────────────────────────────── plates ───────────────────────────────

/** Most plates the stack shows: past it, each plate stands for more than one set. */
export const PLATE_CAP = 6;

/** Plates alternate full and a size down, so each one reads as its own disc. */
export const plateRadius = (i: number) => (i % 2 === 0 ? 1 : 0.86);

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

// ─────────────────────────────── shelf ───────────────────────────────

/** The milestone the shelf shows: the latest one earned. By the day it was
    earned; an earned one with no day counts as oldest, and on a tie the one
    later in the list (the bigger milestone) wins. Null when none is earned. */
export function latestEarned<T extends { earned: boolean; earnedAt: string | null }>(items: readonly T[]): T | null {
  let best: T | null = null;
  for (const m of items) {
    if (!m.earned) continue;
    if (!best || (m.earnedAt ?? '') >= (best.earnedAt ?? '')) best = m;
  }
  return best;
}

// ─────────────────────────────── image framing ───────────────────────────────

/** Where an object sits in its square image: its opaque bounds, as shares of the side. */
export type ImageBounds = { left: number; top: number; right: number; bottom: number };

/**
 * Size and nudge a square object image so the object inside it has a given
 * visual mass (the square root of its width times its height, in px), never
 * wider than `maxW` or taller than `maxH`, and its middle on the box's
 * middle. A long, low dumbbell and a tall, thin shaker then read as the
 * same size. Returns the image's side and the shift that centres the
 * object (add it to the image's centred position).
 */
export function objectFrame(b: ImageBounds, mass: number, maxW: number, maxH: number): { side: number; dx: number; dy: number } {
  const w = Math.max(0.01, b.right - b.left);
  const h = Math.max(0.01, b.bottom - b.top);
  const side = Math.min(mass / Math.sqrt(w * h), maxW / w, maxH / h);
  return {
    side: Math.round(side * 10) / 10,
    dx: Math.round((0.5 - (b.left + b.right) / 2) * side * 10) / 10 + 0,
    dy: Math.round((0.5 - (b.top + b.bottom) / 2) * side * 10) / 10 + 0,
  };
}

// ─────────────────────────────── object swap ───────────────────────────────

/** `spin` is radians about the vertical axis (the image turns edge-on at a quarter turn). */
export type SwapPose = { phase: 'out' | 'in' | 'rest'; scale: number; spin: number; opacity: number };

/**
 * The questionnaire object changing: the old one shrinks and spins away
 * (`out` seconds, ease-in), the new one grows and spins in (`inn` seconds,
 * ease-out quart, no overshoot), fading out and in on the way. `t` is
 * seconds since the change; with `skipOut` (first mount) only the way in
 * plays.
 */
export function swapPose(t: number, skipOut = false, out = 0.25, inn = 0.3): SwapPose {
  const o = skipOut ? 0 : out;
  if (t < o) {
    const p = clamp01(t / o);
    const e = p * p * p; // ease-in cubic: leaves gently, then goes
    return { phase: 'out', scale: Math.max(0.001, 1 - e), spin: e * (Math.PI / 2), opacity: 1 - e };
  }
  if (t < o + inn) {
    const e = easeOutQuart((t - o) / inn);
    return { phase: 'in', scale: Math.max(0.001, e), spin: -(1 - e) * (Math.PI / 2), opacity: clamp01(e * 1.5) };
  }
  return { phase: 'rest', scale: 1, spin: 0, opacity: 1 };
}
