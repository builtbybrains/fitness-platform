/* Extra 2px outline icons for the Coach tab, drawn on the same 24px grid
   as components/Icon.tsx (which stays untouched), plus a round button that
   carries them with the same look and 44px target as IconButton. */

import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { C } from '../../design';
import { useReduceMotion } from '../motion';

export type CoachIconName = 'chats' | 'more' | 'mic' | 'search' | 'pin' | 'archive' | 'restore' | 'copy' | 'edit' | 'redo';

export function CoachIcon({ name, size = 24, color = C.text, strokeWidth = 2 }: { name: CoachIconName; size?: number; color?: string; strokeWidth?: number }) {
  const s = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode = null;
  switch (name) {
    case 'chats':
      // Two speech bubbles, the back one offset: past conversations.
      body = (
        <>
          <Path d="M8.5 7.5V6a2.5 2.5 0 0 1 2.5-2.5h7A2.5 2.5 0 0 1 20.5 6v4.5A2.5 2.5 0 0 1 18 13h-.5v2.5l-2.6-2.1" {...s} />
          <Path d="M3.5 10.5A2.5 2.5 0 0 1 6 8h7a2.5 2.5 0 0 1 2.5 2.5V15a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3H6A2.5 2.5 0 0 1 3.5 15Z" {...s} />
        </>
      );
      break;
    case 'more':
      body = (
        <>
          <Circle cx={5.5} cy={12} r={1.4} fill={color} />
          <Circle cx={12} cy={12} r={1.4} fill={color} />
          <Circle cx={18.5} cy={12} r={1.4} fill={color} />
        </>
      );
      break;
    case 'mic':
      body = (
        <>
          <Rect x={9} y={3.5} width={6} height={11} rx={3} {...s} />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" {...s} />
        </>
      );
      break;
    case 'search':
      body = (
        <>
          <Circle cx={11} cy={11} r={6.5} {...s} />
          <Path d="m16 16 4.5 4.5" {...s} />
        </>
      );
      break;
    case 'pin':
      body = <Path d="M9 3.5h6M10 3.5v5.5L6.5 13h11L14 9V3.5M12 13v7.5" {...s} />;
      break;
    case 'archive':
      body = (
        <>
          <Rect x={3.5} y={4} width={17} height={4.5} rx={1.5} {...s} />
          <Path d="M5 8.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" {...s} />
        </>
      );
      break;
    case 'restore':
      body = (
        <>
          <Path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" {...s} />
          <Path d="M4.5 4.5V9H9" {...s} />
        </>
      );
      break;
    case 'copy':
      body = (
        <>
          <Rect x={8.5} y={8.5} width={12} height={12} rx={2.5} {...s} />
          <Path d="M15.5 5.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" {...s} />
        </>
      );
      break;
    case 'edit':
      body = <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" {...s} />;
      break;
    case 'redo':
      body = (
        <>
          <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9" {...s} />
          <Path d="M19.5 4.5V9H15" {...s} />
        </>
      );
      break;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}

/** Round icon-only button for a Coach icon: Carbon or bare, 44px target. */
export function CoachIconButton({
  icon,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'carbon',
  size = 44,
  color,
  disabled,
  busy,
  selected,
  expanded,
}: {
  icon: CoachIconName;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  variant?: 'carbon' | 'bare';
  size?: number;
  color?: string;
  disabled?: boolean;
  busy?: boolean;
  selected?: boolean;
  expanded?: boolean;
}) {
  const reduce = useReduceMotion();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!busy, selected, expanded }}
      style={({ pressed }) => ({
        width: Math.max(size, 44),
        height: Math.max(size, 44),
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed && !reduce ? 0.95 : 1 }],
      })}
    >
      {({ pressed }) => (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: variant === 'bare' ? (pressed ? C.raised : 'transparent') : pressed ? C.pressed : C.raised,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={C.text} /> : <CoachIcon name={icon} size={Math.round(size * 0.46)} color={color ?? C.text} />}
        </View>
      )}
    </Pressable>
  );
}
