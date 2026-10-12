/* A check that draws itself on: the short stroke, then the long one, as
   one pen line (380ms after a 120ms beat, ease-out quart). It plays once,
   when it first shows: a saved check-in, a logged meal, a sent report, any
   success notice. Reduce Motion: the check is simply there. */

import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { C } from '../design';
import { CHECK_LENGTH, CHECK_PATH, dashOffset, easeOutQuart } from '../lib/motionMath';
import { useElapsed } from './motion';

const DELAY = 120;
const DRAW = 380;

export function DrawCheck({ size = 24, color = C.green, strokeWidth = 2.6 }: { size?: number; color?: string; strokeWidth?: number }) {
  const elapsed = useElapsed(DELAY + DRAW);
  const p = easeOutQuart(Math.max(0, Math.min(1, (elapsed - DELAY) / DRAW)));
  // A hair over the true length so the round cap never peeks out early.
  const len = CHECK_LENGTH + 1;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none" aria-hidden>
      <Path
        d={CHECK_PATH}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={p > 0 ? 1 : 0}
        {...(p < 1 ? { strokeDasharray: `${len} ${len}`, strokeDashoffset: dashOffset(len, p) } : null)}
      />
    </Svg>
  );
}
