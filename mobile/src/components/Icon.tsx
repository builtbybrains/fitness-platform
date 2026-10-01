/* The BUILT icon set: 2px outline icons on a 24px grid, drawn with
   react-native-svg. One set for the whole app; never emoji or glyphs. */

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '../design';

export type IconName =
  | 'home'
  | 'dumbbell'
  | 'bars'
  | 'brain'
  | 'person'
  | 'burger'
  | 'chevronRight'
  | 'chevronLeft'
  | 'arrowRight'
  | 'camera'
  | 'image'
  | 'plus'
  | 'minus'
  | 'close'
  | 'check'
  | 'drop'
  | 'flame'
  | 'play'
  | 'scale'
  | 'bell'
  | 'refresh'
  | 'swap'
  | 'calendar'
  | 'pulse'
  | 'edit'
  | 'trash'
  | 'clock'
  | 'steps';

type Props = { name: IconName; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 24, color = C.green, strokeWidth = 2 }: Props) {
  const s = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode;
  switch (name) {
    case 'home':
      body = (
        <>
          <Path d="M3.5 10.5 12 3.5l8.5 7" {...s} />
          <Path d="M5.5 9v11h4.5v-6h4v6h4.5V9" {...s} />
        </>
      );
      break;
    case 'dumbbell':
      body = (
        <>
          <Rect x={2.5} y={9} width={2.5} height={6} rx={1} {...s} />
          <Rect x={5} y={6.5} width={3} height={11} rx={1} {...s} />
          <Path d="M8 12h8" {...s} />
          <Rect x={16} y={6.5} width={3} height={11} rx={1} {...s} />
          <Rect x={19} y={9} width={2.5} height={6} rx={1} {...s} />
        </>
      );
      break;
    case 'bars':
      body = (
        <>
          <Rect x={3.5} y={14} width={4} height={6.5} rx={1} {...s} />
          <Rect x={10} y={9} width={4} height={11.5} rx={1} {...s} />
          <Rect x={16.5} y={3.5} width={4} height={17} rx={1} {...s} />
        </>
      );
      break;
    case 'brain':
      body = (
        <>
          <Path d="M12 5a3 3 0 1 0-6 .13 4 4 0 0 0-2.52 5.77 4 4 0 0 0 .55 6.59A4 4 0 1 0 12 18Z" {...s} />
          <Path d="M12 5a3 3 0 1 1 6 .13 4 4 0 0 1 2.52 5.77 4 4 0 0 1-.55 6.59A4 4 0 1 1 12 18Z" {...s} />
          <Path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" {...s} />
          <Path d="M12 5v13" {...s} />
        </>
      );
      break;
    case 'person':
      body = (
        <>
          <Circle cx={12} cy={8} r={4} {...s} />
          <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...s} />
        </>
      );
      break;
    case 'burger':
      body = (
        <>
          <Path d="M4 10.5C4 6.9 7.6 4 12 4s8 2.9 8 6.5Z" {...s} />
          <Path d="M3 14c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1" {...s} />
          <Path d="M5 17h14v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z" {...s} />
        </>
      );
      break;
    case 'chevronRight':
      body = <Path d="M9 5.5 15.5 12 9 18.5" {...s} />;
      break;
    case 'chevronLeft':
      body = <Path d="M15 5.5 8.5 12l6.5 6.5" {...s} />;
      break;
    case 'arrowRight':
      body = <Path d="M5 12h14M13 6l6 6-6 6" {...s} />;
      break;
    case 'camera':
      body = (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" {...s} />
          <Circle cx={12} cy={13.5} r={3.5} {...s} />
        </>
      );
      break;
    case 'image':
      body = (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2} {...s} />
          <Circle cx={9} cy={10} r={2} {...s} />
          <Path d="m21 16-5-5L5 20" {...s} />
        </>
      );
      break;
    case 'plus':
      body = <Path d="M12 5v14M5 12h14" {...s} />;
      break;
    case 'minus':
      body = <Path d="M5 12h14" {...s} />;
      break;
    case 'close':
      body = <Path d="M6 6l12 12M18 6 6 18" {...s} />;
      break;
    case 'check':
      body = <Path d="m5 12.5 4.5 4.5L19 7.5" {...s} />;
      break;
    case 'drop':
      body = <Path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5Z" {...s} />;
      break;
    case 'flame':
      body = <Path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 0 2 1 3 2 3 0-3-1-5.5.5-8Z" {...s} />;
      break;
    case 'play':
      body = <Path d="M8.5 5.5v13l10-6.5Z" fill={color} stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />;
      break;
    case 'scale':
      body = (
        <>
          <Rect x={3.5} y={3.5} width={17} height={17} rx={4} {...s} />
          <Path d="M8 9a5 5 0 0 1 8 0" {...s} />
          <Path d="m12 11 1.5-2.5" {...s} />
        </>
      );
      break;
    case 'bell':
      body = (
        <>
          <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" {...s} />
          <Path d="M10 20.5a2 2 0 0 0 4 0" {...s} />
        </>
      );
      break;
    case 'refresh':
      body = (
        <>
          <Path d="M20 12a8 8 0 0 1-14.3 4.9" {...s} />
          <Path d="M4 12a8 8 0 0 1 14.3-4.9" {...s} />
          <Path d="M18.5 3v4.5H14M5.5 21v-4.5H10" {...s} />
        </>
      );
      break;
    case 'swap':
      body = (
        <>
          <Path d="M4 8h14l-3.5-3.5" {...s} />
          <Path d="M20 16H6l3.5 3.5" {...s} />
        </>
      );
      break;
    case 'calendar':
      body = (
        <>
          <Rect x={3.5} y={5} width={17} height={15.5} rx={2.5} {...s} />
          <Path d="M3.5 10h17M8 3v4M16 3v4" {...s} />
        </>
      );
      break;
    case 'pulse':
      body = <Path d="M3 12h4l2.5-6 5 12 2.5-6h4" {...s} />;
      break;
    case 'edit':
      body = (
        <>
          <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16Z" {...s} />
          <Path d="m13.5 6.5 4 4" {...s} />
        </>
      );
      break;
    case 'trash':
      body = (
        <>
          <Path d="M4.5 7h15M10 3.5h4M6.5 7l1 13h9l1-13" {...s} />
          <Path d="M10 11v5.5M14 11v5.5" {...s} />
        </>
      );
      break;
    case 'clock':
      body = (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M12 7.5V12l3 2" {...s} />
        </>
      );
      break;
    case 'steps':
      body = (
        <>
          <Path d="M7 3.5c1.7 0 2.5 1.8 2.5 4S8.7 12 7 12s-2.5-2.3-2.5-4.5S5.3 3.5 7 3.5Z" {...s} />
          <Path d="M5 15h4v1.5a2 2 0 0 1-4 0Z" {...s} />
          <Path d="M17 7.5c1.7 0 2.5 1.8 2.5 4s-.8 4.5-2.5 4.5-2.5-2.3-2.5-4.5.8-4 2.5-4Z" {...s} />
          <Path d="M15 19h4v.5a2 2 0 0 1-4 0Z" {...s} />
        </>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {body}
    </Svg>
  );
}
