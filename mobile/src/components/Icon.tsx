import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

export type IconName =
  | 'home'
  | 'ai'
  | 'plan'
  | 'progress'
  | 'profile'
  | 'flame'
  | 'water'
  | 'meal'
  | 'dumbbell'
  | 'bell'
  | 'notification'
  | 'clock'
  | 'target'
  | 'card'
  | 'shield'
  | 'doc'
  | 'logout'
  | 'chevron'
  | 'check'
  | 'send'
  | 'sliders'
  | 'google';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * One small hand-built icon set. Purpose-drawn rather than pulled from a
 * generic pack, so the app does not read as a template.
 */
export function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.7 }: Props) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  if (name === 'google') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d="M21.6 12.2c0-.7-.06-1.36-.18-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.74 3-4.3 3-7.3Z" fill="#4285F4" />
        <Path d="M12 22c2.7 0 4.96-.9 6.6-2.44l-3.2-2.5c-.9.6-2.04.96-3.4.96-2.6 0-4.8-1.76-5.6-4.12H3.1v2.58A10 10 0 0 0 12 22Z" fill="#34A853" />
        <Path d="M6.4 13.9a6 6 0 0 1 0-3.82V7.5H3.1a10 10 0 0 0 0 9l3.3-2.6Z" fill="#FBBC05" />
        <Path d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.84-2.84C16.95 3.04 14.7 2 12 2a10 10 0 0 0-8.9 5.5l3.3 2.58C7.2 7.72 9.4 5.98 12 5.98Z" fill="#EA4335" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && <Path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z" {...p} />}
      {name === 'home' && <Path d="M9.6 20.5v-5.2h4.8v5.2" {...p} />}

      {name === 'ai' && <Circle cx={12} cy={12} r={8.4} {...p} />}
      {name === 'ai' && <Path d="M8.6 10.4h6.8M8.6 13.6h4.4" {...p} />}

      {name === 'plan' && <Rect x={3.6} y={4.6} width={16.8} height={15.4} rx={2.6} {...p} />}
      {name === 'plan' && <Path d="M3.6 9.2h16.8M8.4 3v3.4M15.6 3v3.4M8.6 14.4l2.2 2.2 4-4.2" {...p} />}

      {name === 'progress' && <Path d="M4 20V4M4 20h16" {...p} />}
      {name === 'progress' && <Path d="m7.6 15.8 3.4-4 3 2.2 4.6-6.2" {...p} />}

      {name === 'profile' && <Circle cx={12} cy={8.6} r={4} {...p} />}
      {name === 'profile' && <Path d="M4.8 20.2c.9-3.7 3.7-5.6 7.2-5.6s6.3 1.9 7.2 5.6" {...p} />}

      {name === 'flame' && <Path d="M12 3s5 4.2 5 9a5 5 0 1 1-10 0c0-2 1-3.4 1-3.4S9 10.5 10 11c0-3 2-6.2 2-8Z" {...p} />}

      {name === 'water' && <Path d="M12 3.2c3.6 3.7 5.6 6.9 5.6 9.6a5.6 5.6 0 1 1-11.2 0c0-2.7 2-5.9 5.6-9.6Z" {...p} />}

      {name === 'meal' && <Path d="M3 12.6h18a9 9 0 0 1-18 0Z" {...p} />}
      {name === 'meal' && <Path d="M11.8 9.4c0-3.9 2.6-6.4 7-6.8-.2 4.3-2.8 6.7-7 6.8ZM11.8 9.4C11.2 6.3 9.4 4.2 6.4 3.4" {...p} />}

      {name === 'dumbbell' && <Rect x={3.2} y={7.4} width={4.2} height={9.2} rx={1.7} {...p} />}
      {name === 'dumbbell' && <Rect x={16.6} y={7.4} width={4.2} height={9.2} rx={1.7} {...p} />}
      {name === 'dumbbell' && <Path d="M7.4 12h9.2" {...p} />}

      {name === 'bell' && <Circle cx={12} cy={13.4} r={7.4} {...p} />}
      {name === 'bell' && <Path d="M12 9.6v3.8l2.8 1.7M6.2 5.7 3.9 8.1M17.8 5.7l2.3 2.4" {...p} />}

      {name === 'notification' && <Path d="M18.4 9.2a6.4 6.4 0 1 0-12.8 0c0 5.2-2.2 6.6-2.2 6.6h17.2s-2.2-1.4-2.2-6.6" {...p} />}
      {name === 'notification' && <Path d="M10.2 19.4a2.1 2.1 0 0 0 3.6 0" {...p} />}

      {name === 'clock' && <Circle cx={12} cy={12} r={8.6} {...p} />}
      {name === 'clock' && <Path d="M12 7.2V12l3.2 1.9" {...p} />}

      {name === 'target' && <Path d="M20.4 8.2A8.8 8.8 0 1 1 15.8 3.6" {...p} />}
      {name === 'notification' && <Path d="M18.4 9.2a6.4 6.4 0 1 0-12.8 0c0 5.2-2.2 6.6-2.2 6.6h17.2s-2.2-1.4-2.2-6.6" {...p} />}
      {name === 'notification' && <Path d="M10.2 19.4a2.1 2.1 0 0 0 3.6 0" {...p} />}

      {name === 'clock' && <Circle cx={12} cy={12} r={8.6} {...p} />}
      {name === 'clock' && <Path d="M12 7.2V12l3.2 1.9" {...p} />}

      {name === 'target' && <Path d="M16.2 12a4.2 4.2 0 1 1-4.2-4.2M12 12l8-8M16.4 4H20v3.6" {...p} />}

      {name === 'card' && <Rect x={2.8} y={5.4} width={18.4} height={13.2} rx={2.6} {...p} />}
      {name === 'card' && <Path d="M2.8 9.8h18.4M6.4 14.6h3.6" {...p} />}

      {name === 'shield' && <Path d="M12 3 19 6v5.6c0 4.3-2.8 7.8-7 9.4-4.2-1.6-7-5.1-7-9.4V6Z" {...p} />}
      {name === 'shield' && <Path d="m9.2 12.1 2 2 3.6-3.9" {...p} />}

      {name === 'doc' && <Path d="M6 3.4h7.6L19 8.8V20a1.6 1.6 0 0 1-1.6 1.6H6A1.6 1.6 0 0 1 4.4 20V5A1.6 1.6 0 0 1 6 3.4Z" {...p} />}
      {name === 'doc' && <Path d="M13.4 3.4v5.4H19M8 13h8M8 16.6h5" {...p} />}

      {name === 'logout' && <Path d="M14.4 7.4V5.2A1.8 1.8 0 0 0 12.6 3.4H5.8A1.8 1.8 0 0 0 4 5.2v13.6a1.8 1.8 0 0 0 1.8 1.8h6.8a1.8 1.8 0 0 0 1.8-1.8v-2.2" {...p} />}
      {name === 'logout' && <Path d="M9.6 12h10.8m0 0-3.2-3.2M20.4 12l-3.2 3.2" {...p} />}

      {name === 'chevron' && <Path d="m9.5 5 7 7-7 7" {...p} />}
      {name === 'check' && <Path d="m5 12.6 4.6 4.6L19 7" {...p} />}
      {name === 'send' && <Path d="M20.4 3.6 10.8 13.2M20.4 3.6l-6.2 17-3.4-7.4-7.4-3.4Z" {...p} />}

      {name === 'sliders' && <Path d="M3.8 7h3.4M11 7h9.2M3.8 12h9.8M17.4 12h2.8M3.8 17h2M9.6 17h10.6" {...p} />}
      {name === 'sliders' && <Circle cx={9.1} cy={7} r={1.9} {...p} />}
      {name === 'sliders' && <Circle cx={15.5} cy={12} r={1.9} {...p} />}
      {name === 'sliders' && <Circle cx={7.8} cy={17} r={1.9} {...p} />}

    </Svg>
  );
}
