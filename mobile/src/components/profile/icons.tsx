/* Extra 2px outline icons for Profile screens, drawn on the same 24px grid
   as components/Icon.tsx (which stays untouched). */

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '../../design';
import { Icon, type IconName } from '../Icon';

export type ExtraIconName = 'trash' | 'flag' | 'heart' | 'moon' | 'lock' | 'send' | 'clock' | 'phone' | 'list';

export function ExtraIcon({ name, size = 24, color = C.green, strokeWidth = 2 }: { name: ExtraIconName; size?: number; color?: string; strokeWidth?: number }) {
  const s = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode = null;
  switch (name) {
    case 'trash':
      body = (
        <>
          <Path d="M4 7h16M9.5 7V4.5h5V7" {...s} />
          <Path d="M6 7l1 13h10l1-13" {...s} />
          <Path d="M10 11v5M14 11v5" {...s} />
        </>
      );
      break;
    case 'flag':
      body = (
        <>
          <Path d="M5 21V4" {...s} />
          <Path d="M5 4h11l-2 4 2 4H5" {...s} />
        </>
      );
      break;
    case 'heart':
      body = <Path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" {...s} />;
      break;
    case 'moon':
      body = <Path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" {...s} />;
      break;
    case 'lock':
      body = (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2} {...s} />
          <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...s} />
        </>
      );
      break;
    case 'send':
      body = <Path d="M4 12 20 4l-4 16-4-6.5L4 12Zm8 1.5L20 4" {...s} />;
      break;
    case 'clock':
      body = (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Path d="M12 7.5V12l3 2" {...s} />
        </>
      );
      break;
    case 'phone':
      body = <Path d="M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z" {...s} />;
      break;
    case 'list':
      body = <Path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" {...s} />;
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      {body}
    </Svg>
  );
}

const EXTRA: readonly string[] = ['trash', 'flag', 'heart', 'moon', 'lock', 'send', 'clock', 'phone', 'list'];

export type AnyIconName = IconName | ExtraIconName;

/** The shared icon set plus the extras above. */
export function AnyIcon({ name, size = 24, color = C.green, strokeWidth = 2 }: { name: AnyIconName; size?: number; color?: string; strokeWidth?: number }) {
  return EXTRA.includes(name) ? (
    <ExtraIcon name={name as ExtraIconName} size={size} color={color} strokeWidth={strokeWidth} />
  ) : (
    <Icon name={name as IconName} size={size} color={color} strokeWidth={strokeWidth} />
  );
}
