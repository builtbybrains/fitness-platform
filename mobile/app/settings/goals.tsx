import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bar, Button, Card, Chip, FadeIn, Header, Input, Screen, Txt } from '@/components';
import { Goal, useDerived, useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

const GOALS: { key: Goal; label: string }[] = [
  { key: 'lose', label: 'Lose weight' },
  { key: 'maintain', label: 'Stay healthy' },
  { key: 'gain', label: 'Build muscle' },
];

export default function Goals() {
  const profile = useStore((s) => s.profile);
  const update = useStore((s) => s.updateProfile);
  const d = useDerived();

  const [weight, setWeight] = useState(String(profile.weightKg));
  const [target, setTarget] = useState(String(profile.targetWeightKg));
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const w = Number(weight);
    const t = Number(target);
    if (!(w >= 35 && w <= 300) || !(t >= 35 && t <= 300)) {
      setError('Enter a weight between 35 and 300 kg.');
      return;
    }
    update({ weightKg: w, targetWeightKg: t, goal });
    router.back();
  };

  return (
    <Screen keyboardAware contentStyle={styles.content}>
      <Header title="Goals" subtitle="Change these and your plan rebuilds." back />

      <FadeIn>
        <Card accent>
          <Txt variant="caption" color={colors.textSoft}>
            CURRENT PROGRESS
          </Txt>
          <View style={styles.metric}>
            <Txt variant="metric">{d.lost.toFixed(1)}</Txt>
            <Txt variant="small" color={colors.textSoft}>
              kg lost of {d.toLose.toFixed(1)} kg
            </Txt>
          </View>
          <Bar value={d.weightProgress} />
        </Card>
      </FadeIn>

      <FadeIn delay={70} style={styles.form}>
        <View style={styles.row}>
          <View style={styles.half}>
            <Input
              label="Current weight (kg)"
              value={weight}
              onChangeText={(v) => { setWeight(v); setError(null); }}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
          <View style={styles.half}>
            <Input
              label="Target weight (kg)"
              value={target}
              onChangeText={(v) => { setTarget(v); setError(null); }}
              keyboardType="decimal-pad"
              maxLength={5}
            />
          </View>
        </View>

        <View>
          <Txt variant="caption" color={colors.textSoft} style={styles.label}>
            GOAL
          </Txt>
          <View style={styles.chips}>
            {GOALS.map((g) => (
              <Chip key={g.key} label={g.label} selected={goal === g.key} onPress={() => setGoal(g.key)} />
            ))}
          </View>
        </View>

        {error ? (
          <Txt variant="small" color={colors.danger}>
            {error}
          </Txt>
        ) : null}

        <Button label="Save goals" onPress={save} />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  metric: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: spacing.xs },
  form: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  label: { marginBottom: spacing.xs, marginLeft: spacing.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
