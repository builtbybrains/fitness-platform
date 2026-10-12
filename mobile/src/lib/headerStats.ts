/* The short lines in the Plan and Food headers: the date eyebrow and the
   small stat chips under the title. Pure: no React, no native modules, so
   the wording is unit tested. Icon names are a type-only import. */

import type { IconName } from '../components/Icon';
import { dayTitle, plural } from '../components/training/labels';

export type HeaderStat = { icon: IconName; text: string; label?: string };

/** 1725 → "1,725", the same grouping DayTotals shows. */
export function groupThousands(n: number): string {
  const v = Math.round(Math.abs(n));
  return `${n < 0 && v > 0 ? '-' : ''}${String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "1,725 kcal left" or "120 kcal over", rounded like DayTotals. */
export function kcalLeftText(eaten: number, target: number): string {
  const e = Math.round(eaten);
  const t = Math.round(target);
  return e > t ? `${groupThousands(e - t)} kcal over` : `${groupThousands(t - e)} kcal left`;
}

/** "2 of 6 this week"; "Rest week" when nothing is planned. */
export function weekCountText(done: number, planned: number): string {
  return planned > 0 ? `${done} of ${planned} this week` : 'Rest week';
}

/** Spoken form: "2 of 6 workouts done this week". */
export function weekCountLabel(done: number, planned: number): string {
  return planned > 0 ? `${done} of ${plural(planned, 'workout')} done this week` : 'No workouts planned this week';
}

/** "TODAY · THURSDAY 8 OCT", or "FRIDAY 9 OCT" for any other day. */
export function dateEyebrow(index: number, id: string, isToday: boolean): string {
  return `${isToday ? 'Today · ' : ''}${dayTitle(index, id)}`.toUpperCase();
}

type SessionInput = { kind: 'workout'; focus: string; minutes: number } | { kind: 'rest' };

/** Plan header chips: the day's session, its length (workouts only) and
    the week's count, in the same numbers as Today's week strip. */
export function planHeaderStats(session: SessionInput, week: { done: number; planned: number }): HeaderStat[] {
  const out: HeaderStat[] = [];
  if (session.kind === 'workout') {
    out.push({ icon: 'dumbbell', text: session.focus, label: `Workout: ${session.focus}` });
    if (session.minutes > 0) out.push({ icon: 'clock', text: `${session.minutes} min`, label: `${session.minutes} minutes` });
  } else {
    out.push({ icon: 'calendar', text: 'Rest day' });
  }
  out.push({ icon: 'check', text: weekCountText(week.done, week.planned), label: weekCountLabel(week.done, week.planned) });
  return out;
}

/** Food header chips: calories left (or over), the next meal to eat and
    how many planned meals are ticked. When every meal is eaten the two
    meal chips become one "All meals eaten". */
export function foodHeaderStats(p: { eatenKcal: number; targetKcal: number; meals: readonly { slot: string }[]; eatenSlots: readonly string[] }): HeaderStat[] {
  const kcal = kcalLeftText(p.eatenKcal, p.targetKcal);
  const out: HeaderStat[] = [{ icon: 'flame', text: kcal }];
  if (p.meals.length === 0) return out;
  const next = p.meals.find((m) => !p.eatenSlots.includes(m.slot));
  const eaten = p.meals.filter((m) => p.eatenSlots.includes(m.slot)).length;
  if (!next) {
    out.push({ icon: 'check', text: 'All meals eaten' });
    return out;
  }
  out.push({ icon: 'clock', text: `Next: ${next.slot}`, label: `Next meal: ${next.slot}` });
  out.push({ icon: 'check', text: `${eaten} of ${p.meals.length} eaten`, label: `${eaten} of ${plural(p.meals.length, 'meal')} eaten` });
  return out;
}
