/* Entry gate: splash while the session restores, then route — login when
   signed out, the stats prompt when the profile is missing personal stats,
   otherwise the tabs. In local mode ("continue without an account") the
   app goes straight to onboarding/tabs. */

import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { C } from '../src/design';
import { useAuth } from '../src/auth';
import { supabaseConfigured } from '../supabase.config';

export default function Gate() {
  const { ready, session, profile, localMode } = useAuth();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Text style={{ color: C.mint, fontSize: 30, fontWeight: '900', letterSpacing: 6 }}>VITAL</Text>
        <ActivityIndicator color={C.mint} />
      </View>
    );
  }

  // Signed-out and not in local mode → the login screen. This is what makes
  // Profile's sign-out button work: the gate remounts and reacts.
  if (!session && !localMode) {
    return <Redirect href="/(auth)/login" />;
  }

  const needsStats = profile != null && (profile.height_cm == null || profile.age == null || !profile.gender);
  if (needsStats) return <Redirect href="/(onboarding)/stats" />;

  return <Redirect href="/(tabs)" />;
}
