/* Local-day helpers for the health readers (pure, unit tested). */

import { addDays, parseDay } from '../../lib/dates';

/** Day ids from `from` to `to` inclusive (max 60). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 60; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Local midnight to the next local midnight. */
export function dayRange(day: string): { start: Date; end: Date } {
  return { start: parseDay(day), end: parseDay(addDays(day, 1)) };
}

/** The night that ends on the morning of `day`: 18:00 the day before to
    12:00 on the day. */
export function nightRange(day: string): { start: Date; end: Date } {
  const start = parseDay(addDays(day, -1));
  start.setHours(18, 0, 0, 0);
  const end = parseDay(day);
  end.setHours(12, 0, 0, 0);
  return { start, end };
}

/** Minutes of overlap between [a0, a1] and [b0, b1]. */
export function overlapMinutes(a0: Date, a1: Date, b0: Date, b1: Date): number {
  const s = Math.max(a0.getTime(), b0.getTime());
  const e = Math.min(a1.getTime(), b1.getTime());
  return e > s ? Math.round((e - s) / 60000) : 0;
}
