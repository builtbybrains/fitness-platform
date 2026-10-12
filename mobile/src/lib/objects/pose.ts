/* Pure motion math for the object images (the sign-in dumbbell, the
   celebration dumbbell and medal): easing, the drop-in and flip-in curves,
   the idle float and sway, and a sampler that turns any curve into an
   Animated interpolation. No React Native here, so it runs in tests.
   Times are in seconds; distances in px; angles in degrees unless named. */

export const clamp01 = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p);

export const easeOutQuart = (p: number) => 1 - Math.pow(1 - clamp01(p), 4);

/** The dumbbell dropping in: px above its rest point, degrees of turn on
    top of its pose, and opacity. Ease-out quart, settled by `duration`. */
export function dropIn(t: number, duration = 0.5, from = 56, turn = -28) {
  const e = easeOutQuart(t / duration);
  return {
    y: -from * (1 - e) + 0,
    rotate: turn * (1 - e) + 0,
    opacity: clamp01(t / (duration * 0.3)),
    done: t >= duration,
  };
}

/** The medal flipping in: degrees about the vertical axis, from edge-on
    (90) to face-on (0), ease-out quart with no overshoot, then held. */
export function flipIn(t: number, duration = 0.6): number {
  return 90 * (1 - easeOutQuart(t / duration));
}

/** A slow float, zero at t = 0 so it can start from a still pose without
    a jump. */
export function bob(t: number, amplitude = 6, period = 3.2): number {
  return Math.sin((t / period) * Math.PI * 2) * amplitude;
}

/**
 * `n + 1` evenly spaced samples of `fn` over 0..1, as an Animated
 * interpolation (inputRange, outputRange). Piecewise linear between
 * samples, so 24 or so reads as a smooth curve.
 */
export function sampleCurve(fn: (p: number) => number, n = 24): { inputRange: number[]; outputRange: number[] } {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    inputRange.push(p);
    // `+ 0` turns -0 into 0, so a still pose reads as exactly 0.
    outputRange.push(Math.round(fn(p) * 1000) / 1000 + 0);
  }
  return { inputRange, outputRange };
}

/**
 * The sign-in dumbbell's idle loop, as a share `c` (0..1) of one cycle of
 * `period` seconds: two bobs and one slow sway (a turn and a drift) per
 * cycle, so the loop joins up with no jump. Zero at c = 0.
 */
export function floatPose(c: number, bobPx = 6, swayDeg = 3, driftPx = 4) {
  const a = c * Math.PI * 2;
  return { y: -Math.sin(a * 2) * bobPx, rotate: Math.sin(a) * swayDeg, x: Math.sin(a) * driftPx };
}

/** Drag tilt for an object: follows the finger, never past `max`. */
export const softClamp = (x: number, max: number) => max * Math.tanh(x / max);

/** Size of the sign-in dumbbell for a screen height: 180 on most phones,
    120 on short ones, none while the keyboard covers a short screen. */
export function heroSize(screenHeight: number, keyboardUp: boolean): number {
  if (screenHeight < 700) return keyboardUp ? 0 : 120;
  return 180;
}
