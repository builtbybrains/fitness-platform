import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

/**
 * Crash finder.
 *
 * Safe mode proved the core runtime works, so the fault is in one of the layers
 * it strips. Each level below pulls in exactly one of them, and nothing is
 * loaded until its button is tapped: the require() calls sit inside the render
 * functions, not at module scope.
 *
 * Tap the levels in order. The one that ejects you from Expo Go is the culprit.
 */
const LEVELS: { n: number; label: string; Component: React.ComponentType }[] = [
  {
    n: 1,
    label: 'Plain React Native (baseline)',
    Component: () => <Text style={s.sample}>Plain text renders.</Text>,
  },
  {
    n: 2,
    label: 'Custom Inter fonts',
    Component: () => {
      const { useFonts, Inter_700Bold } = require('@expo-google-fonts/inter');
      const [loaded] = useFonts({ Inter_700Bold });
      if (!loaded) return <Text style={s.sample}>Loading font…</Text>;
      return <Text style={[s.sample, { fontFamily: 'Inter_700Bold' }]}>Inter loaded and applied.</Text>;
    },
  },
  {
    n: 3,
    label: 'SVG (the VITAL logo)',
    Component: () => {
      const { Logo } = require('@/components/Logo');
      return (
        <View style={s.center}>
          <Logo size={90} />
          <Text style={s.sample}>SVG rendered.</Text>
        </View>
      );
    },
  },
  {
    n: 4,
    label: 'Linear gradient',
    Component: () => {
      const { LinearGradient } = require('expo-linear-gradient');
      return (
        <LinearGradient colors={['#E03B4F', 'transparent']} style={s.grad}>
          <Text style={s.sample}>Gradient rendered.</Text>
        </LinearGradient>
      );
    },
  },
  {
    n: 5,
    label: 'Reanimated (shared value + animation)',
    Component: () => {
      const Reanimated = require('react-native-reanimated');
      const { default: Animated, useAnimatedStyle, useSharedValue, withTiming } = Reanimated;
      const Probe = () => {
        const v = useSharedValue(0.3);
        const style = useAnimatedStyle(() => ({ opacity: v.value }));
        React.useEffect(() => {
          v.value = withTiming(1, { duration: 600 });
        }, [v]);
        return (
          <Animated.View style={[s.box, style]}>
            <Text style={s.sample}>Reanimated ran.</Text>
          </Animated.View>
        );
      };
      return <Probe />;
    },
  },
  {
    n: 6,
    label: 'Gesture handler + safe area providers',
    Component: () => {
      const { GestureHandlerRootView } = require('react-native-gesture-handler');
      const { SafeAreaProvider, useSafeAreaInsets } = require('react-native-safe-area-context');
      const Inner = () => {
        const i = useSafeAreaInsets();
        return <Text style={s.sample}>Insets top {Math.round(i.top)}, bottom {Math.round(i.bottom)}.</Text>;
      };
      return (
        <GestureHandlerRootView style={s.center}>
          <SafeAreaProvider>
            <Inner />
          </SafeAreaProvider>
        </GestureHandlerRootView>
      );
    },
  },
  {
    n: 7,
    label: 'Haptics + async storage',
    Component: () => {
      require('expo-haptics');
      require('@react-native-async-storage/async-storage');
      return <Text style={s.sample}>Both modules loaded.</Text>;
    },
  },
  {
    n: 8,
    label: 'Splash screen control',
    Component: () => {
      const Splash = require('expo-splash-screen');
      const [state, setState] = React.useState('calling…');
      React.useEffect(() => {
        Splash.preventAutoHideAsync()
          .then(() => Splash.hideAsync())
          .then(() => setState('prevent + hide both returned'))
          .catch((e: unknown) => setState(`failed: ${e instanceof Error ? e.message : 'error'}`));
      }, []);
      return <Text style={s.sample}>{state}</Text>;
    },
  },
  {
    n: 9,
    label: 'Store + async storage rehydration',
    Component: () => {
      const { useStore } = require('@/state/store');
      const hydrated = useStore((st: { hydrated: boolean }) => st.hydrated);
      const name = useStore((st: { profile: { firstName: string } }) => st.profile.firstName);
      return <Text style={s.sample}>hydrated: {String(hydrated)}, name: {name}</Text>;
    },
  },
  {
    n: 10,
    label: 'The real boot animation (logo + glow + motion)',
    Component: () => {
      const { LinearGradient } = require('expo-linear-gradient');
      const { Logo } = require('@/components/Logo');
      const R = require('react-native-reanimated');
      const { default: Animated, Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } = R;

      const Inner = () => {
        const opacity = useSharedValue(0);
        const scale = useSharedValue(0.86);
        const rotate = useSharedValue(-10);
        const glow = useSharedValue(0);

        React.useEffect(() => {
          opacity.value = withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) });
          scale.value = withSequence(
            withTiming(1.04, { duration: 520, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 260 }),
          );
          rotate.value = withTiming(0, { duration: 760, easing: Easing.out(Easing.back(1.6)) });
          glow.value = withDelay(240, withTiming(1, { duration: 780 }));
        }, [opacity, scale, rotate, glow]);

        const mark = useAnimatedStyle(() => ({
          opacity: opacity.value,
          transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
        }));
        const halo = useAnimatedStyle(() => ({ opacity: glow.value * 0.9 }));

        return (
          <View style={s.center}>
            <Animated.View style={[{ position: 'absolute', width: 200, height: 200, borderRadius: 100, overflow: 'hidden' }, halo]}>
              <LinearGradient colors={['rgba(224,59,79,0.32)', 'transparent']} style={{ flex: 1 }} />
            </Animated.View>
            <Animated.View style={mark}>
              <Logo size={100} />
            </Animated.View>
            <Text style={s.sample}>Boot animation ran.</Text>
          </View>
        );
      };
      return <Inner />;
    },
  },
];

