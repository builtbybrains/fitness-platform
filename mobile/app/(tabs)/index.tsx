import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bar, Card, FadeIn, Icon, IconName, Ring, Screen, Txt } from '@/components';
import { todayPlan } from '@/data/plan';
import { catchUpMessage } from '@/services/coach';
import { Activity, useDerived, useStore } from '@/state/store';
import { colors, gap, isSmallPhone, radius, s, shadow, spacing } from '@/theme';

const KIND_ICON: Record<string, IconName> = {
  meal: 'meal',
  workout: 'dumbbell',
  water: 'water',
};

/** Badge palette per row kind, mirroring the reference card badges. */
const KIND_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  meal: { bg: colors.accentSoft, fg: colors.onAccent, label: 'Meal' },
  workout: { bg: colors.badgeYellowSoft, fg: colors.onBadgeYellow, label: 'Workout' },
  water: { bg: colors.chartSoft, fg: colors.onChart, label: 'Water' },
};

const LEVEL_LABEL: Record<Activity, string> = {
  sedentary: 'Beginner',
  light: 'Light',
  moderate: 'Intermediate',
  active: 'Advanced',
};

export default function Home() {
  const profile = useStore((st) => st.profile);
  const addWater = useStore((st) => st.addWater);
  const logWorkout = useStore((st) => st.logWorkout);
  const unread = useStore((st) => st.notifications.filter((n) => !n.read).length);
  const d = useDerived();
  const [refreshing, setRefreshing] = useState(false);
  const catchUp = catchUpMessage(d.daysSinceWorkout, profile.firstName);

  const initials =
    `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`.trim().toUpperCase() || 'A';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  const startWorkout = () => {
    logWorkout();
    router.push('/(tabs)/plan');
  };

  return (
    <Screen
      tabBarPadding
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentStyle={styles.content}
      header={
        <View style={styles.greetRow}>
          <View style={styles.flex}>
            <Txt variant="small" color={colors.muted}>
              Welcome back{' '}🙌
            </Txt>
            <Txt variant="h1" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {profile.firstName}
              {profile.lastName ? ` ${profile.lastName}` : ''}
            </Txt>
          </View>

          <Pressable
            onPress={() => router.push('/notifications')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            style={({ pressed }) => [styles.circleBtn, pressed && styles.pressed]}
          >
            <Icon name="notification" size={19} color={colors.text} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Txt variant="caption" color={colors.onPrimary} maxFontSizeMultiplier={1}>
                  {unread > 9 ? '9+' : unread}
                </Txt>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/profile')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            <Txt variant="h3" color={colors.onAccent}>
              {initials}
            </Txt>
          </Pressable>
        </View>
      }
    >
      {catchUp ? (
        <FadeIn delay={40}>
          <Card accent style={styles.catchUp}>
            <View style={styles.catchUpHead}>
              <View style={styles.catchUpIcon}>
                <Icon name="flame" size={18} color={colors.onAccent} />
              </View>
              <Txt variant="h3" style={styles.flex}>
                Let&apos;s pick it back up
              </Txt>
            </View>
            <Txt variant="small" color={colors.textSoft}>
              {catchUp}
            </Txt>
            <Pressable
              onPress={startWorkout}
              accessibilityRole="button"
              style={({ pressed }) => [styles.catchUpBtn, pressed && styles.pressed]}
            >
              <Txt variant="smallMed" color={colors.onPrimary}>
                Start today&apos;s session
              </Txt>
            </Pressable>
          </Card>
        </FadeIn>
      ) : null}

      {/* Hero: today's session, ring in a lime tile, black continue pill. */}
      <FadeIn delay={70}>
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={[styles.flex, styles.heroCopy]}>
              <Txt variant="h3">Progress</Txt>
              <View style={styles.heroBadge}>
                <Txt variant="caption" color={colors.onAccent} maxFontSizeMultiplier={1.1}>
                  {profile.training[0] ?? 'Strength'}
                </Txt>
              </View>
              <Txt variant="h2" numberOfLines={1}>
                Upper body
              </Txt>
              <View style={styles.metaRow}>
                <Icon name="clock" size={14} color={colors.muted} />
                <Txt variant="small" color={colors.muted}>
                  {d.workoutMinutes} min
                </Txt>
                <View style={styles.metaDot} />
                <Icon name="target" size={14} color={colors.muted} />
                <Txt variant="small" color={colors.muted}>
                  {LEVEL_LABEL[profile.activity]}
                </Txt>
              </View>
            </View>

            <View style={styles.ringTile}>
              <Ring
                value={d.dailyGoal}
                size={s(72)}
                stroke={s(7)}
                label={`${Math.round(d.dailyGoal * 100)}%`}
              />
            </View>
          </View>

          <Pressable
            onPress={startWorkout}
            accessibilityRole="button"
            accessibilityLabel="Continue the workout"
            style={({ pressed }) => [styles.continueBtn, pressed && styles.pressed]}
          >
            <Txt variant="h3" color={colors.onPrimary}>
              Continue the workout
            </Txt>
            <View style={styles.continueArrow}>
              <Icon name="chevron" size={14} color={colors.onPrimary} strokeWidth={2.2} />
            </View>
          </Pressable>
        </Card>
      </FadeIn>

      {/* Today's numbers. */}
      <FadeIn delay={130}>
        <Card>
          <View style={styles.overviewHead}>
            <Txt variant="h3">Today&apos;s progress</Txt>
            <Txt variant="small" color={colors.muted}>
              You are on track
            </Txt>
          </View>
          <View style={styles.statGrid}>
            <Stat
              icon="flame"
              label="Calories"
              value={`${d.caloriesEaten.toLocaleString()}`}
              sub={`of ${d.calorieTarget.toLocaleString()}`}
              progress={d.caloriesEaten / d.calorieTarget}
            />
            <Stat
              icon="water"
              label="Water"
              value={`${d.waterGlasses}`}
              sub={`of ${d.waterTarget} glasses`}
              progress={d.waterGlasses / d.waterTarget}
            />
            <Stat icon="dumbbell" label="Workout" value={`${d.workoutMinutes}`} sub="minutes" progress={0.62} />
            <Stat icon="target" label="Streak" value={`${d.streak}`} sub="days" progress={0.8} />
          </View>
        </Card>
      </FadeIn>

      {/* Recommendation-style plan rows. */}
      <FadeIn delay={190}>
        <View style={styles.sectionHead}>
          <Txt variant="h2">Today&apos;s plan</Txt>
          <Pressable onPress={() => router.push('/(tabs)/plan')} hitSlop={8} accessibilityRole="button">
            <Txt variant="smallMed" color={colors.muted}>
              See all
            </Txt>
          </Pressable>
        </View>

        <View style={styles.list}>
          {todayPlan.map((item, i) => {
            const badge = KIND_BADGE[item.kind] ?? KIND_BADGE.meal;
            return (
              <FadeIn key={item.id} delay={220 + i * 45}>
                <Pressable
                  onPress={() => (item.kind === 'water' ? addWater(1) : router.push('/(tabs)/plan'))}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.meta}`}
                  style={({ pressed }) => [styles.planRow, pressed && styles.pressed]}
                >
                  <View style={[styles.planIcon, { backgroundColor: badge.bg }]}>
                    <Icon
                      name={item.done ? 'check' : (KIND_ICON[item.kind] ?? 'meal')}
                      size={19}
                      color={badge.fg}
                    />
                  </View>

                  <View style={styles.flex}>
                    <Txt variant="h3" numberOfLines={1}>
                      {item.title}
                    </Txt>
                    <Txt variant="small" color={colors.muted} numberOfLines={1}>
                      {item.subtitle}
                    </Txt>
                    <View style={styles.metaRow}>
                      <Icon name="clock" size={12} color={colors.faint} />
                      <Txt variant="caption" color={colors.faint} numberOfLines={1}>
                        {item.meta}
                      </Txt>
                    </View>
                  </View>

                  <View style={[styles.kindBadge, { backgroundColor: badge.bg }]}>
                    <Txt variant="caption" color={badge.fg} maxFontSizeMultiplier={1}>
                      {item.done ? 'Done' : badge.label}
                    </Txt>
                  </View>
                </Pressable>
              </FadeIn>
            );
          })}
        </View>
      </FadeIn>

      <FadeIn delay={480}>
        <Pressable
          onPress={() => router.push('/(tabs)/ai')}
          accessibilityRole="button"
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card accent style={styles.askRow}>
            <View style={styles.askIcon}>
              <Icon name="ai" size={20} color={colors.onAccent} />
            </View>
            <View style={styles.flex}>
              <Txt variant="h3">Ask your coach</Txt>
              <Txt variant="small" color={colors.textSoft}>
                Meals, training or anything about your goal
              </Txt>
            </View>
            <Icon name="chevron" size={16} color={colors.onAccent} />
          </Card>
        </Pressable>
      </FadeIn>
    </Screen>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  progress,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  progress: number;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statHead}>
        <Icon name={icon} size={14} color={colors.textSoft} />
        <Txt variant="caption" color={colors.muted} numberOfLines={1}>
          {label.toUpperCase()}
        </Txt>
      </View>
      <View style={styles.statValue}>
        <Txt variant={isSmallPhone ? 'metricSm' : 'metric'} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Txt>
        <Txt variant="caption" color={colors.faint} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      <Bar value={progress} height={5} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  flex: { flex: 1 },
  pressed: { opacity: 0.72 },

  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  circleBtn: {
    width: s(44),
    height: s(44),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  avatar: {
    width: s(44),
    height: s(44),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: s(19),
    height: s(19),
    paddingHorizontal: 5,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.bg,
  },

  catchUp: { gap: spacing.xs },
  catchUpHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  catchUpIcon: {
    width: s(34),
    height: s(34),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  catchUpBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: s(38),
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },

  hero: { gap: spacing.md },
  heroTop: { flexDirection: 'row', gap: spacing.md },
  heroCopy: { gap: spacing.xs },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.faint, marginHorizontal: 2 },
  ringTile: {
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
    alignSelf: 'flex-start',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: s(54),
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  continueArrow: {
    width: s(26),
    height: s(26),
    borderRadius: radius.pill,
    borderWidth: 1.4,
    borderColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  overviewHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { gap: 1 },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  list: { gap: spacing.sm },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    minHeight: s(80),
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  planIcon: {
    width: s(46),
    height: s(46),
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },

  askRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  askIcon: {
    width: s(40),
    height: s(40),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
});
