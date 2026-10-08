import { describe, expect, it } from 'vitest';

import { TILT_MAX, tiltAngles } from '../lib/tilt';
import { indicatorX } from '../lib/tabIndicator';

describe('tiltAngles', () => {
  it('is flat when pressed in the centre', () => {
    expect(tiltAngles(100, 50, 200, 100)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it('tips the pressed edge away, up to the max', () => {
    expect(tiltAngles(100, 0, 200, 100)).toEqual({ rotateX: TILT_MAX, rotateY: 0 });
    expect(tiltAngles(100, 100, 200, 100)).toEqual({ rotateX: -TILT_MAX, rotateY: 0 });
    expect(tiltAngles(200, 50, 200, 100)).toEqual({ rotateX: 0, rotateY: TILT_MAX });
    expect(tiltAngles(0, 50, 200, 100)).toEqual({ rotateX: 0, rotateY: -TILT_MAX });
  });

  it('scales between centre and edge on both axes', () => {
    const a = tiltAngles(150, 25, 200, 100);
    expect(a.rotateX).toBeCloseTo(2.5);
    expect(a.rotateY).toBeCloseTo(2.5);
  });

  it('clamps points outside the card to its edge', () => {
    expect(tiltAngles(-40, 400, 200, 100)).toEqual({ rotateX: -TILT_MAX, rotateY: -TILT_MAX });
  });

  it('honours a custom max', () => {
    expect(tiltAngles(0, 0, 10, 10, 3)).toEqual({ rotateX: 3, rotateY: -3 });
  });

  it('stays flat before layout or on bad input', () => {
    expect(tiltAngles(10, 10, 0, 100)).toEqual({ rotateX: 0, rotateY: 0 });
    expect(tiltAngles(NaN, 10, 100, 100)).toEqual({ rotateX: 0, rotateY: 0 });
  });
});

describe('indicatorX', () => {
  it('centres the bar under each of five tabs', () => {
    expect(indicatorX(390, 5, 0)).toBe(27);
    expect(indicatorX(390, 5, 2)).toBe(183);
    expect(indicatorX(390, 5, 4)).toBe(339);
  });

  it('has no position for a hidden or missing tab', () => {
    expect(indicatorX(390, 5, -1)).toBeNull();
    expect(indicatorX(390, 5, 5)).toBeNull();
    expect(indicatorX(0, 5, 1)).toBeNull();
  });
});
