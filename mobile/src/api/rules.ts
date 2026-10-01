/* BUILT health and planning rules: age, calorie floors, safe pace,
   daily targets and weekday maths. Pure functions, no imports, no I/O.

   This file is byte-identical in two places:
     mobile/src/api/rules.ts               (the app: onboarding warnings, local maths)
     supabase/functions/_shared/rules.ts   (the planner and coach)
   mobile/src/__tests__/rules.test.ts fails if they differ. Edit one, copy it
   over the other. */

export type Gender = 'male' | 'female' | '';
export type Goal = 'lose_fat' | 'build_muscle' | 'tone_up' | 'stay_fit' | 'sports_performance';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'athlete';
export type JobActivity = 'desk' | 'on_feet' | 'physical';
export type TimelineMonths = 1 | 3 | 6 | 12;

export const TIMELINES: readonly TimelineMonths[] = [1, 3, 6, 12];
export const MIN_AGE = 13;
export const ADULT_AGE = 18;
export const WEEKS_PER_MONTH = 4.345;
/** kcal in one kg of body-weight change (the usual planning figure). */
export const KCAL_PER_KG = 7700;
/** Safe pace limits from the product spec. */
export const MAX_LOSS_PCT_PER_WEEK = 0.01; // 1% of body weight a week
export const MAX_GAIN_KG_PER_WEEK = 0.5;

// ─────────────────────────────── age ───────────────────────────────

/** Whole years between a birth date and a day (both yyyy-mm-dd). Null when
    either is missing or malformed. */
export function ageOn(birthDate: string | null | undefined, today: string): number | null {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDate ?? '');
  const t = /^(\d{4})-(\d{2})-(\d{2})/.exec(today);
  if (!b || !t) return null;
  const [by, bm, bd] = [Number(b[1]), Number(b[2]), Number(b[3])];
  const [ty, tm, td] = [Number(t[1]), Number(t[2]), Number(t[3])];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

export type AgeRule = 'blocked' | 'minor' | 'adult' | 'unknown';

/** Under 13: cannot use BUILT. 13 to 17: allowed with a guardian's consent,
    maintenance calories only, no max-effort lifting, no supplements. */
export function ageRule(age: number | null | undefined): AgeRule {
  if (age == null || !Number.isFinite(age)) return 'unknown';
  if (age < MIN_AGE) return 'blocked';
  if (age < ADULT_AGE) return 'minor';
  return 'adult';
}

// ───────────────────────────── calories ─────────────────────────────

/** Lowest daily calories BUILT will ever prescribe. Unknown gender uses the
    higher floor. */
export function kcalFloor(gender: string | null | undefined): number {
  return gender === 'female' ? 1200 : 1500;
}

export type BodyStats = {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: string | null | undefined;
};

/** Mifflin-St Jeor resting energy. Null when a stat is missing. */
export function bmr(s: BodyStats): number | null {
  const { weightKg: w, heightCm: h, age } = s;
  if (!w || !h || !age) return null;
  const sex = s.gender === 'male' ? 5 : s.gender === 'female' ? -161 : -78;
  return 10 * w + 6.25 * h - 5 * age + sex;
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  athlete: 1.9,
};

const JOB_BONUS: Record<JobActivity, number> = { desk: 0, on_feet: 0.05, physical: 0.1 };

/** Activity multiplier from the activity level, nudged up for a job on
    your feet or physical work. Capped at the athlete level. */
export function activityFactor(level: ActivityLevel | null | undefined, job?: JobActivity | null): number {
  const base = level ? ACTIVITY_FACTORS[level] ?? 1.375 : 1.375;
  const bonus = job ? JOB_BONUS[job] ?? 0 : 0;
  return Math.min(1.9, Math.round((base + bonus) * 1000) / 1000);
}

/** Maintenance calories (resting energy × activity). */
export function maintenanceKcal(s: BodyStats, level?: ActivityLevel | null, job?: JobActivity | null): number | null {
  const b = bmr(s);
  return b == null ? null : b * activityFactor(level, job);
}

// ─────────────────────────────── pace ───────────────────────────────

