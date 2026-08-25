import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Link, router } from 'expo-router';
import { Button, FadeIn, Icon, Input, Logo, Screen, Txt } from '@/components';
import { isEmail } from '@/lib/validate';
import { useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

export default function Login() {
  const signIn = useStore((s) => s.signIn);
  const continueAsGuest = useStore((s) => s.continueAsGuest);
  const onboarded = useStore((s) => s.onboarded);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const next: typeof errors = {};
    if (!isEmail(email)) next.email = 'Enter a valid email address.';
    if (password.length < 8) next.password = 'Enter your password.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    // Swap this for your auth provider. The screen already handles the states.
    await new Promise((r) => setTimeout(r, 550));
    signIn(email.trim());
    setBusy(false);
    router.replace(onboarded ? '/(tabs)' : '/(onboarding)');
  };

  return (
    <Screen keyboardAware contentStyle={styles.content}>
      <FadeIn>
        <View style={styles.brand}>
          <Logo size={54} />
          <Txt variant="display" style={styles.title}>
            Welcome back
          </Txt>
          <Txt variant="body" color={colors.muted}>
            Your plan is ready when you are.
          </Txt>
        </View>
      </FadeIn>

      <FadeIn delay={80} style={styles.form}>
        <Input
          label="Email"
          value={email}
          onChangeText={(v) => { setEmail(v); setErrors((e) => ({ ...e, email: undefined })); }}
          error={errors.email}
          placeholder="alex@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />

        <Input
          label="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setErrors((e) => ({ ...e, password: undefined })); }}
          error={errors.password}
          placeholder="Your password"
          secure
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <Link href="/(auth)/forgot-password" asChild>
          <Pressable hitSlop={8} style={styles.forgot} accessibilityRole="link">
            <Txt variant="smallMed" color={colors.primaryLight}>
              Forgot password?
            </Txt>
          </Pressable>
        </Link>
      </FadeIn>

      <FadeIn delay={140} style={styles.actions}>
        <Button label="Log in" onPress={submit} loading={busy} />

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
            signIn('alex@example.com', 'Alex');
            router.replace(onboarded ? '/(tabs)' : '/(onboarding)');
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
            New to VITAL?{' '}
          </Txt>
          <Link href="/(auth)/register" asChild>
            <Pressable hitSlop={8} accessibilityRole="link">
              <Txt variant="smallMed" color={colors.primaryLight}>
                Create an account
              </Txt>
            </Pressable>
          </Link>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: gap.lg },
  brand: { gap: spacing.xs, alignItems: 'flex-start' },
  title: { marginTop: spacing.sm },
  form: { gap: spacing.md },
  forgot: { alignSelf: 'flex-end', paddingVertical: spacing.xxs },
  actions: { gap: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
});
