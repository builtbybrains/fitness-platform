import { describe, expect, it } from 'vitest';

import {
  arcAngles,
  arcLength,
  arcSweep,
  clockPoint,
  donutSegments,
  plateDrop,
  plateSlots,
  plateThickness,
  plateY,
  retarget,
  segmentAt,
  settle,
  sharePercents,
  shelfOrder,
  shelfSlots,
  softClamp,
  stepTween,
  swapPose,
  TAU,
  tween,
  tweenDone,
  tweenValue,
  visiblePlates,
} from '../components/three/layout';
import { spinAtRest, stepSpring } from '../components/three/pose';
import { objectForScreen } from '../components/onboarding/objects';

describe('tween', () => {
  it('eases from the current value to the target and reports done', () => {
    let t = retarget(tween(0), 0.6, 0.4);
    expect(tweenValue(t)).toBe(0);
    t = stepTween(t, 0.2);
    // ease-out quart at halfway is 1 - 0.5^4
    expect(tweenValue(t)).toBeCloseTo(0.6 * (1 - 0.0625), 6);
    expect(tweenDone(t)).toBe(false);
    t = stepTween(t, 0.5);
    expect(tweenValue(t)).toBe(0.6);
    expect(tweenDone(t)).toBe(true);
  });

  it('retargets from where it is mid-way, and settles at once', () => {
    let t = stepTween(retarget(tween(0), 1, 0.4), 0.1);
    const mid = tweenValue(t);
    t = retarget(t, 0, 0.25);
    expect(tweenValue(t)).toBeCloseTo(mid, 9);
    expect(tweenValue(settle(t))).toBe(0);
  });

  it('holds its start value through a negative (delay) elapsed', () => {
    const t = { from: 1, to: 0, elapsed: -0.2, duration: 0.35 };
    expect(tweenValue(t)).toBe(1);
    expect(tweenDone(t)).toBe(false);
  });
});

describe('Today ring arc', () => {
  it('sweeps a share of a full turn, clamped', () => {
    expect(arcSweep(0.25)).toBeCloseTo(Math.PI / 2, 9);
    expect(arcSweep(1.4)).toBeCloseTo(TAU, 9);
    expect(arcSweep(-1)).toBe(0);
  });

  it('arc length is sweep times radius', () => {
    expect(arcLength(0.5, 1)).toBeCloseTo(Math.PI, 9);
    expect(arcLength(0.25, 96)).toBeCloseTo(48 * Math.PI, 9);
  });

  it('starts at 12 o clock and runs clockwise', () => {
    const [x0, y0] = clockPoint(0, 1);
    expect(x0).toBeCloseTo(0, 9);
    expect(y0).toBeCloseTo(1, 9);
    const [x1, y1] = clockPoint(Math.PI / 2, 1);
    expect(x1).toBeCloseTo(1, 9); // 3 o'clock is to the right
    expect(y1).toBeCloseTo(0, 9);
  });

  it('spaces arc samples evenly to the end of the fill', () => {
    const a = arcAngles(0.5, 4);
    expect(a).toHaveLength(5);
    expect(a[0]).toBe(0);
    expect(a[4]).toBeCloseTo(Math.PI, 9);
    expect(a[2]).toBeCloseTo(Math.PI / 2, 9);
  });

  it('limits the drag tilt softly', () => {
    expect(softClamp(0.01, 0.6)).toBeCloseTo(0.01, 4);
    expect(softClamp(50, 0.6)).toBeLessThanOrEqual(0.6);
    expect(softClamp(-50, 0.6)).toBeGreaterThanOrEqual(-0.6);
  });
});

