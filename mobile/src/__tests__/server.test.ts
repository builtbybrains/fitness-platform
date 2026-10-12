/* Tests for the Edge Functions' shared logic (supabase/functions/_shared).
   The modules are Deno code; they load here through a runtime import (so
   the app's tsc never sees their Deno imports), with the one remote import
   (supabase-js from esm.sh) mocked and no AI key set, so every path below is
   the built-in rules path. */

import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => ({}) }));
(globalThis as { Deno?: unknown }).Deno = { env: { get: () => undefined }, serve: () => undefined };

const ROOT = new URL('../../../supabase/functions/_shared/', import.meta.url).pathname;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mod = any;
async function server(name: string): Promise<Mod> {
  return import(/* @vite-ignore */ `${ROOT}${name}.ts`);
}

let food: Mod, plan: Mod, profile: Mod, rules: Mod, ex: Mod, review: Mod, body: Mod, push: Mod, memory: Mod, ai: Mod;
beforeAll(async () => {
  [food, plan, profile, rules, ex, review, body, push, memory, ai] = await Promise.all(
    ['food', 'plan', 'profile', 'rules', 'exercises', 'checkinReview', 'bodyAnalysis', 'push', 'memory', 'ai'].map(server),
  );
});

const TODAY = '2026-10-01';
function person(over: Record<string, unknown> = {}) {
  return profile.toPerson(
    {
      id: 'u1', name: 'Ana', gender: 'female', birth_date: '1994-05-05', height_cm: 165, weight_kg: 70,
      activity_level: 'moderate', job_activity: 'desk', goal: 'lose_fat', timeline_months: 3, target_weight_kg: 65,
      train_location: 'home_none', equipment: [], training_days: [1, 2, 3, 4, 5, 6], training_time: 'evening',
      diet_type: 'none', allergies: [], allergies_other: '', dislikes: '', injuries: '', injury_areas: [], conditions: [],
      ...over,
    },
    TODAY,
  );
}
const ctx = (p: Mod, extra: Record<string, unknown> = {}) => ({ person: p, memory: [], analysis: null, previous: null, instruction: null, today: TODAY, ...extra });
const workouts = (pl: Mod) => pl.days.filter((d: Mod) => d.session.kind === 'workout');
const allExercises = (pl: Mod) => workouts(pl).flatMap((d: Mod) => d.session.exercises);

describe('typed food without AI', () => {
  it('reads "2 eggs, 1 pita, labneh" and asks how much labneh', () => {
    const { draft, questions } = food.parseFoodText('2 eggs, 1 pita, labneh');
    expect(draft.items.map((i: Mod) => i.name)).toEqual(['Egg', 'Pita', 'Labneh']);
    expect(draft.items[0].kcal).toBe(156);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ id: 'item:2', question: 'How much labneh?' });
    expect(draft.kcal).toBe(draft.items.reduce((a: number, i: Mod) => a + i.kcal, 0));
    const final = food.applyAnswers(draft, [{ id: 'item:2', answer: '3 tbsp' }]);
    expect(final.items[2].kcal).toBe(90);
    expect(final.kcal).toBe(156 + 165 + 90);
    expect(final.confidence).toBe('medium');
  });

  it('handles grams, word numbers and unknown food', () => {
    expect(food.parseFoodText('150g chicken').draft.items[0].kcal).toBe(248);
    expect(food.parseFoodText('2 chicken breasts').draft.items[0].portion).toBe('300 g');
    expect(food.parseFoodText('two bananas').draft.items[0].kcal).toBe(210);
    const odd = food.parseFoodText('a slice of grandma special');
    expect(odd.questions[0].allowFreeText).toBe(true);
    const fixed = food.applyAnswers(odd.draft, [{ id: 'item:0', answer: 'about 300 kcal' }]);
    expect(fixed.kcal).toBe(300);
  });
});

