import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bar, Card, FadeIn, Icon, Ring, Screen, Txt, WeightChart } from '@/components';
import { consistency, weeklyWeights } from '@/data/plan';
import { useDerived, useStore } from '@/state/store';
import { colors, gap, radius, s, spacing } from '@/theme';

export default function Progress() {
  const profile = useStore((s) => s.profile);
  const d = useDerived();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, []);

  const remaining = Math.max(0, profile.weightKg - profile.targetWeightKg);

  return (
    <Screen tabBarPadding onRefresh={onRefresh} refreshing={refreshing} contentStyle={styles.content}>
      <FadeIn>
        <Txt variant="h1">Progress</Txt>
        <Txt variant="small" color={colors.muted}>
          Twelve weeks in and still moving.
        </Txt>
      </FadeIn>

      <FadeIn delay={60}>
        <Card>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Txt variant="caption" color={colors.muted}>
                WEIGHT LOST
              </Txt>
              <View style={styles.metricRow}>
                <Txt variant="metric">{d.lost.toFixed(1)}</Txt>
                <Txt variant="small" color={colors.muted}>
                  kg
                </Txt>
              </View>
              <Txt variant="small" color={colors.muted}>
                {remaining.toFixed(1)} kg to your target
              </Txt>
            </View>
            <Ring
              value={d.weightProgress}
              size={s(84)}
              label={`${Math.round(d.weightProgress * 100)}%`}
              caption="OF GOAL"
            />
          </View>

          <View style={styles.legend}>
            <Legend label="Start" value={`${profile.startWeightKg} kg`} />
            <Legend label="Now" value={`${profile.weightKg} kg`} accent />
            <Legend label="Target" value={`${profile.targetWeightKg} kg`} />
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={120}>
        <Card>
          <Txt variant="h3">Weekly progress</Txt>
          <Txt variant="small" color={colors.muted} style={styles.spaced}>
            Your weight over the last {weeklyWeights.length} weeks
          </Txt>
          <View style={styles.chartWrap}>
            <WeightChart values={weeklyWeights} />
          </View>
        </Card>
      </FadeIn>

      <FadeIn delay={180}>
        <View style={styles.duo}>
          <Card style={styles.duoCard}>
            <View style={styles.iconRow}>
              <Icon name="flame" size={16} color={colors.primaryLight} />
              <Txt variant="caption" color={colors.muted}>
                STREAK
              </Txt>
            </View>
            <Txt variant="metric">{d.streak}</Txt>
            <Txt variant="small" color={colors.muted}>
              days in a row
            </Txt>
          </Card>

          <Card style={styles.duoCard}>
            <View style={styles.iconRow}>
              <Icon name="water" size={16} color={colors.primaryLight} />
              <Txt variant="caption" color={colors.muted}>
                WATER TODAY
              </Txt>
            </View>
            <Txt variant="metric">
              {d.waterGlasses}
              <Txt variant="small" color={colors.muted}>
                {' '}
                / {d.waterTarget}
              </Txt>
            </Txt>
            <Txt variant="small" color={colors.muted}>
              glasses
            </Txt>
          </Card>
        </View>
      </FadeIn>

      <FadeIn delay={240}>
        <Card>
          <Txt variant="h3" style={styles.spacedBottom}>
            Consistency
          </Txt>
          <View style={styles.rows}>
            {consistency.map((c) => (
              <View key={c.label} style={styles.consRow}>
                <View style={styles.consHead}>
                  <Txt variant="bodyMed">{c.label}</Txt>
                  <Txt variant="smallMed" color={colors.primaryLight}>
                    {Math.round(c.value * 100)}%
                  </Txt>
                </View>
                <Bar value={c.value} height={6} />
                <Txt variant="caption" color={colors.faint}>
                  {c.detail}
                </Txt>
              </View>
            ))}
          </View>
        </Card>
      </FadeIn>
    </Screen>
  );
}

function Legend({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <Txt variant="caption" color={colors.faint}>
        {label.toUpperCase()}
      </Txt>
      <Txt variant="smallMed" color={accent ? colors.primaryLight : colors.text}>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  legendItem: { gap: 2 },
  spaced: { marginTop: 2 },
  spacedBottom: { marginBottom: spacing.sm },
  chartWrap: { marginTop: spacing.md },
  duo: { flexDirection: 'row', gap: spacing.sm },
  duoCard: { flex: 1, gap: 2, borderRadius: radius.lg },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.xs },
  rows: { gap: spacing.md },
  consRow: { gap: 6 },
  consHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
