/* Pure countdown math for the rest timer (unit tested). */

/** Whole seconds left until `endAt` (ms epoch), never negative. */
export function remainingSeconds(endAt: number, now: number): number {
  return Math.max(0, Math.ceil((endAt - now) / 1000));
}