describe('diet and allergy checks', () => {
  const base = { diet: 'none', allergies: [], allergiesOther: '', dislikes: '', minor: false };
  it('catches allergens, diets, dislikes and supplements for minors', () => {
    expect(food.violates('Labneh with pita', { ...base, diet: 'vegan' })).toBe('not vegan');
    expect(food.violates('Hummus with carrots', { ...base, allergies: ['sesame'] })).toBe('contains sesame');
    expect(food.violates('Grilled shrimp', { ...base, allergies: ['shellfish'] })).toBe('contains shellfish');
    expect(food.violates('Pork chop', { ...base, diet: 'halal' })).toBe('not halal');
    expect(food.violates('Shish taouk with rice', { ...base, diet: 'vegetarian' })).toBe('not vegetarian');
    expect(food.violates('Tuna salad', { ...base, diet: 'pescatarian' })).toBeNull();
    expect(food.violates('Chicken wrap', { ...base, diet: 'gluten_free' })).toBe('contains gluten');
    expect(food.violates('Okra stew', { ...base, dislikes: 'okra, liver' })).toMatch(/dislike/);
    expect(food.violates('Kiwi bowl', { ...base, allergiesOther: 'kiwi' })).toBe('contains kiwi');
    expect(food.violates('Whey shake + banana', { ...base, minor: true })).toBe('supplement for a minor');
    expect(food.violates('Mujadara with salad', { ...base, diet: 'vegan', allergies: ['nuts', 'sesame'] })).toBeNull();
  });

  it('the meal library has options for every diet and every single allergy', () => {
    for (const diet of ['none', 'halal', 'vegetarian', 'vegan', 'pescatarian', 'lactose_free', 'gluten_free']) {
      for (const slot of food.MEAL_SLOTS) expect(food.libraryOptions(slot, { ...base, diet }).length, `${diet} ${slot}`).toBeGreaterThan(0);
    }
    for (const a of ['nuts', 'peanuts', 'dairy', 'eggs', 'gluten', 'shellfish', 'fish', 'soy', 'sesame']) {
      for (const slot of food.MEAL_SLOTS) expect(food.libraryOptions(slot, { ...base, allergies: [a] }).length, `${a} ${slot}`).toBeGreaterThan(0);
    }
  });
});

