/* Log an activity: walking, football, padel and the rest, with minutes and
   effort. Calories burned are MET x body weight x hours (data/activities)
   and show before saving. Works offline and without an account; the
   activity appears on Today and in Progress at once. */

import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { C, card as cardStyle, FONT, screen, T } from '../../src/design';
import { usePlan } from '../../src/planStore';
import { ACTIVITIES, DEFAULT_WEIGHT_KG, EFFORT_HINTS, EFFORTS, type ActivityKind, type Effort, kcalFor, MAX_ACTIVITY_MINUTES } from '../../src/data/activities';
import { addDays } from '../../src/lib/dates';
import { Button, LinkButton } from '../../src/components/Button';
import { Notice } from '../../src/components/Bits';
import { Field } from '../../src/components/Field';
import { Icon } from '../../src/components/Icon';
import { BackHeader, goBack } from '../../src/components/training/BackHeader';
import { Chip, Segmented } from '../../src/components/training/Controls';

const QUICK_MINUTES = [15, 30, 45, 60, 90];
const EFFORT_LABEL: Record<Effort, string> = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };

export default function LogActivityScreen() {
  const { todayId, profile, logActivity } = usePlan();
  const inset = useSafeAreaInsets();
  const [kind, setKind] = useState<ActivityKind>('walking');
  const [label, setLabel] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [effort, setEffort] = useState<Effort>('moderate');
  const [when, setWhen] = useState<'today' | 'yesterday'>('today');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ name: string; minutes: number; kcal: number } | null>(null);

  const weight = profile?.weight_kg && profile.weight_kg >= 30 ? profile.weight_kg : null;
  const mins = Math.round(Number(minutes) || 0);
  const valid = mins >= 1 && mins <= MAX_ACTIVITY_MINUTES && (kind !== 'other' || !!label.trim());
  const kcal = useMemo(() => kcalFor(kind, mins, effort, weight), [kind, mins, effort, weight]);
  const name = kind === 'other' ? label.trim() || 'Activity' : ACTIVITIES.find((a) => a.kind === kind)?.label ?? 'Activity';

  async function save() {
    if (!valid || busy) {
      if (!valid) setError(kind === 'other' && !label.trim() ? 'Name the activity first.' : `Enter between 1 and ${MAX_ACTIVITY_MINUTES} minutes.`);
      return;
    }
    setBusy(true);
    setError(null);
    const r = await logActivity({ kind, minutes: mins, effort, label: kind === 'other' ? label.trim() : '', day: when === 'today' ? todayId : addDays(todayId, -1) });
    setBusy(false);
    if (r.ok && r.activity) setSaved({ name, minutes: r.activity.minutes, kcal: r.activity.kcal });
    else setError(r.error ?? "That didn't save. Try again.");
  }

  function another() {
    setSaved(null);
    setMinutes('30');
    setLabel('');
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 140, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <BackHeader title={saved ? 'Logged' : 'Log an activity'} subtitle={saved ? undefined : 'Anything you did outside your plan counts.'} fallback="/(tabs)" />

        {saved ? (
          <View style={[cardStyle, { alignItems: 'center', gap: 12, paddingVertical: 32 }]} accessibilityLiveRegion="polite">
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={30} color={C.green} strokeWidth={2.6} />
            </View>
            <Text style={[T.h2, { textAlign: 'center' }]}>
              {saved.minutes} min of {saved.name.toLowerCase()}
            </Text>
            <Text style={[T.meta, { textAlign: 'center' }]}>About {saved.kcal} kcal burned. It&apos;s on Today and in Progress.</Text>
            <LinkButton onPress={another} accessibilityLabel="Log another activity">
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Log another</Text>
            </LinkButton>
          </View>
        ) : (
          <>
            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>What did you do?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Activity">
                {ACTIVITIES.map((a) => (
                  <Chip key={a.kind} label={a.label} selected={kind === a.kind} onPress={() => setKind(a.kind)} />
                ))}
              </View>
              {kind === 'other' ? <Field label="What was it?" value={label} onChangeText={setLabel} placeholder="Yoga, tennis, a long bike ride" maxLength={80} /> : null}
            </View>

            <View style={{ gap: 10 }}>
              <Field
                label="Minutes"
                value={minutes}
                onChangeText={(t) => setMinutes(t.replace(/[^0-9]/g, '').slice(0, 3))}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={3}
                error={!!minutes && (mins < 1 || mins > MAX_ACTIVITY_MINUTES)}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {QUICK_MINUTES.map((m) => (
                  <Chip key={m} label={`${m} min`} selected={mins === m} onPress={() => setMinutes(String(m))} />
                ))}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>How hard was it?</Text>
              <Segmented label="Effort" value={effort} onChange={setEffort} options={EFFORTS.map((e) => ({ value: e, label: EFFORT_LABEL[e] }))} />
              <Text style={T.meta}>{EFFORT_HINTS[effort]}</Text>
            </View>

            <View style={{ gap: 10 }}>
              <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>When</Text>
              <Segmented
                label="When"
                value={when}
                onChange={setWhen}
                options={[
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                ]}
              />
            </View>

            <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 16 }]} accessible accessibilityLabel={`About ${valid ? kcal : 0} calories burned`}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="flame" size={24} color={C.stone} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONT.displaySemi, fontSize: 28, lineHeight: 34, color: C.text }}>{valid ? kcal : 0} kcal</Text>
                <Text style={T.small}>
                  {weight ? `Estimated for ${weight} kg.` : `Estimated for ${DEFAULT_WEIGHT_KG} kg. Add your weight in Profile for a closer number.`}
                </Text>
              </View>
            </View>

            {error ? <Notice tone="error">{error}</Notice> : null}
          </>
        )}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 12 + inset.bottom,
          backgroundColor: C.bg,
          borderTopWidth: 1,
          borderTopColor: C.line,
        }}
      >
        <View style={{ maxWidth: 600, width: '100%', alignSelf: 'center' }}>
          {saved ? (
            <Button label="Done" onPress={() => goBack('/(tabs)')} />
          ) : (
            <Button icon="check" label={valid ? `Log ${mins} min of ${name.toLowerCase()}` : 'Log activity'} onPress={() => void save()} busy={busy} disabled={!valid} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
