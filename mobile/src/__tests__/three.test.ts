import { describe, expect, it } from 'vitest';

import { centredOutline, pathOutline } from '../components/three/outline';
import { bob, dropIn, fitDistance, fitExtent, flickVelocity, flipIn, heroSize, stepSpin } from '../components/three/pose';

// The B mark, as in src/components/BuiltLogo.tsx and assets/img/mark.svg.
const MARK =
  'M15.2 0H100.35A27.15 27.15 0 0 1 127.5 27.15A27.15 27.15 0 0 1 115.97 49.36A28 28 0 0 1 127.5 72A28 28 0 0 1 99.5 100H0L11.76 75.03H89.02A6.89 6.89 0 0 0 89.02 61.26H18.25L29.95 36.42H89.08A6.82 6.82 0 0 0 89.08 22.78H36.37Z';

describe('B mark outline', () => {
  const pts = pathOutline(MARK, 8);

  it('spans the mark viewBox', () => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0, 5);
    expect(Math.max(...xs)).toBeCloseTo(127.5, 1);
    expect(Math.min(...ys)).toBeCloseTo(0, 5);
    expect(Math.max(...ys)).toBeCloseTo(100, 5);
  });

  it('samples every arc and lands each one on its end point', () => {
    // 9 straight points plus 6 arcs of 8 samples.
    expect(pts.length).toBe(9 + 6 * 8);
    expect(pts).toContainEqual([127.5, 27.15]);
    expect(pts).toContainEqual([89.02, 61.26]);
  });

  it('keeps the slot caps inside the bowl (sweep 0 arcs bulge right)', () => {
    // The upper slot cap runs from y 36.42 to 22.78 around x 89.08 with r 6.82.
    const cap = pts.filter((p) => p[1] > 22.78 && p[1] < 36.42 && p[0] > 89.08 && p[0] < 110);
    expect(cap.length).toBeGreaterThan(0);
    for (const [x] of cap) expect(x).toBeLessThanOrEqual(89.08 + 6.82 + 1e-6);
  });

  it('centres and scales with y up', () => {
    const c = centredOutline(MARK, 1);
    const ys = c.map((p) => p[1]);
    const xs = c.map((p) => p[0]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1.275, 3);
    // The first point (top-left chevron at SVG y 0) is now at the top.
    expect(c[0][1]).toBeCloseTo(0.5, 6);
  });
});

describe('3D motion curves', () => {
  it('drops in from half a unit above and settles at rest by 500ms', () => {
    expect(dropIn(0).y).toBeCloseTo(0.5);
    expect(dropIn(0.25).y).toBeLessThan(0.05);
    const end = dropIn(0.5);
    expect(end.y).toBe(0);
    expect(end.spin).toBe(0);
    expect(end.tilt).toBe(0);
    expect(end.done).toBe(true);
    expect(dropIn(2).y).toBe(0);
  });

  it('flips the medal from the back to face-on in 600ms with no overshoot', () => {
    expect(flipIn(0)).toBeCloseTo(Math.PI);
    expect(flipIn(0.6)).toBe(0);
    let prev = Infinity;
    for (let t = 0; t <= 0.6; t += 0.005) {
      const a = flipIn(t);
      // Turns one way only and never passes face-on.
      expect(a).toBeLessThanOrEqual(prev);
      expect(a).toBeGreaterThanOrEqual(0);
      prev = a;
    }
  });

  it('floats from zero so a still pose has no jump', () => {
    expect(bob(0)).toBe(0);
    expect(Math.abs(bob(0.8))).toBeCloseTo(0.08, 5);
  });

  it('decays a flick back to the idle spin', () => {
    let s = { angle: 0, velocity: flickVelocity(1, 300), dragging: false };
    expect(s.velocity).toBeCloseTo(10); // capped
    for (let i = 0; i < 240; i++) s = stepSpin(s, 1 / 60);
    expect(s.angle).toBeGreaterThan(2);
    expect(Math.abs(s.velocity)).toBeLessThan(0.01);
    const held = { angle: 1, velocity: 5, dragging: true };
    expect(stepSpin(held, 1 / 60)).toBe(held);
  });

  it('backs the camera off further for narrow views', () => {
    const square = fitDistance(1.5, 30, 1);
    const wide = fitDistance(1.5, 30, 2);
    const narrow = fitDistance(1.5, 30, 0.5);
    expect(wide).toBeCloseTo(square);
    expect(narrow).toBeGreaterThan(square);
    expect(square).toBeCloseTo(1.5 / Math.sin(Math.PI / 12));
  });

  it('fits a wide object by width in a square view and by height in a wide one', () => {
    const tan = Math.tan(Math.PI / 12);
    // Square: the 1.6 half width binds.
    expect(fitExtent(1.6, 1, 0, 30, 1)).toBeCloseTo(1.6 / tan);
    // Twice as wide as tall: the 1.0 half height binds, and it sits much closer than the sphere fit.
    expect(fitExtent(1.6, 1, 0, 30, 2)).toBeCloseTo(1 / tan);
    expect(fitExtent(1.6, 1, 0.5, 30, 2)).toBeLessThan(fitDistance(1.6, 30, 2));
  });

  it('shrinks the sign-in dumbbell on short screens and hides it behind the keyboard', () => {
    expect(heroSize(844, false)).toBe(180);
    expect(heroSize(844, true)).toBe(180);
    expect(heroSize(640, false)).toBe(120);
    expect(heroSize(640, true)).toBe(0);
  });
});
