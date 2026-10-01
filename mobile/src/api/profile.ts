/* Profile and the sign-up questionnaire.

   Cloud accounts: public.profiles (RLS: own row), mirrored on the device.
   No account: the same on-device record auth.tsx uses ('vital.localUser'),
   so both stay in step. The rules the database enforces (13+, waiver,
   guardian consent, value lists) are checked here first too, so the
   no-account mode follows them and screens get a readable message before
   any network call. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '../lib/supabase';
import { isCloudUser } from '../lib/cloud';
import { loadLocal, saveLocal } from '../lib/localFallback';
import { todayId } from '../lib/dates';
import { saveWeight } from '../data';
import { WAIVER_VERSION } from '../legal/waiver';
import { ApiError, fromDbError } from './errors';
import { ageOn, ageRule, dailyTargets, paceCheck, TIMELINES, type DailyTargets, type PaceCheck } from './rules';
import type { OnboardingStep, ProfilePatchV2, ProfileV2, ReminderPrefs } from '../types';

// ─────────────────────────────── defaults ───────────────────────────────

export const DEFAULT_REMINDERS: ReminderPrefs = {
  workout: true,
  meals: true,
  water: true,
  weigh_in: true,
  checkin: true,
  streak: true,
  plan_updated: true,
  report_reply: true,
};

export function emptyProfile(id: string, name = ''): ProfileV2 {
  return {
    id,
    name,
    kcal_target: 2200,
    water_target: 8,
    height_cm: null,
    age: null,
    gender: '',
    weight_kg: null,
    phone: '',
    birth_date: null,
    activity_level: null,
    job_activity: null,
    sleep_hours: null,
    goal: null,
    timeline_months: null,
    target_weight_kg: null,
    train_location: null,
    equipment: [],
    equipment_other: '',
    training_days: [1, 2, 3, 4, 5, 6],
    training_time: 'evening',
    diet_type: 'none',
    allergies: [],
    allergies_other: '',
    dislikes: '',
    injuries: '',
    injury_areas: [],
    conditions: [],
    waiver_version: '',
    waiver_accepted_at: null,
    guardian_name: '',
    guardian_consent_at: null,
    onboarding_step: '',
    onboarding_done_at: null,
    last_active_at: null,
    timezone: 'Asia/Beirut',
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    reminder_prefs: { ...DEFAULT_REMINDERS },
    health_sync: { enabled: false },
  };
}

/** Any stored row (v1 or v2, cloud or device) as a full ProfileV2. */
export function toProfileV2(row: Partial<ProfileV2> & { id: string }): ProfileV2 {
  const base = emptyProfile(row.id, row.name ?? '');
  const merged = { ...base, ...Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) } as ProfileV2;
  merged.reminder_prefs = { ...DEFAULT_REMINDERS, ...(row.reminder_prefs ?? {}) };
  merged.health_sync = { enabled: false, ...(row.health_sync ?? {}) };
  merged.age = ageOn(merged.birth_date, todayId()) ?? merged.age;
  return merged;
}

// ─────────────────────────────── onboarding ───────────────────────────────

/** Questionnaire order (PRODUCT.md). The body photo step is skipped in
    no-account mode (photos need an account). */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'name', 'phone', 'birth_date', 'gender', 'body', 'activity', 'lifestyle', 'goal',
  'timeline', 'location', 'schedule', 'diet', 'health', 'photo', 'waiver', 'done',
];

/** Where to resume: the saved step, or the first one. */
export function resumeStep(p: Pick<ProfileV2, 'onboarding_step' | 'onboarding_done_at'>): OnboardingStep {
  if (p.onboarding_done_at) return 'done';
  return (ONBOARDING_STEPS as readonly string[]).includes(p.onboarding_step) ? (p.onboarding_step as OnboardingStep) : 'name';
}

