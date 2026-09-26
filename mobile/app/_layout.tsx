/* Root layout: SafeAreaProvider + AuthProvider + PlanProvider +
   CelebrationProvider. Data goes straight to Supabase from the stores;
   the auth provider decides cloud vs local-only mode. */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { C } from '../src/design';
import { getNotifications } from '../src/lib/notify';
import { AuthProvider } from '../src/auth';
import { PlanProvider } from '../src/planStore';
import { CelebrationProvider } from '../src/celebration';

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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <PlanProvider>
          <CelebrationProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="workout/[day]" options={{ gestureEnabled: true }} />
            </Stack>
          </CelebrationProvider>
        </PlanProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
