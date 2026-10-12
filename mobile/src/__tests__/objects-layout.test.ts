import { describe, expect, it } from 'vitest';

import {
  arcSweep,
  donutSegments,
  latestEarned,
  liftOffset,
  objectFrame,
  PLATE_CAP,
  plateRadius,
  plateSlots,
  plateThickness,
  plateY,
  revealSegments,
  segmentAt,
  sharePercents,
  sliceAt,
  slicePath,
  swapPose,
  TAU,
  visiblePlates,
} from '../lib/objects/layout';
import { objectForScreen } from '../components/onboarding/objects';

describe('arcs', () => {
  it('sweeps a share of a full turn, clamped', () => {
    expect(arcSweep(0.25)).toBeCloseTo(Math.PI / 2, 9);
    expect(arcSweep(1.4)).toBeCloseTo(TAU, 9);
    expect(arcSweep(-1)).toBe(0);
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
  it('gives one plate a set up to the cap of 6', () => {
    expect(PLATE_CAP).toBe(6);
    expect(plateSlots(5)).toBe(5);
    expect(plateSlots(20)).toBe(6);
    for (let d = 0; d <= 5; d++) expect(visiblePlates(d, 5)).toBe(d);
  });

  it('past the cap, sets map onto the plates in proportion', () => {
    expect(visiblePlates(1, 15)).toBe(1);
    expect(visiblePlates(3, 12)).toBe(2);
    expect(visiblePlates(6, 12)).toBe(3);
    expect(visiblePlates(15, 15)).toBe(6);
    let last = 0;
    for (let d = 0; d <= 15; d++) {
      const v = visiblePlates(d, 15);
      expect(v).toBeGreaterThanOrEqual(last); // never shrinks as sets are ticked
      expect(v).toBeLessThanOrEqual(6);
      last = v;
    }
  });

  it('handles nothing to do and overshoot', () => {
    expect(visiblePlates(0, 0)).toBe(0);
    expect(visiblePlates(3, 0)).toBe(0);
    expect(visiblePlates(30, 12)).toBe(6);
  });

  it('alternates full and smaller plates', () => {
    expect([0, 1, 2, 3, 4, 5].map(plateRadius)).toEqual([1, 0.86, 1, 0.86, 1, 0.86]);
  });

  it('thins plates so a full stack fits, never thicker than the max', () => {
    expect(plateThickness(3, 1.3, 0.22)).toBe(0.22);
    expect(plateThickness(6, 1.2, 0.22)).toBeCloseTo(0.2, 9);
    expect(plateThickness(40, 1.2, 0.22)).toBeCloseTo(0.2, 9);
  });

  it('stacks plate centres a thickness and a gap apart from the floor', () => {
    expect(plateY(0, 0.2, 0.05)).toBeCloseTo(0.1, 9);
    expect(plateY(3, 0.2, 0.05)).toBeCloseTo(3 * 0.25 + 0.1, 9);
    expect(plateY(3, 0.2, 0) - plateY(2, 0.2, 0)).toBeCloseTo(0.2, 9);
  });
});

describe('trophy shelf', () => {
  it('shows the latest milestone earned', () => {
    const items = [
      { id: 'a', earned: true, earnedAt: '2026-09-08' },
      { id: 'b', earned: false, earnedAt: null },
      { id: 'c', earned: true, earnedAt: '2026-09-20' },
      { id: 'd', earned: true, earnedAt: '2026-09-12' },
    ];
    expect(latestEarned(items)?.id).toBe('c');
  });

  it('breaks a tie by list order and puts undated ones first', () => {
    const items = [
      { id: 'a', earned: true, earnedAt: '2026-09-20' },
      { id: 'b', earned: true, earnedAt: '2026-09-20' },
      { id: 'c', earned: true, earnedAt: null },
    ];
    expect(latestEarned(items)?.id).toBe('b');
    expect(latestEarned([{ id: 'x', earned: true, earnedAt: null }])?.id).toBe('x');
  });

  it('is empty when nothing is earned', () => {
    expect(latestEarned([])).toBeNull();
    expect(latestEarned([{ earned: false, earnedAt: null }])).toBeNull();
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
    expect(rest).toEqual({ phase: 'rest', scale: 1, spin: 0, opacity: 1 });
  });

  it('fades out as it leaves and is fully up before it lands', () => {
    expect(swapPose(0).opacity).toBe(1);
    expect(swapPose(0.249).opacity).toBeLessThan(0.05);
    expect(swapPose(0.25).opacity).toBeCloseTo(0, 6);
    expect(swapPose(0.45).opacity).toBe(1);
    for (let t = 0.25; t < 0.55; t += 0.01) expect(swapPose(t).scale).toBeLessThanOrEqual(1);
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

describe('macro donut drawing', () => {
  const segs = donutSegments({ protein: 100, carbs: 100, fat: 0 }, 0.1);
  const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

  it('draws a slice from its outer start, round the outer edge, back round the inner edge', () => {
    // A quarter from 12 o'clock to 3 o'clock on a 100 box, radii 30 and 50.
    const d = slicePath(50, 50, 30, 50, 0, Math.PI / 2);
    expect(d.startsWith('M50 0A50 50 0 0 1 100 50L80 50A30 30 0 0 0 50 20Z')).toBe(true);
  });

  it('uses the large-arc flag past half a turn', () => {
    const d = slicePath(50, 50, 30, 50, 0, Math.PI * 1.5);
    expect(d).toContain('A50 50 0 1 1');
    expect(d).toContain('A30 30 0 1 0');
  });

  it('draws a whole ring as two circles and nothing for no sweep', () => {
    const ring = slicePath(50, 50, 30, 50, 0, TAU);
    expect(ring.match(/M/g)).toHaveLength(2);
    for (const n of nums(ring)) expect(Math.abs(n)).toBeLessThanOrEqual(100);
    expect(slicePath(50, 50, 30, 50, 1, 1)).toBe('');
  });

  it('keeps every point inside the box', () => {
    for (const s of segs) {
      const xs = nums(slicePath(70, 70, 37, 63, s.start, s.end));
      for (const n of xs) expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('sweeps the slices in clockwise, cutting the one it is crossing', () => {
    expect(revealSegments(segs, 0)).toEqual([]);
    const half = revealSegments(segs, Math.PI / 2);
    expect(half).toHaveLength(1);
    expect(half[0].key).toBe('protein');
    expect(half[0].end).toBeCloseTo(Math.PI / 2, 9);
    expect(half[0].mid).toBeCloseTo((half[0].start + Math.PI / 2) / 2, 9);
    expect(revealSegments(segs, TAU)).toEqual(segs);
    // The input is never changed.
    expect(segs[0].end).toBeGreaterThan(Math.PI / 2);
  });

  it('pops a slice out along its middle, y down', () => {
    const up = liftOffset(0, 6);
    expect(up.dx).toBeCloseTo(0, 9);
    expect(up.dy).toBeCloseTo(-6, 9);
    const right = liftOffset(Math.PI / 2, 6);
    expect(right.dx).toBeCloseTo(6, 9);
    expect(right.dy).toBeCloseTo(0, 9);
  });

  it('finds the slice under a tap, and nothing in the hole or far outside', () => {
    // Protein runs from 12 to about 6 o'clock on the right, carbs on the left.
    expect(sliceAt(segs, 90, 50, 50, 50, 30, 50)).toBe('protein');
    expect(sliceAt(segs, 10, 50, 50, 50, 30, 50)).toBe('carbs');
    expect(sliceAt(segs, 50, 50, 50, 50, 30, 50)).toBeNull();
    expect(sliceAt(segs, 50 + 70, 50, 50, 50, 30, 50)).toBeNull();
    // Within the slack just outside the ring still counts.
    expect(sliceAt(segs, 50 + 55, 50, 50, 50, 30, 50)).toBe('protein');
  });
});

describe('object image framing', () => {
  const wide = { left: 0.1, top: 0.3, right: 0.9, bottom: 0.7 }; // 0.8 x 0.4
  const tall = { left: 0.3, top: 0.1, right: 0.7, bottom: 0.9 }; // 0.4 x 0.8

  it('gives a long object and a tall one the same visual mass', () => {
    const a = objectFrame(wide, 80, 1000, 1000);
    const b = objectFrame(tall, 80, 1000, 1000);
    expect(a.side).toBeCloseTo(b.side, 6);
    expect(Math.sqrt(0.8 * a.side * 0.4 * a.side)).toBeCloseTo(80, 0);
  });

  it('never lets the object outgrow the box', () => {
    const f = objectFrame(tall, 80, 1000, 100);
    expect(f.side * 0.8).toBeLessThanOrEqual(100.05);
    const g = objectFrame(wide, 80, 100, 1000);
    expect(g.side * 0.8).toBeLessThanOrEqual(100.05);
  });

  it('shifts an off-centre object onto the middle', () => {
    const f = objectFrame({ left: 0.2, top: 0.2, right: 1, bottom: 0.6 }, 100, 1000, 1000);
    expect(f.dx).toBeLessThan(0); // its middle is right of centre: move it left
    expect(f.dy).toBeGreaterThan(0); // and above centre: move it down
    expect(objectFrame(wide, 80, 1000, 1000)).toMatchObject({ dx: 0, dy: 0 });
  });
});
