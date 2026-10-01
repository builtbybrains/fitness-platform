/* A drawn framing guide for body photos (no stock imagery): a figure
   outline in the frame, facing front, side or back. */

import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '../../design';
import type { BodyPhotoKind } from '../../types';

export function PoseGuide({ kind, size = 160 }: { kind: BodyPhotoKind; size?: number }) {
  const s = { stroke: C.green, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const faint = { ...s, stroke: C.faint, strokeDasharray: '4 6' };
  const w = size * 0.75;
  return (
    <Svg width={w} height={size} viewBox="0 0 120 160" accessibilityLabel={`Framing guide, ${kind} view`}>
      <Rect x={4} y={4} width={112} height={152} rx={14} {...faint} />
      {kind === 'side' ? (
        <>
          <Circle cx={60} cy={30} r={11} {...s} />
          <Path d="M56 42c-4 10-5 22-4 34l2 18-2 50M62 42c5 10 6 22 4 34l-2 18 4 50M58 54l6 30" {...s} />
        </>
      ) : (
        <>
          <Circle cx={60} cy={30} r={11} {...s} />
          <Path d="M46 46h28l6 40M46 46l-6 40M52 46l-2 50-4 50M68 46l2 50 4 50M50 96h20" {...s} />
          {kind === 'back' ? <Path d="M60 50v44" {...s} /> : null}
        </>
      )}
    </Svg>
  );
}
