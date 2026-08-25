import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { colors, radius, s, timing } from '@/theme';
import { Txt } from './Txt';

const clamp01 = (n: number) => Math.min(Math.max(Number.isFinite(n) ? n : 0, 0), 1);

/** Horizontal progress bar that animates to its value on mount and on change. */
export function Bar({
  value,
  height = 8,
  tint = colors.accent,
  track = colors.surfaceAlt,
}: {
  value: number;
  height?: number;
  tint?: string;
  track?: string;
}) {
  const progress = useSharedValue(0);
  const target = clamp01(value);

  useEffect(() => {
    progress.value = withTiming(target, { duration: timing.slow });
  }, [target, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View
      style={[styles.track, { height, borderRadius: height, backgroundColor: track }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
    >
      <Animated.View style={[styles.fill, { borderRadius: height, backgroundColor: tint }, fill]} />
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Circular progress ring used for the headline daily goal. */
export function Ring({
  value,
  size = s(92),
  stroke = s(8),
  label,
  caption,
  tint = colors.accent,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  caption?: string;
  tint?: string;
}) {
  const target = clamp01(value);
  const progress = useSharedValue(0);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    progress.value = withTiming(target, { duration: timing.slow + 160 });
  }, [target, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.surfaceAlt}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        {label ? <Txt variant="metricSm">{label}</Txt> : null}
        {caption ? (
          <Txt variant="caption" color={colors.muted}>
            {caption}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
  ringCenter: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
});
