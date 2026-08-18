import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';

/**
 * Deliberately plain: core React Native only, no Reanimated, SVG, gradients or
 * custom fonts. If this screen renders but the app does not, the fault is in
 * one of those libraries rather than in the router or the native runtime.
 *
 * Open it with:  exp://<your-ip>:8081/--/diag
 */
export default function Diag() {
  const probes: [string, string][] = [
    ['Platform', `${Platform.OS} ${String(Platform.Version)}`],
    ['Expo SDK', String(Constants.expoConfig?.sdkVersion ?? 'unknown')],
    ['Execution env', String(Constants.executionEnvironment)],
    ['App name', String(Constants.expoConfig?.name ?? '?')],
  ];

  const modules: [string, () => unknown][] = [
    ['react-native-reanimated', () => require('react-native-reanimated').useSharedValue],
    ['react-native-svg', () => require('react-native-svg').Svg],
    ['expo-linear-gradient', () => require('expo-linear-gradient').LinearGradient],
    ['react-native-safe-area-context', () => require('react-native-safe-area-context').SafeAreaProvider],
    ['react-native-screens', () => require('react-native-screens').enableScreens],
    ['expo-haptics', () => require('expo-haptics').impactAsync],
    ['@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage').default],
  ];

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h1}>VITAL diagnostics</Text>
        <Text style={s.note}>Plain React Native only. If you can read this, the router and native runtime are fine.</Text>

        {probes.map(([k, v]) => (
          <View key={k} style={s.row}>
            <Text style={s.k}>{k}</Text>
            <Text style={s.v}>{v}</Text>
          </View>
        ))}

        <Text style={s.h2}>Native modules</Text>
        {modules.map(([name, load]) => {
          let status = 'ok';
          try {
            status = load() ? 'ok' : 'undefined export';
          } catch (e) {
            status = `FAILED: ${e instanceof Error ? e.message.slice(0, 80) : 'error'}`;
          }
          return (
            <View key={name} style={s.row}>
              <Text style={s.k}>{name}</Text>
              <Text style={[s.v, status === 'ok' ? s.ok : s.bad]} selectable>
                {status}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A090B' },
  body: { padding: 20, paddingTop: 64, gap: 10 },
  h1: { color: '#F6F3F4', fontSize: 22, fontWeight: '700' },
  h2: { color: '#F6F3F4', fontSize: 16, fontWeight: '700', marginTop: 18 },
  note: { color: '#8D848A', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)', paddingVertical: 8, gap: 3 },
  k: { color: '#C7BFC4', fontSize: 13 },
  v: { color: '#F6F3F4', fontSize: 13 },
  ok: { color: '#3FD08A' },
  bad: { color: '#F4667A' },
});
