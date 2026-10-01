import { describe, expect, it } from 'vitest';

import {
  activityFactor,
  ageOn,
  ageRule,
  bmr,
  dailyTargets,
  kcalFloor,
  macroKcal,
  mentionsSupplement,
  paceCheck,
  planIndexOfWeekday,
  trainingSchedule,
  weekdayOfPlanIndex,
} from '../api/rules';

/** File contents as text (Vite ?raw import; no Node types needed). */
async function readText(rel: string): Promise<string> {
  const mod = (await import(/* @vite-ignore */ `${new URL(rel, import.meta.url).pathname}?raw`)) as { default: string };
  return mod.default;
}

describe('the shared rules file', () => {
  it('is byte-identical in the app and the Edge Functions', async () => {
    const app = await readText('../api/rules.ts');
    const server = await readText('../../../supabase/functions/_shared/rules.ts');
    expect(app.length).toBeGreaterThan(1000);
    expect(server).toBe(app);
  });
});

describe('age rules', () => {
  it('counts whole years, birthday-aware', () => {
    expect(ageOn('2000-10-01', '2026-10-01')).toBe(26);
    expect(ageOn('2000-10-02', '2026-10-01')).toBe(25);
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
    expect(ageOn(null, '2026-10-01')).toBeNull();
    expect(ageOn('not a date', '2026-10-01')).toBeNull();
  });

  it('blocks under 13, flags 13 to 17 as minors', () => {
    expect(ageRule(12)).toBe('blocked');
    expect(ageRule(13)).toBe('minor');
    expect(ageRule(17)).toBe('minor');
    expect(ageRule(18)).toBe('adult');
    expect(ageRule(null)).toBe('unknown');
  });
});

describe('calorie floors', () => {
  it('1200 for women, 1500 for men or unknown', () => {
    expect(kcalFloor('female')).toBe(1200);
    expect(kcalFloor('male')).toBe(1500);
    expect(kcalFloor('')).toBe(1500);
    expect(kcalFloor(undefined)).toBe(1500);
  });

  it('never prescribes below the floor or resting energy × 1.1 when losing', () => {
    // Small woman, big target, 1 month: the deficit is capped and floored.
    const t = dailyTargets({ weightKg: 50, heightCm: 160, age: 30, gender: 'female', activityLevel: 'sedentary', goal: 'lose_fat', targetKg: 40, months: 1 });
    const rest = bmr({ weightKg: 50, heightCm: 160, age: 30, gender: 'female' })!;
    expect(rest).toBeCloseTo(1189, 0);
    expect(t.kcal).toBe(1310); // max(1200, 1189 × 1.1) rounded to 10
    expect(t.floorApplied).toBe(true);
    expect(t.kcal).toBeGreaterThanOrEqual(kcalFloor('female'));
  });

  it('keeps every adult at or above the floor across a grid of inputs', () => {
    for (const gender of ['female', 'male', '']) {
      for (const weightKg of [40, 55, 70, 90, 130]) {
        for (const goal of ['lose_fat', 'tone_up', 'stay_fit', 'build_muscle', 'sports_performance'] as const) {
          for (const activityLevel of ['sedentary', 'moderate', 'athlete'] as const) {
            const t = dailyTargets({ weightKg, heightCm: 165, age: 35, gender, activityLevel, goal, targetKg: weightKg - 20, months: 1 });
            expect(t.kcal).toBeGreaterThanOrEqual(kcalFloor(gender));
            expect(t.kcal).toBeLessThanOrEqual(6000);
            const b = bmr({ weightKg, heightCm: 165, age: 35, gender })!;
            if (t.adjustment < 0) expect(t.kcal).toBeGreaterThanOrEqual(Math.round((b * 1.1) / 10) * 10 - 10);
          }
        }
      }
    }
  });

  it('gives minors maintenance, never a deficit', () => {
    const t = dailyTargets({ weightKg: 60, heightCm: 170, age: 15, gender: 'male', activityLevel: 'moderate', goal: 'lose_fat', targetKg: 50, months: 3 });
    expect(t.adjustment).toBeGreaterThanOrEqual(0);
    expect(t.kcal).toBeGreaterThanOrEqual(t.maintenance! - 5);
    expect(t.reason).toMatch(/Under 18/);
    expect(t.protein_g).toBeLessThanOrEqual(Math.round(60 * 1.5));
  });

  it('caps at 6000 kcal', () => {
    const t = dailyTargets({ weightKg: 200, heightCm: 210, age: 20, gender: 'male', activityLevel: 'athlete', jobActivity: 'physical', goal: 'build_muscle' });
    expect(t.kcal).toBe(6000);
  });

  it('macros add up to the calories', () => {
    const t = dailyTargets({ weightKg: 80, heightCm: 180, age: 28, gender: 'male', activityLevel: 'moderate', goal: 'build_muscle' });
    expect(Math.abs(macroKcal(t.protein_g, t.carbs_g, t.fat_g) - t.kcal)).toBeLessThanOrEqual(10);
    expect(t.water_glasses).toBeGreaterThanOrEqual(6);
    expect(t.water_glasses).toBeLessThanOrEqual(12);
  });

  it('a desk job adds nothing, physical work adds a little, capped at athlete', () => {
    expect(activityFactor('moderate', 'desk')).toBe(1.55);
    expect(activityFactor('moderate', 'physical')).toBe(1.65);
    expect(activityFactor('athlete', 'physical')).toBe(1.9);
  });
});

