import { describe, expect, it } from 'vitest';

import { bob, dropIn, flipIn, floatPose, heroSize, sampleCurve, softClamp } from '../lib/objects/pose';

describe('object motion curves', () => {
  it('drops in from 56px above with a turn and settles at rest by 500ms', () => {
    const start = dropIn(0);
    expect(start.y).toBeCloseTo(-56);
    expect(start.rotate).toBeCloseTo(-28);
    expect(start.opacity).toBe(0);
    expect(dropIn(0.25).y).toBeGreaterThan(-5);
    const end = dropIn(0.5);
    expect(end.y).toBe(0);
    expect(end.rotate).toBe(0);
    expect(end.opacity).toBe(1);
    expect(end.done).toBe(true);
    expect(dropIn(2).y).toBe(0);
    // Fully up by 150ms, so the drop is seen.
    expect(dropIn(0.15).opacity).toBe(1);
  });

  it('flips the medal from edge-on to face-on in 600ms with no overshoot', () => {
    expect(flipIn(0)).toBeCloseTo(90);
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
    expect(Math.abs(bob(0.8))).toBeCloseTo(6, 5);
  });

  it('loops the sign-in float with no jump: two bobs to one sway', () => {
    const a = floatPose(0);
    const z = floatPose(1);
    expect(a.y).toBeCloseTo(0, 9);
    expect(a.rotate).toBeCloseTo(0, 9);
    expect(z.y).toBeCloseTo(a.y, 9);
    expect(z.rotate).toBeCloseTo(a.rotate, 9);
    expect(z.x).toBeCloseTo(a.x, 9);
    // A quarter cycle in, the sway is at its peak and the bob back at rest.
    expect(floatPose(0.25).rotate).toBeCloseTo(3, 9);
    expect(floatPose(0.25).y).toBeCloseTo(0, 9);
  });

  it('samples a curve as an Animated interpolation', () => {
    const s = sampleCurve((p) => p * p, 4);
    expect(s.inputRange).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(s.outputRange).toEqual([0, 0.063, 0.25, 0.563, 1]);
    // No -0 in the output.
    expect(Object.is(sampleCurve(() => -0, 1).outputRange[0], 0)).toBe(true);
  });

  it('limits the drag tilt softly', () => {
    expect(softClamp(0.01, 12)).toBeCloseTo(0.01, 4);
    expect(softClamp(500, 12)).toBeLessThanOrEqual(12);
    expect(softClamp(-500, 12)).toBeGreaterThanOrEqual(-12);
  });

  it('shrinks the sign-in dumbbell on short screens and hides it behind the keyboard', () => {
    expect(heroSize(844, false)).toBe(180);
    expect(heroSize(844, true)).toBe(180);
    expect(heroSize(640, false)).toBe(120);
    expect(heroSize(640, true)).toBe(0);
  });
});
