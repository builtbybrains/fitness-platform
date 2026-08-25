import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Bar, Button, Card, Chip, FadeIn, Input, Screen, Txt } from '@/components';
import { Activity, Budget, Goal, useStore } from '@/state/store';
import { colors, gap, spacing } from '@/theme';

const GOALS: { key: Goal; label: string; detail: string }[] = [
  { key: 'lose', label: 'Lose weight', detail: 'Steady fat loss you can keep off' },
  { key: 'maintain', label: 'Stay healthy', detail: 'Hold your weight, build the habit' },
  { key: 'gain', label: 'Build muscle', detail: 'Lean gain with strength training' },
];

const ACTIVITY: { key: Activity; label: string; detail: string }[] = [
  { key: 'sedentary', label: 'Mostly sitting', detail: 'Desk job, little movement' },
  { key: 'light', label: 'Lightly active', detail: 'A walk or two most days' },
  { key: 'moderate', label: 'Moderately active', detail: 'Training 3 to 4 times a week' },
  { key: 'active', label: 'Very active', detail: 'Training most days, on your feet' },
];

const DIETS = ['High protein', 'Balanced', 'Vegetarian', 'Vegan', 'Low carb', 'Mediterranean', 'Quick prep', 'Budget'];
const TRAINING = ['Strength', 'Cardio', 'Home workouts', 'Gym', 'Bodyweight', 'Mobility', 'Running', 'Low impact'];

const BUDGETS: { key: Budget; label: string; detail: string }[] = [
  { key: 'low', label: '$  Budget', detail: 'Eggs, chicken thighs, lentils, seasonal veg' },
  { key: 'standard', label: '$$  Standard', detail: 'Chicken breast, fish twice a week, mixed veg' },
  { key: 'premium', label: '$$$  Premium', detail: 'Salmon, steak, prawns, wider variety' },
];

const CONDITIONS = ['Diabetes', 'High blood pressure', 'High cholesterol', 'Thyroid', 'PCOS', 'Asthma', 'Heart condition', 'None'];
const INJURIES = ['Lower back', 'Knee', 'Shoulder', 'Wrist', 'Neck', 'Ankle', 'Hip', 'None'];
const ALLERGIES = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy', 'None'];

const STEPS = ['About you', 'Your goal', 'How active', 'Your health', 'Food budget', 'Preferences'] as const;

