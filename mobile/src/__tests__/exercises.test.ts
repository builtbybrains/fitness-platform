import { describe, expect, it } from 'vitest';

import {
  ALL_EQUIPMENT,
  alternativesFor,
  availableEquipment,
  EXERCISES,
  exercisesFor,
  findExercise,
  fitsEquipment,
  INJURY_AREAS,
  injuriesFromText,
  safeFor,
  variantFor,
  type InjuryArea,
  type Muscle,
} from '../data/exercises';
import { buildWeek } from '../planData';

const SETUPS = {
  home_none: availableEquipment('home_none'),
  home_some: availableEquipment('home_equipment', ['dumbbells', 'bands']),
  home_bar: availableEquipment('home_equipment', ['pullup_bar', 'kettlebell']),
  gym: availableEquipment('gym'),
};
const INJURY_SETS: InjuryArea[][] = [[], ['knee'], ['lower_back', 'shoulder'], ['wrist']];

/** File contents as text (Vite ?raw import; no Node types needed). */
async function readText(rel: string): Promise<string> {
  const mod = (await import(/* @vite-ignore */ `${new URL(rel, import.meta.url).pathname}?raw`)) as { default: string };
  return mod.default;
}

describe('exercise library', () => {
  it('is byte-identical in the app and the Edge Functions', async () => {
    const app = await readText('../data/exercises.ts');
    const server = await readText('../../../supabase/functions/_shared/exercises.ts');
    expect(app.length).toBeGreaterThan(1000);
    expect(server).toBe(app);
  });

  it('has at least 80 exercises with unique ids and valid tags', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(80);
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    expect(new Set(EXERCISES.map((e) => e.name.toLowerCase())).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.equipment.length).toBeGreaterThan(0);
      for (const k of e.equipment) expect(ALL_EQUIPMENT).toContain(k);
      for (const c of e.cautions) expect(INJURY_AREAS).toContain(c);
      expect(e.sets).toBeGreaterThan(0);
      expect(e.reps).toBeGreaterThan(0);
      expect(e.cue.length).toBeGreaterThan(5);
      expect(e.cue).not.toMatch(/\u2014/);
    }
  });

  it('covers every equipment type, and every main muscle without equipment', () => {
    for (const k of ALL_EQUIPMENT) expect(EXERCISES.some((e) => e.equipment.includes(k))).toBe(true);
    const muscles: Muscle[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio'];
    for (const m of muscles) expect(exercisesFor({ available: SETUPS.home_none, muscle: m }).length).toBeGreaterThan(0);
  });

  it('maps every exercise of the built-in week by name', () => {
    for (const day of buildWeek(new Date(2026, 8, 28))) {
      if (day.session.kind !== 'workout') continue;
      for (const e of day.session.exercises) expect(findExercise(e.name), e.name).not.toBeNull();
    }
    expect(findExercise('  bench PRESS ')!.id).toBe('barbell_bench');
    expect(findExercise('db_row')!.name).toBe('One-arm dumbbell row');
    expect(findExercise('Moon walk')).toBeNull();
  });

  it('knows what each place offers', () => {
    expect(availableEquipment('home_none')).toEqual(['none']);
    expect(availableEquipment('home_equipment', ['dumbbells', 'other'])).toEqual(['none', 'dumbbells']);
    expect(availableEquipment('gym')).toEqual([...ALL_EQUIPMENT]);
    expect(availableEquipment(null)).toEqual(['none']);
  });

  it('reads injury areas from free text', () => {
    expect(injuriesFromText('Old knee sprain and a sore lower back')).toEqual(['knee', 'lower_back']);
    expect(injuriesFromText('rotator cuff issue')).toEqual(['shoulder']);
    expect(injuriesFromText('')).toEqual([]);
  });
});

