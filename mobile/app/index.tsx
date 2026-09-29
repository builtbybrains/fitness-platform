/* Entry gate: holds while the session restores, then routes. Login when
   signed out, the stats prompt when the profile is missing personal stats,
   otherwise the tabs. With no account ("Continue without an account") the
   app goes straight to onboarding or the tabs. */

import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { C } from '../src/design';
import { useAuth } from '../src/auth';
import { BuiltMark } from '../src/components/BuiltLogo';

export default function Gate() {
  const { ready, profileLoaded, session, profile, localMode } = useAuth();

  if (!ready || (session && !profileLoaded)) {
    return (
      <View
        style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 24 }}
        accessibilityLabel="Loading BUILT"
      >
        <BuiltMark size={64} />
        <ActivityIndicator color={C.green} />
      </View>
    );
  }

  // Signed out and not in no-account mode: the login screen. This is what
  // makes Profile's sign-out work: the gate remounts and reacts.
  if (!session && !localMode) {
    return <Redirect href="/(auth)/login" />;
  }

  const needsStats = profile != null && (profile.height_cm == null || profile.weight_kg == null || profile.age == null || !profile.gender);
  if (needsStats) return <Redirect href="/(onboarding)/stats" />;

  return <Redirect href="/(tabs)" />;
}
