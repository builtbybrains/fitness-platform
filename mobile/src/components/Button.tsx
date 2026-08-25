import React, { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, isIOS, radius, s, shadow, spacing } from '@/theme';
import { Txt } from './Txt';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  iconRight,
  full = true,
  style,
  compact,
}: Props) {
  const pressed = useSharedValue(0);
  const inert = disabled || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.025 }],
    opacity: 1 - pressed.value * 0.12,
  }));

  const handlePress = useCallback(() => {
    if (inert) return;
    if (isIOS) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress?.();
  }, [inert, onPress]);

  const fg =
    variant === 'primary' || variant === 'danger'
      ? colors.onPrimary
      : variant === 'secondary'
        ? colors.text
        : colors.primary;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      accessibilityLabel={label}
      disabled={inert}
      onPress={handlePress}
      onPressIn={() => { pressed.value = withSpring(1, { damping: 22, stiffness: 320 }); }}
      onPressOut={() => { pressed.value = withSpring(0, { damping: 22, stiffness: 320 }); }}
      style={[
        styles.base,
        compact && styles.compact,
        full && styles.full,
        variantStyles[variant],
        variant === 'primary' && !inert && shadow.glow,
        inert && styles.disabled,
        animatedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon}
          <Txt variant="h3" color={fg} maxFontSizeMultiplier={1.15}>
            {label}
          </Txt>
          {iconRight ? <View style={styles.iconRight}>{iconRight}</View> : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: s(54),
    minHeight: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  compact: { height: s(44), minHeight: 44, paddingHorizontal: spacing.lg },
  full: { alignSelf: 'stretch' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconRight: {
    marginLeft: spacing.xxs,
    width: s(26),
    height: s(26),
    borderRadius: radius.pill,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.45 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  danger: { backgroundColor: colors.primaryDeep },
  secondary: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', borderColor: colors.primaryBorder },
});
