/* Create account. The name travels as signup metadata; a server trigger
   turns it into the profile row. */

import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { BuiltLogo } from '../../src/components/BuiltLogo';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { Notice } from '../../src/components/Bits';
import { readableAuthError } from '../../src/components/copy';

export default function RegisterScreen() {
  const { signUp, session } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If signup returns a session (email confirmation off), go straight in.
  // With confirmation on there is no session yet: the message below stays
  // on screen and the person signs in from the login screen afterwards.
  useEffect(() => {
    if (session) router.replace('/');
  }, [session]);

  async function submit() {
    if (!email.trim()) {
      setErr('Enter your email.');
      return;
    }
    if (password.length < 8) {
      setErr('Use at least 8 characters for your password.');
      return;
    }
    if (password !== confirm) {
      setErr("The passwords don't match.");
      return;
    }
    setBusy(true);
    setErr(null);
    setInfo(null);
    const { error } = await signUp(email.trim(), password, name.trim());
    setBusy(false);
    if (error?.startsWith('CONFIRM_EMAIL:')) {
      setInfo(error.slice('CONFIRM_EMAIL:'.length));
      return;
    }
    if (error) setErr(readableAuthError(error));
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', gap: 32, maxWidth: 480, width: '100%', alignSelf: 'center' }}
        >
          <View style={{ alignItems: 'center', paddingTop: 16 }}>
            <BuiltLogo height={62} tagline />
          </View>

          <View style={{ gap: 16 }}>
            <View style={{ gap: 4 }}>
              <Text style={T.h2} accessibilityRole="header">
                Create your account
              </Text>
              <Text style={T.meta}>Your plan, progress and coach, synced to every device.</Text>
            </View>
            <Field label="First name" value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" />
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
              hint="At least 8 characters."
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <Field
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={submit}
            />
            {err ? <Notice tone="error">{err}</Notice> : null}
            {info ? <Notice tone="success">{info}</Notice> : null}
          </View>

          <View style={{ gap: 12 }}>
            <Button label={busy ? 'Creating your account' : 'Create account'} onPress={submit} busy={busy} />
            <Button label="I have an account" variant="secondary" onPress={back} accessibilityLabel="I have an account. Sign in." />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
