/* First-run personal stats: height, weight, age, gender. Saves the profile,
   then asks the AI planner for targets + a full week plan (rules-based
   fallback when the planner is unavailable). */

import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, screen, sectionLabel, title } from '../../src/design';
import { useAuth } from '../../src/auth';
import { usePlan } from '../../src/planStore';

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

export default function StatsScreen() {
  const { profile, saveProfile, userId } = useAuth();
  const { regenerate, generating } = usePlan();
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [weight, setWeight] = useState(profile?.weight_kg ? String(profile.weight_kg) : '');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'form' | 'saving' | 'planning'>('form');

  async function submit() {
    const h = Number.parseFloat(height.replace(',', '.'));
    const w = Number.parseFloat(weight.replace(',', '.'));
    const a = Number.parseInt(age, 10);
    if (!Number.isFinite(h) || h < 120 || h > 230) {
      setErr('Height should be between 120 and 230 cm');
      return;
    }
    if (!Number.isFinite(w) || w < 30 || w > 300) {
      setErr('Weight should be between 30 and 300 kg');
      return;
    }
    if (!Number.isFinite(a) || a < 14 || a > 100) {
      setErr('Age should be between 14 and 100');
      return;
    }
    if (!gender) {
      setErr('Pick one to calibrate your targets');
      return;
    }
    setErr(null);
    setBusy(true);
    setPhase('planning');

    // The AI planner recomputes targets from these stats; saving them first
    // (weight also seeds the weight log) keeps every screen consistent.
    await saveProfile({
      height_cm: Math.round(h),
      weight_kg: Math.round(w * 10) / 10,
      age: a,
      gender,
    });

    let planOk = false;
    if (userId) {
      const res = await regenerate();
      planOk = res.ok;
    }
    setBusy(false);
    setPhase('form');
    router.replace('/(tabs)');
    if (!planOk) {
      // The fallback week is already in place; targets stay at profile defaults.
    }
  }

  function skip() {
    router.replace('/(tabs)');
  }

  const field = {
    color: C.text,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
  } as const;

  const planning = phase === 'planning';

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}>
        <View style={{ gap: 4 }}>
          <Text style={sectionLabel}>VITAL · SETUP</Text>
          <Text style={title}>About you</Text>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
            Four quick facts. Your coach uses them to set your calorie and water
            targets and build your first training week — no manual math.
          </Text>
        </View>

        <View style={[cardStyle, { gap: 14 }]}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Height (cm)</Text>
              <TextInput
                value={height}
                onChangeText={setHeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 178"
                placeholderTextColor={C.muted}
                style={field}
              />
            </View>
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Weight (kg)</Text>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="e.g. 74.5"
                placeholderTextColor={C.muted}
                style={field}
              />
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Age</Text>
            <TextInput
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="e.g. 32"
              placeholderTextColor={C.muted}
              style={field}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Gender</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {GENDERS.map((g) => {
                const on = gender === g.id;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => setGender(g.id)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: on ? C.mint : C.cardStrong,
                      borderWidth: 1,
                      borderColor: on ? C.mint : C.line,
                    }}
                  >
                    <Text style={{ color: on ? '#04120C' : C.text, fontWeight: '700' }}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              Used only to calibrate your plan — never shared.
            </Text>
          </View>
        </View>

        {err ? <Text style={{ color: C.danger, fontSize: 13 }}>{err}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          style={({ pressed }) => ({
            backgroundColor: C.mint,
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
            opacity: busy || pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: '#04120C', fontWeight: '800', fontSize: 16 }}>
            {planning ? 'Building your plan…' : 'Save and build my plan'}
          </Text>
        </Pressable>

        {planning ? (
          <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center' }}>
            Your AI coach is setting targets and scheduling your week — this takes a moment.
          </Text>
        ) : (
          <Pressable onPress={skip}>
            <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14 }}>
              I'll do this later
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
