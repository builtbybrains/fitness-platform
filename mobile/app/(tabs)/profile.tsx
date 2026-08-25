import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, FadeIn, Icon, ListRow, Screen, Txt } from '@/components';
import { useStore } from '@/state/store';
import { colors, gap, radius, s, spacing } from '@/theme';

export default function Profile() {
  const profile = useStore((st) => st.profile);
  const premium = useStore((st) => st.premium);
  const guest = useStore((st) => st.guest);
  const renewsOn = useStore((st) => st.renewsOn);
  const signOut = useStore((st) => st.signOut);

  const initials =
    `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.trim().toUpperCase() || 'A';

  const confirmSignOut = () =>
    Alert.alert('Log out', 'You can log back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => {
          signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);

  return (
    <Screen tabBarPadding contentStyle={styles.content}>
      <FadeIn>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Txt variant="h2" color={colors.primaryLight}>
              {initials}
            </Txt>
          </View>
          <View style={styles.flex}>
            <Txt variant="h2" numberOfLines={1}>
              {profile.firstName} {profile.lastName}
            </Txt>
            <Txt variant="small" color={colors.muted} numberOfLines={1}>
              {guest ? 'Guest · nothing leaves this device' : profile.email || 'Signed in'}
            </Txt>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={60}>
        <Card accent={premium} style={styles.sub}>
          <View style={styles.subHead}>
            <View style={styles.flex}>
              <Txt variant="h3">VITAL Premium</Txt>
              <Txt variant="small" color={premium ? colors.textSoft : colors.muted}>
                {premium ? `Active · renews ${renewsOn}` : 'Not subscribed'}
              </Txt>
            </View>
            <View style={[styles.badge, premium && styles.badgeActive]}>
              <Txt variant="caption" color={premium ? colors.success : colors.muted}>
                {premium ? 'ACTIVE' : 'FREE'}
              </Txt>
            </View>
          </View>
          <ListRow
            label={premium ? 'Manage subscription' : 'Subscribe now'}
            onPress={() => router.push('/settings/subscription')}
            last
          />
        </Card>
      </FadeIn>

      <FadeIn delay={110}>
        <Txt variant="caption" color={colors.faint} style={styles.groupLabel}>
          YOUR PLAN
        </Txt>
        <Card padded={false}>
          <ListRow icon="profile" label="Profile information" onPress={() => router.push('/settings/personal')} />
          <ListRow icon="target" label="Goals" onPress={() => router.push('/settings/goals')} />
          <ListRow icon="shield" label="Health" onPress={() => router.push('/settings/health')} />
          <ListRow icon="sliders" label="Preferences" onPress={() => router.push('/settings/preferences')} />
          <ListRow icon="bell" label="Reminders" onPress={() => router.push('/settings/reminders')} last />
        </Card>
      </FadeIn>

      <FadeIn delay={160}>
        <Txt variant="caption" color={colors.faint} style={styles.groupLabel}>
          BILLING
        </Txt>
        <Card padded={false}>
          <ListRow icon="card" label="Subscription" onPress={() => router.push('/settings/subscription')} />
          <ListRow icon="card" label="Payment method" onPress={() => router.push('/settings/payment')} last />
        </Card>
      </FadeIn>

      <FadeIn delay={210}>
        <Txt variant="caption" color={colors.faint} style={styles.groupLabel}>
          LEGAL
        </Txt>
        <Card padded={false}>
          <ListRow icon="shield" label="Privacy &amp; data" onPress={() => router.push('/settings/privacy-controls')} />
          <ListRow icon="doc" label="Terms of service" onPress={() => router.push('/settings/terms')} last />
        </Card>
      </FadeIn>

      <FadeIn delay={260}>
        <Card padded={false}>
          <ListRow
            icon="logout"
            label={guest ? 'Exit guest mode' : 'Log out'}
            danger
            onPress={confirmSignOut}
            last
          />
        </Card>
        <View style={styles.version}>
          <Icon name="check" size={13} color={colors.faint} />
          <Txt variant="caption" color={colors.faint}>
            VITAL 1.0.0
          </Txt>
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.sm },
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.xs },
  avatar: {
    width: s(58),
    height: s(58),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  sub: { padding: 0 },
  subHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  badgeActive: { backgroundColor: colors.successSoft },
  groupLabel: { marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: spacing.xxs },
  version: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
});
