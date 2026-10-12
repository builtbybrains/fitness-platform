/* Buttons. Primary: Built Green pill, Deep Black Sora label, 48px tall.
   Secondary: Carbon pill, white label. Round icon buttons for play and
   send. Every target is at least 44x44 and scales to 0.97 on press
   (unless Reduce Motion is on). Pill buttons settle back on release with
   a touch spring: about 250ms, a hair past full size, then still. */

import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';

import { C, FONT, R, T } from '../design';
import { Icon, IconName } from './Icon';
import { useReduceMotion } from './motion';

type Variant = 'primary' | 'secondary' | 'danger';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const NATIVE = Platform.OS !== 'web';
const PRESSED_SCALE = 0.97;

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
  const [pressed, setPressed] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const press = (on: boolean) => {
    setPressed(on);
    if (reduce) return scale.setValue(1);
    Animated.spring(scale, on
      ? { toValue: PRESSED_SCALE, stiffness: 600, damping: 40, mass: 1, useNativeDriver: NATIVE }
      : // Low damping: a tiny overshoot past 1 on the way back.
        { toValue: 1, stiffness: 520, damping: 17, mass: 1, useNativeDriver: NATIVE },
    ).start();
  };
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => press(true)}
      onPressOut={() => press(false)}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={[
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
          transform: [{ scale }],
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
    </AnimatedPressable>
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
