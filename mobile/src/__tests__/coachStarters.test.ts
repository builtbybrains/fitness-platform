import { describe, expect, it } from 'vitest';

import { coachContextChips, focusName, pickStarters, proteinFarBelow, type CoachDay } from '../lib/coachStarters';

const base: CoachDay = {
  session: { kind: 'workout', focus: 'Upper body · Strength' },
  workoutDone: false,
  protein: { eaten: 80, target: 160 },
  kcal: { eaten: 675, target: 2400 },
  streak: 2,
  hour: 10,
};

describe('pickStarters', () => {
  it('offers a warm-up on a workout day, and always the week', () => {
    expect(pickStarters(base)).toEqual(['Warm-up for upper body?', "How's my week going?"]);
  });
  it('offers refuelling once the workout is done', () => {
    expect(pickStarters({ ...base, workoutDone: true })[0]).toBe('What should I eat after training?');
  });
  it('offers recovery on a rest day', () => {
    expect(pickStarters({ ...base, session: { kind: 'rest' } })[0]).toBe('What should I do on a rest day?');
  });
  it('adds snack ideas when protein is far below target in the afternoon', () => {
    expect(pickStarters({ ...base, hour: 16, protein: { eaten: 30, target: 160 } })).toEqual(['Warm-up for upper body?', 'High-protein snack ideas?', "How's my week going?"]);
  });
  it('handles a workout without a focus', () => {
    expect(pickStarters({ ...base, session: { kind: 'workout', focus: '' } })[0]).toBe('How should I warm up today?');
  });
});

describe('proteinFarBelow', () => {
  it('waits for the afternoon and needs a target', () => {
    expect(proteinFarBelow({ eaten: 0, target: 160 }, 9)).toBe(false);
    expect(proteinFarBelow({ eaten: 63, target: 160 }, 14)).toBe(true);
    expect(proteinFarBelow({ eaten: 64, target: 160 }, 14)).toBe(false);
    expect(proteinFarBelow({ eaten: 0, target: 0 }, 20)).toBe(false);
  });
});

describe('coachContextChips', () => {
  it('shows the session, calories left and the streak', () => {
    expect(coachContextChips(base).map((c) => c.text)).toEqual(['Upper body today', '1,725 kcal left', '2 in a row']);
  });
  it('says rest day, done and over, and skips a zero streak', () => {
    expect(coachContextChips({ ...base, session: { kind: 'rest' }, streak: 0, kcal: { eaten: 2520, target: 2400 } }).map((c) => c.text)).toEqual(['Rest day today', '120 kcal over']);
    expect(coachContextChips({ ...base, workoutDone: true })[0].text).toBe('Upper body done');
  });
  it('has a spoken label for the streak', () => {
    expect(coachContextChips({ ...base, streak: 1 })[2].label).toBe('Workout streak: 1 workout in a row');
  });
  it('reads the focus name', () => {
    expect(focusName('Lower body · Strength')).toBe('Lower body');
    expect(focusName('Recovery')).toBe('Recovery');
  });
});