describe('safe pace and timeline', () => {
  it('flags losing more than 1% of body weight a week and suggests a longer timeline', () => {
    const p = paceCheck({ currentKg: 80, targetKg: 70, months: 1, age: 30 });
    expect(p.direction).toBe('lose');
    expect(p.safe).toBe(false);
    expect(p.maxWeeklyKg).toBe(0.8);
    expect(p.suggestedMonths).toBe(3);
    expect(p.message).toMatch(/3 months is a better timeline/);
    expect(p.message).not.toMatch(/\u2014/);
  });

  it('accepts a safe loss', () => {
    const p = paceCheck({ currentKg: 80, targetKg: 76, months: 3, age: 30 });
    expect(p.safe).toBe(true);
    expect(p.message).toBe('');
  });

  it('flags gaining more than 0.5 kg a week', () => {
    const p = paceCheck({ currentKg: 60, targetKg: 70, months: 3, age: 25 });
    expect(p.direction).toBe('gain');
    expect(p.safe).toBe(false);
    expect(p.suggestedMonths).toBe(6);
    expect(paceCheck({ currentKg: 60, targetKg: 66, months: 6, age: 25 }).safe).toBe(true);
  });

  it('says so when even 12 months is too fast', () => {
    const p = paceCheck({ currentKg: 100, targetKg: 40, months: 12, age: 40 });
    expect(p.safe).toBe(false);
    expect(p.suggestedMonths).toBeNull();
    expect(p.message).toMatch(/closer target weight/);
  });

  it('never sets a weight-loss target for a minor', () => {
    const p = paceCheck({ currentKg: 70, targetKg: 65, months: 12, age: 15 });
    expect(p.safe).toBe(false);
    expect(p.message).toMatch(/Under 18/);
    expect(paceCheck({ currentKg: 55, targetKg: 58, months: 12, age: 15 }).safe).toBe(true);
  });

  it('treats no target as maintenance', () => {
    expect(paceCheck({ currentKg: 70, targetKg: null, months: 3 }).direction).toBe('maintain');
  });
});

describe('weekdays and supplements', () => {
  it('converts Sunday-first days to Monday-first plan indexes and back', () => {
    expect(planIndexOfWeekday(0)).toBe(6); // Sunday
    expect(planIndexOfWeekday(1)).toBe(0); // Monday
    for (let i = 0; i < 7; i++) expect(planIndexOfWeekday(weekdayOfPlanIndex(i))).toBe(i);
  });

  it('defaults to Monday to Saturday with Sunday rest', () => {
    expect(trainingSchedule([])).toEqual([true, true, true, true, true, true, false]);
    expect(trainingSchedule([1, 3, 5])).toEqual([true, false, true, false, true, false, false]);
  });

  it('spots supplements in meal text', () => {
    expect(mentionsSupplement('Whey shake + banana')).toBe(true);
    expect(mentionsSupplement('Creatine with water')).toBe(true);
    expect(mentionsSupplement('Labneh, cucumber and pita')).toBe(false);
  });
});
