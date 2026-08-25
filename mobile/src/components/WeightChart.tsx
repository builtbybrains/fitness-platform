import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, radius, s, spacing } from '@/theme';
import { Txt } from './Txt';

/**
 * Statistic-style chart from the reference design: thin rounded lavender bars,
 * with the most recent one highlighted in lime and captioned by a floating
 * value pill. Deliberately not a charting library; it reads instantly and
 * costs nothing at runtime.
 */
export function WeightChart({
  values,
  height = s(140),
  highlightLabel,
}: {
  values: number[];
  height?: number;
  highlightLabel?: string;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.1, max - min);

  return (
    <View>
      <View style={[styles.chart, { height }]} accessibilityLabel="Weekly weight trend">
        {values.map((v, i) => {
          // Floor at 18% so the lowest bar is still a visible mark.
          const ratio = 0.18 + ((v - min) / span) * 0.82;
          const isLast = i === values.length - 1;
          return (
            <View key={i} style={styles.slot}>
              {isLast && highlightLabel ? (
                <View style={styles.tooltip} pointerEvents="none">
                  <Txt variant="caption" color={colors.onAccent} maxFontSizeMultiplier={1} numberOfLines={1}>
                    {highlightLabel}
                  </Txt>
                </View>
              ) : null}
              <ChartBar ratio={ratio} index={i} highlight={isLast} />
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Txt variant="caption" color={colors.faint}>
          Week 1
        </Txt>
        <Txt variant="caption" color={colors.faint}>
          Week {values.length}
        </Txt>
      </View>
    </View>
  );
}

function ChartBar({ ratio, index, highlight }: { ratio: number; index: number; highlight: boolean }) {
  const reduced = useReducedMotion();
  const grow = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      grow.value = 1;
      return;
    }
    grow.value = withDelay(index * 55, withTiming(1, { duration: 520 }));
  }, [grow, index, reduced]);

  const style = useAnimatedStyle(() => ({ height: `${ratio * 100 * grow.value}%` }));

  return <Animated.View style={[styles.bar, highlight && styles.barHighlight, style]} />;
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: s(4),
    // Room for the floating value pill above the tallest bar.
    paddingTop: s(34),
  },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: {
    width: s(7),
    borderRadius: radius.pill,
    backgroundColor: colors.chart,
    minHeight: 6,
  },
  barHighlight: { width: s(9), backgroundColor: colors.accent },
  tooltip: {
    position: 'absolute',
    top: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    // Anchored to the last slot; nudged left so it does not clip the card edge.
    right: -s(4),
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
