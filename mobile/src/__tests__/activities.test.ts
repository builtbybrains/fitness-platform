import { describe, expect, it } from 'vitest';

import { ACTIVITIES, activityDef, DEFAULT_WEIGHT_KG, EFFORT_HINTS, EFFORTS, isActivityKind, kcalFor } from '../data/activities';

describe('activities', () => {
  it('lists every activity from the spec', () => {
    const kinds = ACTIVITIES.map((a) => a.kind);
    for (const k of ['walking', 'running', 'football', 'basketball', 'swimming', 'cycling', 'padel', 'hiking', 'dancing', 'other']) {
      expect(kinds).toContain(k);
    }
  });

  it('has MET values that rise with effort', () => {
    for (const a of ACTIVITIES) {
      expect(a.met.easy).toBeGreaterThan(1);
      expect(a.met.moderate).toBeGreaterThan(a.met.easy);
      expect(a.met.hard).toBeGreaterThan(a.met.moderate);
      expect(a.met.hard).toBeLessThan(16);
    }
    for (const e of EFFORTS) expect(EFFORT_HINTS[e]).toBeTruthy();
  });

  it('kcal = MET × kg × hours', () => {
    expect(kcalFor('running', 30, 'moderate', 70)).toBe(Math.round(9.8 * 70 * 0.5)); // 343
    expect(kcalFor('walking', 60, 'moderate', 80)).toBe(280);
    expect(kcalFor('padel', 90, 'hard', 75)).toBe(Math.round(8 * 75 * 1.5));
  });

  it('uses 70 kg when the weight is missing or implausible', () => {
    expect(kcalFor('cycling', 60, 'easy', null)).toBe(Math.round(4 * DEFAULT_WEIGHT_KG));
    expect(kcalFor('cycling', 60, 'easy', 5)).toBe(Math.round(4 * DEFAULT_WEIGHT_KG));
  });

  it('clamps minutes and handles unknown kinds as other', () => {
    expect(kcalFor('walking', -10, 'easy', 70)).toBe(0);
    expect(kcalFor('walking', 10_000, 'easy', 70)).toBe(Math.round(2.8 * 70 * 12));
    expect(activityDef('skydiving').kind).toBe('other');
    expect(isActivityKind('padel')).toBe(true);
    expect(isActivityKind('skydiving')).toBe(false);
  });
});
