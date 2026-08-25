import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bar, Button, Card, FadeIn, Icon, Screen, Txt } from '@/components';
import { exercises, macros, todayPlan } from '@/data/plan';
import { useDerived, useStore } from '@/state/store';
import { colors, gap, radius, s, spacing } from '@/theme';

const BUDGET_LABEL = {
  low: 'Budget',
  standard: 'Standard',
  premium: 'Premium',
} as const;

const BUDGET_NOTE = {
  low: 'Meals built from eggs, chicken thighs, lentils, tuna and seasonal veg. Same protein, lower cost.',
  standard: 'Chicken breast, fish twice a week and mixed vegetables.',
  premium: 'Salmon, steak and prawns in rotation, with wider variety across the week.',
} as const;

const TABS = ['Nutrition', 'Training', 'Goals'] as const;
type Tab = (typeof TABS)[number];

export default function Plan() {
  const [tab, setTab] = useState<Tab>('Nutrition');
  const profile = useStore((s) => s.profile);
  const d = useDerived();

  return (
    <Screen tabBarPadding contentStyle={styles.content}>
      <FadeIn>
        <Txt variant="h1">My plan</Txt>
        <Txt variant="small" color={colors.muted}>
          Built around your goal and updated as you log.
        </Txt>
      </FadeIn>

      <FadeIn delay={60}>
        <View style={styles.segment} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              style={[styles.segmentItem, tab === t && styles.segmentActive]}
            >
              <Txt
                variant="smallMed"
                color={tab === t ? colors.onPrimary : colors.muted}
                maxFontSizeMultiplier={1.1}
              >
                {t}
              </Txt>
            </Pressable>
          ))}
        </View>
      </FadeIn>

      {tab === 'Nutrition' && (
        <FadeIn key="n" style={styles.section}>
          <Card>
            <Txt variant="caption" color={colors.muted}>
              DAILY TARGET
            </Txt>
            <View style={styles.targetRow}>
              <Txt variant="metric">{d.calorieTarget.toLocaleString()}</Txt>
              <Txt variant="small" color={colors.muted}>
                kcal
              </Txt>
            </View>
            <Bar value={d.caloriesEaten / d.calorieTarget} />
            <Txt variant="small" color={colors.muted} style={styles.spaced}>
              {d.caloriesEaten.toLocaleString()} eaten ·{' '}
              {(d.calorieTarget - d.caloriesEaten).toLocaleString()} left
            </Txt>
          </Card>

          <Card>
            <Txt variant="h3" style={styles.cardTitle}>
              Macros
            </Txt>
            <View style={styles.macros}>
              {macros.map((m) => (
                <View key={m.label} style={styles.macro}>
                  <View style={styles.macroHead}>
                    <Txt variant="smallMed">{m.label}</Txt>
                    <Txt variant="small" color={colors.muted}>
                      {m.value} / {m.target}
                      {m.unit}
                    </Txt>
                  </View>
                  <Bar value={m.value / m.target} height={6} />
                </View>
              ))}
            </View>
          </Card>

          <Card padded={false}>
            <Txt variant="h3" style={styles.listTitle}>
              Today&apos;s meals
            </Txt>
            {todayPlan
              .filter((p) => p.kind === 'meal')
              .map((meal, i, arr) => (
                <View
                  key={meal.id}
                  style={[styles.mealRow, i < arr.length - 1 && styles.rowDivider]}
                >
                  <View style={styles.mealIcon}>
                    <Icon name="meal" size={17} color={colors.primaryLight} />
                  </View>
                  <View style={styles.flex}>
                    <Txt variant="bodyMed" numberOfLines={1}>
                      {meal.title}
                    </Txt>
                    <Txt variant="small" color={colors.muted} numberOfLines={2}>
                      {meal.subtitle}
                    </Txt>
                    <Txt variant="caption" color={colors.faint}>
                      {meal.meta}
                    </Txt>
                  </View>
                </View>
              ))}
          </Card>

          <Card accent>
            <Txt variant="caption" color={colors.textSoft}>
              FOOD BUDGET
            </Txt>
            <Txt variant="h3" style={styles.tight}>
              {BUDGET_LABEL[profile.budget]}
            </Txt>
            <Txt variant="small" color={colors.textSoft}>
              {BUDGET_NOTE[profile.budget]}
            </Txt>
          </Card>

          <Button
            label="Ask for a different meal"
            variant="secondary"
            onPress={() => router.push('/(tabs)/ai')}
          />
        </FadeIn>
      )}

      {tab === 'Training' && (
        <FadeIn key="t" style={styles.section}>
          <Card>
            <Txt variant="caption" color={colors.muted}>
              TODAY
            </Txt>
            <Txt variant="h2" style={styles.tight}>
              Upper body strength
            </Txt>
            <Txt variant="small" color={colors.muted}>
              32 minutes · 6 exercises · {profile.activity} level
            </Txt>
            <View style={styles.spacedTop}>
              <Bar value={3 / 6} />
              <Txt variant="small" color={colors.muted} style={styles.spaced}>
                3 of 6 complete
              </Txt>
            </View>
          </Card>

          <Card padded={false}>
            {exercises.map((ex, i) => (
              <View
                key={ex.id}
                style={[styles.exRow, i < exercises.length - 1 && styles.rowDivider]}
              >
                <View style={[styles.exIdx, ex.done && styles.exIdxDone]}>
                  {ex.done ? (
                    <Icon name="check" size={15} color={colors.success} />
                  ) : (
                    <Txt variant="caption" color={colors.primaryLight}>
                      {i + 1}
                    </Txt>
                  )}
                </View>
                <View style={styles.flex}>
                  <Txt variant="bodyMed" numberOfLines={1}>
                    {ex.name}
                  </Txt>
                  <Txt variant="small" color={colors.muted}>
                    {ex.detail}
                  </Txt>
                </View>
              </View>
            ))}
          </Card>

          <Button label="Give me a different workout" variant="secondary" onPress={() => router.push('/(tabs)/ai')} />
        </FadeIn>
      )}

      {tab === 'Goals' && (
        <FadeIn key="g" style={styles.section}>
          <Card accent>
            <Txt variant="caption" color={colors.textSoft}>
              MAIN GOAL
            </Txt>
            <Txt variant="h2" style={styles.tight}>
              {profile.goal === 'lose'
                ? `Lose ${(profile.startWeightKg - profile.targetWeightKg).toFixed(0)} kg`
                : profile.goal === 'gain'
                  ? 'Build muscle'
                  : 'Stay healthy'}
            </Txt>
            <View style={styles.spacedTop}>
              <Bar value={d.weightProgress} />
            </View>
            <View style={styles.legend}>
              <Txt variant="caption" color={colors.textSoft}>
                Start {profile.startWeightKg} kg
              </Txt>
              <Txt variant="caption" color={colors.textSoft}>
                Now {profile.weightKg} kg
              </Txt>
              <Txt variant="caption" color={colors.textSoft}>
                Goal {profile.targetWeightKg} kg
              </Txt>
            </View>
          </Card>

          <Card>
            <Txt variant="h3" style={styles.cardTitle}>
              Your targets
            </Txt>
            <Row label="Daily calories" value={`${d.calorieTarget.toLocaleString()} kcal`} />
            <Row label="Protein" value="150 g" />
            <Row label="Water" value={`${d.waterTarget} glasses`} />
            <Row label="Training" value="4 sessions a week" />
            <Row label="Weekly pace" value="0.5 kg" last />
          </Card>

          <Button label="Edit my goals" variant="secondary" onPress={() => router.push('/settings/goals')} />
        </FadeIn>
      )}
    </Screen>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.kvRow, !last && styles.rowDivider]}>
      <Txt variant="body" color={colors.textSoft} style={styles.flex}>
        {label}
      </Txt>
      <Txt variant="bodyMed">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  flex: { flex: 1 },
  tight: { marginTop: 2 },
  spaced: { marginTop: spacing.xs },
  spacedTop: { marginTop: spacing.md },
  section: { gap: spacing.sm },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    minHeight: s(40),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  segmentActive: { backgroundColor: colors.primary },
  targetRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: spacing.xs },
  cardTitle: { marginBottom: spacing.sm },
  macros: { gap: spacing.sm },
  macro: { gap: 6 },
  macroHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listTitle: { padding: spacing.md, paddingBottom: spacing.xs },
  mealRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, alignItems: 'center' },
  mealIcon: {
    width: s(36),
    height: s(36),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  exRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, alignItems: 'center' },
  exIdx: {
    width: s(32),
    height: s(32),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  exIdxDone: { backgroundColor: colors.successSoft },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs, gap: spacing.xs },
  kvRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
});
