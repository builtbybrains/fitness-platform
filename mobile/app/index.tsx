import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Logo, Txt } from '@/components';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useStore } from '@/state/store';
import { colors, s, spacing } from '@/theme';

/**
 * Launch screen.
 *
 * The logo fades up, settles with a small rotational twist, a soft halo grows
 * behind it, then the screen hands off to auth. About 1.6s in total.
 *
 * This uses React Native's built-in Animated rather than Reanimated. The motion
 * here is simple enough that the extra worklet machinery buys nothing on the
 * very first screen, and keeping the launch path on core primitives means the
 * app can always start. Reanimated still drives everything inside the app.
 */
export default function Boot() {
  const reduced = useReducedMotion();
  const hydrated = useStore((st) => st.hydrated);
  const signedIn = useStore((st) => st.signedIn);
  const onboarded = useStore((st) => st.onboarded);

  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const word = useRef(new Animated.Value(0)).current;

  // Never strand the user here if persisted state fails to resolve.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!hydrated && !timedOut) return;

    const go = () => {
      if (!signedIn) router.replace('/(auth)/login');
      else if (!onboarded) router.replace('/(onboarding)');
      else router.replace('/(tabs)');
    };

    if (reduced) {
      fade.setValue(1);
      scale.setValue(1);
      spin.setValue(1);
      word.setValue(1);
      const t = setTimeout(go, 450);
      return () => clearTimeout(t);
    }

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 460,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.04,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scale, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
      Animated.timing(spin, {
        toValue: 1,
        duration: 760,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.timing(halo, {
        toValue: 1,
        duration: 900,
        delay: 200,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(word, {
        toValue: 1,
        duration: 420,
        delay: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const t = setTimeout(go, 1600);
    return () => clearTimeout(t);
  }, [hydrated, timedOut, reduced, signedIn, onboarded, fade, scale, spin, halo, word]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] });

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {
            opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }),
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }],
          },
        ]}
      />

      <Animated.View style={{ opacity: fade, transform: [{ scale }, { rotate }] }}>
        <Logo size={s(112)} />
      </Animated.View>

      <Animated.View
        style={{
          opacity: word,
          transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }}
      >
        <Txt variant="h1" style={styles.word}>
          VITAL
        </Txt>
        <Txt variant="caption" color={colors.muted} center>
          AI HEALTH &amp; TRAINING
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
  halo: {
    position: 'absolute',
    width: s(260),
    height: s(260),
    borderRadius: s(130),
    backgroundColor: colors.primary,
    opacity: 0,
  },
  word: { letterSpacing: 6, textAlign: 'center' },
});
