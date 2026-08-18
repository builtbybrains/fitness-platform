import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Button, Icon, Screen, Txt } from '@/components';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { colors, radius, s, spacing } from '@/theme';

export default function PaymentSuccess() {
  const reduced = useReducedMotion();
  const pop = useSharedValue(reduced ? 1 : 0);
  const rise = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) return;
    pop.value = withSequence(
      withTiming(1.12, { duration: 380, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 200 }),
    );
    rise.value = withDelay(180, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
  }, [pop, rise, reduced]);

  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }], opacity: pop.value }));
  const copy = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 16 }],
  }));

  return (
    <Screen scroll={false} contentStyle={styles.content}>
      <View style={styles.middle}>
        <Animated.View style={[styles.badge, badge]}>
          <Icon name="check" size={s(44)} color={colors.primaryLight} strokeWidth={2.4} />
        </Animated.View>

        <Animated.View style={[styles.copy, copy]}>
          <Txt variant="h1" center>
            You&apos;re now a VITAL Premium member 🎉
          </Txt>
          <Txt variant="body" color={colors.muted} center>
            Your full plan, AI coach and reminders are unlocked. Let&apos;s get to work.
          </Txt>
        </Animated.View>
      </View>

      <Button label="Back to my plan" onPress={() => router.replace('/(tabs)')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'space-between', paddingVertical: spacing.xxl },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  badge: {
    width: s(104),
    height: s(104),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  copy: { gap: spacing.sm, paddingHorizontal: spacing.md },
});
