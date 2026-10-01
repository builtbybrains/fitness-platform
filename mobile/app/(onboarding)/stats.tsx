/* First-run personal stats: height, weight, age, gender, and a required
   acknowledgement. Saves the profile, then (with an account) asks the AI
   planner for targets and a full week. Without an account the built-in
   plan is used. */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { usePlan } from '../../src/planStore';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { Button, LinkButton } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { CheckBox, Notice } from '../../src/components/Bits';

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

const ACKNOWLEDGEMENT =
  "I'm 18 or older. BUILT gives general fitness and nutrition guidance, not medical advice. If I have a medical condition, am pregnant, or have a history of disordered eating, I'll check with a doctor first.";

export default function StatsScreen() {
  const { profile, saveProfile, session } = useAuth();
  const { regenerate } = usePlan();
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [weight, setWeight] = useState(profile?.weight_kg ? String(profile.weight_kg) : '');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'saving' | 'planning'>('form');

  async function submit() {
    const h = Number.parseFloat(height.replace(',', '.'));
    const w = Number.parseFloat(weight.replace(',', '.'));
    const a = Number.parseInt(age, 10);
    if (!Number.isFinite(h) || h < 120 || h > 230) {
      setErr('Enter a height between 120 and 230 cm.');
      return;
    }
    if (!Number.isFinite(w) || w < 30 || w > 300) {
      setErr('Enter a weight between 30 and 300 kg.');
      return;
    }
    if (!Number.isFinite(a) || a < 18 || a > 100) {
      setErr(Number.isFinite(a) && a < 18 ? 'BUILT is for people 18 and older.' : 'Enter an age between 18 and 100.');
      return;
    }
    if (!gender) {
      setErr('Choose one so your targets are calibrated.');
      return;
    }
    if (!ack) {
      setErr('Tick the box to confirm before you continue.');
      return;
    }
    setErr(null);
    setPhase('saving');

    // The planner recomputes targets from these stats; saving them first
    // (weight also seeds the weight log) keeps every screen consistent.
    const saved = await saveProfile({
      height_cm: Math.round(h),
      weight_kg: Math.round(w * 10) / 10,
      age: a,
      gender,
    });
    if (saved.error) {
      setErr(saved.error);
      setPhase('form');
      return;
    }

    // Only an account can reach the planner; without one the built-in
    // plan is already in place.
    if (session) {
      setPhase('planning');
      await regenerate();
    }
    setPhase('form');
    router.replace('/(tabs)');
  }

  function skip() {
    if (!ack) {
      setErr('Tick the box to confirm before you continue.');
      return;
    }
    router.replace('/(tabs)');
  }

  const working = phase !== 'form';

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 48, maxWidth: 560, width: '100%', alignSelf: 'center' }}
        >
          <View style={{ gap: 16 }}>
            <BuiltMark size={32} />
            <View style={{ gap: 8 }}>
              <Text style={T.h1} accessibilityRole="header">
                About you
              </Text>
              <Text style={[T.body, { color: C.muted }]}>
                Four quick facts. Your coach uses them to set your calorie and water targets and build your first week.
              </Text>
            </View>
          </View>

          <View style={[cardStyle, { gap: 16 }]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="e.g. 178" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="e.g. 74.5" />
              </View>
            </View>

            <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="e.g. 32" hint="18 or older." />

            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }} nativeID="genderLabel">
                Gender
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, padding: 4, backgroundColor: C.surface, borderRadius: R.pill }} accessibilityRole="radiogroup">
                {GENDERS.map((g) => {
                  const on = gender === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => setGender(g.id)}
                      accessibilityRole="radio"
                      accessibilityLabel={g.label}
                      accessibilityState={{ selected: on, checked: on }}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: R.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? C.green : 'transparent',
                      }}
                    >
                      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: on ? C.onGreen : C.text }}>{g.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={T.small}>Used only to calibrate your plan. Never shared.</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setAck((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ack }}
            accessibilityLabel={ACKNOWLEDGEMENT}
            style={({ pressed }) => ({
              flexDirection: 'row',
              gap: 14,
              alignItems: 'flex-start',
              padding: 16,
              borderRadius: R.tile,
              borderWidth: 1,
              borderColor: ack ? C.greenBorder : C.lineStrong,
              backgroundColor: ack ? C.greenTint : pressed ? C.surface : 'transparent',
            })}
          >
            <CheckBox checked={ack} />
            <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: C.stone }}>{ACKNOWLEDGEMENT}</Text>
          </Pressable>

          {err ? <Notice tone="error">{err}</Notice> : null}

          <View style={{ gap: 8 }}>
            <Button
              label={phase === 'planning' ? 'Building your plan' : phase === 'saving' ? 'Saving' : 'Save and build my plan'}
              onPress={submit}
              busy={working}
              accessibilityHint={ack ? undefined : 'Tick the confirmation box first.'}
            />
            {phase === 'planning' ? (
              <Text style={[T.small, { textAlign: 'center' }]}>Your coach is setting targets and scheduling your week.</Text>
            ) : (
              <LinkButton onPress={skip} accessibilityLabel="I'll do this later">
                I&apos;ll do this later
              </LinkButton>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
