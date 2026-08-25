import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

export type ExerciseArtName =
  | 'bench'
  | 'row'
  | 'raise'
  | 'pushdown'
  | 'facepull'
  | 'plank'
  | 'squat'
  | 'run';

interface Props {
  name: ExerciseArtName;
  size?: number;
  /** Tile background. Defaults to the soft grey; pass accentSoft for hero use. */
  tile?: string;
  rounded?: number;
}

/**
 * Hand-drawn exercise illustrations in the reference's thumbnail slots.
 *
 * Deliberately vector rather than stock photography: capsule-limbed athlete
 * figures stay crisp at any size, cost nothing at runtime, and read as one
 * family with the rest of the design. Real photos can replace the tiles later
 * without touching the layout.
 */
export function ExerciseArt({ name, size = 52, tile = colors.surfaceAlt, rounded = 16 }: Props) {
  const ink = colors.primary;
  const limb = {
    stroke: ink,
    strokeWidth: 6.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const thin = { ...limb, strokeWidth: 4.5 };
  const gear = { ...limb, strokeWidth: 4 };

  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Rect x={0} y={0} width={96} height={96} rx={rounded * (96 / size)} fill={tile} />
      <Circle cx={70} cy={26} r={26} fill={colors.accentSoft} opacity={0.85} />

      {name === 'bench' && (
        <>
          {/* bench */}
          <Rect x={18} y={62} width={56} height={6} rx={3} fill={ink} opacity={0.18} />
          <Line x1={26} y1={68} x2={26} y2={78} {...gear} opacity={0.3} />
          <Line x1={66} y1={68} x2={66} y2={78} {...gear} opacity={0.3} />
          {/* athlete lying */}
          <Circle cx={66} cy={54} r={7} fill={ink} />
          <Path d="M58 56 36 57" {...limb} />
          <Path d="M36 57 27 49 27 62" {...limb} />
          {/* press */}
          <Path d="M46 54 46 38 M54 54 54 38" {...thin} />
          <Line x1={30} y1={34} x2={70} y2={34} {...gear} />
          <Circle cx={28} cy={34} r={6} fill={ink} />
          <Circle cx={72} cy={34} r={6} fill={ink} />
        </>
      )}

      {name === 'row' && (
        <>
          <Line x1={16} y1={82} x2={80} y2={82} {...gear} opacity={0.2} />
          <Circle cx={69} cy={33} r={7} fill={ink} />
          <Path d="M62 38 42 52" {...limb} />
          <Path d="M42 52 40 82" {...limb} />
          <Path d="M52 82 50 56" {...limb} />
          {/* pulling arm + dumbbell */}
          <Path d="M54 44 54 62" {...thin} />
          <Line x1={46} y1={66} x2={62} y2={66} {...gear} />
          <Circle cx={44} cy={66} r={5} fill={ink} />
          <Circle cx={64} cy={66} r={5} fill={ink} />
        </>
      )}

      {name === 'raise' && (
        <>
          <Line x1={20} y1={84} x2={76} y2={84} {...gear} opacity={0.2} />
          <Circle cx={48} cy={26} r={7} fill={ink} />
          <Path d="M48 34 48 58" {...limb} />
          <Path d="M48 58 41 84 M48 58 56 84" {...limb} />
          {/* arms out */}
          <Path d="M48 42 26 38 M48 42 70 38" {...thin} />
          <Circle cx={23} cy={37} r={5} fill={ink} />
          <Circle cx={73} cy={37} r={5} fill={ink} />
        </>
      )}

      {name === 'pushdown' && (
        <>
          <Line x1={20} y1={84} x2={76} y2={84} {...gear} opacity={0.2} />
          {/* cable */}
          <Line x1={62} y1={10} x2={62} y2={36} {...gear} opacity={0.4} />
          <Circle cx={46} cy={26} r={7} fill={ink} />
          <Path d="M46 34 46 58" {...limb} />
          <Path d="M46 58 40 84 M46 58 54 84" {...limb} />
          <Path d="M46 40 58 44 60 58" {...thin} />
          <Line x1={52} y1={60} x2={68} y2={58} {...gear} />
        </>
      )}

      {name === 'facepull' && (
        <>
          <Line x1={20} y1={84} x2={76} y2={84} {...gear} opacity={0.2} />
          {/* high anchor + rope */}
          <Circle cx={74} cy={14} r={4} fill={ink} opacity={0.4} />
          <Path d="M72 16 58 32 M72 16 60 40" {...gear} opacity={0.5} />
          <Circle cx={42} cy={30} r={7} fill={ink} />
          <Path d="M42 38 40 60" {...limb} />
          <Path d="M40 60 34 84 M40 60 48 84" {...limb} />
          <Path d="M42 42 56 33 M42 46 58 41" {...thin} />
        </>
      )}

      {name === 'plank' && (
        <>
          <Line x1={14} y1={78} x2={84} y2={78} {...gear} opacity={0.2} />
          <Circle cx={26} cy={48} r={7} fill={ink} />
          <Path d="M32 52 62 56" {...limb} />
          <Path d="M62 56 80 70" {...limb} />
          {/* forearm support */}
          <Path d="M34 54 30 70 42 70" {...thin} />
        </>
      )}

      {name === 'squat' && (
        <>
          <Line x1={20} y1={84} x2={76} y2={84} {...gear} opacity={0.2} />
          {/* bar on shoulders */}
          <Line x1={26} y1={36} x2={66} y2={36} {...gear} />
          <Circle cx={24} cy={36} r={6} fill={ink} />
          <Circle cx={68} cy={36} r={6} fill={ink} />
          <Circle cx={46} cy={28} r={7} fill={ink} />
          <Path d="M46 38 44 54" {...limb} />
          <Path d="M44 54 32 60 34 78" {...limb} />
          <Path d="M44 54 56 62 54 78" {...limb} />
        </>
      )}

      {name === 'run' && (
        <>
          <Line x1={16} y1={84} x2={80} y2={84} {...gear} opacity={0.2} />
          <Circle cx={56} cy={24} r={7} fill={ink} />
          <Path d="M52 31 44 52" {...limb} />
          <Path d="M44 52 28 62 M44 52 58 66 54 84" {...limb} />
          <Path d="M50 38 64 34 M50 40 38 48" {...thin} />
        </>
      )}
    </Svg>
  );
}
