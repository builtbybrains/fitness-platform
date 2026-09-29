/* Profile: account, today's weigh-in, personal stats, coach targets,
   reminders and sign out. */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { usePlan } from '../../src/planStore';
import { useReminders } from '../../src/useReminders';
import { showConfirm } from '../../src/lib/dialog';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { Notice, ScreenHeader } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';

type Feedback = { tone: 'error' | 'success'; text: string } | null;

function useFlash(): [Feedback, (f: Feedback, ms?: number) => void] {
  const [fb, setFb] = useState<Feedback>(null);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  return [
    fb,
    (f, ms = 3500) => {
      if (timer) clearTimeout(timer);
      setFb(f);
      if (f?.tone === 'success') setTimer(setTimeout(() => setFb(null), ms));
    },
  ];
}

function AccountCard() {
  const { profile, email } = useAuth();
  const name = profile?.name?.trim();
  return (
    <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
        {name ? (
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 22, color: C.green }}>{name.charAt(0).toUpperCase()}</Text>
        ) : (
          <Icon name="person" size={26} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.h3}>{name || 'Your profile'}</Text>
        <Text style={T.meta}>{email ?? 'No account. Your data stays on this device.'}</Text>
      </View>
    </View>
  );
}

function WeighInCard() {
  const { profile, logWeight } = useAuth();
  const [kg, setKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [fb, flash] = useFlash();

  async function save() {
    const v = Number.parseFloat(kg.replace(',', '.'));
    if (!Number.isFinite(v) || v < 30 || v > 300) {
      flash({ tone: 'error', text: 'Enter a weight between 30 and 300 kg.' });
      return;
    }
    setBusy(true);
    const { error } = await logWeight(v);
    setBusy(false);
    if (error) {
      flash({ tone: 'error', text: error });
      return;
    }
    setKg('');
    flash({ tone: 'success', text: `Saved ${Math.round(v * 10) / 10} kg for today.` });
  }

  return (
    <View style={[cardStyle, { gap: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="scale" size={26} />
        <View style={{ flex: 1 }}>
          <Text style={T.h3} accessibilityRole="header">
            Today&apos;s weight
          </Text>
          <Text style={T.small}>{profile?.weight_kg != null ? `Last saved: ${profile.weight_kg} kg` : 'Nothing logged yet'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Weight (kg)"
            value={kg}
            onChangeText={setKg}
            keyboardType="decimal-pad"
            placeholder="e.g. 74.5"
            onSubmitEditing={save}
            returnKeyType="done"
          />
        </View>
        <Button label="Save" onPress={save} busy={busy} style={{ minHeight: 48, paddingHorizontal: 28 }} accessibilityLabel="Save today's weight" />
      </View>
      {fb ? <Notice tone={fb.tone}>{fb.text}</Notice> : null}
    </View>
  );
}

function StatsCard() {
  const { profile, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [height, setHeight] = useState(profile?.height_cm != null ? String(profile.height_cm) : '');
  const [age, setAge] = useState(profile?.age != null ? String(profile.age) : '');
  const [gender, setGender] = useState(profile?.gender ?? '');
  const [busy, setBusy] = useState(false);
  const [fb, flash] = useFlash();

  async function save() {
    const h = Number.parseFloat(height.replace(',', '.'));
    const a = Number.parseInt(age, 10);
    if (height && (!Number.isFinite(h) || h < 120 || h > 230)) {
      flash({ tone: 'error', text: 'Enter a height between 120 and 230 cm.' });
      return;
    }
    if (age && (!Number.isFinite(a) || a < 18 || a > 100)) {
      flash({ tone: 'error', text: 'Enter an age between 18 and 100.' });
      return;
    }
    setBusy(true);
    const { error } = await saveProfile({
      name: name.trim(),
      height_cm: height ? Math.round(h) : null,
      age: age ? a : null,
      gender,
    });
    setBusy(false);
    if (error) flash({ tone: 'error', text: error });
    else flash({ tone: 'success', text: 'Saved.' });
  }

  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <Text style={T.h3} accessibilityRole="header">
        About you
      </Text>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Sam" autoComplete="given-name" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="e.g. 178" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="e.g. 32" />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>Gender</Text>
        <View style={{ flexDirection: 'row', gap: 8, padding: 4, backgroundColor: C.surface, borderRadius: R.pill }} accessibilityRole="radiogroup">
          {[
            { id: 'male', label: 'Male' },
            { id: 'female', label: 'Female' },
          ].map((g) => {
            const on = gender === g.id;
            return (
              <Pressable
                key={g.id}
                onPress={() => setGender(g.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, selected: on }}
                accessibilityLabel={g.label}
                style={{ flex: 1, minHeight: 44, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.green : 'transparent' }}
              >
                <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: on ? C.onGreen : C.text }}>{g.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={T.small}>Your coach sets calorie and water targets from these.</Text>
      {fb ? <Notice tone={fb.tone}>{fb.text}</Notice> : null}
      <Button label="Save changes" variant="secondary" onPress={save} busy={busy} />
    </View>
  );
}

function TargetsCard() {
  const { profile } = useAuth();
  const { generating, aiPlan, regenerate } = usePlan();
  const [goal, setGoal] = useState('');
  const [fb, flash] = useFlash();

  async function run() {
    const res = await regenerate(goal.trim() || undefined);
    if (res.ok) flash({ tone: 'success', text: 'Your new plan is ready.' }, 5000);
    else flash({ tone: 'error', text: res.error ?? 'Try again in a moment.' });
  }

  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <Text style={T.h3} accessibilityRole="header">
        Daily targets
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 28, color: C.text }}>
            {profile?.kcal_target != null ? profile.kcal_target.toLocaleString() : 'Not set'}
          </Text>
          <Text style={T.small}>kcal a day</Text>
        </View>
        <View style={{ width: 1, backgroundColor: C.lineStrong, marginHorizontal: 16 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 28, color: C.text }}>{profile?.water_target ?? 'Not set'}</Text>
          <Text style={T.small}>glasses of water</Text>
        </View>
      </View>
      <Text style={T.meta}>
        {aiPlan ? 'Set by your coach from your stats.' : 'Starter targets. Your coach tunes them when it builds your plan.'}
      </Text>
      <Field label="Goal for your next plan (optional)" value={goal} onChangeText={setGoal} placeholder="e.g. lose 4 kg by December" />
      {fb ? <Notice tone={fb.tone}>{fb.text}</Notice> : null}
      <Button label={generating ? 'Your coach is planning' : 'Build a new plan'} icon={generating ? undefined : 'refresh'} onPress={run} busy={generating} />
    </View>
  );
}

function RemindersCard() {
  const { prefs, update, granted, supported } = useReminders();

  if (!supported) {
    return (
      <View style={[cardStyle, { gap: 8 }]}>
        <Text style={T.h3} accessibilityRole="header">
          Reminders
        </Text>
        <Text style={T.meta}>
          {Platform.OS === 'web'
            ? 'Reminders work in the BUILT app on your phone. Your choices are saved either way.'
            : "Reminders need the full BUILT app build; they aren't available in this preview. Your choices are saved either way."}
        </Text>
      </View>
    );
  }

  const row = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 }}>
      <Text style={T.body}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        trackColor={{ true: C.green, false: '#4A4A4A' }}
        thumbColor={value ? C.onGreen : C.stone}
        {...(Platform.OS === 'web' ? { activeThumbColor: C.onGreen } : {})}
      />
    </View>
  );

  return (
    <View style={[cardStyle, { gap: 4 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <Icon name="bell" size={24} />
        <Text style={T.h3} accessibilityRole="header">
          Reminders
        </Text>
      </View>
      {row('Water, daily', prefs.water, (v) => void update({ water: v }))}
      {row('Workout, daily', prefs.workout, (v) => void update({ workout: v }))}
      <Text style={[T.small, { marginTop: 4 }]}>
        Water at {String(prefs.waterHour).padStart(2, '0')}:00, workout at {String(prefs.workoutHour).padStart(2, '0')}:00.
        {granted === false ? " You'll be asked to allow notifications when you turn one on." : ''}
      </Text>
    </View>
  );
}

export default function ProfileTab() {
  const { signOut, session } = useAuth();

  async function confirmSignOut() {
    const ok = await showConfirm({
      title: 'Sign out?',
      message: session
        ? "You'll return to the sign-in screen. Your data stays in your account."
        : "You'll return to the sign-in screen. Your data stays on this device.",
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    await signOut();
    // The tabs stay mounted, so go to the sign-in screen explicitly.
    router.replace('/(auth)/login');
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' }}
        >
          <ScreenHeader title="Profile" />
          <AccountCard />
          <WeighInCard />
          <StatsCard />
          <TargetsCard />
          <RemindersCard />
          <Button label="Sign out" variant="danger" onPress={confirmSignOut} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
