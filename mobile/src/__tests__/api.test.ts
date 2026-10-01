import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory AsyncStorage and a Supabase client that must never be called
// (every flow below runs as a device-only identity).
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => void store.set(k, v),
    removeItem: async (k: string) => void store.delete(k),
    getAllKeys: async () => [...store.keys()],
    multiRemove: async (ks: string[]) => ks.forEach((k) => store.delete(k)),
  },
}));
vi.mock('../lib/supabase', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be called for a device-only identity'); } }),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, Linking: {} }));

import { base64Bytes, base64ToBytes } from '../api/base64';
import { cleanRegions, fitSize, padRegion, requireRegions } from '../api/device/blurShared';
import { dayRange, daysBetween, nightRange, overlapMinutes } from '../api/device/healthDays';
import { ApiError, asApiError, codeForStatus, fromDbError } from '../api/errors';
import { estimateFromMeal, foodLogRow, sumMacros } from '../api/food';
import {
  emptyOverrides,
  exerciseOptions,
  getWeekOverrides,
  moveWorkoutDay,
  planForLocation,
  replaceExercise,
  resetWeek,
  swapDays,
  toPlanExercise,
  upgradePlan,
  weekStartOf,
  weekView,
} from '../api/plan';
import { checkinsDue, submitCheckin } from '../api/checkins';
import { logActivity, listActivities, deleteActivity, activityKcalByDay } from '../api/activities';
import { listMemory, rememberFact, deleteMemory } from '../api/memory';
import { generatePlan } from '../api/plan';
import { analyzeFood } from '../api/food';
import { createReport } from '../api/reports';
import {
  emptyProfile,
  getProfile,
  nextStep,
  normalizePhone,
  ONBOARDING_STEPS,
  paceFor,
  previousStep,
  resumeStep,
  saveProfilePatch,
  completeOnboarding,
  acceptWaiver,
  giveGuardianConsent,
  stepProgress,
  targetsFor,
  validateProfilePatch,
} from '../api/profile';
import { findExercise } from '../data/exercises';
import { buildWeek, type StoredPlan } from '../planData';
import type { PlanV2 } from '../types';

const LOCAL = 'local-test1234';

function v1Plan(): StoredPlan {
  const week = buildWeek(new Date(2026, 8, 28));
  return { days: week.map((d) => ({ session: d.session, meals: d.meals })) as StoredPlan['days'], kcal_target: 2200, water_target: 8 };
}

beforeEach(() => store.clear());

describe('errors', () => {
  it('maps database rule codes to readable errors', () => {
    expect(fromDbError({ code: 'BU013' }).code).toBe('under_13');
    expect(fromDbError({ code: 'BU014' }).code).toBe('waiver_required');
    expect(fromDbError({ code: 'BU015' }).code).toBe('guardian_required');
    expect(fromDbError({ code: '23514' }).code).toBe('bad_request');
    expect(fromDbError({ message: 'TypeError: Network request failed' }).code).toBe('offline');
    expect(codeForStatus(429)).toBe('limit_reached');
    expect(codeForStatus(503)).toBe('not_configured');
    expect(asApiError(new Error('x')).code).toBe('server_error');
  });
});

describe('profile and questionnaire', () => {
  it('normalises phone numbers to E.164 with +961 by default', () => {
    expect(normalizePhone('70 123 456')).toBe('+96170123456');
    expect(normalizePhone('070-123-456')).toBe('+96170123456');
    expect(normalizePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('0044 7700 900123')).toBe('+447700900123');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('12')).toBeNull();
  });

  it('walks the questionnaire in order, skipping photos without an account', () => {
    expect(ONBOARDING_STEPS[0]).toBe('name');
    expect(ONBOARDING_STEPS.at(-1)).toBe('done');
    expect(nextStep('health')).toBe('photo');
    expect(nextStep('health', { skipPhoto: true })).toBe('waiver');
    expect(previousStep('waiver', { skipPhoto: true })).toBe('health');
    expect(resumeStep({ onboarding_step: 'diet', onboarding_done_at: null })).toBe('diet');
    expect(resumeStep({ onboarding_step: 'nonsense' as never, onboarding_done_at: null })).toBe('name');
    expect(resumeStep({ onboarding_step: 'diet', onboarding_done_at: '2026-10-01' })).toBe('done');
    expect(stepProgress('name')).toBe(0);
    expect(stepProgress('done')).toBe(1);
  });

  it('validates answers like the database does', () => {
    const p = emptyProfile('x');
    const today = '2026-10-01';
    expect(validateProfilePatch({ birth_date: '2015-01-01' }, p, today)?.code).toBe('under_13');
    expect(validateProfilePatch({ birth_date: '2027-01-01' }, p, today)?.code).toBe('bad_request');
    expect(validateProfilePatch({ birth_date: '1995-05-05' }, p, today)).toBeNull();
    expect(validateProfilePatch({ timeline_months: 2 as never }, p, today)?.code).toBe('bad_request');
    expect(validateProfilePatch({ phone: '70123456' }, p, today)?.code).toBe('bad_request');
    expect(validateProfilePatch({ equipment: ['treadmill' as never] }, p, today)?.code).toBe('bad_request');
    expect(validateProfilePatch({ training_days: [] }, p, today)?.code).toBe('bad_request');
    expect(validateProfilePatch({ training_time: '18:30' }, p, today)).toBeNull();
    expect(validateProfilePatch({ onboarding_done_at: 'now' }, { ...p, birth_date: '1995-05-05' }, today)?.code).toBe('waiver_required');
    const minor = { ...p, birth_date: '2011-03-03', waiver_version: 'v', waiver_accepted_at: 'now' };
    expect(validateProfilePatch({ onboarding_done_at: 'now' }, minor, today)?.code).toBe('guardian_required');
    expect(validateProfilePatch({ onboarding_done_at: 'now' }, { ...minor, guardian_name: 'Rita', guardian_consent_at: 'now' }, today)).toBeNull();
  });

  it('saves the questionnaire on the device without an account and finishes onboarding', async () => {
    store.set('vital.localUser', JSON.stringify({ userId: LOCAL, name: 'Ana' }));
    let p = await getProfile(LOCAL);
    expect(p.name).toBe('Ana');
    expect(p.training_days).toEqual([1, 2, 3, 4, 5, 6]);
    p = await saveProfilePatch(LOCAL, { birth_date: '1996-01-01', gender: 'female', weight_kg: 68.04, goal: 'lose_fat', onboarding_step: 'body' });
    expect(p.weight_kg).toBe(68);
    await expect(saveProfilePatch(LOCAL, { birth_date: '2020-01-01' })).rejects.toMatchObject({ code: 'under_13' });
    await expect(completeOnboarding(LOCAL)).rejects.toMatchObject({ code: 'waiver_required' });
    await acceptWaiver(LOCAL);
    p = await completeOnboarding(LOCAL);
    expect(p.onboarding_done_at).toBeTruthy();
    expect(p.onboarding_step).toBe('done');
    // auth.tsx reads the same record
    const stored = JSON.parse(store.get('vital.localUser')!);
    expect(stored.profile.goal).toBe('lose_fat');
    expect(stored.userId).toBe(LOCAL);
    await expect(giveGuardianConsent(LOCAL, ' ')).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('derives pace and targets from the answers', () => {
    const p = { ...emptyProfile('x'), weight_kg: 80, target_weight_kg: 70, timeline_months: 1 as const, birth_date: '1990-01-01', height_cm: 175, gender: 'male', activity_level: 'moderate' as const, goal: 'lose_fat' as const };
    expect(paceFor(p)!.safe).toBe(false);
    expect(paceFor({ ...p, timeline_months: null })).toBeNull();
    expect(targetsFor(p).kcal).toBeGreaterThanOrEqual(1500);
  });
});

describe('plan: upgrade, week view, moves and swaps', () => {
  it('upgrades a v1 plan to v2 without losing anything', () => {
    const v2 = upgradePlan(v1Plan())!;
    expect(v2.version).toBe(2);
    expect(v2.days).toHaveLength(7);
    const first = v2.days[0].session;
    expect(first.kind).toBe('workout');
    if (first.kind === 'workout') {
      expect(first.exercises[0].name).toBe('Incline dumbbell press');
      expect(first.exercises[0].id).toBe('incline_db_press');
    }
    expect(v2.days[0].meals[0].carbs).toBe(0);
    expect(upgradePlan({ days: [] })).toBeNull();
    expect(upgradePlan(null)).toBeNull();
    expect(upgradePlan(v2)).toBe(v2);
  });

  it('swaps two weekdays and keeps swaps attached to plan days', () => {
    expect(swapDays([0, 1, 2, 3, 4, 5, 6], 2, 3)).toEqual([0, 1, 3, 2, 4, 5, 6]);
    expect(() => swapDays([0, 1, 2, 3, 4, 5, 6], 2, 9)).toThrow(ApiError);
    const plan = upgradePlan(v1Plan())!;
    const o = { ...emptyOverrides('2026-09-28'), day_order: [0, 1, 3, 2, 4, 5, 6] };
    const view = weekView(plan, o, '2026-09-28');
    expect(view[2].planIndex).toBe(3);
    expect(view[2].moved).toBe(true);
    expect(view[2].id).toBe('2026-09-30');
    expect(view[2].day.session.kind).toBe('workout'); // Wednesday now trains
    expect(view[3].day.session.kind).toBe('rest');
    expect(weekView(plan, { ...o, day_order: [0, 0, 0, 0, 0, 0, 0] }, '2026-09-28')[1].planIndex).toBe(1); // bad order ignored
  });

  it('moves a workout and resets the week, on the device', async () => {
    const monday = weekStartOf('2026-10-01');
    expect(monday).toBe('2026-09-28');
    const moved = await moveWorkoutDay(LOCAL, monday, 2, 3);
    expect(moved.day_order).toEqual([0, 1, 3, 2, 4, 5, 6]);
    expect((await getWeekOverrides(LOCAL, '2026-10-02')).day_order).toEqual([0, 1, 3, 2, 4, 5, 6]);
    expect((await resetWeek(LOCAL, monday)).day_order).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('offers 3 alternatives that fit the person and replaces for a week or for good', async () => {
    const profile = { ...emptyProfile(LOCAL), train_location: 'home_equipment' as const, equipment: ['dumbbells' as const], injury_areas: ['knee' as const], birth_date: '1990-01-01' };
    const plan: PlanV2 = upgradePlan(v1Plan())!;
    const squatDay = plan.days[1];
    if (squatDay.session.kind !== 'workout') throw new Error('expected a workout');
    const squat = squatDay.session.exercises[0];
    expect(squat.name).toBe('Back squat');
    const options = exerciseOptions(squat, profile);
    expect(options).toHaveLength(3);
    for (const o of options) {
      expect(o.cautions).not.toContain('knee');
      expect(o.equipment.every((k) => k === 'none' || k === 'dumbbells')).toBe(true);
    }
    const week = await replaceExercise(LOCAL, { plan, weekStart: '2026-09-28', planIndex: 1, exerciseIndex: 0, replacement: options[0], scope: 'week', profile });
    expect(week.overrides.exercise_swaps['1:0'].name).toBe(options[0].name);
    expect(week.overrides.exercise_swaps['1:0'].replaced_from).toBe('Back squat');
    expect(weekView(plan, week.overrides, '2026-09-28')[1].day.session).toMatchObject({ kind: 'workout' });
    const forGood = await replaceExercise(LOCAL, { plan, weekStart: '2026-09-28', planIndex: 1, exerciseIndex: 0, replacement: options[1], scope: 'always', profile });
    const d = forGood.plan.days[1].session;
    expect(d.kind === 'workout' && d.exercises[0].name).toBe(options[1].name);
    expect(forGood.overrides.exercise_swaps['1:0']).toBeUndefined();
    expect(JSON.parse(store.get(`fallback:${LOCAL}:aiPlan`)!).days[1].session.exercises[0].name).toBe(options[1].name);
  });

  it('keeps minors at 8+ reps and the 3-in-reserve note', () => {
    const minor = { ...emptyProfile('x'), train_location: 'gym' as const, birth_date: '2011-01-01' };
    const original = { id: 'back_squat', name: 'Back squat', muscle: 'quads' as const, sets: 4, reps: 5, unit: 'reps' as const, rest: 150, kg: null, variants: {} };
    const next = toPlanExercise(findExercise('goblet_squat')!, original, minor);
    expect(next.reps).toBeGreaterThanOrEqual(8);
    expect(next.note).toMatch(/3 in reserve/);
    expect(next.kg).toBeNull();
    expect(next.variants.gym?.id).toBe('goblet_squat');
  });

  it('switches a plan to its home variants', () => {
    const profile = { ...emptyProfile('x'), train_location: 'gym' as const };
    const plan = upgradePlan(v1Plan())!;
    const ex = plan.days[0].session.kind === 'workout' ? plan.days[0].session.exercises[0] : null;
    const withVariants: PlanV2 = { ...plan, days: plan.days.map((d, i) => (i === 0 && d.session.kind === 'workout' ? { ...d, session: { ...d.session, exercises: [toPlanExercise(findExercise('incline_db_press')!, ex!, profile)] } } : d)) };
    const home = planForLocation(withVariants, 'home_none');
    const s = home.days[0].session;
    expect(s.kind === 'workout' && findExercise(s.exercises[0].id ?? '')!.equipment).toEqual(['none']);
  });
});

describe('features that need an account', () => {
  it('say so clearly in device-only mode', async () => {
    await expect(generatePlan(LOCAL)).rejects.toMatchObject({ code: 'needs_account' });
    await expect(analyzeFood(LOCAL, { text: '2 eggs' })).rejects.toMatchObject({ code: 'needs_account' });
    await expect(createReport(LOCAL, { category: 'bug', message: 'x' })).rejects.toMatchObject({ code: 'needs_account' });
  });
});

describe('activities, check-ins and memory on the device', () => {
  it('logs activities with MET calories and lists them by day', async () => {
    const a = await logActivity(LOCAL, { kind: 'running', minutes: 30, effort: 'moderate', day: '2026-10-01' }, 70);
    expect(a.kcal).toBe(343);
    await logActivity(LOCAL, { kind: 'padel', minutes: 60, effort: 'easy', day: '2026-09-30' }, 70);
    const { activities } = await listActivities(LOCAL, '2026-09-30', '2026-10-01');
    expect(activities.map((x) => x.kind)).toEqual(['running', 'padel']);
    expect(activityKcalByDay(activities)['2026-10-01']).toBe(343);
    await expect(logActivity(LOCAL, { kind: 'walking', minutes: 0, effort: 'easy' })).rejects.toMatchObject({ code: 'bad_request' });
    await deleteActivity(LOCAL, a.id);
    expect((await listActivities(LOCAL, '2026-09-30', '2026-10-01')).activities).toHaveLength(1);
  });

  it('dedupes health imports by external id', async () => {
    await logActivity(LOCAL, { kind: 'walking', minutes: 20, effort: 'easy', day: '2026-10-01', externalId: 'hk:1', source: 'health' }, 70);
    await logActivity(LOCAL, { kind: 'walking', minutes: 25, effort: 'easy', day: '2026-10-01', externalId: 'hk:1', source: 'health' }, 70);
    const { activities } = await listActivities(LOCAL, '2026-10-01', '2026-10-01');
    expect(activities).toHaveLength(1);
    expect(activities[0].minutes).toBe(25);
  });

  it('works out which check-ins are due', () => {
    expect(checkinsDue({ today: '2026-10-01', lastWeightDay: '2026-09-28', lastMonthlyDay: null, startedDay: '2026-09-20' })).toEqual({ weekly: false, monthly: false });
    expect(checkinsDue({ today: '2026-10-01', lastWeightDay: '2026-09-24', lastMonthlyDay: null, startedDay: '2026-08-20' })).toEqual({ weekly: true, monthly: true });
    expect(checkinsDue({ today: '2026-10-01', lastWeightDay: null, lastMonthlyDay: '2026-09-15', startedDay: '2026-01-01' })).toEqual({ weekly: true, monthly: false });
  });

  it('saves a weekly check-in on the device with the trend', async () => {
    await submitCheckin(LOCAL, { kind: 'weekly', day: '2026-09-24', weight_kg: 72.6 });
    const r = await submitCheckin(LOCAL, { kind: 'weekly', day: '2026-10-01', weight_kg: 72.2 });
    expect(r.localOnly).toBe(true);
    expect(r.summary).toBe('Down 0.4 kg since 2026-09-24 (72.6 → 72.2 kg).');
    await expect(submitCheckin(LOCAL, { kind: 'weekly' })).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('remembers facts once and forgets on request', async () => {
    const f = await rememberFact(LOCAL, 'Prefers training before work', 'schedule');
    expect(f).not.toBeNull();
    expect(await rememberFact(LOCAL, '  prefers training BEFORE work. ', 'schedule')).toBeNull();
    expect(await listMemory(LOCAL)).toHaveLength(1);
    await deleteMemory(LOCAL, f!.id);
    expect(await listMemory(LOCAL)).toHaveLength(0);
  });
});

describe('food rows', () => {
  it('builds a clamped food_logs row with all macros', () => {
    const est = { label: 'Labneh wrap', kcal: 9000, protein: 22, carbs: 40, fat: 18, confidence: 'medium' as const, items: [], source: 'text' as const };
    const row = foodLogRow('u', est, { id: 'id1', day: '2026-10-01', slot: 'Breakfast', followUp: [{ question: 'Oil?', answer: '1 tbsp' }] });
    expect(row.kcal).toBe(5000);
    expect(row).toMatchObject({ carbs: 40, fat: 18, source: 'text', slot: 'Breakfast' });
    expect(row.follow_up).toHaveLength(1);
    const meal = { slot: 'Lunch' as const, label: 'Shish taouk', kcal: 620, protein: 45, carbs: 70, fat: 16 };
    expect(estimateFromMeal(meal).source).toBe('plan');
    expect(sumMacros([meal, { kcal: 100, protein: 5 }])).toEqual({ kcal: 720, protein: 50, carbs: 70, fat: 16 });
  });
});

describe('photo and health helpers', () => {
  it('decodes base64 without native modules', () => {
    expect([...base64ToBytes('SGVsbG8=')]).toEqual([72, 101, 108, 108, 111]);
    expect([...base64ToBytes('data:image/jpeg;base64,SGk=')]).toEqual([72, 105]);
    expect(base64Bytes('SGVsbG8=')).toBe(5);
    expect(() => base64ToBytes('!!!')).toThrow();
  });

  it('cleans and pads blur regions and refuses an empty blur', () => {
    expect(cleanRegions([{ x: -0.1, y: 0.9, width: 0.5, height: 0.5, shape: 'ellipse' }])[0]).toMatchObject({ x: 0, y: 0.9, width: 0.5 });
    expect(cleanRegions([{ x: 0.5, y: 0.5, width: 0, height: 0.2, shape: 'rect' }])).toEqual([]);
    const padded = padRegion({ x: 0.4, y: 0.1, width: 0.2, height: 0.2, shape: 'ellipse' });
    expect(padded.width).toBeGreaterThan(0.2);
    expect(padded.x).toBeLessThan(0.4);
    expect(() => requireRegions([], {})).toThrow(/blur over your face/);
    expect(requireRegions([], { confirmNoFace: true })).toEqual([]);
    expect(fitSize(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('splits days and nights for health reads', () => {
    expect(daysBetween('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    const { start, end } = dayRange('2026-10-01');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000);
    const n = nightRange('2026-10-01');
    expect(n.start.getHours()).toBe(18);
    expect(n.end.getHours()).toBe(12);
    expect(overlapMinutes(new Date(2026, 9, 1, 0, 0), new Date(2026, 9, 1, 2, 0), new Date(2026, 9, 1, 1, 0), new Date(2026, 9, 1, 5, 0))).toBe(60);
  });
});
