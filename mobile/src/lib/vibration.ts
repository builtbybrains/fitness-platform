/* Web vibration: the pattern for each kind of haptic, and a guarded call to
   navigator.vibrate. Android Chrome buzzes; iOS Safari and desktop browsers
   have no vibrate, so they stay silent. Pure, so it is tested without React
   Native. */

export type HapticKind = 'tap' | 'select' | 'success' | 'heavy';

/** Milliseconds of buzz (or buzz, pause, buzz) for each kind. */
export const VIBRATION: Record<HapticKind, number | number[]> = {
  tap: 15,
  select: 10,
  success: [20, 60, 35],
  heavy: 30,
};

type Vibrator = {
  vibrate?: (pattern: number | number[]) => boolean;
  userActivation?: { hasBeenActive: boolean };
};

function defaultNavigator(): Vibrator | undefined {
  return typeof navigator !== 'undefined' ? (navigator as unknown as Vibrator) : undefined;
}

/** Buzz the phone for `kind`. Returns whether the browser took the call.
    Skipped before the person has touched the page (the browser would block
    it and log a warning) and wherever vibrate does not exist. */
export function webVibrate(kind: HapticKind, nav: Vibrator | undefined = defaultNavigator()): boolean {
  if (!nav || !('vibrate' in nav) || typeof nav.vibrate !== 'function') return false;
  if (nav.userActivation && !nav.userActivation.hasBeenActive) return false;
  try {
    return nav.vibrate(VIBRATION[kind]) !== false;
  } catch {
    return false;
  }
}

/** Where the Vibration setting is kept on this device. '0' means off. */
export const VIBRATION_KEY = 'settings:vibration';

/** The stored value, read leniently: anything but '0' is on. */
export function vibrationFromStored(v: string | null | undefined): boolean {
  return v !== '0';
}
