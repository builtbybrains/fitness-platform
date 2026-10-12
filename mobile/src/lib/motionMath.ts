/* The arithmetic behind the small animations (chart bars, the weight line,
   the water drop, the drawn check, the sliding pills). Pure, so it is
   tested without React Native. */

export const easeOutQuart = (p: number) => 1 - Math.pow(1 - p, 4);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Progress of item `i` in a staggered entrance, eased: item 0 starts at
    once, each next one `step` ms later, each taking `duration` ms. */
export function staggered(elapsed: number, i: number, step = 50, duration = 420): number {
  if (!Number.isFinite(elapsed)) return 1;
  return easeOutQuart(clamp01((elapsed - i * step) / Math.max(1, duration)));
}

/** Total time for `count` staggered items. */
export function staggerTotal(count: number, step = 50, duration = 420): number {
  return Math.max(0, count - 1) * step + duration;
}

type Pt = { x: number; y: number };

/** Length of a polyline through `pts`. */
export function polylineLength(pts: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

/** For each point, the share of the line drawn when the pen reaches it. */
export function pointReach(pts: readonly Pt[]): number[] {
  const total = polylineLength(pts);
  if (!(total > 0)) return pts.map(() => 1);
  let run = 0;
  return pts.map((p, i) => {
    if (i > 0) run += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    return run / total;
  });
}

/** The dash offset that shows `progress` (0 to 1) of a stroke `length` long. */
export function dashOffset(length: number, progress: number): number {
  return length * (1 - clamp01(progress));
}

/** The check icon's path (24 box) and its length, for drawing it on. */
export const CHECK_PATH = 'm5 12.5 4.5 4.5L19 7.5';
export const CHECK_LENGTH = Math.hypot(4.5, 4.5) + Math.hypot(9.5, 9.5);

/** The water drop's outline (24 box), the same as the drop icon. */
export const DROP_PATH = 'M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5Z';
const DROP_BOTTOM = 20.5;
const DROP_TOP = 3;

/** Liquid inside the drop at fill `p` (0 empty, 1 full): a body whose top
    is a wave that settles flat as it reaches the top. Clip it to DROP_PATH. */
export function wavePath(p: number, width = 24): string {
  const t = clamp01(p);
  const level = DROP_BOTTOM - (DROP_BOTTOM - DROP_TOP) * easeOutQuart(t);
  const amp = 1.6 * (1 - t);
  const phase = t * Math.PI * 3;
  const pts: string[] = [];
  for (let x = 0; x <= width; x += 2) {
    const y = level + amp * Math.sin((x / width) * Math.PI * 2 + phase);
    pts.push(`${x} ${y.toFixed(2)}`);
  }
  return `M${pts.join(' L')} L${width} 24 L0 24 Z`;
}

/** Left edge of segment `index` in a row of `count` equal segments that
    fill `width` with `gap` between them (and `pad` inside each end). */
export function segmentX(width: number, count: number, index: number, gap: number, pad = 0): { x: number; w: number } | null {
  if (!(width > 0) || count < 1 || index < 0 || index >= count) return null;
  const w = (width - pad * 2 - gap * (count - 1)) / count;
  if (!(w > 0)) return null;
  return { x: pad + index * (w + gap), w };
}

/** Which segment a pill at `x` covers most. */
export function segmentAt(x: number, segW: number, gap: number, count: number, pad = 0): number {
  if (!(segW > 0) || count < 1) return 0;
  const i = Math.round((x - pad) / (segW + gap));
  return Math.max(0, Math.min(count - 1, i));
}
