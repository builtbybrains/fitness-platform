/* Sign in, create an account, or continue without one. */

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, FONT, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { BuiltLogo } from '../../src/components/BuiltLogo';
import { Button, LinkButton } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { Notice } from '../../src/components/Bits';
import { readableAuthError } from '../../src/components/copy';

export default function LoginScreen() {
  const { signIn, continueOffline, session, localMode, ready } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // The root gate unmounts when it routes here, so a successful sign-in gets
  // no redirect from it. Watch auth state instead: as soon as a session or a
  // device-only identity exists, hand control back to the gate.
  useEffect(() => {
    if (ready && (session || localMode)) router.replace('/');
  }, [ready, session, localMode]);

  async function submit() {
    if (!email.trim() || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setErr(readableAuthError(error));
  }

  async function noAccount() {
    setLeaving(true);
    await continueOffline();
  }

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', gap: 32, maxWidth: 480, width: '100%', alignSelf: 'center' }}
        >
          <View style={{ alignItems: 'center', gap: 20, paddingTop: 16 }}>
            <BuiltLogo height={62} tagline />
          </View>

          <View style={{ gap: 16 }}>
            <Text style={T.h2} accessibilityRole="header">
              Sign in
            </Text>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              onSubmitEditing={submit}
            />
            {err ? <Notice tone="error">{err}</Notice> : null}
          </View>

          <View style={{ gap: 12 }}>
            <Button label={busy ? 'Signing in' : 'Sign in'} onPress={submit} busy={busy} />
            <Button label="Create an account" variant="secondary" onPress={() => router.push('/(auth)/register')} />
            <LinkButton onPress={noAccount} accessibilityLabel="Continue without an account. Data stays on this device.">
              <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, lineHeight: 21, color: C.muted, textAlign: 'center' }}>
                {leaving ? 'Opening your plan' : 'Continue without an account. Data stays on this device.'}
              </Text>
            </LinkButton>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
