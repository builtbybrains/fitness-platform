// What a check-in means for the plan, in code (no AI): weight trend against
// the goal's pace, how hard the plan felt, energy, sleep and hunger. The
// result feeds the planner (an instruction and a calorie change) and a
// plain-language summary. Pure functions.

import { MAX_GAIN_KG_PER_WEEK, MAX_LOSS_PCT_PER_WEEK, WEEKS_PER_MONTH, type Goal } from './rules.ts';

export type CheckinAnswers = {
  energy?: number; // 1 very low … 5 great
  sleep?: number; // 1 very poor … 5 great
  hunger?: number; // 1 never hungry … 5 always hungry
  difficulty?: number; // 1 too easy … 3 about right … 5 too hard
  adherence?: number; // 0..100, % of the plan followed
  notes?: string;
};

export type Measurements = { waist_cm?: number; hips_cm?: number; chest_cm?: number; arm_cm?: number; thigh_cm?: number };

export type Review = {
  /** kg a week since the comparison point (negative = losing). */
  weeklyChange: number | null;
  /** what the goal expects, kg a week (negative = losing). */
  expectedWeekly: number;
  kcalDelta: number;
  instruction: string;
  lines: string[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function expectedWeekly(goal: Goal | null, weightKg: number, targetKg: number | null, months: number | null, minor: boolean): number {
  if (targetKg != null && months && Math.abs(targetKg - weightKg) >= 0.5) {
    const w = (targetKg - weightKg) / (months * WEEKS_PER_MONTH);
    const capped = w < 0 ? Math.max(w, -weightKg * MAX_LOSS_PCT_PER_WEEK) : Math.min(w, MAX_GAIN_KG_PER_WEEK);
    return minor && capped < 0 ? 0 : capped;
  }
  if (goal === 'lose_fat' && !minor) return -weightKg * 0.005;
  if (goal === 'build_muscle') return 0.2;
  return 0;
}

export function review(input: {
  goal: Goal | null;
  minor: boolean;
  startKg: number | null;
  nowKg: number | null;
  days: number;
  targetKg: number | null;
  months: number | null;
  answers: CheckinAnswers;
  startWaist?: number | null;
  nowWaist?: number | null;
}): Review {
  const a = input.answers;
  const lines: string[] = [];
  const asks: string[] = [];
  let delta = 0;
  const weeks = Math.max(1, input.days / 7);
  const weight = input.nowKg ?? input.startKg ?? 70;
  const expected = expectedWeekly(input.goal, weight, input.targetKg, input.months, input.minor);
  let weekly: number | null = null;
  const adherent = (a.adherence ?? 75) >= 70;

  if (input.startKg != null && input.nowKg != null && input.days >= 6) {
    weekly = Math.round(((input.nowKg - input.startKg) / weeks) * 100) / 100;
    const total = r1(input.nowKg - input.startKg);
    lines.push(total === 0 ? `Your weight held steady at ${input.nowKg} kg.` : `${total < 0 ? 'Down' : 'Up'} ${Math.abs(total)} kg in ${Math.round(input.days)} days (${input.startKg} → ${input.nowKg} kg).`);
    if (expected < 0) {
      if (weekly < -weight * MAX_LOSS_PCT_PER_WEEK) {
        delta += 150;
        lines.push('That is faster than a safe pace, so your calories go up a little.');
        asks.push('Losing too fast: raise calories slightly.');
      } else if (weekly > expected * 0.25 && adherent && !input.minor) {
        delta -= 150;
        lines.push('Progress has slowed while you stuck to the plan, so calories come down a little (never below your safe minimum).');
        asks.push('Weight loss has stalled: slightly lower calories.');
      } else {
        lines.push('That is right on pace.');
      }
    } else if (expected > 0) {
      if (weekly < 0.05 && adherent) {
        delta += 150;
        lines.push('You are not gaining yet, so calories go up a little.');
        asks.push('Not gaining: slightly more calories.');
      } else if (weekly > MAX_GAIN_KG_PER_WEEK) {
        delta -= 100;
        lines.push('Gaining a bit fast, so calories come down slightly.');
      } else {
        lines.push('That is right on pace for building muscle.');
      }
    } else if (Math.abs(weekly) > 0.3 && adherent) {
      delta += weekly > 0 ? -100 : 100;
      lines.push('Your weight drifted, so calories are nudged to hold it steady.');
    }
  } else if (input.nowKg != null) {
    lines.push(`Logged at ${input.nowKg} kg. Your next check-in will show the trend.`);
  }

  if (input.startWaist && input.nowWaist) {
    const w = r1(input.nowWaist - input.startWaist);
    if (Math.abs(w) >= 0.5) lines.push(`Waist ${w < 0 ? 'down' : 'up'} ${Math.abs(w)} cm.`);
  }

  if ((a.difficulty ?? 3) >= 4) {
    asks.push('The plan felt too hard: make it easier.');
    lines.push('The plan felt hard, so workouts get a little less volume.');
  } else if ((a.difficulty ?? 3) <= 2) {
    asks.push('The plan felt too easy: make it harder.');
    lines.push('The plan felt easy, so workouts step up.');
  }
  if ((a.energy ?? 3) <= 2 || (a.sleep ?? 3) <= 2) {
    if (expected < 0 && delta < 100) delta += 100;
    asks.push('Low energy or poor sleep: prioritise recovery.');
    lines.push('Energy or sleep has been low, so there is more recovery built in.');
  }
  if ((a.hunger ?? 3) >= 4) {
    asks.push('Often hungry: more filling, high-protein, high-fibre meals.');
    lines.push('You have been hungry, so meals lean on more filling, high-protein food.');
  }
  if (input.minor && delta < 0) delta = 0;

  return {
    weeklyChange: weekly,
    expectedWeekly: Math.round(expected * 100) / 100,
    kcalDelta: Math.max(-300, Math.min(300, delta)),
    instruction: asks.length ? `Monthly check-in: ${asks.join(' ')}` : 'Monthly check-in: keep the plan on track.',
    lines,
  };
}

/** Clean answers from the app. */
export function cleanAnswers(raw: unknown): CheckinAnswers {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const scale = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) >= 1 && Number(v) <= 5 ? Math.round(Number(v)) : undefined);
  const out: CheckinAnswers = {
    energy: scale(r.energy),
    sleep: scale(r.sleep),
    hunger: scale(r.hunger),
    difficulty: scale(r.difficulty),
    adherence: Number.isFinite(Number(r.adherence)) && r.adherence !== null && r.adherence !== '' ? Math.min(100, Math.max(0, Math.round(Number(r.adherence)))) : undefined,
    notes: typeof r.notes === 'string' ? r.notes.replace(/\s+/g, ' ').trim().slice(0, 500) || undefined : undefined,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined)) as CheckinAnswers;
}

export function cleanMeasurements(raw: unknown): Measurements {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Measurements = {};
  for (const k of ['waist_cm', 'hips_cm', 'chest_cm', 'arm_cm', 'thigh_cm'] as const) {
    const v = Number(r[k]);
    if (Number.isFinite(v) && v >= 15 && v <= 250) out[k] = Math.round(v * 10) / 10;
  }
  return out;
}
