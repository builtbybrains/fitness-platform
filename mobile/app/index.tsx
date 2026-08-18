import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Logo, Txt } from '@/components';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { SAFE_MODE } from '@/lib/safeMode';
import { useStore } from '@/state/store';
import { colors, s, spacing } from '@/theme';

/**
 * Launch screen.
 *
 * The logo fades up, settles with a small rotational twist, and a soft light
 * sweeps across it before the screen hands off to auth. The whole sequence is
 * about 1.6s and only ever plays once per cold start.
 */
export default function Boot() {
  if (SAFE_MODE) return <SafeBoot />;
  return <AnimatedBoot />;
}

/** No Reanimated, SVG or gradients: pure React Native. */
function SafeBoot() {
  return (
    <View style={[styles.root, { padding: 24 }]}>
      <Txt variant="h1" center>
        VITAL
      </Txt>
      <Txt variant="body" color={colors.muted} center>
        Safe mode is on. If you can read this, the native runtime is fine and the
        crash is in the animation, SVG or font layer.
      </Txt>
      <Link href="/probe" style={styles.safeLink}>
        Open the crash finder
      </Link>
      <Link href="/diag" style={styles.safeLink}>
        Open diagnostics
      </Link>
    </View>
  );
}

function AnimatedBoot() {
  const reduced = useReducedMotion();
  const hydrated = useStore((st) => st.hydrated);
  const signedIn = useStore((st) => st.signedIn);
  const onboarded = useStore((st) => st.onboarded);

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.86);
  const rotate = useSharedValue(-10);
  const glow = useSharedValue(0);
  const wordmark = useSharedValue(0);
  const done = useSharedValue(0);

  const go = React.useCallback(() => {
    if (!signedIn) router.replace('/(auth)/login');
    else if (!onboarded) router.replace('/(onboarding)');
    else router.replace('/(tabs)');
  }, [signedIn, onboarded]);

  // Safety net: if persisted state never resolves, continue anyway rather than
  // stranding the user on the launch screen.
  const [timedOut, setTimedOut] = React.useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!hydrated && !timedOut) return;

    if (reduced) {
      opacity.value = 1;
      scale.value = 1;
      rotate.value = 0;
      wordmark.value = 1;
      const t = setTimeout(go, 450);
      return () => clearTimeout(t);
    }

    opacity.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withTiming(1.04, { duration: 520, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
    );
    rotate.value = withTiming(0, { duration: 760, easing: Easing.out(Easing.back(1.6)) });
    glow.value = withDelay(240, withTiming(1, { duration: 780, easing: Easing.inOut(Easing.quad) }));
    wordmark.value = withDelay(420, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));

    done.value = withDelay(1250, withTiming(1, { duration: 320, easing: Easing.in(Easing.quad) }));

    // Navigation is driven by a plain timer rather than runOnJS from inside the
    // animation callback. Routing from a worklet is the most exotic thing in the
    // startup path, and it fires on the UI thread while the navigator is still
    // mounting; a timer does the same job on the JS thread with no coupling to
    // whether the animation finished.
    const t = setTimeout(go, 1570);
    return () => clearTimeout(t);
  }, [hydrated, timedOut, reduced, go, opacity, scale, rotate, glow, wordmark, done]);

  const markStyle = useAnimatedStyle(() => ({
    opacity: opacity.value * (1 - done.value * 0.9),
    transform: [
      { scale: scale.value * (1 + done.value * 0.06) },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.9 * (1 - done.value),
    transform: [{ scale: 0.85 + glow.value * 0.35 }],
  }));

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (1 - glow.value) * 3.4,
    transform: [{ translateX: -s(120) + glow.value * s(240) }, { rotate: '18deg' }],
  }));

  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value * (1 - done.value),
    transform: [{ translateY: (1 - wordmark.value) * s(10) }],
  }));

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
        <LinearGradient
          colors={[colors.primaryGlow, 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      <Animated.View style={[styles.mark, markStyle]}>
        <Logo size={s(112)} />
        <Animated.View style={[styles.sweep, sweepStyle]} pointerEvents="none">
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.30)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>

      <Animated.View style={wordStyle}>
        <Txt variant="h1" style={styles.word}>
          VITAL
        </Txt>
        <Txt variant="caption" color={colors.muted} center>
          AI HEALTH & TRAINING
        </Txt>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  mark: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sweep: { position: 'absolute', top: -s(40), bottom: -s(40), width: s(46) },
  glow: {
    position: 'absolute',
    width: s(300),
    height: s(300),
    borderRadius: s(150),
    overflow: 'hidden',
    opacity: 0,
  },
  word: { letterSpacing: 6, textAlign: 'center' },
  safeLink: { color: colors.primaryLight, fontSize: 16, marginTop: 10, textAlign: 'center' },
});