describe('macro donut segments', () => {
  it('sizes segments by share of calories with equal gaps', () => {
    // 100 g protein (400 kcal), 100 g carbs (400), 0 fat: half and half.
    const gap = 0.1;
    const s = donutSegments({ protein: 100, carbs: 100, fat: 0 }, gap);
    expect(s.map((x) => x.key)).toEqual(['protein', 'carbs']);
    const sweep = (x: { start: number; end: number }) => x.end - x.start;
    expect(sweep(s[0])).toBeCloseTo(sweep(s[1]), 9);
    expect(sweep(s[0]) + sweep(s[1]) + 2 * gap).toBeCloseTo(TAU, 9);
    expect(s[1].start - s[0].end).toBeCloseTo(gap, 9);
  });

  it('counts fat at 9 kcal a gram', () => {
    const s = donutSegments({ protein: 9, carbs: 0, fat: 4 });
    expect(s[0].share).toBeCloseTo(0.5, 9);
    expect(s[1].share).toBeCloseTo(0.5, 9);
    expect(s[1].grams).toBe(4);
  });

  it('draws one macro as a full ring with no gap, and nothing as no segments', () => {
    const one = donutSegments({ protein: 30, carbs: 0, fat: 0 });
    expect(one).toHaveLength(1);
    expect(one[0].start).toBe(0);
    expect(one[0].end).toBeCloseTo(TAU, 9);
    expect(donutSegments({ protein: 0, carbs: 0, fat: 0 })).toEqual([]);
    expect(donutSegments({ protein: -5, carbs: Number.NaN, fat: 0 })).toEqual([]);
  });

  it('keeps a sliver tappable and still fills the ring', () => {
    const gap = 0.08;
    const s = donutSegments({ protein: 200, carbs: 300, fat: 0.2 }, gap, 0.12);
    const fat = s.find((x) => x.key === 'fat')!;
    expect(fat.end - fat.start).toBeCloseTo(0.12, 9);
    const total = s.reduce((a, x) => a + (x.end - x.start), 0) + gap * s.length;
    expect(total).toBeCloseTo(TAU, 9);
  });

  it('finds the segment under an angle, and none in a gap', () => {
    const s = donutSegments({ protein: 100, carbs: 100, fat: 0 }, 0.2);
    expect(segmentAt(s, s[0].mid)).toBe('protein');
    expect(segmentAt(s, s[1].mid + TAU)).toBe('carbs');
    expect(segmentAt(s, s[0].end + 0.1)).toBeNull();
  });

  it('rounds percents to add up to 100', () => {
    const s = donutSegments({ protein: 1, carbs: 1, fat: 4 / 9 });
    const p = sharePercents(s);
    expect((p.protein ?? 0) + (p.carbs ?? 0) + (p.fat ?? 0)).toBe(100);
    expect(sharePercents([])).toEqual({});
  });
});

describe('plate stack', () => {
  it('gives one plate a set up to the cap', () => {
    expect(plateSlots(9)).toBe(9);
    expect(plateSlots(20)).toBe(12);
    for (let d = 0; d <= 9; d++) expect(visiblePlates(d, 9)).toBe(d);
  });

  it('past the cap, the first tick drops a plate and the last fills the stack', () => {
    expect(visiblePlates(1, 15)).toBe(1);
    expect(visiblePlates(15, 15)).toBe(12);
    let last = 0;
    for (let d = 0; d <= 15; d++) {
      const v = visiblePlates(d, 15);
      expect(v).toBeGreaterThanOrEqual(last); // never shrinks as sets are ticked
      expect(v).toBeLessThanOrEqual(12);
      last = v;
    }
  });

  it('handles nothing to do and overshoot', () => {
    expect(visiblePlates(0, 0)).toBe(0);
    expect(visiblePlates(3, 0)).toBe(0);
    expect(visiblePlates(30, 12)).toBe(12);
  });

  it('thins plates so a full stack fits, never thicker than the max', () => {
    expect(plateThickness(3, 1.3, 0.22)).toBe(0.22);
    expect(plateThickness(12, 1.3, 0.22)).toBeCloseTo(1.3 / 12, 9);
    expect(plateThickness(40, 1.3, 0.22)).toBeCloseTo(1.3 / 12, 9);
  });

  it('stacks plate centres a thickness and a gap apart from the floor', () => {
    expect(plateY(0, 0.2, 0.05)).toBeCloseTo(0.1, 9);
    expect(plateY(3, 0.2, 0.05)).toBeCloseTo(3 * 0.25 + 0.1, 9);
    expect(plateY(3, 0.2, 0) - plateY(2, 0.2, 0)).toBeCloseTo(0.2, 9);
  });

  it('drops in from above and lands at 0.35s', () => {
    expect(plateDrop(0)).toBeCloseTo(1.2, 9);
    expect(plateDrop(0.35)).toBe(0);
    expect(plateDrop(0.1)).toBeLessThan(plateDrop(0.05));
  });
});