const ROUTES = [
  { href: '/(auth)/login', label: 'Login screen' },
  { href: '/(auth)/register', label: 'Register screen' },
  { href: '/(onboarding)', label: 'Onboarding wizard' },
  { href: '/(tabs)', label: 'Main tabs (home)' },
] as const;

export default function Probe() {
  const [active, setActive] = useState<number | null>(null);
  const current = LEVELS.find((l) => l.n === active);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h1}>Crash finder</Text>
        <Text style={s.note}>
          Tap each level in order. Whichever one throws you out of Expo Go is the
          cause. Reopen the app and continue from the next level.
        </Text>

        {LEVELS.map((l) => (
          <Pressable
            key={l.n}
            onPress={() => setActive(l.n)}
            style={({ pressed }) => [s.btn, active === l.n && s.btnOn, pressed && s.btnPressed]}
          >
            <Text style={s.btnText}>
              {l.n}. {l.label}
            </Text>
          </Pressable>
        ))}

        <Text style={s.h2}>Real screens</Text>
        <Text style={s.note}>Open each one. Whichever ejects you is where the crash lives.</Text>
        {ROUTES.map((r) => (
          <Link key={r.href} href={r.href as never} style={s.link}>
            {r.label}
          </Link>
        ))}

        <View style={s.stage}>
          {current ? (
            // key remounts cleanly so each level starts from a fresh hook list
            <current.Component key={current.n} />
          ) : (
            <Text style={s.note}>Nothing loaded yet.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A090B' },
  body: { padding: 20, paddingTop: 64, gap: 10 },
  h1: { color: '#F6F3F4', fontSize: 22, fontWeight: '700' },
  note: { color: '#8D848A', fontSize: 13, lineHeight: 18 },
  btn: { backgroundColor: '#161418', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  btnOn: { borderColor: '#E03B4F', backgroundColor: 'rgba(224,59,79,0.12)' },
  btnPressed: { opacity: 0.7 },
  btnText: { color: '#F6F3F4', fontSize: 14 },
  stage: { marginTop: 18, minHeight: 130, justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 120 },
  sample: { color: '#F6F3F4', fontSize: 16, textAlign: 'center' },
  box: { backgroundColor: 'rgba(224,59,79,0.2)', padding: 20, borderRadius: 12 },
  grad: { padding: 24, borderRadius: 12 },
  link: { color: '#F4667A', fontSize: 15, paddingVertical: 10 },
  h2: { color: '#F6F3F4', fontSize: 16, fontWeight: '700', marginTop: 20 },
});
