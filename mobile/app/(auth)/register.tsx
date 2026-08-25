import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button, FadeIn, Header, Icon, Input, Screen, Txt } from '@/components';
import { isEmail, passwordProblem, requiredName } from '@/lib/validate';
import { useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

type Errors = Partial<Record<'first' | 'last' | 'email' | 'password' | 'confirm', string>>;

export default function Register() {
  const signIn = useStore((s) => s.signIn);
  const continueAsGuest = useStore((s) => s.continueAsGuest);

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const clear = (k: keyof Errors) => setErrors((e) => ({ ...e, [k]: undefined }));

  const submit = async () => {
    const next: Errors = {};
    next.first = requiredName(first, 'first name') ?? undefined;
    next.last = requiredName(last, 'last name') ?? undefined;
    if (!isEmail(email)) next.email = 'Enter a valid email address.';
    next.password = passwordProblem(password) ?? undefined;
    if (confirm !== password) next.confirm = 'Passwords do not match.';

    const cleaned = Object.fromEntries(Object.entries(next).filter(([, v]) => v)) as Errors;
    setErrors(cleaned);
    if (Object.keys(cleaned).length) return;

    setBusy(true);
    await new Promise((r) => setTimeout(r, 600));
    signIn(email.trim(), first.trim(), last.trim());
    setBusy(false);
    router.replace('/(onboarding)');
  };

  return (
    <Screen keyboardAware contentStyle={styles.content}>
      <Header title="Create account" subtitle="Two minutes to your first plan." back />

      <FadeIn style={styles.form}>
        <View style={styles.row}>
          <View style={styles.half}>
            <Input
              label="First name"
              value={first}
              onChangeText={(v) => { setFirst(v); clear('first'); }}
              error={errors.first}
              placeholder="Alex"
              autoComplete="given-name"
              textContentType="givenName"
            />
          </View>
          <View style={styles.half}>
            <Input
              label="Last name"
              value={last}
              onChangeText={(v) => { setLast(v); clear('last'); }}
              error={errors.last}
              placeholder="Moreau"
              autoComplete="family-name"
              textContentType="familyName"
            />
          </View>
        </View>

        <Input
          label="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); clear('email'); }}
          error={errors.email}
          placeholder="alex@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); clear('password'); }}
          error={errors.password}
          placeholder="At least 8 characters"
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />

        <Input
          label="Confirm password"
          value={confirm}
          onChangeText={(v) => { setConfirm(v); clear('confirm'); }}
          error={errors.confirm}
          placeholder="Repeat your password"
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
      </FadeIn>

      <FadeIn delay={100} style={styles.actions}>
        <Button label="Create account" onPress={submit} loading={busy} />

        <View style={styles.divider}>
          <View style={styles.line} />
          <Txt variant="caption" color={colors.faint}>
            OR
          </Txt>
          <View style={styles.line} />
        </View>

        <Button
          label="Continue with Google"
          variant="secondary"
          icon={<Icon name="google" size={18} />}
          onPress={() => {
            signIn('alex@example.com', 'Alex', 'Moreau');
            router.replace('/(onboarding)');
          }}
        />

        <Button
          label="Continue as guest"
          variant="ghost"
          onPress={() => {
            continueAsGuest();
            router.replace('/(onboarding)');
          }}
        />

        <View style={styles.footer}>
          <Txt variant="small" color={colors.muted}>
            Already have an account?{' '}
          </Txt>
          <Link href="/(auth)/login" asChild>
            <Pressable hitSlop={8} accessibilityRole="link">
              <Txt variant="smallMed" color={colors.primaryLight}>
                Log in
              </Txt>
            </Pressable>
          </Link>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md, paddingTop: spacing.md },
  form: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  actions: { gap: spacing.md, marginTop: spacing.xs },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
});
