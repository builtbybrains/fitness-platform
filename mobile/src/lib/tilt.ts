/* Press-tilt math (see components/Tilt.tsx). A card pressed near an edge
   tips that edge away from you, as if the finger pushed it in: the angle
   grows from 0 at the centre to `max` degrees at the edge, on both axes. */

export const TILT_MAX = 5;
export const TILT_PERSPECTIVE = 800;
export const TILT_SCALE = 0.98;

export type TiltAngles = { rotateX: number; rotateY: number };

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

/** Degrees to tilt a `width` x `height` card pressed at (x, y), measured
    from its top-left corner. Points outside the card count as its edge. */
export function tiltAngles(x: number, y: number, width: number, height: number, max = TILT_MAX): TiltAngles {
  if (!(width > 0) || !(height > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return { rotateX: 0, rotateY: 0 };
  const nx = clamp1((x / width) * 2 - 1);
  const ny = clamp1((y / height) * 2 - 1);
  // Top edge pressed: rotateX > 0 sends the top away. Right edge pressed:
  // rotateY > 0 sends the right side away. `+ 0` turns -0 into 0.
  return { rotateX: -ny * max + 0, rotateY: nx * max + 0 };
}
