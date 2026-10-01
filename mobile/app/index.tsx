/* Entry gate: holds while the session restores, then routes. Login when
   signed out; the questionnaire for anyone who hasn't finished it (every v1
   account included, onboarding_done_at is null for them); otherwise the
   tabs. With no account ("Continue without an account") the same rule
   applies to the device profile. */

import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useState } from 'react';

import { C, T } from '../src/design';
import { useAuth } from '../src/auth';
import { BuiltMark } from '../src/components/BuiltLogo';
import { Button } from '../src/components/Button';

export default function Gate() {
  const { ready, profileLoaded, profileError, session, profile, localMode, refreshProfile, signOut } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (!ready || (session && !profileLoaded) || (localMode && !profile)) {
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

  // Signed in, but the profile couldn't be loaded and there is no copy on
  // this device: say so, and retry.
  if (session && !profile && profileError) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: 'center', padding: 24, gap: 24 }}>
        <BuiltMark size={48} />
        <View style={{ gap: 8 }}>
          <Text style={T.h1} accessibilityRole="header">
            Can&apos;t reach BUILT
          </Text>
          <Text style={[T.body, { color: C.muted }]}>{profileError}</Text>
        </View>
        <View style={{ gap: 12 }}>
          <Button
            label={retrying ? 'Trying again' : 'Try again'}
            busy={retrying}
            onPress={async () => {
              setRetrying(true);
              await refreshProfile();
              setRetrying(false);
            }}
          />
          <Button label="Sign out" variant="secondary" onPress={() => void signOut()} />
        </View>
      </View>
    );
  }

  if (profile && !profile.onboarding_done_at) return <Redirect href="/(onboarding)/questionnaire" />;

  return <Redirect href="/(tabs)" />;
}
