import { beforeAll, describe, expect, it } from 'vitest';

import { ACTIVITIES, activitiesFor, activityDef, DEFAULT_WEIGHT_KG, EFFORT_HINTS, EFFORTS, isActivityKind, isSportKind, kcalFor, SPORT_KINDS, SPORTS } from '../data/activities';

// schema.sql as text (Vite ?raw import; no Node types needed).
let SCHEMA = '';
beforeAll(async () => {
  const path = new URL('../../../supabase/schema.sql', import.meta.url).pathname;
  SCHEMA = ((await import(/* @vite-ignore */ `${path}?raw`)) as { default: string }).default;
});

/** The quoted values inside one named check in schema.sql. */
function checkValues(name: string): string[] {
  const line = SCHEMA.split('\n').find((l: string) => l.includes(`'${name}'`));
  if (!line) throw new Error(`no ${name} in schema.sql`);
  const body = line.slice(line.indexOf('$c$'));
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('activities', () => {
  it('lists every activity from the spec', () => {
    const kinds = ACTIVITIES.map((a) => a.kind);
    for (const k of ['walking', 'running', 'football', 'basketball', 'swimming', 'cycling', 'padel', 'tennis', 'pilates', 'yoga', 'volleyball', 'martial_arts', 'boxing', 'climbing', 'crossfit', 'hiking', 'dancing', 'other']) {
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

  it('offers the sign-up sports from the same list people log', () => {
    expect(SPORTS.map((s) => s.label)).toEqual([
      'Pilates', 'Swimming', 'Football', 'Basketball', 'Tennis', 'Padel', 'Running', 'Cycling', 'Yoga',
      'Volleyball', 'Martial arts', 'Boxing', 'Hiking', 'Dance', 'Climbing', 'CrossFit', 'Other',
    ]);
    for (const k of SPORT_KINDS) expect(isActivityKind(k)).toBe(true);
    expect(isSportKind('tennis')).toBe(true);
    expect(isSportKind('walking')).toBe(false);
    expect(activityDef('tennis').label).toBe('Tennis');
    expect(kcalFor('tennis', 60, 'moderate', 70)).toBe(490);
  });

  it('puts the person\'s own sports first in the picker', () => {
    const order = activitiesFor(['tennis', 'other', 'pilates', 'skydiving']).map((a) => a.kind);
    expect(order.slice(0, 3)).toEqual(['tennis', 'pilates', 'walking']);
    expect(order).toHaveLength(ACTIVITIES.length);
    expect(new Set(order).size).toBe(ACTIVITIES.length);
    expect(activitiesFor(null).map((a) => a.kind)).toEqual(ACTIVITIES.map((a) => a.kind));
  });

  it('matches the database checks', () => {
    expect(checkValues('activities_kind_values_v2').sort()).toEqual(ACTIVITIES.map((a) => a.kind).sort());
    expect(checkValues('profiles_sports_values').sort()).toEqual([...SPORT_KINDS].sort());
  });
});
