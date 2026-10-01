/* Monthly check-in (PRODUCT.md "Check-ins"): weight, optional
   measurements, new face-blurred photos, then energy, sleep, hunger, how
   hard the plan felt and how much of it was followed. The coach reviews
   the month, adjusts the plan and says what changed and why. */

import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { isCloudUser } from '../../src/lib/cloud';
import { asApiError } from '../../src/api/errors';
import { submitCheckin } from '../../src/api/checkins';
import { newPhotoSetId } from '../../src/api/photos';
import { Field } from '../../src/components/Field';
import { Notice } from '../../src/components/Bits';
import { QuestionShell } from '../../src/components/onboarding/QuestionShell';
import { OptionList } from '../../src/components/onboarding/Controls';
import { PhotoSetPanel } from '../../src/components/profile/PhotoSetPanel';
import { usePhotoSet } from '../../src/components/profile/photoSetStore';
import { AnalysisResult, AnalysisWaiting, useBodyAnalysis } from '../../src/components/profile/BodyAnalysis';
import { CheckinResultView, MEASUREMENTS, RATINGS, type RatingKey } from '../../src/components/profile/checkinBits';
import { markCheckinsChanged } from '../../src/components/profile/CheckinDue';
import { goBack } from '../../src/components/profile/SubScreen';
import type { CheckinAnswers, CheckinResult, Measurements } from '../../src/types';

type Stage = 'weight' | 'measurements' | 'photos' | 'analysis' | RatingKey | 'notes' | 'submit';

const REVIEW_LINES = ['Comparing your weight trend', 'Reading your answers', 'Adjusting calories and training', 'Writing your review'];

