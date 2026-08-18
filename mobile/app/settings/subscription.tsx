import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, FadeIn, Header, Icon, Logo, Screen, Txt } from '@/components';
import { createSubscriptionSession, PRICE, PUBLISHABLE_KEY, stripeConfigured } from '@/services/payments';
import { isExpoGo, loadStripe } from '@/services/stripeCompat';
import { useStore } from '@/state/store';
import { colors, gap, radius, s, spacing } from '@/theme';

export default function Subscription() {
  const premium = useStore((st) => st.premium);
  const renewsOn = useStore((st) => st.renewsOn);
  const setPremium = useStore((st) => st.setPremium);
  const email = useStore((st) => st.profile.email);

  const [busy, setBusy] = useState(false);

  /**
   * Card details are collected by Stripe's own PaymentSheet. They never pass
   * through this app, so there is nothing sensitive to store.
   */
  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const stripe = await loadStripe(PUBLISHABLE_KEY);

      if (!stripeConfigured || !stripe) {
        // No keys, or running in Expo Go: complete locally so the flow stays
        // reviewable end to end without taking a payment.
        await new Promise((r) => setTimeout(r, 700));
        setPremium(true);
        router.replace('/settings/payment-success');
        return;
      }

      const session = await createSubscriptionSession(email || 'member@vital.app');

      const init = await stripe.initPaymentSheet({
        merchantDisplayName: 'VITAL',
        customerId: session.customer,
        customerEphemeralKeySecret: session.ephemeralKey,
        paymentIntentClientSecret: session.paymentIntent,
        allowsDelayedPaymentMethods: false,
        applePay: { merchantCountryCode: 'US' },
        googlePay: { merchantCountryCode: 'US', testEnv: __DEV__ },
        appearance: {
          colors: {
            primary: colors.primary,
            background: colors.bgElevated,
            componentBackground: colors.surface,
            componentText: colors.text,
            primaryText: colors.text,
            secondaryText: colors.muted,
          },
        },
      });
      if (init.error) throw new Error(init.error.message);

      const result = await stripe.presentPaymentSheet();
      if (result.error) {
        if (result.error.code !== 'Canceled') {
          Alert.alert('Payment not completed', result.error.message);
        }
        return;
      }

      setPremium(true);
      router.replace('/settings/payment-success');
    } catch (err) {
      Alert.alert('Something went wrong', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [email, setPremium]);

  const cancel = () =>
    Alert.alert('Cancel subscription', 'You keep access until the end of the paid period.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel plan', style: 'destructive', onPress: () => setPremium(false) },
    ]);

  return (
    <Screen contentStyle={styles.content}>
      <Header title="Subscription" back />

      <FadeIn>
        <Card accent style={styles.plan}>
          <View style={styles.planHead}>
            <Logo size={s(38)} />
            <View style={styles.flex}>
              <Txt variant="h2">VITAL Premium</Txt>
              <Txt variant="small" color={colors.textSoft}>
                Everything, from day one
              </Txt>
            </View>
          </View>

          <View style={styles.priceRow}>
            <Txt variant="display">{PRICE.amount}</Txt>
            <Txt variant="body" color={colors.textSoft}>
              / {PRICE.period}
            </Txt>
          </View>

          <View style={styles.perDay}>
            <Icon name="check" size={15} color={colors.primaryLight} />
            <Txt variant="smallMed" color={colors.primaryLight}>
              {PRICE.perDay}
            </Txt>
          </View>

          <View style={styles.benefits}>
            {PRICE.benefits.map((b) => (
              <View key={b} style={styles.benefit}>
                <Icon name="check" size={15} color={colors.primaryLight} />
                <Txt variant="small" color={colors.textSoft} style={styles.flex}>
                  {b}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={90} style={styles.actions}>
        {premium ? (
          <>
            <Card>
              <View style={styles.statusRow}>
                <View style={styles.flex}>
                  <Txt variant="h3">Active</Txt>
                  <Txt variant="small" color={colors.muted}>
                    Next billing date {renewsOn}
                  </Txt>
                </View>
                <View style={styles.dot} />
              </View>
            </Card>
            <Button label="Manage payment method" variant="secondary" onPress={() => router.push('/settings/payment')} />
            <Button label="Cancel subscription" variant="ghost" onPress={cancel} />
          </>
        ) : (
          <>
            <Button label="SUBSCRIBE NOW" onPress={subscribe} loading={busy} />
            <Txt variant="caption" color={colors.faint} center>
              Cancel anytime. Card details are handled by Stripe and never stored in this app.
            </Txt>
            {!stripeConfigured || isExpoGo ? (
              <Txt variant="caption" color={colors.warning} center>
                {isExpoGo
                  ? 'Demo mode: Expo Go cannot load Stripe. Use a development build for real payments.'
                  : 'Demo mode: no Stripe key configured, so no real charge is made.'}
              </Txt>
            ) : null}
          </>
        )}
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md, paddingTop: spacing.md },
  flex: { flex: 1 },
  plan: { gap: spacing.sm },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: spacing.xs },
  perDay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  benefits: { gap: spacing.xs, marginTop: spacing.sm },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { gap: spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
});
