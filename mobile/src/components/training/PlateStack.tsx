/* A small 3D stack of bumper plates beside the workout's set counter.
   Each ticked set drops a plate onto the stack (0.35s, ease-out); untick
   one and the top plate lifts off. When the workout is done the plates
   close up and the stack makes one quarter turn. Up to 12 plates show; a
   longer session makes them thinner so the full stack still fits. Still
   between changes.

   Decorative: the "x of y sets done" text beside it says the same. Under
   Reduce Motion, without WebGL, or if the 3D cannot load, it is not shown. */

import React, { useState } from 'react';

import { Lazy3DScene } from '../three/Lazy3D';
import { useCan3D } from '../three/support';

export const PLATE_STACK_SIZE = 90;

export function PlateStack({ done, total, complete }: { done: number; total: number; complete: boolean }) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  if (!can3D || failed || total <= 0) return null;
  return (
    <Lazy3DScene
      kind="plates"
      params={{ done, total, complete }}
      width={PLATE_STACK_SIZE}
      height={PLATE_STACK_SIZE}
      onFail={() => setFailed(true)}
    />
  );
}
