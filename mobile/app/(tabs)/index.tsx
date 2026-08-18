import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bar, Card, FadeIn, Icon, IconName, Ring, Screen, Txt } from '@/components';
import { todayPlan } from '@/data/plan';
import { useDerived, useStore } from '@/state/store';
import { colors, gap, isSmallPhone, radius, s, spacing } from '@/theme';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const KIND_ICON: Record<string, IconName> = {
  meal: 'meal',
  workout: 'dumbbell',
  water: 'water',
};

export default function Home() {
  const profile = useStore((s) => s.profile);
  const addWater = useStore((s) => s.addWater);
  const d = useDerived();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  return (
    <Screen tabBarPadding onRefresh={onRefresh} refreshing={refreshing} contentStyle={styles.content}>
      <FadeIn>
        <Txt variant="small" color={colors.muted}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Txt>
        <Txt variant="h1" numberOfLines={2}>
          {greeting()}, {profile.firstName} 👋
        </Txt>
      </FadeIn>

      <FadeIn delay={70}>
        <Card>
          <View style={styles.progressHead}>
            <View style={styles.flex}>
              <Txt variant="caption" color={colors.muted}>
                TODAY&apos;S PROGRESS
              </Txt>
              <Txt variant="h3" style={styles.tight}>
                You are on track
              </Txt>
            </View>
            <Ring
              value={d.dailyGoal}
              size={s(78)}
              label={`${Math.round(d.dailyGoal * 100)}%`}
              caption="GOAL"
            />
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
            <Stat
              icon="dumbbell"
              label="Workout"
              value={`${d.workoutMinutes}`}
              sub="minutes"
              progress={0.62}
            />
            <Stat icon="target" label="Streak" value={`${d.streak}`} sub="days" progress={0.8} />
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={130}>
        <View style={styles.sectionHead}>
          <Txt variant="h2">Today&apos;s plan</Txt>
          <Pressable onPress={() => router.push('/(tabs)/plan')} hitSlop={8} accessibilityRole="button">
            <Txt variant="smallMed" color={colors.primaryLight}>
              See all
            </Txt>
          </Pressable>
        </View>

        <View style={styles.list}>
          {todayPlan.map((item, i) => (
            <FadeIn key={item.id} delay={160 + i * 45}>
              <Pressable
                onPress={() => (item.kind === 'water' ? addWater(1) : router.push('/(tabs)/plan'))}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.subtitle}. ${item.meta}`}
                style={({ pressed }) => [styles.planRow, pressed && styles.pressed]}
              >
                <View style={[styles.planIcon, item.done && styles.planIconDone]}>
                  <Icon
                    name={item.done ? 'check' : (KIND_ICON[item.kind] ?? 'meal')}
                    size={18}
                    color={item.done ? colors.success : colors.primaryLight}
                  />
                </View>
                <View style={styles.flex}>
                  <Txt variant="h3" numberOfLines={1}>
                    {item.title}
                  </Txt>
                  <Txt variant="small" color={colors.muted} numberOfLines={1}>
                    {item.subtitle}
                  </Txt>
                </View>
                <Txt variant="caption" color={colors.faint} style={styles.planMeta} numberOfLines={2}>
                  {item.meta}
                </Txt>
              </Pressable>
            </FadeIn>
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={420}>
        <Pressable
          onPress={() => router.push('/(tabs)/ai')}
          accessibilityRole="button"
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Card accent style={styles.askRow}>
            <View style={styles.askIcon}>
              <Icon name="ai" size={20} color={colors.primaryLight} />
            </View>
            <View style={styles.flex}>
              <Txt variant="h3">Ask your coach</Txt>
              <Txt variant="small" color={colors.textSoft}>
                Meals, training or anything about your goal
              </Txt>
            </View>
            <Icon name="chevron" size={16} color={colors.muted} />
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
        <Icon name={icon} size={14} color={colors.primaryLight} />
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
  tight: { marginTop: 2 },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '46%',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { gap: 1 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.xs },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  planIcon: {
    width: s(38),
    height: s(38),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  planIconDone: { backgroundColor: colors.successSoft },
  planMeta: { maxWidth: '32%', textAlign: 'right' },
  pressed: { opacity: 0.72 },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  askIcon: {
    width: s(40),
    height: s(40),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