export function nextStep(step: OnboardingStep, opts: { skipPhoto?: boolean } = {}): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  const next = ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, i + 1)];
  return next === 'photo' && opts.skipPhoto ? 'waiver' : next;
}

export function previousStep(step: OnboardingStep, opts: { skipPhoto?: boolean } = {}): OnboardingStep {
  const i = ONBOARDING_STEPS.indexOf(step);
  const prev = ONBOARDING_STEPS[Math.max(0, i - 1)];
  return prev === 'photo' && opts.skipPhoto ? 'health' : prev;
}

/** 0..1 for the progress bar. */
export function stepProgress(step: OnboardingStep): number {
  return Math.max(0, ONBOARDING_STEPS.indexOf(step)) / (ONBOARDING_STEPS.length - 1);
}

// ─────────────────────────────── validation ───────────────────────────────

/** "+961 70 123 456", "70123456", "0096170123456" → "+96170123456".
    A number without a country code gets `defaultCode` (Lebanon). Null when
    it can't be a phone number. */
export function normalizePhone(input: string, defaultCode = '+961'): string | null {
  const raw = input.trim();
  if (!raw) return '';
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (!digits.startsWith('+')) digits = `${defaultCode}${digits.replace(/^0+/, '')}`;
  digits = `+${digits.slice(1).replace(/\D/g, '')}`;
  return /^\+[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

const ONE_OF: Partial<Record<keyof ProfilePatchV2, readonly string[]>> = {
  activity_level: ['sedentary', 'light', 'moderate', 'very', 'athlete'],
  job_activity: ['desk', 'on_feet', 'physical'],
  goal: ['lose_fat', 'build_muscle', 'tone_up', 'stay_fit', 'sports_performance'],
  train_location: ['home_none', 'home_equipment', 'gym'],
  diet_type: ['none', 'halal', 'vegetarian', 'vegan', 'pescatarian', 'lactose_free', 'gluten_free'],
};
const SUBSET: Partial<Record<keyof ProfilePatchV2, readonly string[]>> = {
  equipment: ['dumbbells', 'bands', 'kettlebell', 'pullup_bar', 'bench', 'other'],
  allergies: ['nuts', 'peanuts', 'dairy', 'eggs', 'gluten', 'shellfish', 'fish', 'soy', 'sesame', 'other'],
  injury_areas: ['knee', 'lower_back', 'shoulder', 'wrist', 'elbow', 'hip', 'ankle', 'neck'],
  conditions: ['high_blood_pressure', 'diabetes', 'asthma', 'heart_condition', 'pregnant', 'postpartum', 'eating_disorder_history', 'joint_pain', 'other'],
};

/** Why this change would be refused, or null when it is fine. Applies the
    same rules as the database. `current` is the profile before the change. */
export function validateProfilePatch(patch: ProfilePatchV2, current: ProfileV2, today = todayId()): ApiError | null {
  const bad = (m: string) => new ApiError('bad_request', m, 400);
  for (const [k, allowed] of Object.entries(ONE_OF)) {
    const v = patch[k as keyof ProfilePatchV2];
    if (v != null && !allowed!.includes(String(v))) return bad('One of those answers isn\'t valid. Check it and try again.');
  }
  for (const [k, allowed] of Object.entries(SUBSET)) {
    const v = patch[k as keyof ProfilePatchV2] as unknown;
    if (v != null && (!Array.isArray(v) || v.some((x) => !allowed!.includes(String(x))))) return bad('One of those answers isn\'t valid. Check it and try again.');
  }
  if (patch.phone != null && patch.phone !== '' && !/^\+[1-9]\d{6,14}$/.test(patch.phone)) return bad('Enter a phone number with its country code, for example +961 70 123 456.');
  if (patch.timeline_months != null && !(TIMELINES as readonly number[]).includes(patch.timeline_months)) return bad('Pick 1, 3, 6 or 12 months.');
  if (patch.target_weight_kg != null && (patch.target_weight_kg < 30 || patch.target_weight_kg > 300)) return bad('Target weight should be between 30 and 300 kg.');
  if (patch.weight_kg != null && (patch.weight_kg < 30 || patch.weight_kg > 300)) return bad('Weight should be between 30 and 300 kg.');
  if (patch.height_cm != null && (patch.height_cm < 100 || patch.height_cm > 250)) return bad('Height should be between 100 and 250 cm.');
  if (patch.sleep_hours != null && (patch.sleep_hours < 3 || patch.sleep_hours > 14)) return bad('Sleep should be between 3 and 14 hours.');
  if (patch.training_days != null && (!patch.training_days.length || patch.training_days.some((d) => !Number.isInteger(d) || d < 0 || d > 6))) return bad('Pick at least one training day.');
  if (patch.training_time != null && !/^(morning|midday|evening|([01]\d|2[0-3]):[0-5]\d)$/.test(patch.training_time)) return bad('Pick a time of day.');

  const next = { ...current, ...patch };
  if (patch.birth_date !== undefined && next.birth_date) {
    if (next.birth_date > today) return bad('Enter a real date of birth.');
    if (ageRule(ageOn(next.birth_date, today)) === 'blocked') return new ApiError('under_13', 'BUILT is for people aged 13 and over.', 400);
  }
  if (next.onboarding_done_at && !current.onboarding_done_at) {
    if (!next.birth_date) return new ApiError('birth_date_required', 'Add your date of birth to finish.', 400);
    if (!next.waiver_accepted_at || !next.waiver_version) return new ApiError('waiver_required', 'Accept the waiver to finish.', 400);
    if (ageRule(ageOn(next.birth_date, today)) === 'minor' && (!next.guardian_name.trim() || !next.guardian_consent_at)) {
      return new ApiError('guardian_required', 'A parent or guardian needs to give consent first.', 400);
    }
  }
  return null;
}

// ─────────────────────────────── storage ───────────────────────────────

// Same key and shape as auth.tsx's device-only identity.
const LOCAL_USER_KEY = 'vital.localUser';
type StoredLocalUser = { userId: string; name: string; profile?: Partial<ProfileV2> };

async function readLocalUser(): Promise<StoredLocalUser | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_USER_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredLocalUser) : null;
    return parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

/** The full profile. Cloud: the server row (device copy when offline).
    No account: the device record. */
export async function getProfile(userId: string): Promise<ProfileV2> {
  if (!isCloudUser(userId)) {
    const u = await readLocalUser();
    const stored = u && u.userId === userId ? u : null;
    return toProfileV2({ ...(stored?.profile ?? {}), id: userId, name: stored?.profile?.name ?? stored?.name ?? '' });
  }
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error || !data) {
    const cached = await loadLocal<Partial<ProfileV2>>(userId, 'profile');
    if (cached) return toProfileV2({ ...cached, id: userId });
    if (error) throw fromDbError(error, "Couldn't load your profile. Check your connection and try again.");
    return emptyProfile(userId);
  }
  await saveLocal(userId, 'profile', data);
  return toProfileV2(data as ProfileV2);
}