describe('trophy shelf', () => {
  it('centres medals and keeps them at most a step apart', () => {
    expect(shelfSlots(0, 4, 1)).toEqual([]);
    expect(shelfSlots(1, 4, 1)).toEqual([0]);
    const xs = shelfSlots(4, 10, 0.8);
    expect(xs[1] - xs[0]).toBeCloseTo(0.8, 9);
    expect(xs[0] + xs[3]).toBeCloseTo(0, 9);
    const tight = shelfSlots(8, 4, 1);
    expect(tight[7] - tight[0]).toBeCloseTo(3.5, 9);
  });

  it('counts earned medals and lights the last one', () => {
    const items = [
      { earned: true, earnedAt: '2026-09-08' },
      { earned: false, earnedAt: null },
      { earned: true, earnedAt: '2026-09-20' },
    ];
    expect(shelfOrder(items)).toEqual({ count: 2, newest: 1 });
    expect(shelfOrder([])).toEqual({ count: 0, newest: -1 });
  });
});

describe('questionnaire object', () => {
  it('shrinks and spins out in 250ms, then grows in over 300ms', () => {
    expect(swapPose(0).phase).toBe('out');
    expect(swapPose(0).scale).toBeCloseTo(1, 6);
    expect(swapPose(0.249).scale).toBeLessThan(0.05);
    const inn = swapPose(0.26);
    expect(inn.phase).toBe('in');
    expect(inn.spin).toBeLessThan(0);
    const rest = swapPose(0.56);
    expect(rest).toEqual({ phase: 'rest', scale: 1, spin: 0 });
  });

  it('only comes in on first mount', () => {
    expect(swapPose(0, true).phase).toBe('in');
    expect(swapPose(0.31, true).phase).toBe('rest');
  });

  it('groups the screens by topic', () => {
    for (const id of ['name', 'phone', 'birth_date', 'guardian', 'gender', 'body', 'activity', 'job', 'sleep', 'goal', 'injuries', 'conditions', 'photo']) {
      expect(objectForScreen(id)).toBe('dumbbell');
    }
    expect(objectForScreen('location')).toBe('kettlebell');
    expect(objectForScreen('schedule')).toBe('kettlebell');
    for (const id of ['diet', 'allergies', 'dislikes']) expect(objectForScreen(id)).toBe('shaker');
    for (const id of ['timeline', 'waiver', 'finish']) expect(objectForScreen(id)).toBe('medal');
  });
});

describe('drag spring', () => {
  it('springs back to rest without crossing zero', () => {
    let s = { angle: 0.6, velocity: 0, dragging: false };
    let crossed = false;
    for (let i = 0; i < 60; i++) {
      s = stepSpring(s, 1 / 60);
      if (s.angle < -1e-6) crossed = true;
    }
    expect(crossed).toBe(false);
    expect(spinAtRest(s, true)).toBe(true);
  });

  it('holds still while dragging', () => {
    const s = { angle: 0.4, velocity: 0, dragging: true };
    expect(stepSpring(s, 0.1)).toBe(s);
    expect(spinAtRest(s, true)).toBe(false);
  });
});
