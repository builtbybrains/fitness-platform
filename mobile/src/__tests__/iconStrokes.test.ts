import { describe, expect, it } from 'vitest';

import { circleStroke, iconStrokes, pathStrokes, rectStroke, type MedalIcon } from '../components/three/iconStrokes';

describe('medal icon strokes', () => {
  it('reads moves, lines, H and V, absolute and relative', () => {
    const s = pathStrokes('M8 3.5 11 9.5M16 3.5l-3 6');
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ pts: [[8, 3.5], [11, 9.5]], closed: false });
    expect(s[1].pts[1]).toEqual([13, 9.5]);
    expect(pathStrokes('M10.8 13.6 12 12.8v4.4')[0].pts[2][1]).toBeCloseTo(17.2, 9);
    expect(pathStrokes('m12 11 1.5-2.5')[0].pts).toEqual([[12, 11], [13.5, 8.5]]);
    expect(pathStrokes('M8 12h8')[0].pts).toEqual([[8, 12], [16, 12]]);
  });

  it('follows curves and arcs to their end points, and closes on Z', () => {
    const [flame] = pathStrokes('M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 0 2 1 3 2 3 0-3-1-5.5.5-8Z', 8);
    expect(flame.closed).toBe(true);
    // Back at the start: the closing point is dropped, not repeated.
    const last = flame.pts[flame.pts.length - 1];
    expect(Math.hypot(last[0] - 12, last[1] - 3)).toBeGreaterThan(1e-6);
    // The arc's far end, 10 left of (17, 13).
    expect(flame.pts.some(([x, y]) => Math.abs(x - 7) < 1e-6 && Math.abs(y - 13) < 1e-6)).toBe(true);
    // The arc bulges down to y = 18 (a half circle of radius 5).
    expect(Math.max(...flame.pts.map((p) => p[1]))).toBeCloseTo(18, 1);
  });

  it('draws rects and circles as closed strokes inside their box', () => {
    const r = rectStroke(3.5, 3.5, 17, 17, 4);
    expect(r.closed).toBe(true);
    for (const [x, y] of r.pts) {
      expect(x).toBeGreaterThanOrEqual(3.5 - 1e-9);
      expect(x).toBeLessThanOrEqual(20.5 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(3.5 - 1e-9);
      expect(y).toBeLessThanOrEqual(20.5 + 1e-9);
    }
    const c = circleStroke(12, 15, 5.5, 16);
    for (const [x, y] of c.pts) expect(Math.hypot(x - 12, y - 15)).toBeCloseTo(5.5, 9);
  });

  it('has every milestone icon on the 24px grid', () => {
    for (const name of ['dumbbell', 'flame', 'bars', 'scale', 'medal'] as MedalIcon[]) {
      const strokes = iconStrokes(name);
      expect(strokes.length).toBeGreaterThan(0);
      for (const s of strokes) for (const [x, y] of s.pts) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(24);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(24);
      }
    }
  });
});
