/* First-run personal stats: height, age, gender. Saves to the profile and
   suggests a calorie target from the Mifflin-St Jeor estimate. */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, screen, sectionLabel, title } from '../../src/design';
import { useAuth } from '../../src/auth';
import { tdeeSuggestion } from '../../src/stats';
import { fetchWeights } from '../../src/data';

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

export default function StatsScreen() {
  const { profile, saveProfile, userId } = useAuth();
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<number | null>(null);

  // A calorie suggestion needs a weight; pull the latest logged one.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchWeights(userId).then(({ entries }) => {
      if (!alive) return;
      const latest = entries?.length ? entries[entries.length - 1].kg : null;
      const h = Number.parseFloat(height.replace(',', '.'));
      const a = Number.parseInt(age, 10);
      setSuggestion(
        tdeeSuggestion({ gender, age: Number.isFinite(a) ? a : null, height_cm: Number.isFinite(h) ? h : null, latestKg: latest }),
      );
    });
    return () => {
      alive = false;
    };
  }, [userId, height, age, gender]);

  async function submit() {
    const h = Number.parseFloat(height.replace(',', '.'));
    const a = Number.parseInt(age, 10);
    if (!Number.isFinite(h) || h < 120 || h > 230) {
      setErr('Height should be between 120 and 230 cm');
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
    await saveProfile({
      height_cm: Math.round(h),
      age: a,
      gender,
      ...(suggestion != null ? { kcal_target: suggestion } : {}),
    });
    setBusy(false);
    router.replace('/(tabs)');
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

  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16, paddingBottom: 40 }}>
        <View style={{ gap: 4 }}>
          <Text style={sectionLabel}>VITAL · SETUP</Text>
          <Text style={title}>About you</Text>
          <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
            Three quick facts so your targets fit you — not the average person.
          </Text>
        </View>

        <View style={[cardStyle, { gap: 14 }]}>
          <View style={{ gap: 8 }}>
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
              Used only to calibrate calorie math — never shared.
            </Text>
          </View>
        </View>

        {suggestion != null ? (
          <View style={[cardStyle, { gap: 6 }]}>
            <Text style={sectionLabel}>Suggested target</Text>
            <Text style={{ color: C.text, fontSize: 15, lineHeight: 22 }}>
              Around <Text style={{ color: C.mint, fontWeight: '800' }}>{suggestion} kcal</Text> a
              day for you, based on your stats and training load. You can change it anytime in Profile.
            </Text>
          </View>
        ) : null}

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
            {busy ? 'Saving…' : 'Save and start'}
          </Text>
        </Pressable>

        <Pressable onPress={skip}>
          <Text style={{ color: C.muted, textAlign: 'center', fontSize: 14 }}>
            I'll do this later
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
