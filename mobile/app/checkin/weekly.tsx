/* Weekly weigh-in: one number, saved to the weight history and the
   profile, then the trend since last time. */

import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';

import { C, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { submitCheckin } from '../../src/api/checkins';
import { Field } from '../../src/components/Field';
import { QuestionShell } from '../../src/components/onboarding/QuestionShell';
import { CheckinResultView } from '../../src/components/profile/checkinBits';
import { markCheckinsChanged } from '../../src/components/profile/CheckinDue';
import { goBack } from '../../src/components/profile/SubScreen';
import type { CheckinResult } from '../../src/types';

export default function WeeklyCheckin() {
  const { userId, profile, saveProfile } = useAuth();
  const [kg, setKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CheckinResult | null>(null);

  async function save() {
    if (!userId) return;
    const v = Number.parseFloat(kg.replace(',', '.'));
    if (!Number.isFinite(v) || v < 30 || v > 300) return setErr('Enter a weight between 30 and 300 kg.');
    setBusy(true);
    setErr(null);
    try {
      const r = await submitCheckin(userId, { kind: 'weekly', weight_kg: v });
      await saveProfile({ weight_kg: Math.round(v * 10) / 10 });
      markCheckinsChanged();
      setResult(r);
    } catch (e) {
      setErr(asApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <QuestionShell title="Weight logged" primaryLabel="Done" onPrimary={() => goBack('/(tabs)')} secondaryLabel="See check-in history" onSecondary={() => router.replace('/checkin')}>
        <CheckinResultView summary={result.summary} changes={result.plan_changes} weight={result.checkin.weight_kg} />
      </QuestionShell>
    );
  }

  return (
    <QuestionShell
      title="Weekly weigh-in"
      helper="Same scale, same time of day. Before breakfast is best."
      onBack={() => goBack('/(tabs)')}
      primaryLabel={busy ? 'Saving' : 'Save weight'}
      onPrimary={save}
      busy={busy}
      error={err}
    >
      <Field
        label="Weight (kg)"
        value={kg}
        onChangeText={setKg}
        keyboardType="decimal-pad"
        placeholder={profile?.weight_kg ? `Last time ${profile.weight_kg}` : 'e.g. 74.5'}
        onSubmitEditing={save}
        returnKeyType="done"
        autoFocus
      />
      <Text style={[T.meta, { color: C.stone }]}>Weight moves day to day with water and food. Your coach looks at the trend, not one number.</Text>
    </QuestionShell>
  );
}