describe('alternativesFor', () => {
  it('always fits the equipment, avoids the injuries and stays on the same muscle group', () => {
    for (const ex of EXERCISES) {
      for (const [, available] of Object.entries(SETUPS)) {
        for (const injuries of INJURY_SETS) {
          const alts = alternativesFor(ex, available, injuries);
          expect(alts.length).toBeLessThanOrEqual(3);
          for (const a of alts) {
            expect(a.id).not.toBe(ex.id);
            expect(fitsEquipment(a, available)).toBe(true);
            expect(safeFor(a, injuries)).toBe(true);
            expect(a.muscle === ex.muscle || a.secondary.includes(ex.muscle) || a.pattern === ex.pattern).toBe(true);
          }
          expect(new Set(alts.map((a) => a.id)).size).toBe(alts.length);
        }
      }
    }
  });

  it('offers 3 same-muscle options in a gym for every exercise', () => {
    for (const ex of EXERCISES) {
      const alts = alternativesFor(ex, SETUPS.gym, []);
      expect(alts.length, ex.id).toBe(3);
      expect(alts.filter((a) => a.muscle === ex.muscle).length, ex.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers 3 options at home with no equipment for the main muscle groups', () => {
    for (const m of ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes', 'core', 'cardio'] as Muscle[]) {
      const first = exercisesFor({ available: SETUPS.home_none, muscle: m })[0];
      expect(alternativesFor(first, SETUPS.home_none, []).length, m).toBe(3);
    }
  });

  it('leaves nobody without options: at least 2 for every muscle, place and single injury', () => {
    const places = { home_none: SETUPS.home_none, home_dumbbells: availableEquipment('home_equipment', ['dumbbells']), home_bands: availableEquipment('home_equipment', ['bands']), gym: SETUPS.gym };
    const fewer: string[] = [];
    for (const m of ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio'] as Muscle[]) {
      for (const [place, available] of Object.entries(places)) {
        for (const injuries of [[], ...INJURY_AREAS.map((i) => [i])] as InjuryArea[][]) {
          const first = exercisesFor({ available, muscle: m })[0];
          const n = alternativesFor(first, available, injuries).length;
          expect(n, `${m} ${place} ${injuries.join()}`).toBeGreaterThanOrEqual(2);
          if (n < 3) fewer.push(`${m} ${place} ${injuries.join()}`);
        }
      }
    }
    // Known thin spots: bodyweight-only with a wrist or knee injury.
    expect(fewer.length).toBeLessThanOrEqual(3);
  });

  it('puts the same movement pattern first', () => {
    const alts = alternativesFor('back_squat', SETUPS.gym, []);
    expect(alts[0].pattern).toBe('squat');
    expect(alts[0].muscle).toBe('quads');
  });

  it('swaps away from a knee-loading squat for someone with a knee injury', () => {
    const alts = alternativesFor('back_squat', SETUPS.home_some, ['knee']);
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect(a.cautions).not.toContain('knee');
  });

  it('respects a level cap and exclusions', () => {
    const alts = alternativesFor('push_up', SETUPS.gym, [], { maxLevel: 'beginner', exclude: ['incline_push_up'] });
    for (const a of alts) {
      expect(a.level).toBe('beginner');
      expect(a.id).not.toBe('incline_push_up');
    }
  });

  it('accepts a name and returns [] for an unknown exercise', () => {
    expect(alternativesFor('Lat pulldown', SETUPS.gym).length).toBe(3);
    expect(alternativesFor('Unknown thing', SETUPS.gym)).toEqual([]);
  });

  it('variantFor keeps a fitting exercise and finds one for a new place', () => {
    expect(variantFor('push_up', SETUPS.home_none)!.id).toBe('push_up');
    const v = variantFor('barbell_bench', SETUPS.home_none)!;
    expect(fitsEquipment(v, SETUPS.home_none)).toBe(true);
    expect(v.muscle).toBe('chest');
  });
});

describe('alternativesFor keeps the kind of load', () => {
  it('offers loaded presses, not push-ups, to someone with gym kit', () => {
    const alts = alternativesFor('incline_db_press', ALL_EQUIPMENT);
    expect(alts.length).toBe(3);
    expect(alts.every((e) => !e.equipment.every((k) => k === 'none'))).toBe(true);
  });

  it('still offers bodyweight moves when that is all there is', () => {
    const alts = alternativesFor('incline_db_press', ['none']);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((e) => e.equipment.every((k) => k === 'none'))).toBe(true);
  });
});