export default function Onboarding() {
  const complete = useStore((s) => s.completeOnboarding);
  const profile = useStore((s) => s.profile);

  const [step, setStep] = useState(0);
  const [height, setHeight] = useState(String(profile.heightCm));
  const [weight, setWeight] = useState(String(profile.weightKg));
  const [target, setTarget] = useState(String(profile.targetWeightKg));
  const [age, setAge] = useState(String(profile.age));
  const [goal, setGoal] = useState<Goal>(profile.goal);
  const [activity, setActivity] = useState<Activity>(profile.activity);
  const [diet, setDiet] = useState<string[]>(profile.diet);
  const [training, setTraining] = useState<string[]>(profile.training);
  const [budget, setBudget] = useState<Budget>(profile.budget);
  const [goalDelta, setGoalDelta] = useState(String(profile.goalDeltaKg));
  const [conditions, setConditions] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string[]>([]);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [medications, setMedications] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setMedical = useStore((s) => s.setMedical);

  const numbersValid = useMemo(() => {
    const h = Number(height);
    const w = Number(weight);
    const t = Number(target);
    const a = Number(age);
    return h >= 120 && h <= 230 && w >= 35 && w <= 300 && t >= 35 && t <= 300 && a >= 13 && a <= 100;
  }, [height, weight, target, age]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const next = () => {
    if (step === 0 && !numbersValid) {
      setError('Check your height, weight, target and age.');
      return;
    }
    if (step === 3 && conditions.length === 0 && injuries.length === 0 && allergies.length === 0) {
      setError('Pick at least one option, or choose None, so I know what to work around.');
      return;
    }
    if (step === 5 && diet.length === 0) {
      setError('Pick at least one dietary preference.');
      return;
    }
    setError(null);

    if (step < STEPS.length - 1) {
      setStep((v) => v + 1);
      return;
    }

    const clean = (list: string[]) => list.filter((v) => v !== 'None');
    setMedical({
      conditions: clean(conditions),
      injuries: clean(injuries),
      allergies: clean(allergies),
      medications: medications.trim(),
      completed: true,
    });
    complete({
      heightCm: Number(height),
      weightKg: Number(weight),
      targetWeightKg: Number(target),
      age: Number(age),
      goal,
      activity,
      diet,
      training,
      budget,
      goalDeltaKg: Number(goalDelta) || 10,
    });
    router.replace('/(tabs)');
  };

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.head}>
        <Txt variant="caption" color={colors.muted}>
          STEP {step + 1} OF {STEPS.length}
        </Txt>
        <Txt variant="h1">{STEPS[step]}</Txt>
        <Bar value={(step + 1) / STEPS.length} height={5} />
      </View>

      {step === 0 && (
        <FadeIn key="s0" style={styles.body}>
          <Txt variant="small" color={colors.muted}>
            We only ask for what genuinely changes your plan.
          </Txt>
          <View style={styles.row}>
            <View style={styles.half}>
              <Input label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" maxLength={3} />
            </View>
            <View style={styles.half}>
              <Input label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={3} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.half}>
              <Input label="Current weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" maxLength={5} />
            </View>
            <View style={styles.half}>
              <Input label="Target weight (kg)" value={target} onChangeText={setTarget} keyboardType="decimal-pad" maxLength={5} />
            </View>
          </View>
        </FadeIn>
      )}

      {step === 1 && (
        <FadeIn key="s1" style={styles.body}>
          {GOALS.map((g) => (
            <Card key={g.key} accent={goal === g.key} style={styles.option}>
              <Chip label={g.label} selected={goal === g.key} onPress={() => setGoal(g.key)} />
              <Txt variant="small" color={colors.muted} style={styles.optionDetail}>
                {g.detail}
              </Txt>
            </Card>
          ))}

          {goal !== 'maintain' ? (
            <View style={styles.sectionGap}>
              <Input
                label={goal === 'gain' ? 'How many kg to gain' : 'How many kg to lose'}
                value={goalDelta}
                onChangeText={setGoalDelta}
                keyboardType="decimal-pad"
                maxLength={4}
              />
            </View>
          ) : null}
        </FadeIn>
      )}

      {step === 2 && (
        <FadeIn key="s2" style={styles.body}>
          {ACTIVITY.map((a) => (
            <Card key={a.key} accent={activity === a.key} style={styles.option}>
              <Chip label={a.label} selected={activity === a.key} onPress={() => setActivity(a.key)} />
              <Txt variant="small" color={colors.muted} style={styles.optionDetail}>
                {a.detail}
              </Txt>
            </Card>
          ))}
        </FadeIn>
      )}

      {step === 3 && (
        <FadeIn key="s3" style={styles.body}>
          <Txt variant="small" color={colors.muted}>
            This stays on your device and shapes every plan I build. Choose None where
            nothing applies.
          </Txt>

          <Txt variant="h3" style={styles.sectionGap}>Medical conditions</Txt>
          <View style={styles.chips}>
            {CONDITIONS.map((c) => (
              <Chip key={c} label={c} selected={conditions.includes(c)} onPress={() => toggle(conditions, setConditions, c)} />
            ))}
          </View>

          <Txt variant="h3" style={styles.sectionGap}>Injuries to work around</Txt>
          <View style={styles.chips}>
            {INJURIES.map((c) => (
              <Chip key={c} label={c} selected={injuries.includes(c)} onPress={() => toggle(injuries, setInjuries, c)} />
            ))}
          </View>

          <Txt variant="h3" style={styles.sectionGap}>Food allergies</Txt>
          <View style={styles.chips}>
            {ALLERGIES.map((c) => (
              <Chip key={c} label={c} selected={allergies.includes(c)} onPress={() => toggle(allergies, setAllergies, c)} />
            ))}
          </View>

          <View style={styles.sectionGap}>
            <Input
              label="Medication (optional)"
              value={medications}
              onChangeText={setMedications}
              placeholder="Anything I should know about"
            />
          </View>

          <Txt variant="caption" color={colors.faint}>
            VITAL is not a medical service. Check with your doctor before starting a new
            diet or training programme.
          </Txt>
        </FadeIn>
      )}

      {step === 4 && (
        <FadeIn key="s4" style={styles.body}>
          <Txt variant="small" color={colors.muted}>
            Meals are built to fit this. You can change it any time.
          </Txt>
          {BUDGETS.map((b) => (
            <Card key={b.key} accent={budget === b.key} style={styles.option}>
              <Chip label={b.label} selected={budget === b.key} onPress={() => setBudget(b.key)} />
              <Txt variant="small" color={colors.muted} style={styles.optionDetail}>
                {b.detail}
              </Txt>
            </Card>
          ))}
        </FadeIn>
      )}

      {step === 5 && (
        <FadeIn key="s5" style={styles.body}>
          <Txt variant="h3">Food</Txt>
          <View style={styles.chips}>
            {DIETS.map((d) => (
              <Chip key={d} label={d} selected={diet.includes(d)} onPress={() => toggle(diet, setDiet, d)} />
            ))}
          </View>
          <Txt variant="h3" style={styles.sectionGap}>
            Training
          </Txt>
          <View style={styles.chips}>
            {TRAINING.map((t) => (
              <Chip key={t} label={t} selected={training.includes(t)} onPress={() => toggle(training, setTraining, t)} />
            ))}
          </View>
        </FadeIn>
      )}

      <View style={styles.footer}>
        {error ? (
          <Txt variant="small" color={colors.danger} center>
            {error}
          </Txt>
        ) : null}
        <Button label={step === STEPS.length - 1 ? 'Build my plan' : 'Continue'} onPress={next} />
        {step > 0 ? (
          <Button label="Back" variant="ghost" compact onPress={() => { setError(null); setStep((v) => v - 1); }} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: gap.lg, paddingTop: spacing.lg },
  head: { gap: spacing.xs },
  body: { gap: spacing.sm, flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  option: { gap: spacing.xs, alignItems: 'flex-start' },
  optionDetail: { paddingHorizontal: spacing.xxs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sectionGap: { marginTop: spacing.sm },
  footer: { gap: spacing.sm, marginTop: spacing.lg },
});
