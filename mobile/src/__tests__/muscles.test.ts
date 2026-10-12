import { describe, expect, it } from 'vitest';

import { muscleMapLabel, muscleNames, musclesForExercises, toneFor } from '../lib/muscles';

describe('musclesForExercises', () => {
  it('lists primary muscles most-worked first and secondaries by count', () => {
    // Push-up: chest + triceps, shoulders, core. Bench: chest + triceps, shoulders.
    // Squat: quads + glutes.
    const r = musclesForExercises(['Push-up', 'Dumbbell bench press', 'Bodyweight squat']);
    expect(r.primary).toEqual(['chest', 'quads']);
    expect(r.secondary).toEqual(['triceps', 'shoulders', 'core', 'glutes']);
  });

  it('drops a secondary that is primary elsewhere in the session', () => {
    const r = musclesForExercises(['Push-up', 'Close-grip bench press']);
    expect(r.primary).toEqual(['chest', 'triceps']);
    expect(r.secondary).toEqual(['shoulders', 'core']);
    expect(r.secondary).not.toContain('chest');
  });

  it('resolves ids and aliases, and skips names it does not know', () => {
    const r = musclesForExercises(['push_up', 'Pushups', 'Something made up', '']);
    expect(r.primary).toEqual(['chest']);
    expect(r.secondary).toEqual(['triceps', 'shoulders', 'core']);
  });

  it('is empty for an empty session', () => {
    expect(musclesForExercises([])).toEqual({ primary: [], secondary: [] });
  });
});

describe('toneFor', () => {
  it('main beats also, and unlisted muscles stay unlit', () => {
    expect(toneFor('chest', ['chest'], ['chest'])).toBe('main');
    expect(toneFor('triceps', ['chest'], ['triceps'])).toBe('also');
    expect(toneFor('quads', ['chest'], ['triceps'])).toBe('none');
  });

  it('full body lights everything as also', () => {
    expect(toneFor('calves', ['full_body'], [])).toBe('also');
    expect(toneFor('back', [], ['full_body'])).toBe('also');
    expect(toneFor('core', ['full_body'], ['core'])).toBe('also');
    expect(toneFor('core', ['core'], ['full_body'])).toBe('main');
  });

  it('conditioning lights the legs as also, nothing else', () => {
    expect(toneFor('quads', ['cardio'], [])).toBe('also');
    expect(toneFor('calves', ['cardio'], [])).toBe('also');
    expect(toneFor('chest', ['cardio'], [])).toBe('none');
  });
});

describe('muscleMapLabel', () => {
  it('reads as one sentence', () => {
    expect(muscleMapLabel(['chest', 'triceps'], ['shoulders'])).toBe('Works chest and triceps, with shoulders');
    expect(muscleMapLabel(['chest', 'triceps', 'back'], [])).toBe('Works chest, triceps and back');
    expect(muscleMapLabel([], ['core'])).toBe('Works core');
    expect(muscleMapLabel(['full_body'], ['cardio'])).toBe('Works the full body, with conditioning');
    expect(muscleMapLabel([], [])).toBe('Muscle map, nothing targeted');
  });

  it('names for the legend start with a capital', () => {
    expect(muscleNames(['chest', 'triceps'])).toBe('Chest, triceps');
    expect(muscleNames(['full_body'])).toBe('Full body');
    expect(muscleNames([])).toBe('');
  });
});
