import React from 'react';
import { Alert, Platform, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, FadeIn, Header, Icon, Screen, Txt } from '@/components';
import { useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

export default function PrivacyControls() {
  const share = useStore((s) => s.shareAnalytics);
  const setShare = useStore((s) => s.setShareAnalytics);
  const guest = useStore((s) => s.guest);
  const signOut = useStore((s) => s.signOut);

  const wipe = () =>
    Alert.alert('Delete all data', 'This removes your profile, health details and history from this device. It cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);

  return (
    <Screen contentStyle={styles.content}>
      <Header title="Privacy" subtitle="What is kept, and what you can remove." back />

      <FadeIn>
        <Card style={styles.row}>
          <View style={styles.flex}>
            <Txt variant="bodyMed">Improve recommendations</Txt>
            <Txt variant="small" color={colors.muted}>
              Share anonymous usage so plans get better. Never your health details.
            </Txt>
          </View>
          <Switch
            value={share}
            onValueChange={setShare}
            trackColor={{ false: colors.surfaceAlt, true: colors.primaryDeep }}
            thumbColor={Platform.OS === 'android' ? (share ? colors.primaryLight : colors.muted) : undefined}
            ios_backgroundColor={colors.surfaceAlt}
          />
        </Card>
      </FadeIn>

      <FadeIn delay={70}>
        <Card>
          <View style={styles.head}>
            <Icon name="shield" size={18} color={colors.primaryLight} />
            <Txt variant="h3">Where your data lives</Txt>
          </View>
          <View style={styles.points}>
            {[
              guest
                ? 'You are using VITAL as a guest, so nothing leaves this device at all.'
                : 'Your profile and health details are stored on this device.',
              'Health details are used to build your plan and are never sold or shared with advertisers.',
              'Card details are handled by Stripe and never reach this app.',
              'You can delete everything below, at any time.',
            ].map((t) => (
              <View key={t} style={styles.point}>
                <Icon name="check" size={14} color={colors.primaryLight} />
                <Txt variant="small" color={colors.textSoft} style={styles.flex}>
                  {t}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={130} style={styles.actions}>
        <Button label="Read the privacy policy" variant="secondary" onPress={() => router.push('/settings/privacy')} />
        <Button label="Delete all my data" variant="ghost" onPress={wipe} />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  points: { gap: spacing.xs },
  point: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  actions: { gap: spacing.sm },
});