describe('planner without AI', () => {
  it('builds Monday to Saturday training with Sunday rest, bodyweight only, at a safe calorie target', async () => {
    const p = person();
    const { plan: pl, changes } = await plan.buildPlan(ctx(p));
    expect(pl.version).toBe(2);
    expect(pl.source).toBe('rules');
    expect(pl.days).toHaveLength(7);
    expect(pl.days.map((d: Mod) => d.session.kind)).toEqual(['workout', 'workout', 'workout', 'workout', 'workout', 'workout', 'rest']);
    for (const e of allExercises(pl)) {
      const lib = ex.findExercise(e.id);
      expect(lib, e.name).not.toBeNull();
      expect(ex.fitsEquipment(lib, ['none'])).toBe(true);
      expect(e.kg).toBeNull();
      expect(e.variants.home_none).toBeTruthy();
      expect(e.variants.gym).toBeTruthy();
    }
    for (const d of workouts(pl)) {
      expect(d.session.exercises.length).toBeGreaterThanOrEqual(3);
      expect(d.session.time).toBe('evening');
      expect(d.session.exercises.some((e: Mod) => e.muscle === 'cardio')).toBe(true); // fat-loss finisher
    }
    expect(pl.kcal_target).toBeGreaterThanOrEqual(1200);
    for (const d of pl.days) {
      expect(d.meals.map((m: Mod) => m.slot)).toEqual(['Breakfast', 'Lunch', 'Dinner', 'Snack']);
      const sum = d.meals.reduce((a: number, m: Mod) => a + m.kcal, 0);
      expect(sum).toBeGreaterThanOrEqual(1200);
      expect(Math.abs(sum - pl.kcal_target) / pl.kcal_target).toBeLessThan(0.12);
    }
    expect(pl.pace.safe).toBe(true);
    expect(changes).toMatch(/first plan/i);
    expect(pl.summary).not.toMatch(/\u2014/);
  });

  it('follows the chosen training days', async () => {
    const { plan: pl } = await plan.buildPlan(ctx(person({ training_days: [1, 3, 5], train_location: 'gym' })));
    expect(pl.days.map((d: Mod) => d.session.kind)).toEqual(['workout', 'rest', 'workout', 'rest', 'workout', 'rest', 'rest']);
    expect(pl.training_days).toEqual([1, 3, 5]);
  });

  it('only uses the home equipment the person has', async () => {
    const p = person({ train_location: 'home_equipment', equipment: ['dumbbells', 'bands'] });
    const { plan: pl } = await plan.buildPlan(ctx(p));
    for (const e of allExercises(pl)) expect(ex.fitsEquipment(ex.findExercise(e.id), ['none', 'dumbbells', 'bands'])).toBe(true);
    expect(allExercises(pl)[0].variants.home_equipment).toBeTruthy();
  });

  it('avoids exercises that load an injured area', async () => {
    const { plan: pl } = await plan.buildPlan(ctx(person({ train_location: 'gym', injuries: 'bad left knee', injury_areas: ['lower_back'] })));
    for (const e of allExercises(pl)) {
      const lib = ex.findExercise(e.id);
      expect(lib.cautions).not.toContain('knee');
      expect(lib.cautions).not.toContain('lower_back');
    }
  });

  it('applies the minor rules: maintenance, no max effort, no supplements', async () => {
    const p = person({ birth_date: '2011-06-01', gender: 'male', weight_kg: 60, height_cm: 170, goal: 'lose_fat', train_location: 'gym' });
    expect(p.minor).toBe(true);
    const { plan: pl } = await plan.buildPlan(ctx(p));
    expect(pl.minor).toBe(true);
    const t = rules.dailyTargets({ weightKg: 60, heightCm: 170, age: 15, gender: 'male', activityLevel: 'moderate', jobActivity: 'desk', goal: 'lose_fat' });
    expect(pl.kcal_target).toBeGreaterThanOrEqual(t.maintenance - 10);
    for (const e of allExercises(pl)) {
      expect(ex.findExercise(e.id).level).not.toBe('advanced');
      if (e.unit === 'reps') expect(e.reps).toBeGreaterThanOrEqual(8);
      if (/in reserve/.test(e.note ?? '')) expect(e.note).toMatch(/3 in reserve/);
    }
    for (const d of pl.days) for (const m of d.meals) expect(rules.mentionsSupplement(m.label)).toBe(false);
  });

  it('respects diet and allergies in every meal', async () => {
    const p = person({ diet_type: 'vegan', allergies: ['nuts', 'soy'], dislikes: 'okra' });
    const { plan: pl } = await plan.buildPlan(ctx(p));
    const r = plan.dietRulesOf(p);
    for (const d of pl.days) for (const m of d.meals) expect(food.violates(m.label, r), m.label).toBeNull();
  });

  it('changes the plan from a request in the person\'s words', async () => {
    const p = person({ train_location: 'gym' });
    const first = (await plan.buildPlan(ctx(p))).plan;
    const knee = await plan.buildPlan(ctx(p, { previous: first, instruction: 'my knee hurts' }));
    for (const e of allExercises(knee.plan)) expect(ex.findExercise(e.id).cautions).not.toContain('knee');
    expect(knee.changes).toMatch(/knee/);
    const three = await plan.buildPlan(ctx(p, { previous: first, instruction: 'only 3 days this week' }));
    expect(workouts(three.plan)).toHaveLength(3);
    expect(three.changes).toMatch(/Training days:/);
    const travel = await plan.buildPlan(ctx(p, { previous: first, instruction: 'travelling, no equipment this week' }));
    expect(travel.plan.location).toBe('home_none');
    for (const e of allExercises(travel.plan)) expect(ex.fitsEquipment(ex.findExercise(e.id), ['none'])).toBe(true);
    const short = await plan.buildPlan(ctx(p, { instruction: 'I only have 30 minutes' }));
    for (const d of workouts(short.plan)) expect(d.session.minutes).toBeLessThanOrEqual(35);
  });

  it('checks every exercise and meal the AI writes', () => {
    const p = person({ allergies: ['sesame'] });
    const adj = plan.applyInstruction(p, null);
    const targets = rules.dailyTargets({ weightKg: 70, heightCm: 165, age: 32, gender: 'female', activityLevel: 'moderate', goal: 'lose_fat', targetKg: 65, months: 3 });
    const skeleton = plan.rulesWeek(adj, targets);
    const fill = {
      summary: 'x',
      why: '',
      days: skeleton.map((_: Mod, i: number) => ({
        focus: 'AI focus',
        exercises: [{ id: 'barbell_bench', sets: 9, reps: 99 }, { id: 'not_real' }, { id: 'push_up', sets: 3, reps: 12, note: 'Use 40 kg' }, { id: 'bodyweight_squat' }, { id: 'glute_bridge' }],
        meals: [
          { slot: 'Breakfast', label: 'Hummus and pita', kcal: 400, protein: 15, carbs: 50, fat: 15 },
          { slot: 'Lunch', label: 'Grilled chicken and rice', kcal: 600, protein: 45, carbs: 60, fat: 15 },
          { slot: 'Dinner', label: 'Lentil soup', kcal: 9000, protein: 20, carbs: 60, fat: 10 },
        ],
        note: i === 6 ? 'Rest well' : undefined,
      })),
    };
    const days = plan.mergeFill(skeleton, fill, adj, targets);
    expect(days[6].session.kind).toBe('rest'); // rest days stay rest days
    for (const d of days.filter((x: Mod) => x.session.kind === 'workout')) {
      const ids = d.session.exercises.map((e: Mod) => e.id);
      expect(ids).not.toContain('barbell_bench'); // needs a barbell
      expect(ids).not.toContain('not_real');
      const pu = d.session.exercises.find((e: Mod) => e.id === 'push_up');
      expect(pu.note).not.toMatch(/40 kg/);
      for (const m of d.meals) expect(food.violates(m.label, plan.dietRulesOf(p))).toBeNull(); // hummus replaced
      expect(d.meals.find((m: Mod) => m.slot === 'Dinner').kcal).toBeLessThan(2000);
      expect(d.meals.find((m: Mod) => m.slot === 'Snack')).toBeTruthy(); // missing slot filled
    }
  });
});

