import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, FadeIn, Header, Icon, Screen, Txt } from '@/components';
import { stripeConfigured } from '@/services/payments';
import { useStore } from '@/state/store';
import { colors, gap, radius, s, spacing } from '@/theme';

/**
 * Payment method screen.
 *
 * There is deliberately no card form here. Adding or changing a card opens
 * Stripe's PaymentSheet, which runs in Stripe's own UI, so this app never
 * touches a card number, expiry or CVV and has nothing sensitive to persist.
 */
export default function Payment() {
  const premium = useStore((s) => s.premium);
  const renewsOn = useStore((s) => s.renewsOn);

  return (
    <Screen contentStyle={styles.content} header={<Header title="Payment" subtitle="Handled securely by Stripe" back />}>

      <FadeIn>
        {premium ? (
          <Card>
            <View style={styles.cardRow}>
              <View style={styles.brand}>
                <Icon name="card" size={20} color={colors.primaryLight} />
              </View>
              <View style={styles.flex}>
                <Txt variant="bodyMed">Card on file</Txt>
                <Txt variant="small" color={colors.muted}>
                  Stored with Stripe · next charge {renewsOn}
                </Txt>
              </View>
            </View>
          </Card>
        ) : (
          <Card>
            <Txt variant="bodyMed">No payment method yet</Txt>
            <Txt variant="small" color={colors.muted} style={styles.spaced}>
              Add one when you subscribe. You will confirm the amount before anything is charged.
            </Txt>
          </Card>
        )}
      </FadeIn>

      <FadeIn delay={70}>
        <Card>
          <View style={styles.secureHead}>
            <Icon name="shield" size={18} color={colors.success} />
            <Txt variant="h3">Your card stays with Stripe</Txt>
          </View>
          <View style={styles.points}>
            {[
              'Card number, expiry and CVV are entered inside Stripe’s own secure sheet.',
              'This app never receives, stores or transmits raw card details.',
              'Only a payment token is kept, and it cannot be used anywhere else.',
              'Apple Pay and Google Pay are supported where available.',
            ].map((p) => (
              <View key={p} style={styles.point}>
                <Icon name="check" size={14} color={colors.primaryLight} />
                <Txt variant="small" color={colors.textSoft} style={styles.flex}>
                  {p}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={130} style={styles.actions}>
        <Button
          label={premium ? 'Update payment method' : 'Go to subscription'}
          onPress={() => router.replace('/settings/subscription')}
        />
        {!stripeConfigured ? (
          <Txt variant="caption" color={colors.warning} center>
            Demo mode: add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY and EXPO_PUBLIC_API_URL to take real
            payments.
          </Txt>
        ) : null}
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  flex: { flex: 1 },
  spaced: { marginTop: spacing.xxs },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  brand: {
    width: s(44),
    height: s(44),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  secureHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  points: { gap: spacing.xs },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  actions: { gap: spacing.sm },
});
