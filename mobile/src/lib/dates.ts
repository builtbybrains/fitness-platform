/* Calendar-day helpers. Every id is a LOCAL calendar day, yyyy-mm-dd, and
   weeks run Monday to Sunday. Pure functions (no React, no native modules)
   so they run in unit tests. */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** yyyy-mm-dd for the local calendar day of `d`. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local day id. */
export function todayId(now: Date = new Date()): string {
  return isoDay(now);
}

/** Local midnight of a day id. */
export function parseDay(id: string): Date {
  const [y, m, d] = id.split('-').map((n) => Number.parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Day id `n` days after (or before, when negative) `id`. DST-safe. */
export function addDays(id: string, n: number): string {
  const d = parseDay(id);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** 0 = Monday … 6 = Sunday. */
export function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Local midnight of the Monday that starts `from`'s week. */
export function weekStartDate(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayIndex(d));
  return d;
}

export function weekStartId(from: Date = new Date()): string {
  return isoDay(weekStartDate(from));
}

/** The seven day ids (Mon..Sun) of the week containing `from`. */
export function weekDayIds(from: Date = new Date()): string[] {
  const start = isoDay(weekStartDate(from));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Milliseconds from `now` until the next local midnight (always > 0). */
export function msUntilNextMidnight(now: Date = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1, next.getTime() - now.getTime());
}