describe('calorie changes from check-ins stay safe', () => {
  it('never goes below the floors', () => {
    const p = person({ weight_kg: 50, height_cm: 155, goal: 'lose_fat' });
    const t = rules.dailyTargets({ weightKg: 50, heightCm: 155, age: 32, gender: 'female', activityLevel: 'moderate', goal: 'lose_fat' });
    const lower = plan.applyKcalDelta(t, -300, p);
    const b = rules.bmr({ weightKg: 50, heightCm: 155, age: 32, gender: 'female' });
    expect(lower.kcal).toBeGreaterThanOrEqual(Math.max(1200, Math.round((b * 1.1) / 10) * 10 - 10));
    expect(plan.applyKcalDelta(t, 150, p).kcal).toBe(t.kcal + 150);
    const minor = person({ birth_date: '2011-06-01', gender: 'male', weight_kg: 60, height_cm: 170 });
    const mt = rules.dailyTargets({ weightKg: 60, heightCm: 170, age: 15, gender: 'male', activityLevel: 'moderate', goal: 'lose_fat' });
    expect(plan.applyKcalDelta(mt, -300, minor).kcal).toBeGreaterThanOrEqual(mt.maintenance - 10);
  });

  it('reads the month: stalled, too fast, too hard, hungry', () => {
    const stalled = review.review({ goal: 'lose_fat', minor: false, startKg: 80, nowKg: 79.9, days: 30, targetKg: 75, months: 3, answers: { adherence: 90 } });
    expect(stalled.kcalDelta).toBe(-150);
    const fast = review.review({ goal: 'lose_fat', minor: false, startKg: 80, nowKg: 74, days: 28, targetKg: 70, months: 6, answers: {} });
    expect(fast.kcalDelta).toBe(150);
    const hard = review.review({ goal: 'stay_fit', minor: false, startKg: 70, nowKg: 70, days: 30, targetKg: null, months: null, answers: { difficulty: 5, hunger: 5 } });
    expect(hard.instruction).toMatch(/too hard/);
    expect(hard.instruction).toMatch(/hungry/);
    const teen = review.review({ goal: 'lose_fat', minor: true, startKg: 60, nowKg: 60, days: 30, targetKg: 55, months: 3, answers: { adherence: 100 } });
    expect(teen.kcalDelta).toBeGreaterThanOrEqual(0);
    const gain = review.review({ goal: 'build_muscle', minor: false, startKg: 70, nowKg: 70, days: 30, targetKg: null, months: null, answers: { adherence: 80 } });
    expect(gain.kcalDelta).toBe(150);
    expect(review.cleanAnswers({ energy: 9, sleep: 2, adherence: '120', notes: '  ok ' })).toEqual({ sleep: 2, adherence: 100, notes: 'ok' });
    expect(review.cleanMeasurements({ waist_cm: 80.44, arm_cm: 900 })).toEqual({ waist_cm: 80.4 });
  });
});

