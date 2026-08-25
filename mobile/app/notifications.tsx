import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Card, FadeIn, Header, Icon, IconName, Screen, Txt } from '@/components';
import { AppNotification, useStore } from '@/state/store';
import { colors, gap, radius, s, spacing } from '@/theme';

const ICON: Record<AppNotification['kind'], IconName> = {
  meal: 'meal',
  water: 'water',
  workout: 'dumbbell',
  goal: 'target',
  progress: 'progress',
  coach: 'ai',
};

export default function Notifications() {
  const items = useStore((st) => st.notifications);
  const markRead = useStore((st) => st.markNotificationsRead);
  const dismiss = useStore((st) => st.dismissNotification);

  // Opening the screen is the acknowledgement; no extra "mark all read" needed.
  useEffect(() => {
    const t = setTimeout(markRead, 600);
    return () => clearTimeout(t);
  }, [markRead]);

  return (
    <Screen contentStyle={styles.content}>
      <Header
        title="Notifications"
        subtitle={items.length ? `${items.filter((n) => !n.read).length} new` : undefined}
        back
        right={
          <Pressable onPress={() => router.push('/settings/reminders')} hitSlop={10} accessibilityLabel="Reminder settings">
            <Icon name="sliders" size={20} color={colors.muted} />
          </Pressable>
        }
      />

      {items.length === 0 ? (
        <FadeIn>
          <Card style={styles.empty}>
            <Icon name="notification" size={26} color={colors.muted} />
            <Txt variant="h3">Nothing waiting</Txt>
            <Txt variant="small" color={colors.muted} center>
              Reminders and coach updates land here.
            </Txt>
          </Card>
        </FadeIn>
      ) : null}

      {items.map((n, i) => (
        <FadeIn key={n.id} delay={i * 45}>
          <Card style={[styles.row, !n.read && styles.unread]}>
            <View style={[styles.icon, !n.read && styles.iconUnread]}>
              <Icon name={ICON[n.kind]} size={18} color={n.read ? colors.muted : colors.primary} />
            </View>

            <View style={styles.body}>
              <Txt variant="h3" numberOfLines={2}>
                {n.title}
              </Txt>
              <Txt variant="small" color={colors.textSoft}>
                {n.body}
              </Txt>
              <Txt variant="caption" color={colors.faint} style={styles.time}>
                {n.at}
              </Txt>
            </View>

            <Pressable
              onPress={() => dismiss(n.id)}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss ${n.title}`}
              style={styles.clear}
            >
              <Txt variant="body" color={colors.faint}>
                ×
              </Txt>
            </Pressable>
          </Card>
        </FadeIn>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  flex: { flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  unread: { borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  icon: {
    width: s(38),
    height: s(38),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  iconUnread: { backgroundColor: colors.bg },
  body: { flex: 1, gap: 3 },
  time: { marginTop: 2 },
  clear: {
    width: s(28),
    height: s(28),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
});
