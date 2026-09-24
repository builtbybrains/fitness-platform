/* Profile tab — account, editable personal stats and targets, reminders,
   sign out. The weight chart moved to the Progress tab. */

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, card as cardStyle, screen, sectionLabel, subtitle, title } from '../../src/design';
import { useAuth } from '../../src/auth';
import { useReminders } from '../../src/useReminders';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text style={{ color: C.muted, fontSize: 13 }}>{label}</Text>
      {children}
    </View>
  );
}

function StatsTargetsCard() {
  const { profile, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [height, setHeight] = useState(profile?.height_cm != null ? String(profile.height_cm) : '');
  const [age, setAge] = useState(profile?.age != null ? String(profile.age) : '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [kcal, setKcal] = useState(String(profile?.kcal_target ?? 2200));
  const [water, setWater] = useState(String(profile?.water_target ?? 8));
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    const h = Number.parseFloat(height.replace(',', '.'));
    const a = Number.parseInt(age, 10);
    const k = Number.parseInt(kcal, 10);
    const w = Number.parseInt(water, 10);

    if (height && (!Number.isFinite(h) || h < 120 || h > 230)) {
      setErr('Height should be 120–230 cm');
      return;
    }
    if (age && (!Number.isFinite(a) || a < 14 || a > 100)) {
      setErr('Age should be 14–100');
      return;
    }
    if (!Number.isFinite(k) || k < 800 || k > 6000) {
      setErr('Calorie target should be 800–6000');
      return;
    }
    if (!Number.isFinite(w) || w < 2 || w > 20) {
      setErr('Water target should be 2–20 glasses');
      return;
    }

    setErr(null);
    setBusy(true);
    const { error } = await saveProfile({
      name: name.trim(),
      height_cm: height ? Math.round(h) : null,
      age: age ? a : null,
      gender,
      kcal_target: k,
      water_target: w,
    });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  const field = {
    color: C.text,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  } as const;

  return (
    <View style={[cardStyle, { gap: 10 }]}>
      <Text style={sectionLabel}>Your stats & targets</Text>

      <View style={{ gap: 8 }}>
        <Text style={{ color: C.muted, fontSize: 12 }}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.muted} style={field} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: C.muted, fontSize: 12 }}>Height (cm)</Text>
          <TextInput value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="178" placeholderTextColor={C.muted} style={field} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: C.muted, fontSize: 12 }}>Age</Text>
          <TextInput value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="32" placeholderTextColor={C.muted} style={field} />
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ color: C.muted, fontSize: 12 }}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { id: 'male', label: 'Male' },
            { id: 'female', label: 'Female' },
          ].map((g) => {
            const on = gender === g.id;
            return (
              <Pressable
                key={g.id}
                onPress={() => setGender(g.id)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center',
                  backgroundColor: on ? C.mint : C.cardStrong,
                  borderWidth: 1,
                  borderColor: on ? C.mint : C.line,
                }}
              >
                <Text style={{ color: on ? '#04120C' : C.text, fontWeight: '700', fontSize: 13 }}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: C.muted, fontSize: 12 }}>Calorie target</Text>
          <TextInput value={kcal} onChangeText={setKcal} keyboardType="number-pad" style={field} />
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          <Text style={{ color: C.muted, fontSize: 12 }}>Water (glasses)</Text>
          <TextInput value={water} onChangeText={setWater} keyboardType="number-pad" style={field} />
        </View>
      </View>

      {err ? <Text style={{ color: C.danger, fontSize: 12 }}>{err}</Text> : null}
      {saved ? <Text style={{ color: C.mint, fontSize: 12 }}>Saved ✓</Text> : null}

      <Pressable
        onPress={save}
        disabled={busy}
        style={({ pressed }) => ({
          backgroundColor: C.mint,
          borderRadius: 12,
          paddingVertical: 13,
          alignItems: 'center',
          opacity: busy || pressed ? 0.8 : 1,
        })}
      >
        <Text style={{ color: '#04120C', fontWeight: '800', fontSize: 15 }}>Save</Text>
      </Pressable>
    </View>
  );
}

function RemindersCard() {
  const { prefs, update, granted, supported } = useReminders();

  if (!supported) {
    return (
      <View style={[cardStyle, { gap: 6 }]}>
        <Text style={sectionLabel}>Reminders</Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>
          Notifications aren't available in Expo Go on Android — install a development build to enable daily water and workout reminders. Your preferences are saved either way.
        </Text>
      </View>
    );
  }

  return (
    <View style={[cardStyle, { gap: 4 }]}>
      <Text style={sectionLabel}>Reminders</Text>
      {granted === false ? (
        <Text style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>
          You'll be asked for notification permission when you enable one.
        </Text>
      ) : null}

      <Row label="Water reminder (daily)">
        <Switch
          value={prefs.water}
          onValueChange={(v) => void update({ water: v })}
          trackColor={{ true: C.mint, false: C.cardStrong }}
          thumbColor={prefs.water ? '#04120C' : C.muted}
        />
      </Row>
      <Row label="Workout reminder (daily)">
        <Switch
          value={prefs.workout}
          onValueChange={(v) => void update({ workout: v })}
          trackColor={{ true: C.mint, false: C.cardStrong }}
          thumbColor={prefs.workout ? '#04120C' : C.muted}
        />
      </Row>
      <Text style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>
        Water at {String(prefs.waterHour).padStart(2, '0')}:00 · workout at{' '}
        {String(prefs.workoutHour).padStart(2, '0')}:00 — local notifications,
        no account needed.
      </Text>
    </View>
  );
}

function ProfileBody() {
  const { profile, email, signOut } = useAuth();

  return (
    <>
      <View style={{ gap: 2 }}>
        <Text style={sectionLabel}>VITAL</Text>
        <Text style={title}>Profile</Text>
        <Text style={subtitle}>Your stats, targets and reminders</Text>
      </View>

      <StatsTargetsCard />

      <RemindersCard />

      <View style={[cardStyle, { gap: 10 }]}>
        <Text style={sectionLabel}>Account</Text>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>
          {profile?.name?.trim() || 'Athlete'}
        </Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>{email ?? 'not signed in — data stays on this device'}</Text>
        <Pressable
          onPress={() => {
            Alert.alert('Sign out', 'You will return to the sign-in screen. Your data stays on this device.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
            ]);
          }}
          style={({ pressed }) => ({
            marginTop: 6,
            borderWidth: 1,
            borderColor: C.danger,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: C.danger, fontWeight: '800' }}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

export default function ProfileTab() {
  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <ProfileBody />
      </ScrollView>
    </SafeAreaView>
  );
}
