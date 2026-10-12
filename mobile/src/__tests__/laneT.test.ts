import { describe, expect, it } from 'vitest';

import { composeWeekV2, localMealSwaps, locationsFor, mealFits, MEAL_LIBRARY, movableDays, scheduleOf, setsOf, starterPlan, type WeekViewEntry } from '../planData';
import { activityByKind, activityTotals, averageMacros, daySummary, kcalAdherence, trainingCalendar, weeklyActivity } from '../stats';
import { findExercise } from '../data/exercises';
import { addDays } from '../lib/dates';
import type { PlanDayV2 } from '../types';

// 2026-09-28 is a Monday.
const MONDAY = '2026-09-28';
const days7 = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i));

function view(plan: { days: PlanDayV2[] }, order = [0, 1, 2, 3, 4, 5, 6]): WeekViewEntry[] {
  return order.map((p, w) => ({ id: days7[w], weekday: w, planIndex: p, moved: p !== w, day: plan.days[p] }));
}

describe('starterPlan', () => {
  it('rests on Sunday by default and trains Monday to Saturday', () => {
    const p = starterPlan();
    expect(p.version).toBe(2);
    expect(p.days).toHaveLength(7);
    expect(p.days.map((d) => d.session.kind)).toEqual(['workout', 'workout', 'workout', 'workout', 'workout', 'workout', 'rest']);
    expect(p.training_days).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('follows the training days (0 = Sunday) and puts rest everywhere else', () => {
    const p = starterPlan({ training_days: [1, 3, 5] });
    expect(p.days.map((d) => d.session.kind)).toEqual(['workout', 'rest', 'workout', 'rest', 'workout', 'rest', 'rest']);
  });

  it('uses library exercises that fit the place, with home and gym variants', () => {
    const p = starterPlan({ train_location: 'home_none' });
    for (const d of p.days) {
      if (d.session.kind !== 'workout') continue;
      for (const e of d.session.exercises) {
        const lib = findExercise(e.id);
        expect(lib, e.name).not.toBeNull();
        expect(lib!.equipment.every((k) => k === 'none')).toBe(true);
        expect(e.kg).toBeNull();
        expect(e.variants.home_none?.id).toBe(e.id);
        expect(e.variants.gym).toBeTruthy();
      }
    }
  });

  it('steers clear of injuries', () => {
    const p = starterPlan({ train_location: 'gym', injury_areas: ['knee'], injuries: 'sore lower back' });
    for (const d of p.days) {
      if (d.session.kind !== 'workout') continue;
      for (const e of d.session.exercises) {
        const lib = findExercise(e.id)!;
        expect(lib.cautions.includes('knee') || lib.cautions.includes('lower_back'), e.name).toBe(false);
      }
    }
  });

  it('scales meals near the calorie target with all macros, and respects the diet', () => {
    const p = starterPlan({ kcal_target: 1800, diet_type: 'vegetarian', allergies: ['nuts'] });
    const day = p.days[0];
    const kcal = day.meals.reduce((a, m) => a + m.kcal, 0);
    expect(Math.abs(kcal - 1800)).toBeLessThan(120);
    for (const m of day.meals) {
      expect(m.carbs).toBeGreaterThan(0);
      expect(m.fat).toBeGreaterThan(0);
      const lib = MEAL_LIBRARY.find((x) => x.label === m.label)!;
      expect(lib.tags.some((t) => ['meat', 'poultry', 'fish', 'nuts'].includes(t)), m.label).toBe(false);
    }
    expect(p.macros.protein_g).toBeGreaterThan(0);
  });

  it('keeps minors at 8 reps or more', () => {
    const p = starterPlan({ minor: true });
    for (const d of p.days) if (d.session.kind === 'workout') for (const e of d.session.exercises) if (e.unit === 'reps') expect(e.reps).toBeGreaterThanOrEqual(8);
  });
});

describe('meal library', () => {
  it('filters by diet, allergy and dislikes', () => {
    const fish = MEAL_LIBRARY.find((m) => m.tags.includes('fish'))!;
    expect(mealFits(fish, { diet_type: 'pescatarian' })).toBe(true);
    expect(mealFits(fish, { diet_type: 'vegetarian' })).toBe(false);
    expect(mealFits(fish, { allergies: ['fish'] })).toBe(false);
    const labneh = MEAL_LIBRARY.find((m) => m.label.startsWith('Labneh'))!;
    expect(mealFits(labneh, { dislikes: 'labneh, olives' })).toBe(false);
    expect(mealFits(labneh, { diet_type: 'vegan' })).toBe(false);
  });

  it('offers up to 3 swaps with similar calories and enough protein', () => {
    const meal = { slot: 'Lunch' as const, label: 'Chicken shawarma plate with rice and fattoush', kcal: 680, protein: 48 };
    const swaps = localMealSwaps(meal, {});
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.length).toBeLessThanOrEqual(3);
    for (const s of swaps) {
      expect(s.slot).toBe('Lunch');
      expect(s.label).not.toBe(meal.label);
      expect(Math.abs(s.kcal - meal.kcal)).toBeLessThanOrEqual(Math.max(60, meal.kcal * 0.12));
    }
    expect(localMealSwaps(meal, { diet_type: 'vegan' }).every((s) => !/chicken|halloumi|yogurt/i.test(s.label))).toBe(true);
  });
});

describe('week view to days', () => {
  it('applies moved days, keeps done rows on calendar days, and swaps meals', () => {
    const plan = starterPlan();
    const order = [0, 6, 2, 3, 4, 5, 1]; // Tuesday's workout moved to Sunday
    const swap = { slot: 'Lunch' as const, label: 'Green bean stew with rice', kcal: 560, protein: 20, carbs: 88, fat: 13 };
    const week = composeWeekV2(view(plan, order), { [days7[6]]: { workout: true, exercises: [], meals: ['Lunch'] } }, { [days7[0]]: { Lunch: swap } });
    expect(week[1].session.kind).toBe('rest');
    expect(week[1].moved).toBe(true);
    expect(week[6].session.kind).toBe('workout');
    expect(week[6].planIndex).toBe(1);
    expect(week[6].done.workout).toBe(true);
    expect(week[0].meals.find((m) => m.slot === 'Lunch')).toMatchObject({ label: swap.label, swapped: true });
    expect(scheduleOf(week)).toEqual(['workout', 'rest', 'workout', 'workout', 'workout', 'workout', 'workout']);
  });

  it('counts sets done and only offers days from today that are not finished', () => {
    const plan = starterPlan();
    const week = composeWeekV2(view(plan), {
      [days7[0]]: { workout: true, exercises: [], meals: [] },
      [days7[2]]: { workout: false, exercises: [[0, 1], [0]], meals: [] },
    });
    expect(setsOf(week[2])).toEqual({ done: 3, total: (week[2].session as { exercises: { sets: number }[] }).exercises.reduce((a, e) => a + e.sets, 0) });
    const movable = movableDays(week, days7[2]);
    expect(movable.has(days7[0])).toBe(false);
    expect(movable.has(days7[1])).toBe(false);
    expect(movable.has(days7[2])).toBe(true);
    expect(movable.has(days7[6])).toBe(true);
  });

  it('offers home with kit only to people who own some', () => {
    expect(locationsFor([])).toEqual(['home_none', 'gym']);
    expect(locationsFor(['other'])).toEqual(['home_none', 'gym']);
    expect(locationsFor(['dumbbells'])).toEqual(['home_none', 'home_equipment', 'gym']);
  });
});

describe('daySummary', () => {
  const targets = { kcal: 2000, protein: 150, carbs: 200, fat: 60 };
  const meals = [
    { slot: 'Breakfast', kcal: 500, protein: 30, carbs: 50, fat: 20 },
    { slot: 'Lunch', kcal: 700, protein: 50, carbs: 70, fat: 20 },
  ];

  it('adds off-plan food to checked meals with every macro', () => {
    const s = daySummary({
      day: { session: { kind: 'rest' }, meals, done: { workout: false, exercises: [], meals: ['Breakfast'] } },
      logs: [{ kcal: 300, protein: 10, carbs: 40, fat: 10 }],
      activityKcal: 0,
      activityMinutes: 0,
      water: { count: 4, target: 8 },
      targets,
    });
    expect(s.eaten).toEqual({ kcal: 800, protein: 40, carbs: 90, fat: 30 });
    expect(s.offPlan.kcal).toBe(300);
    expect(s.kcalLeft).toBe(1200);
    expect(s.parts.train).toBeNull();
    expect(s.progress).toBeCloseTo((((800 / 2000 + 40 / 150) / 2) + 0.5) / 2, 5);
  });

  it('counts an activity as training on a rest day, and sets on a workout day', () => {
    const rest = daySummary({ day: { session: { kind: 'rest' }, meals: [], done: { workout: false, exercises: [], meals: [] } }, logs: [], activityKcal: 300, activityMinutes: 40, water: { count: 0, target: 8 }, targets });
    expect(rest.parts.train).toBe(1);
    expect(rest.burned).toBe(300);
    const work = daySummary({
      day: { session: { kind: 'workout', exercises: [{ sets: 3 }, { sets: 3 }] }, meals: [], done: { workout: false, exercises: [[0, 1, 2]], meals: [] } },
      logs: [],
      activityKcal: 0,
      activityMinutes: 0,
      water: { count: 8, target: 8 },
      targets,
    });
    expect(work.parts.train).toBe(0.5);
    expect(work.parts.water).toBe(1);
  });
});

describe('activity and progress stats', () => {
  const list = [
    { day: '2026-09-29', kind: 'football', minutes: 60, kcal: 600 },
    { day: '2026-09-30', kind: 'walking', minutes: 30, kcal: 120 },
    { day: '2026-09-30', kind: 'walking', minutes: 45, kcal: 180 },
    { day: '2026-09-20', kind: 'padel', minutes: 60, kcal: 400 },
  ];

  it('totals and groups by kind within the range', () => {
    expect(activityTotals(list, MONDAY, '2026-10-04')).toEqual({ kcal: 900, minutes: 135, count: 3 });
    expect(activityByKind(list, MONDAY, '2026-10-04').map((k) => [k.kind, k.minutes])).toEqual([
      ['walking', 75],
      ['football', 60],
    ]);
  });

  it('buckets minutes per week, current week last', () => {
    const w = weeklyActivity(list, 2, new Date(2026, 8, 30, 12));
    expect(w.map((x) => x.weekStartId)).toEqual(['2026-09-21', MONDAY]);
    expect(w.map((x) => x.minutes)).toEqual([0, 135]);
  });

  it('marks the calendar: done, missed, rest, open and future', () => {
    const schedule = ['workout', 'workout', 'rest', 'workout', 'workout', 'workout', 'rest'] as const;
    const rows = trainingCalendar({ [MONDAY]: { workout: true, exercises: [], meals: [] } }, schedule, 1, new Date(2026, 8, 30, 12));
    expect(rows).toHaveLength(1);
    expect(rows[0].map((c) => c.state)).toEqual(['done', 'missed', 'rest', 'future', 'future', 'future', 'future']);
    const thu = trainingCalendar({}, schedule, 1, new Date(2026, 9, 1, 12), MONDAY);
    expect(thu[0][3].state).toBe('open');
    const early = trainingCalendar({ '2026-09-30': { workout: true, exercises: [], meals: [] } }, schedule, 1, new Date(2026, 9, 1, 12));
    expect(early[0].map((c) => c.state).slice(0, 4)).toEqual(['none', 'none', 'done', 'open']);
  });

  it('averages only logged days and caps adherence', () => {
    const avg = averageMacros([
      { kcal: 2000, protein: 150, carbs: 200, fat: 60 },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      { kcal: 1000, protein: 50, carbs: 100, fat: 40 },
    ]);
    expect(avg).toEqual({ avg: { kcal: 1500, protein: 100, carbs: 150, fat: 50 }, days: 2 });
    expect(kcalAdherence([{ id: 'a', kcal: 5000 }, { id: 'b', kcal: 1000 }], 2000)).toEqual([
      { id: 'a', ratio: 1.5 },
      { id: 'b', ratio: 0.5 },
    ]);
  });
});
