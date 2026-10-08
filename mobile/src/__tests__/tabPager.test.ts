import { beforeEach, describe, expect, it } from 'vitest';

import {
  markTouch,
  neighbourIndex,
  PAGER_EDGE,
  PAGER_TABS,
  pagerDecision,
  pagerIndex,
  pagerOffset,
  shouldClaimTab,
  touchStart,
} from '../lib/tabPager';
import { CHECK_LENGTH, dashOffset, pointReach, polylineLength, segmentAt, segmentX, staggered, staggerTotal, wavePath } from '../lib/motionMath';

const W = 412;
const base = { dy: 0, startX: 200, width: W, owner: null } as const;

describe('shouldClaimTab', () => {
  it('claims a clear sideways drag either way', () => {
    expect(shouldClaimTab({ ...base, dx: -40 })).toBe(true);
    expect(shouldClaimTab({ ...base, dx: 40 })).toBe(true);
  });

  it('waits for more than 14px of travel', () => {
    expect(shouldClaimTab({ ...base, dx: 14 })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: -14 })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: 15 })).toBe(true);
  });

  it('leaves vertical and diagonal drags to the scroll', () => {
    expect(shouldClaimTab({ ...base, dx: 30, dy: 30 })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: 30, dy: 19 })).toBe(false); // 30 < 1.6 x 19
    expect(shouldClaimTab({ ...base, dx: 30, dy: 18 })).toBe(true);
    expect(shouldClaimTab({ ...base, dx: 2, dy: 80 })).toBe(false);
  });

  it('never starts within 20px of either edge (Android back gesture)', () => {
    expect(shouldClaimTab({ ...base, dx: -60, startX: PAGER_EDGE - 1 })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: -60, startX: W - PAGER_EDGE + 1 })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: -60, startX: PAGER_EDGE })).toBe(true);
  });

  it('leaves rightward drags that start on a swipe row to the row', () => {
    expect(shouldClaimTab({ ...base, dx: 60, owner: 'row' })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: -60, owner: 'row' })).toBe(true);
  });

  it('never takes drags that start on a 3D object or an exempt area', () => {
    expect(shouldClaimTab({ ...base, dx: -60, owner: '3d' })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: 60, owner: '3d' })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: -60, owner: 'exempt' })).toBe(false);
  });

  it('stays off when disabled or before layout', () => {
    expect(shouldClaimTab({ ...base, dx: -60, enabled: false })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: -60, width: 0 })).toBe(false);
    expect(shouldClaimTab({ ...base, dx: NaN })).toBe(false);
  });
});

describe('markTouch', () => {
  beforeEach(() => {
    touchStart.owner = null;
  });

  it('records what the touch started on', () => {
    markTouch('row');
    expect(touchStart.owner).toBe('row');
  });

  it('lets a 3D object or exempt area inside a row win', () => {
    markTouch('row');
    markTouch('3d');
    expect(touchStart.owner).toBe('3d');
    markTouch('row');
    expect(touchStart.owner).toBe('3d');
  });
});

describe('pager neighbours', () => {
  it('knows the five tabs in bar order, and no place for Progress', () => {
    expect(PAGER_TABS.map((t) => t.title)).toEqual(['Today', 'Plan', 'Food', 'Coach', 'Profile']);
    expect(pagerIndex('food')).toBe(2);
    expect(pagerIndex('progress')).toBe(-1);
  });

  it('goes to the next tab when the finger moves left, the previous when right', () => {
    expect(neighbourIndex(0, -50)).toBe(1);
    expect(neighbourIndex(1, 50)).toBe(0);
    expect(neighbourIndex(2, -50)).toBe(3);
  });

  it('has nothing past the first or last tab, or without a place', () => {
    expect(neighbourIndex(0, 50)).toBeNull();
    expect(neighbourIndex(4, -50)).toBeNull();
    expect(neighbourIndex(-1, -50)).toBeNull();
    expect(neighbourIndex(2, 0)).toBeNull();
  });
});