export type PaceCheck = {
  direction: 'lose' | 'gain' | 'maintain';
  /** kg to change in total (positive number). */
  totalKg: number;
  /** kg a week the timeline implies (positive number). */
  weeklyKg: number;
  /** the safe limit for this direction, kg a week. */
  maxWeeklyKg: number;
  safe: boolean;
  /** Shortest timeline (1, 3, 6 or 12 months) at a safe pace, or null when
      even 12 months is too fast. Equals `months` when already safe. */
  suggestedMonths: TimelineMonths | null;
  /** Plain-language note to show the person. Empty when nothing to say. */
  message: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Is reaching `targetKg` from `currentKg` in `months` a safe pace?
    Loss: at most 1% of body weight a week. Gain: at most 0.5 kg a week.
    Under 18: no weight-loss target at all (maintenance or growth only). */
export function paceCheck(input: {
  currentKg: number;
  targetKg: number | null | undefined;
  months: number;
  age?: number | null;
}): PaceCheck {
  const { currentKg, months } = input;
  const target = input.targetKg;
  const weeks = Math.max(1, months) * WEEKS_PER_MONTH;
  if (target == null || !Number.isFinite(target) || !Number.isFinite(currentKg) || Math.abs(target - currentKg) < 0.5) {
    return { direction: 'maintain', totalKg: 0, weeklyKg: 0, maxWeeklyKg: 0, safe: true, suggestedMonths: nearestTimeline(months), message: '' };
  }
  const direction = target < currentKg ? 'lose' : 'gain';
  const totalKg = round1(Math.abs(target - currentKg));
  const weeklyKg = Math.round((totalKg / weeks) * 100) / 100;
  const maxWeeklyKg = direction === 'lose' ? Math.round(currentKg * MAX_LOSS_PCT_PER_WEEK * 100) / 100 : MAX_GAIN_KG_PER_WEEK;

  if (direction === 'lose' && ageRule(input.age) === 'minor') {
    return {
      direction, totalKg, weeklyKg, maxWeeklyKg: 0, safe: false, suggestedMonths: null,
      message: 'Under 18, BUILT plans for maintenance and growth, not weight loss. Your plan will focus on getting stronger and fitter instead.',
    };
  }

  const fits = (m: number) => totalKg / (m * WEEKS_PER_MONTH) <= maxWeeklyKg + 1e-9;
  const safe = fits(Math.max(1, months));
  const suggestedMonths = TIMELINES.find((m) => m >= Math.min(months, 12) && fits(m)) ?? null;
  let message = '';
  if (!safe) {
    const verb = direction === 'lose' ? 'Losing' : 'Gaining';
    const limit = direction === 'lose' ? `about ${maxWeeklyKg} kg a week (1% of your weight)` : `${MAX_GAIN_KG_PER_WEEK} kg a week`;
    message = suggestedMonths
      ? `${verb} ${totalKg} kg in ${months} month${months === 1 ? '' : 's'} is about ${weeklyKg} kg a week. A safe pace is ${limit}, so ${suggestedMonths} months is a better timeline.`
      : `${verb} ${totalKg} kg is more than a safe pace allows even in 12 months (${limit}). Pick a closer target weight for now; you can set a new one when you reach it.`;
  }
  return { direction, totalKg, weeklyKg, maxWeeklyKg, safe, suggestedMonths, message };
}

function nearestTimeline(months: number): TimelineMonths {
  return TIMELINES.find((m) => m >= months) ?? 12;
}

// ───────────────────────────── targets ─────────────────────────────

export type TargetsInput = BodyStats & {
  activityLevel?: ActivityLevel | null;
  jobActivity?: JobActivity | null;
  goal?: Goal | null;
  targetKg?: number | null;
  months?: number | null;
};

export type DailyTargets = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_glasses: number;
  /** Maintenance estimate the target is based on (null without full stats). */
  maintenance: number | null;
  /** kcal a day below (negative) or above maintenance. */
  adjustment: number;
  /** True when a safety floor raised the target. */
  floorApplied: boolean;
  /** Short explanation, safe to show. */
  reason: string;
};

const PROTEIN_PER_KG: Record<Goal, number> = {
  lose_fat: 2.0,
  build_muscle: 1.8,
  tone_up: 1.8,
  stay_fit: 1.6,
  sports_performance: 1.7,
};

/** Daily calories, macros and water from the questionnaire. Applies every
    safety rule: the calorie floor (1200 women, 1500 men or unknown), never
    below resting energy × 1.1 when losing, a deficit of at most 25% (and
    1000 kcal), and no deficit at all under 18. */
