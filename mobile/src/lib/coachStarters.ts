/* What an empty coach chat offers to ask, and the short "Your coach sees"
   chips under the Coach header, both from today's context. Pure: no React,
   no native modules, so the picks and the wording are unit tested. */

import type { HeaderStat } from './headerStats';
import { kcalLeftText } from './headerStats';

export type CoachDay = {
  session: { kind: 'workout'; focus: string } | { kind: 'rest' };
  workoutDone: boolean;
  protein: { eaten: number; target: number };
  kcal: { eaten: number; target: number };
  streak: number;
  /** Local hour, 0 to 23. */
  hour: number;
};

/** "Upper body · Strength" → "Upper body". */
export function focusName(focus: string): string {
  return focus.split('·')[0].trim();
}

/** Protein is "far below" from 2pm on, when under 40% of the target. */
export function proteinFarBelow(p: { eaten: number; target: number }, hour: number): boolean {
  return p.target > 0 && hour >= 14 && p.eaten < p.target * 0.4;
}

/** Up to three things to ask on an empty chat, the most useful first:
    the day (warm-up for the workout, recovery on a rest day, refuelling
    once the workout is done), a protein nudge when the day is running low,
    and always the week. */
export function pickStarters(day: CoachDay): string[] {
  const out: string[] = [];
  if (day.session.kind === 'workout') {
    const name = focusName(day.session.focus);
    if (day.workoutDone) out.push('What should I eat after training?');
    else out.push(name ? `Warm-up for ${name.toLowerCase()}?` : 'How should I warm up today?');
  } else {
    out.push('What should I do on a rest day?');
  }
  if (proteinFarBelow(day.protein, day.hour)) out.push('High-protein snack ideas?');
  out.push("How's my week going?");
  return out;
}

/** The chips under the Coach header: today's session, calories left and
    the workout streak (when there is one). */
export function coachContextChips(day: CoachDay): HeaderStat[] {
  const out: HeaderStat[] = [];
  if (day.session.kind === 'workout') {
    const name = focusName(day.session.focus) || 'Workout';
    out.push(day.workoutDone ? { icon: 'check', text: `${name} done`, label: `Today's workout, ${name}, is done` } : { icon: 'dumbbell', text: `${name} today`, label: `Today: ${name}` });
  } else {
    out.push({ icon: 'calendar', text: 'Rest day today' });
  }
  if (day.kcal.target > 0) out.push({ icon: 'flame', text: kcalLeftText(day.kcal.eaten, day.kcal.target) });
  if (day.streak > 0) out.push({ icon: 'bars', text: `${day.streak} in a row`, label: `Workout streak: ${day.streak} ${day.streak === 1 ? 'workout' : 'workouts'} in a row` });
  return out;
}