describe('pagerOffset', () => {
  it('follows the finger one to one toward a neighbour, within the width', () => {
    expect(pagerOffset(-120, W, true)).toBe(-120);
    expect(pagerOffset(900, W, true)).toBe(W);
  });

  it('resists past the last tab and never goes past a quarter of the width', () => {
    const a = pagerOffset(-100, W, false);
    const b = pagerOffset(-300, W, false);
    expect(a).toBeLessThan(0);
    expect(Math.abs(a)).toBeLessThan(50);
    expect(Math.abs(b)).toBeGreaterThan(Math.abs(a));
    expect(Math.abs(pagerOffset(-100000, W, false))).toBeLessThan(W * 0.25);
  });

  it('is still for bad input', () => {
    expect(pagerOffset(NaN, W, true)).toBe(0);
    expect(pagerOffset(40, 0, true)).toBe(0);
  });
});

describe('pagerDecision', () => {
  const at = { width: W, hasNeighbour: true };
  it('commits past 28% of the width', () => {
    expect(pagerDecision({ ...at, dx: -0.29 * W, vx: 0 })).toBe('commit');
    expect(pagerDecision({ ...at, dx: 0.29 * W, vx: 0 })).toBe('commit');
    expect(pagerDecision({ ...at, dx: -0.27 * W, vx: 0 })).toBe('cancel');
  });

  it('commits a flick in the direction of travel', () => {
    expect(pagerDecision({ ...at, dx: -40, vx: -0.5 })).toBe('commit');
    expect(pagerDecision({ ...at, dx: -40, vx: -0.4 })).toBe('cancel');
    expect(pagerDecision({ ...at, dx: -40, vx: 0.9 })).toBe('cancel');
  });

  it('never commits without a neighbour', () => {
    expect(pagerDecision({ dx: -300, vx: -2, width: W, hasNeighbour: false })).toBe('cancel');
  });
});

describe('motion math', () => {
  it('staggers items and finishes each one', () => {
    expect(staggered(0, 0)).toBe(0);
    expect(staggered(420, 0)).toBe(1);
    expect(staggered(100, 3)).toBe(0); // item 3 starts at 150ms
    expect(staggered(150 + 420, 3)).toBe(1);
    expect(staggered(Infinity, 5)).toBe(1);
    expect(staggerTotal(8)).toBe(7 * 50 + 420);
  });

  it('measures a line and where each point is reached', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 9 },
    ];
    expect(polylineLength(pts)).toBe(10);
    expect(pointReach(pts)).toEqual([0, 0.5, 1]);
    expect(dashOffset(10, 0)).toBe(10);
    expect(dashOffset(10, 1)).toBe(0);
    expect(dashOffset(10, 2)).toBe(0);
  });

  it('knows the check length', () => {
    expect(CHECK_LENGTH).toBeCloseTo(19.8, 1);
  });

  it('fills the drop from the bottom and ends flat at the top', () => {
    const top = (d: string) => Number(d.slice(1).split(' ')[1]);
    expect(top(wavePath(0))).toBeGreaterThan(18);
    expect(top(wavePath(1))).toBeCloseTo(3, 5);
    expect(wavePath(1)).not.toMatch(/NaN/);
  });

  it('places a sliding pill over equal segments', () => {
    // Segmented: 4px padding, 4px gap, two segments in 300px.
    expect(segmentX(300, 2, 0, 4, 4)).toEqual({ x: 4, w: 144 });
    expect(segmentX(300, 2, 1, 4, 4)).toEqual({ x: 152, w: 144 });
    expect(segmentX(0, 2, 1, 4)).toBeNull();
    expect(segmentX(300, 2, 2, 4)).toBeNull();
    expect(segmentAt(152, 144, 4, 2, 4)).toBe(1);
    expect(segmentAt(60, 144, 4, 2, 4)).toBe(0);
    expect(segmentAt(9999, 144, 4, 2, 4)).toBe(1);
  });
});
