import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, FadeIn, Header, Icon, Input, Screen, Txt } from '@/components';
import { isEmail } from '@/lib/validate';
import { colors, gap, spacing } from '@/theme';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    setBusy(false);
    setSent(true);
  };

  return (
    <Screen keyboardAware contentStyle={styles.content}>
      <Header title="Reset password" subtitle="We will email you a reset link." back />

      {sent ? (
        <FadeIn>
          <Card accent style={styles.done}>
            <Icon name="check" size={26} color={colors.primaryLight} />
            <Txt variant="h3">Check your inbox</Txt>
            <Txt variant="small" color={colors.textSoft} center>
              If an account exists for {email.trim()}, a reset link is on its way.
            </Txt>
          </Card>
          <Button
            label="Back to login"
            variant="secondary"
            onPress={() => router.replace('/(auth)/login')}
            style={styles.spaced}
          />
        </FadeIn>
      ) : (
        <FadeIn style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={(v) => { setEmail(v); setError(null); }}
            error={error}
            placeholder="alex@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            onSubmitEditing={submit}
          />
          <Button label="Send reset link" onPress={submit} loading={busy} />
        </FadeIn>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md, paddingTop: spacing.md },
  form: { gap: spacing.lg },
  done: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  spaced: { marginTop: spacing.lg },
});
