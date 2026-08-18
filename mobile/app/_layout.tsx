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
import { SAFE_MODE } from '@/lib/safeMode';
import { PUBLISHABLE_KEY } from '@/services/payments';
import { isExpoGo } from '@/services/stripeCompat';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * Shown when any route throws. Without this a startup error can take the whole
 * app down with nothing on screen to explain why.
 */
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

const styles = StyleSheet.create({
  errRoot: { flex: 1, backgroundColor: '#0A090B' },
  errBody: { padding: 24, paddingTop: 72, gap: 14 },
  errTitle: { color: '#F6F3F4', fontSize: 20, fontWeight: '700' },
  errMsg: { color: '#F4667A', fontSize: 15, lineHeight: 21 },
  errStack: { color: '#8D848A', fontSize: 11, lineHeight: 16 },
  errRetry: { color: '#E03B4F', fontSize: 15, fontWeight: '600', marginTop: 12 },
});

/**
 * Renders Stripe's provider only where the native module exists. In Expo Go it
 * renders children untouched so the app is still fully browsable.
 */
function StripeGate({ children }: { children: React.ReactElement | React.ReactElement[] }) {
  if (isExpoGo || !PUBLISHABLE_KEY) return <>{children}</>;
  // Required lazily so Expo Go never evaluates the native binding at all.
  const { StripeProvider } = require('@stripe/stripe-react-native') as
    typeof import('@stripe/stripe-react-native');
  return (
    <StripeProvider publishableKey={PUBLISHABLE_KEY} merchantIdentifier="merchant.app.vital">
      {children}
    </StripeProvider>
  );
}

export default function RootLayout() {
  if (SAFE_MODE) return <SafeModeLayout />;
  return <FullLayout />;
}

/** Bare navigator: nothing but expo-router and core React Native. */
function SafeModeLayout() {
  // preventAutoHideAsync runs at module scope, so safe mode has to hide the
  // splash itself or it sits there forever.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A090B' } }} />
    </>
  );
}

function FullLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // Hand off to our own animated logo screen as soon as type is ready. If a
    // font fails to load we still continue rather than hanging on the splash.
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StripeGate>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="index" options={{ animation: 'fade' }} />
            <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
            <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          </Stack>
        </StripeGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