/** Save questionnaire answers or settings. Validates first (ApiError with
    a readable message), saves, and resolves the full updated profile. A
    new weight is also logged in the weight history for today. Call it after
    every questionnaire step with { ...answers, onboarding_step: next }. */
export async function saveProfilePatch(userId: string, patch: ProfilePatchV2, current?: ProfileV2): Promise<ProfileV2> {
  const before = current ?? (await getProfile(userId));
  const clean: ProfilePatchV2 = { ...patch };
  if (clean.weight_kg != null) clean.weight_kg = Math.round(clean.weight_kg * 10) / 10;
  if (clean.target_weight_kg != null) clean.target_weight_kg = Math.round(clean.target_weight_kg * 10) / 10;
  if (clean.training_days) clean.training_days = [...new Set(clean.training_days)].sort((a, b) => a - b);
  if (clean.name != null) clean.name = clean.name.trim().slice(0, 80);
  const invalid = validateProfilePatch(clean, before);
  if (invalid) throw invalid;
  const weightChanged = clean.weight_kg != null && clean.weight_kg !== before.weight_kg;

  if (!isCloudUser(userId)) {
    const u = (await readLocalUser()) ?? { userId, name: '' };
    const profile = { ...(u.profile ?? {}), ...clean };
    await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify({ ...u, name: clean.name ?? u.name, profile })).catch(() => {});
    if (weightChanged) await saveWeight(userId, todayId(), clean.weight_kg!).catch(() => false);
    return toProfileV2({ ...before, ...clean, id: userId });
  }

  const { data, error } = await supabase.from('profiles').update(clean).eq('id', userId).select('*').single();
  if (error) throw fromDbError(error, "Couldn't save that. Check your connection and try again.");
  await saveLocal(userId, 'profile', data);
  if (weightChanged) await saveWeight(userId, todayId(), clean.weight_kg!).catch(() => false);
  return toProfileV2(data as ProfileV2);
}

