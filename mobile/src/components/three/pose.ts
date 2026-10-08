/* Pure motion math for the 3D scenes: easing, the drop-in and flip-in
   curves, the idle float, the drag spin with damping, and how far the
   camera sits to fit an object. No three.js here, so it runs in tests and
   on any platform. Times are in seconds, angles in radians. */

export const clamp01 = (p: number) => (p < 0 ? 0 : p > 1 ? 1 : p);

export const easeOutQuart = (p: number) => 1 - Math.pow(1 - clamp01(p), 4);

/** The dumbbell dropping in: height above its rest point, extra spin on
    top of the idle spin, and a tilt that levels out as it lands. Starts
    half a unit up so the top of the canvas never clips it. */
export function dropIn(t: number, duration = 0.5, from = 0.5, turns = 0.75) {
  const e = easeOutQuart(t / duration);
  return {
    y: from * (1 - e),
    spin: (1 - e) * turns * Math.PI * 2,
    tilt: (1 - e) * 0.45,
    done: t >= duration,
  };
}

/** The medal flipping in: Y rotation from half a turn to face-on,
    ease-out quart with no overshoot, then held. */
export function flipIn(t: number, duration = 0.6): number {
  return Math.PI * (1 - easeOutQuart(t / duration));
}

/** A slow float, zero at t = 0 so it can start from a resting pose without
    a jump. */
export function bob(t: number, amplitude = 0.08, period = 3.2): number {
  return Math.sin((t / period) * Math.PI * 2) * amplitude;
}

export type Spin = { angle: number; velocity: number; dragging: boolean };

/** One frame of drag spin. While dragging, the finger sets the angle
    directly; after release the flick velocity carries on and decays, so
    the object eases back to its own idle spin. */
export function stepSpin(s: Spin, dt: number, damping = 2.6): Spin {
  if (s.dragging || dt <= 0) return s;
  const velocity = s.velocity * Math.exp(-damping * dt);
  return { angle: s.angle + s.velocity * dt, velocity: Math.abs(velocity) < 0.001 ? 0 : velocity, dragging: false };
}

/** Flick speed from a pan release: gesture vx is px per ms; half the view's
    width is a quarter turn. Capped so a hard flick stays readable. */
export function flickVelocity(vxPxPerMs: number, width: number, cap = 10): number {
  const v = ((vxPxPerMs * 1000) / Math.max(1, width)) * Math.PI;
  return Math.max(-cap, Math.min(cap, v));
}

/** Camera distance so a sphere of `radius` fits in a perspective view with
    vertical field of view `fovDeg` and the given aspect (width / height). */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  const half = Math.min(v, h) / 2;
  return radius / Math.sin(half);
}

/** Camera distance so a box `halfW` wide and `halfH` tall (half sizes, in
    the view plane) fits, plus `depth` for parts that swing toward the
    camera. Fills wide views better than a bounding sphere does. */
export function fitExtent(halfW: number, halfH: number, depth: number, fovDeg: number, aspect: number): number {
  const v = (fovDeg * Math.PI) / 180;
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect);
  return Math.max(halfH / Math.tan(v / 2), halfW / Math.tan(h / 2)) + depth;
}

/** Size of the sign-in dumbbell for a screen height: 180 on most phones,
    120 on short ones, none while the keyboard covers a short screen. */
export function heroSize(screenHeight: number, keyboardUp: boolean): number {
  if (screenHeight < 700) return keyboardUp ? 0 : 120;
  return 180;
}
