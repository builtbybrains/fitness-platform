/* Root layout: fonts, splash, providers and the root stack.

   The splash screen stays up until Sora and Inter have loaded (or failed,
   in which case the system font takes over) and the saved session has been
   restored, so nobody sees a flash of the wrong font or a white frame.
   Every navigator paints Deep Black behind its screens. */

import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { useFonts } from 'expo-font';
import { Sora_300Light } from '@expo-google-fonts/sora/300Light';
import { Sora_400Regular } from '@expo-google-fonts/sora/400Regular';
import { Sora_500Medium } from '@expo-google-fonts/sora/500Medium';
import { Sora_600SemiBold } from '@expo-google-fonts/sora/600SemiBold';
import { Sora_700Bold } from '@expo-google-fonts/sora/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';

import { C } from '../src/design';
import { getNotifications } from '../src/lib/notify';
import { AuthProvider, useAuth } from '../src/auth';
import { PlanProvider } from '../src/planStore';
import { CelebrationProvider } from '../src/celebration';
import { useReminderScheduler } from '../src/useReminders';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(C.bg).catch(() => {});

const Notifications = getNotifications();
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Hides the splash once fonts are settled and the session is restored. */
function SplashGate({ fontsSettled }: { fontsSettled: boolean }) {
  const { ready } = useAuth();
  useEffect(() => {
    if (fontsSettled && ready) SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled, ready]);
  return null;
}

/** Where a tapped notification goes: a local reminder carries `url`; a
    server push carries `type` (report_reply with report_id, plan_updated). */
function routeFor(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (data.type === 'report_reply' && typeof data.report_id === 'string') return `/report/${data.report_id}`;
  if (data.type === 'plan_updated') return '/(tabs)/plan';
  return typeof data.url === 'string' && data.url.startsWith('/') ? data.url : null;
}

/** Keeps local reminders scheduled and opens the right screen when a
    notification is tapped. Renders nothing. */
function Reminders() {
  const { userId, onboarded } = useAuth();
  useReminderScheduler();
  useEffect(() => {
    if (!Notifications || !userId || !onboarded) return;
    const open = (r: { notification: { request: { content: { data?: Record<string, unknown> } } }; actionIdentifier?: string } | null) => {
      if (!r || (r.actionIdentifier && r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER)) return;
      const to = routeFor(r.notification.request.content.data);
      if (to) router.push(to as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [userId, onboarded]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Sora_300Light,
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // Never hold the app hostage to a slow font: after 6s, go with the system font.
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGaveUp(true), 6000);
    return () => clearTimeout(t);
  }, []);
  const fontsSettled = fontsLoaded || !!fontError || gaveUp;

  return (
    <SafeAreaProvider style={{ backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <AuthProvider>
        <SplashGate fontsSettled={fontsSettled} />
        {fontsSettled ? (
          <PlanProvider>
            <CelebrationProvider>
              <Reminders />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="workout/[day]" options={{ gestureEnabled: true }} />
                <Stack.Screen name="photos" />
                <Stack.Screen name="checkin" />
                <Stack.Screen name="report" />
                <Stack.Screen name="memory" />
                <Stack.Screen name="settings" />
              </Stack>
            </CelebrationProvider>
          </PlanProvider>
        ) : (
          <View style={{ flex: 1, backgroundColor: C.bg }} />
        )}
      </AuthProvider>
    </SafeAreaProvider>
  );
}
