import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Shown when any route throws, so a failure is readable instead of silent. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errRoot}>
      <ScrollView contentContainerStyle={styles.errBody}>
        <Text style={styles.errTitle}>VITAL hit an error</Text>
        <Text selectable style={styles.errMsg}>
          {error?.message ?? 'Unknown error'}
        </Text>
        <Text selectable style={styles.errStack}>
          {error?.stack ?? ''}
        </Text>
        <Text style={styles.errRetry} onPress={() => void retry()}>
          Tap here to retry
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * Deliberately minimal, and shaped exactly like the layout that was verified
 * working on device.
 *
 * Three things are intentionally absent, each of which was a suspect while
 * chasing a launch crash:
 *  - no `return null` while fonts load. Missing families fall back on their own,
 *    so blocking the first render buys nothing and delays the navigator.
 *  - no per-screen <Stack.Screen> children. They only set entry animations.
 *  - no Stripe provider. It is native-only, and pulling it into the module graph
 *    at the root is not worth it when the payment flow can import it on demand.
 */
export default function RootLayout() {
  useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  errRoot: { flex: 1, backgroundColor: colors.bg },
  errBody: { padding: 24, paddingTop: 72, gap: 14 },
  errTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  errMsg: { color: colors.primaryLight, fontSize: 15, lineHeight: 21 },
  errStack: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  errRetry: { color: colors.primary, fontSize: 15, fontWeight: '600', marginTop: 12 },
});