export default function MonthlyCheckin() {
  const { userId, profile, saveProfile, refreshProfile, notifyPlanChanged } = useAuth();
  const cloud = isCloudUser(userId);
  const [setId] = useState(() => newPhotoSetId());
  const photos = usePhotoSet(setId);
  const analysis = useBodyAnalysis(userId, setId);

  const stages: Stage[] = useMemo(
    () => ['weight', 'measurements', ...(cloud ? (['photos'] as Stage[]) : []), 'energy', 'sleep', 'hunger', 'difficulty', 'adherence', 'notes'],
    [cloud],
  );
  const [stage, setStage] = useState<Stage>('weight');
  const [kg, setKg] = useState('');
  const [meas, setMeas] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<CheckinAnswers>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);

  const i = stages.indexOf(stage === 'analysis' ? 'photos' : stage);
  const progress = i >= 0 ? i / stages.length : 1;
  const label = i >= 0 ? `${i + 1} of ${stages.length}` : undefined;
  const next = () => {
    setErr(null);
    const n = stages[i + 1];
    setStage(n ?? 'submit');
  };
  const back = () => {
    setErr(null);
    if (stage === 'analysis') return setStage('photos');
    if (i <= 0) return goBack('/checkin');
    setStage(stages[i - 1]);
  };

  async function submit() {
    if (!userId) return;
    setStage('submit');
    setBusy(true);
    setErr(null);
    const measurements: Measurements = {};
    for (const m of MEASUREMENTS) {
      const v = Number.parseFloat((meas[m.key] ?? '').replace(',', '.'));
      if (Number.isFinite(v) && v > 0) measurements[m.key] = Math.round(v * 10) / 10;
    }
    const weight = Number.parseFloat(kg.replace(',', '.'));
    try {
      const r = await submitCheckin(userId, {
        kind: 'monthly',
        weight_kg: weight,
        measurements,
        answers,
        photo_set_id: photos.front ? setId : null,
      });
      await saveProfile({ weight_kg: Math.round(weight * 10) / 10 });
      if (r.plan) {
        notifyPlanChanged();
        await refreshProfile();
      }
      markCheckinsChanged();
      setResult(r);
    } catch (e) {
      setErr(asApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  // ─── result ───
  if (result) {
    return (
      <QuestionShell
        title="Your month"
        primaryLabel={result.plan ? 'See my new plan' : 'Done'}
        onPrimary={() => (result.plan ? router.replace('/(tabs)/plan') : goBack('/(tabs)'))}
        secondaryLabel={result.plan ? 'Done' : undefined}
        onSecondary={result.plan ? () => goBack('/(tabs)') : undefined}
      >
        <CheckinResultView summary={result.summary} changes={result.plan_changes} weight={result.checkin.weight_kg} />
      </QuestionShell>
    );
  }

  // ─── sending / review failed ───
  if (stage === 'submit') {
    if (busy) {
      return (
        <QuestionShell title="Reviewing your month" primaryLabel="Working" onPrimary={() => {}} noActions>
          <AnalysisWaiting lines={REVIEW_LINES} note="Usually under a minute." />
        </QuestionShell>
      );
    }
    return (
      <QuestionShell
        title="Your check-in didn't go through"
        helper={err ?? 'Something went wrong. Your answers are still here.'}
        primaryLabel="Try again"
        onPrimary={submit}
        secondaryLabel="Back to the questions"
        onSecondary={() => setStage('notes')}
      />
    );
  }

  if (stage === 'weight') {
    const go = () => {
      const v = Number.parseFloat(kg.replace(',', '.'));
      if (!Number.isFinite(v) || v < 30 || v > 300) return setErr('Enter a weight between 30 and 300 kg.');
      next();
    };
    return (
      <QuestionShell title="Today's weight" helper="Same scale, same time as your weekly weigh-ins." progress={progress} progressLabel={label} onBack={back} primaryLabel="Continue" onPrimary={go} error={err}>
        <Field label="Weight (kg)" value={kg} onChangeText={setKg} keyboardType="decimal-pad" placeholder={profile?.weight_kg ? `Last time ${profile.weight_kg}` : 'e.g. 74.5'} />
      </QuestionShell>
    );
  }

  if (stage === 'measurements') {
    const any = MEASUREMENTS.some((m) => (meas[m.key] ?? '').trim());
    const go = () => {
      for (const m of MEASUREMENTS) {
        const raw = (meas[m.key] ?? '').trim();
        if (!raw) continue;
        const v = Number.parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(v) || v < 10 || v > 300) return setErr(`Check your ${m.label.replace(' (cm)', '').toLowerCase()}: enter it in centimetres.`);
      }
      next();
    };
    return (
      <QuestionShell
        title="Measurements"
        helper="Optional. A tape measure shows changes the scale misses."
        progress={progress}
        progressLabel={label}
        onBack={back}
        primaryLabel={any ? 'Continue' : 'Skip measurements'}
        onPrimary={go}
        error={err}
      >
        <View style={{ gap: 14 }}>
          {MEASUREMENTS.map((m) => (
            <Field key={m.key} label={m.label} value={meas[m.key] ?? ''} onChangeText={(t) => setMeas((x) => ({ ...x, [m.key]: t }))} keyboardType="decimal-pad" />
          ))}
        </View>
      </QuestionShell>
    );
  }

  if (stage === 'photos') {
    return (
      <QuestionShell
        title="New body photos"
        helper="Same spot, same light as last time. Your face is blurred on your phone before anything is uploaded."
        progress={progress}
        progressLabel={label}
        onBack={back}
        primaryLabel={photos.front ? 'Continue' : 'Skip photos this month'}
        onPrimary={() => {
          if (photos.front) {
            setStage('analysis');
            void analysis.run();
          } else next();
        }}
      >
        <PhotoSetPanel setId={setId} source="checkin" />
      </QuestionShell>
    );
  }

  if (stage === 'analysis') {
    const s = analysis.state;
    if (s.phase === 'running' || s.phase === 'idle') {
      return (
        <QuestionShell title="Reading your photos" progress={progress} progressLabel={label} primaryLabel="Working" onPrimary={() => {}} noActions>
          <AnalysisWaiting />
        </QuestionShell>
      );
    }
    return (
      <QuestionShell
        title={s.phase === 'done' ? 'From your photos' : 'Photos saved'}
        progress={progress}
        progressLabel={label}
        onBack={back}
        primaryLabel="Continue"
        onPrimary={() => setStage(stages[stages.indexOf('photos') + 1])}
        secondaryLabel={s.phase === 'skipped' && s.retry ? 'Try the estimate again' : undefined}
        onSecondary={s.phase === 'skipped' && s.retry ? () => void analysis.run() : undefined}
      >
        {s.phase === 'done' ? <AnalysisResult analysis={s.analysis} /> : <Notice>{s.message}</Notice>}
      </QuestionShell>
    );
  }

  const rating = RATINGS.find((r) => r.key === stage);
  if (rating) {
    const value = answers[rating.key];
    return (
      <QuestionShell
        title={rating.title}
        helper={rating.helper}
        progress={progress}
        progressLabel={label}
        onBack={back}
        primaryLabel="Continue"
        primaryDisabled={value == null}
        onPrimary={next}
      >
        <OptionList label={rating.title} options={rating.options} value={value} onChange={(v) => setAnswers((a) => ({ ...a, [rating.key]: v }))} />
      </QuestionShell>
    );
  }

  // notes, then send
  return (
    <QuestionShell
      title="Anything else?"
      helper="Optional. A busy month, a trip, a niggle: your coach takes it into account."
      progress={progress}
      progressLabel={label}
      onBack={back}
      primaryLabel="Send my check-in"
      onPrimary={submit}
      error={err}
    >
      <Field
        label="Notes for your coach"
        value={answers.notes ?? ''}
        onChangeText={(notes) => setAnswers((a) => ({ ...a, notes: notes.slice(0, 600) }))}
        multiline
        placeholder="e.g. travelled for a week, knee felt better"
        style={{ minHeight: 110, textAlignVertical: 'top' }}
      />
      {!cloud ? <Text style={[T.meta, { color: C.stone }]}>Without an account your check-in stays on this phone and shows your weight trend. Sign up to get your coach's review.</Text> : null}
    </QuestionShell>
  );
}
