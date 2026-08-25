import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, FadeIn, Header, Screen, Txt } from '@/components';
import { Activity, useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

const DIETS = ['High protein', 'Balanced', 'Vegetarian', 'Vegan', 'Low carb', 'Mediterranean', 'Quick prep', 'Budget'];
const TRAINING = ['Strength', 'Cardio', 'Home workouts', 'Gym', 'Bodyweight', 'Mobility', 'Running', 'Low impact'];
const ACTIVITY: { key: Activity; label: string }[] = [
  { key: 'sedentary', label: 'Mostly sitting' },
  { key: 'light', label: 'Lightly active' },
  { key: 'moderate', label: 'Moderately active' },
  { key: 'active', label: 'Very active' },
];

export default function Preferences() {
  const profile = useStore((s) => s.profile);
  const update = useStore((s) => s.updateProfile);

  const [diet, setDiet] = useState<string[]>(profile.diet);
  const [training, setTraining] = useState<string[]>(profile.training);
  const [activity, setActivity] = useState<Activity>(profile.activity);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = () => {
    update({ diet, training, activity });
    router.back();
  };

  return (
    <Screen contentStyle={styles.content}>
      <Header title="Preferences" subtitle="Your plan respects these permanently." back />

      <FadeIn style={styles.section}>
        <Txt variant="h3">Food</Txt>
        <View style={styles.chips}>
          {DIETS.map((d) => (
            <Chip key={d} label={d} selected={diet.includes(d)} onPress={() => toggle(diet, setDiet, d)} />
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={70} style={styles.section}>
        <Txt variant="h3">Training</Txt>
        <View style={styles.chips}>
          {TRAINING.map((t) => (
            <Chip key={t} label={t} selected={training.includes(t)} onPress={() => toggle(training, setTraining, t)} />
          ))}
        </View>
      </FadeIn>

      <FadeIn delay={130} style={styles.section}>
        <Txt variant="h3">Activity level</Txt>
        <View style={styles.chips}>
          {ACTIVITY.map((a) => (
            <Chip key={a.key} label={a.label} selected={activity === a.key} onPress={() => setActivity(a.key)} />
          ))}
        </View>
        <Txt variant="small" color={colors.muted}>
          This sets your daily calorie target.
        </Txt>
      </FadeIn>

      <Button label="Save preferences" onPress={save} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.md },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  save: { marginTop: spacing.lg },
});
