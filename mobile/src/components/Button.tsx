/* Buttons. Primary: Built Green pill, Deep Black Sora label, 48px tall.
   Secondary: Carbon pill, white label. Round icon buttons for play and
   send. Every target is at least 44x44 and scales to 0.97 on press
   (unless Reduce Motion is on). */

import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';

import { C, FONT, R, T } from '../design';
import { Icon, IconName } from './Icon';
import { useReduceMotion } from './motion';

type Variant = 'primary' | 'secondary' | 'danger';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  accessibilityLabel,
  accessibilityHint,
  style,
  compact,
}: ButtonProps) {
  const reduce = useReduceMotion();
  const primary = variant === 'primary';
  const fg = primary ? C.onGreen : variant === 'danger' ? C.danger : C.text;
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [
        {
          minHeight: compact ? 44 : 52,
          paddingHorizontal: compact ? 18 : 24,
          borderRadius: R.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: primary ? (pressed ? C.greenPressed : C.green) : variant === 'danger' ? (pressed ? C.surface : 'transparent') : pressed ? C.pressed : C.raised,
          borderWidth: variant === 'danger' ? 1 : 0,
          borderColor: variant === 'danger' ? 'rgba(255,90,78,0.5)' : 'transparent',
          opacity: disabled && !busy ? 0.45 : 1,
          transform: [{ scale: pressed && !reduce ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} size={20} color={fg} />
      ) : null}
      <Text style={[T.button, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A text link with a full 44px touch target. */
export function LinkButton({
  children,
  onPress,
  accessibilityLabel,
  align = 'center',
}: {
  children: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  align?: 'center' | 'flex-start';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: 'center',
        alignItems: align,
        alignSelf: align === 'center' ? 'stretch' : 'flex-start',
        paddingHorizontal: 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {typeof children === 'string' ? (
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

/** Round icon-only button. Always pass an accessibilityLabel. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  variant = 'carbon',
  size = 44,
  disabled,
  busy,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'green' | 'carbon' | 'bare';
  size?: number;
  disabled?: boolean;
  busy?: boolean;
}) {
  const reduce = useReduceMotion();
  const green = variant === 'green';
  const fg = green ? C.onGreen : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
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
            backgroundColor:
              variant === 'bare' ? (pressed ? C.raised : 'transparent') : green ? (pressed ? C.greenPressed : C.green) : pressed ? C.pressed : C.raised,
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <Icon name={icon} size={Math.round(size * 0.46)} color={fg} strokeWidth={green ? 2.4 : 2} />
          )}
        </View>
      )}
    </Pressable>
  );
}