export function dailyTargets(input: TargetsInput): DailyTargets {
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : 70;
  const stats: BodyStats = { ...input, weightKg: weight };
  const minor = ageRule(input.age) === 'minor';
  const goal: Goal = input.goal ?? 'stay_fit';
  const b = bmr(stats);
  const maintenance = b == null ? null : b * activityFactor(input.activityLevel, input.jobActivity);
  const base = maintenance ?? weight * 30; // rough fallback without height/age
  const bmi = input.heightCm ? weight / ((input.heightCm / 100) ** 2) : null;

  let adjustment = 0;
  let reason = '';
  const months = input.months && input.months > 0 ? input.months : null;
  const target = input.targetKg ?? null;
  if (goal === 'lose_fat' || (goal === 'tone_up' && ((target != null && target < weight - 0.5) || (bmi != null && bmi >= 25)))) {
    let weekly = goal === 'lose_fat' ? weight * 0.005 : weight * 0.0025;
    if (target != null && months && target < weight) weekly = (weight - target) / (months * WEEKS_PER_MONTH);
    weekly = Math.min(weekly, weight * MAX_LOSS_PCT_PER_WEEK);
    adjustment = -Math.min((weekly * KCAL_PER_KG) / 7, base * 0.25, 1000);
    reason = 'A steady deficit for fat loss.';
  } else if (goal === 'build_muscle') {
    let weekly = 0.25;
    if (target != null && months && target > weight) weekly = (target - weight) / (months * WEEKS_PER_MONTH);
    weekly = Math.min(Math.max(weekly, 0.2), MAX_GAIN_KG_PER_WEEK);
    adjustment = Math.min((weekly * KCAL_PER_KG) / 7, 500);
    reason = 'A small surplus to build muscle.';
  } else if (goal === 'sports_performance') {
    adjustment = base * 0.05;
    reason = 'A little extra fuel for performance.';
  } else {
    reason = 'Maintenance: steady energy for training.';
  }

  if (minor && adjustment < 0) {
    adjustment = 0;
    reason = 'Under 18: maintenance calories, never a deficit.';
  }

  let kcal = base + adjustment;
  let floorApplied = false;
  const floor = Math.max(
    kcalFloor(input.gender),
    adjustment < 0 && b != null ? b * 1.1 : 0,
    minor ? base : 0,
  );
  if (kcal < floor) {
    kcal = floor;
    floorApplied = true;
    reason += ' Raised to the safe minimum.';
  }
  kcal = Math.min(6000, Math.round(kcal / 10) * 10);

  // Protein on a capped reference weight (BMI 27) so it stays sensible.
  const refWeight = input.heightCm ? Math.min(weight, 27 * (input.heightCm / 100) ** 2) : weight;
  const perKg = minor ? 1.5 : PROTEIN_PER_KG[goal];
  const protein_g = Math.round(Math.min(refWeight * perKg, weight * 2.2));
  const fat_g = Math.round(Math.max((kcal * 0.28) / 9, weight * 0.6));
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  const water_glasses = Math.min(12, Math.max(6, Math.round((weight * 30) / 250)));

  return {
    kcal,
    protein_g,
    carbs_g,
    fat_g,
    water_glasses,
    maintenance: maintenance == null ? null : Math.round(maintenance),
    adjustment: Math.round(kcal - base),
    floorApplied,
    reason: reason.trim(),
  };
}

/** kcal from macros (4 / 4 / 9). */
export function macroKcal(protein: number, carbs: number, fat: number): number {
  return Math.round(protein * 4 + carbs * 4 + fat * 9);
}

// ────────────────────────── minors: supplements ──────────────────────────

const SUPPLEMENT_RE = /\b(whey|protein (?:shake|powder|bar)s?|casein|creatine|pre[- ]?workout|bcaas?|fat[- ]?burners?|mass gainer|supplements?)\b/i;

/** True when a meal label or note mentions a supplement. */
export function mentionsSupplement(text: string): boolean {
  return SUPPLEMENT_RE.test(text);
}

// ───────────────────────────── weekdays ─────────────────────────────
// Two conventions meet here. profiles.training_days uses 0 = Sunday …
// 6 = Saturday (like Date.getDay()). Plans and calendar weeks are Monday
// first: plan day index 0 = Monday … 6 = Sunday.

/** 0 = Sunday … 6 = Saturday  →  0 = Monday … 6 = Sunday. */
export function planIndexOfWeekday(dow: number): number {
  return (dow + 6) % 7;
}

/** 0 = Monday … 6 = Sunday  →  0 = Sunday … 6 = Saturday. */
export function weekdayOfPlanIndex(index: number): number {
  return (index + 1) % 7;
}

/** Monday-first list of 7 booleans: is plan day i a training day? */
export function trainingSchedule(trainingDays: readonly number[] | null | undefined): boolean[] {
  const days = trainingDays && trainingDays.length ? trainingDays : [1, 2, 3, 4, 5, 6];
  return Array.from({ length: 7 }, (_, i) => days.includes(weekdayOfPlanIndex(i)));
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
