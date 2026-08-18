import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, radius, s, spacing } from '@/theme';
import { Txt } from './Txt';

/**
 * Deliberately a simple animated bar chart rather than a full charting library:
 * it reads instantly, costs nothing at runtime, and keeps the bundle small.
 */
export function WeightChart({ values, height = s(120) }: { values: number[]; height?: number }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.1, max - min);

  return (
    <View>
      <View style={[styles.chart, { height }]} accessibilityLabel="Weekly weight trend">
        {values.map((v, i) => {
          // Floor at 12% so the lowest bar is still a visible mark, not a sliver.
          const ratio = 0.12 + ((v - min) / span) * 0.88;
          const isLast = i === values.length - 1;
          return <ChartBar key={i} ratio={ratio} index={i} highlight={isLast} />;
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

  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.bar, highlight && styles.barHighlight, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: s(5) },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.primaryDeep,
    minHeight: 4,
  },
  barHighlight: { backgroundColor: colors.primary },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