/** Record the waiver acceptance (current WAIVER_VERSION, now). */
export function acceptWaiver(userId: string, current?: ProfileV2): Promise<ProfileV2> {
  return saveProfilePatch(userId, { waiver_version: WAIVER_VERSION, waiver_accepted_at: new Date().toISOString() }, current);
}

/** Record a parent or guardian's consent (13 to 17 year olds). */
export function giveGuardianConsent(userId: string, guardianName: string, current?: ProfileV2): Promise<ProfileV2> {
  const name = guardianName.trim();
  if (name.length < 2) return Promise.reject(new ApiError('bad_request', "Enter your parent or guardian's full name.", 400));
  return saveProfilePatch(userId, { guardian_name: name.slice(0, 120), guardian_consent_at: new Date().toISOString() }, current);
}

/** Finish the questionnaire. Throws waiver_required, guardian_required or
    birth_date_required when something is missing. Then call
    generatePlan(userId) to build the first plan. */
export function completeOnboarding(userId: string, current?: ProfileV2): Promise<ProfileV2> {
  return saveProfilePatch(userId, { onboarding_step: 'done', onboarding_done_at: new Date().toISOString() }, current);
}

/** True when the waiver on file is the current version. */
export function waiverCurrent(p: Pick<ProfileV2, 'waiver_version' | 'waiver_accepted_at'>): boolean {
  return !!p.waiver_accepted_at && p.waiver_version === WAIVER_VERSION;
}

// ─────────────────────────────── derived ───────────────────────────────

/** Age today, from the birth date (or the stored age). */
export function ageOf(p: Pick<ProfileV2, 'birth_date' | 'age'>, today = todayId()): number | null {
  return ageOn(p.birth_date, today) ?? p.age;
}

/** The timeline warning for the questionnaire (null without a weight and
    timeline). Show `message` when `safe` is false and offer
    `suggestedMonths`. */
export function paceFor(p: Pick<ProfileV2, 'weight_kg' | 'target_weight_kg' | 'timeline_months' | 'birth_date' | 'age'>): PaceCheck | null {
  if (!p.weight_kg || !p.timeline_months) return null;
  return paceCheck({ currentKg: p.weight_kg, targetKg: p.target_weight_kg, months: p.timeline_months, age: ageOf(p) });
}

/** Daily calorie, macro and water targets from the answers (the planner
    uses the same rules). */
export function targetsFor(p: ProfileV2): DailyTargets {
  return dailyTargets({
    weightKg: p.weight_kg,
    heightCm: p.height_cm,
    age: ageOf(p),
    gender: p.gender,
    activityLevel: p.activity_level,
    jobActivity: p.job_activity,
    goal: p.goal,
    targetKg: p.target_weight_kg,
    months: p.timeline_months,
  });
}
