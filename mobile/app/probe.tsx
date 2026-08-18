import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
const LEVELS: { n: number; label: string; render: () => React.ReactNode }[] = [
  {
    n: 1,
    label: 'Plain React Native (baseline)',
    render: () => <Text style={s.sample}>Plain text renders.</Text>,
  },
  {
    n: 2,
    label: 'Custom Inter fonts',
    render: () => {
      const { useFonts, Inter_700Bold } = require('@expo-google-fonts/inter');
      const [loaded] = useFonts({ Inter_700Bold });
      if (!loaded) return <Text style={s.sample}>Loading font…</Text>;
      return <Text style={[s.sample, { fontFamily: 'Inter_700Bold' }]}>Inter loaded and applied.</Text>;
    },
  },
  {
    n: 3,
    label: 'SVG (the VITAL logo)',
    render: () => {
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
    render: () => {
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
    render: () => {
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
    render: () => {
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
    render: () => {
      require('expo-haptics');
      require('@react-native-async-storage/async-storage');
      return <Text style={s.sample}>Both modules loaded.</Text>;
    },
  },
];

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

        <View style={s.stage}>
          {current ? current.render() : <Text style={s.note}>Nothing loaded yet.</Text>}
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
});