describe('photo estimate checks', () => {
  it('keeps ranges, drops looks and diagnoses', () => {
    const r = body.parseBodyAnalysis('```json\n{"body_fat_range":[25,23],"build":"athletic","posture_notes":["Shoulders rounded forward","Looks attractive"],"training_focus":["Upper back strength"],"confidence":"high","summary":"A solid start."}\n```');
    expect(r.body_fat_range).toEqual([23, 27]);
    expect(r.posture_notes).toEqual(['Shoulders rounded forward']);
    expect(r.build).toBe('athletic');
    expect(body.parseBodyAnalysis('{"body_fat_range":[20,26],"build":"x","summary":"Possible scoliosis"}').summary).not.toMatch(/scoliosis/);
    expect(body.parseBodyAnalysis('{"build":"lean"}')).toBeNull();
  });
});

describe('push quiet hours and memory', () => {
  it('knows quiet hours across midnight in the person\'s time zone', () => {
    // 21:30 UTC is 00:30 in Beirut (UTC+3 in October).
    expect(push.inQuietHours('22:00', '07:00', 'Asia/Beirut', new Date('2026-10-01T21:30:00Z'))).toBe(true);
    expect(push.inQuietHours('22:00', '07:00', 'Asia/Beirut', new Date('2026-10-01T09:00:00Z'))).toBe(false);
    expect(push.inQuietHours('13:00', '15:00', 'Asia/Beirut', new Date('2026-10-01T11:00:00Z'))).toBe(true);
    expect(push.inQuietHours('08:00', '08:00', 'Asia/Beirut')).toBe(false);
  });

  it('spots near-duplicate facts and cleans model output', () => {
    expect(memory.similar('Left knee hurts on deep squats', 'left knee hurts during deep squats')).toBe(true);
    expect(memory.similar('Likes padel', 'Dislikes running')).toBe(false);
    expect(memory.cleanFacts([{ fact: 'Trains at 6am before work', category: 'schedule' }, { fact: 'x' }, { fact: 'Has a bench', category: 'weird' }])).toEqual([
      { fact: 'Trains at 6am before work', category: 'schedule' },
      { fact: 'Has a bench', category: 'other' },
    ]);
    expect(ai.extractJson('Sure! ```json {"a":1} ```')).toEqual({ a: 1 });
    expect(ai.extractJson('no json')).toBeNull();
  });
});
