/* The sign-up questionnaire (PRODUCT.md "Sign-up and the questionnaire").
   One question per screen, a progress bar, back, and every answer saved as
   the person goes (profiles.onboarding_step), so a closed app reopens at
   the same question. Under 13: blocked. 13 to 17: guardian consent. Then
   body photos (accounts only), health apps (phones only), the waiver, and
   the finish: completeOnboarding, then the first plan. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { C, FONT, R, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { isCloudUser } from '../../src/lib/cloud';
import { todayId } from '../../src/lib/dates';
import { asApiError } from '../../src/api/errors';
import { acceptWaiver, completeOnboarding, giveGuardianConsent, resumeStep, targetsFor } from '../../src/api/profile';
import { generatePlan } from '../../src/api/plan';
import { listBodyPhotos, newPhotoSetId } from '../../src/api/photos';
import { enableHealthSync } from '../../src/api/health';
import { ageOn, ageRule } from '../../src/api/rules';
import { healthPlatform } from '../../src/api/device/health';
import {
  GUARDIAN_ACCEPT_LABEL,
  GUARDIAN_NAME_LABEL,
  GUARDIAN_TEXT,
  GUARDIAN_TITLE,
  UNDER_13_TEXT,
  WAIVER_ACCEPT_LABEL,
  WAIVER_PARAGRAPHS,
  WAIVER_TITLE,
} from '../../src/legal/waiver';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { Notice } from '../../src/components/Bits';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { QuestionShell } from '../../src/components/onboarding/QuestionShell';
import { StepObject } from '../../src/components/onboarding/StepObject';
import { CheckRow } from '../../src/components/onboarding/Controls';
import { birthDateOf, draftFromProfile, QUESTIONS, type Draft, type QuestionId } from '../../src/components/onboarding/questions';
import { daysText } from '../../src/components/onboarding/options';
import { PhotoSetPanel } from '../../src/components/profile/PhotoSetPanel';
import { seedPhotoSet, usePhotoSet } from '../../src/components/profile/photoSetStore';
import { AnalysisResult, AnalysisWaiting, useBodyAnalysis } from '../../src/components/profile/BodyAnalysis';
import { requestReminderPermission } from '../../src/useReminders';
import type { OnboardingStep, PlanResult } from '../../src/types';

type ScreenId = QuestionId | 'guardian' | 'photo' | 'health_app' | 'waiver' | 'finish';
type Screen = { id: ScreenId; step: OnboardingStep };

const PLAN_LINES = ['Reading your answers', 'Setting your calories and macros', 'Choosing exercises for where you train', 'Planning your meals'];

export default function Questionnaire() {
  const { userId, profile, saveProfile, applyProfile, refreshProfile, notifyPlanChanged, signOut } = useAuth();
  const cloud = isCloudUser(userId);
  const native = Platform.OS !== 'web' && healthPlatform() != null;

  const [draft, setDraft] = useState<Draft | null>(profile ? draftFromProfile(profile) : null);
  const set = useCallback((patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (profile && !draft) setDraft(draftFromProfile(profile));
  }, [profile, draft]);

  // Anyone who already finished goes to the app.
  const finishedAtMount = useRef(!!profile?.onboarding_done_at);
  useEffect(() => {
    if (finishedAtMount.current) router.replace('/(tabs)');
  }, []);

  const age = ageOn(profile?.birth_date, todayId());
  const minor = ageRule(age) === 'minor';

  const screens: Screen[] = useMemo(() => {
    const list: Screen[] = [];
    for (const q of QUESTIONS) {
      list.push({ id: q.id, step: q.step });
      if (q.id === 'birth_date' && minor) list.push({ id: 'guardian', step: 'birth_date' });
    }
    if (cloud) list.push({ id: 'photo', step: 'photo' });
    if (native) list.push({ id: 'health_app', step: 'waiver' });
    list.push({ id: 'waiver', step: 'waiver' }, { id: 'finish', step: 'done' });
    return list;
  }, [cloud, native, minor]);

  // Resume at the saved step (once).
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    if (index != null || !profile) return;
    const step = resumeStep(profile);
    const at = screens.findIndex((s) => s.step === step);
    setIndex(at >= 0 && step !== 'done' ? at : 0);
  }, [profile, screens, index]);

  const screen = index != null ? screens[Math.min(index, screens.length - 1)] : null;
  const questionCount = screens.length - 1; // the finish screen isn't a question

  const go = useCallback(
    (to: number) => {
      setErr(null);
      setIndex(Math.max(0, Math.min(screens.length - 1, to)));
    },
    [screens.length],
  );
  const goTo = useCallback((id: ScreenId) => go(screens.findIndex((s) => s.id === id)), [go, screens]);

  if (!profile || !draft || !screen || index == null || !userId) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Loading your questions">
        <BuiltMark size={48} />
      </View>
    );
  }

  const nextStepOf = (i: number): OnboardingStep => screens[Math.min(i + 1, screens.length - 1)].step;
  const progress = Math.min(1, index / questionCount);
  const progressLabel = `${Math.min(index + 1, questionCount)} of ${questionCount}`;
  const back = index > 0 ? () => go(index - 1) : undefined;

  // ─── under 13 ───
  if (blocked) {
    return (
      <QuestionShell
        title={UNDER_13_TEXT}
        helper="Thanks for wanting to train with us. You can't use BUILT yet, but moving matters at every age: sport, play and time outside with friends all count."
        primaryLabel="Change my date of birth"
        onPrimary={() => {
          setBlocked(false);
          goTo('birth_date');
        }}
        secondaryLabel="Sign out"
        onSecondary={() => void signOut().then(() => router.replace('/(auth)/login'))}
        lead={<BuiltMark size={40} />}
      >
        <Text style={[T.meta, { color: C.stone }]}>If you typed your date of birth by mistake, change it and carry on.</Text>
      </QuestionShell>
    );
  }

  // ─── one question ───
  const q = QUESTIONS.find((x) => x.id === screen.id);
  if (q) {
    const submit = async () => {
      const r = q.toPatch(draft, profile);
      if ('error' in r) {
        setErr(r.error);
        return;
      }
      // Under 13: say so kindly and save nothing.
      if (q.id === 'birth_date') {
        const dob = birthDateOf(draft);
        if ('value' in dob && ageRule(ageOn(dob.value, todayId())) === 'blocked') {
          setBlocked(true);
          return;
        }
      }
      setBusy(true);
      setErr(null);
      const willBeMinor = q.id === 'birth_date' && 'value' in birthDateOf(draft) && ageRule(ageOn((birthDateOf(draft) as { value: string }).value, todayId())) === 'minor';
      const nextStep: OnboardingStep = q.id === 'birth_date' && willBeMinor ? 'birth_date' : nextStepOf(index);
      const res = await saveProfile({ ...r.patch, onboarding_step: nextStep });
      setBusy(false);
      if (res.code === 'under_13') {
        setBlocked(true);
        return;
      }
      if (res.error) {
        setErr(res.error);
        return;
      }
      // The screen list changes when the birth date makes this a minor.
      if (q.id === 'birth_date' && willBeMinor) {
        setIndex(index + 1);
        return;
      }
      go(index + 1);
    };
    return (
      <QuestionShell
        title={q.title}
        helper={q.helper}
        progress={progress}
        progressLabel={progressLabel}
        onBack={back}
        primaryLabel={q.cta?.(draft) ?? 'Continue'}
        onPrimary={submit}
        busy={busy}
        error={err}
        lead={<StepObject screen={q.id} />}
      >
        {q.render({ draft, set, profile })}
      </QuestionShell>
    );
  }

  // ─── guardian consent (13 to 17) ───
  if (screen.id === 'guardian') return <GuardianStep {...{ progress, progressLabel, back, onDone: () => go(index + 1), nextStep: nextStepOf(index) }} />;

  // ─── body photos ───
  if (screen.id === 'photo') return <PhotoStep {...{ progress, progressLabel, back, onDone: () => go(index + 1), nextStep: nextStepOf(index) }} />;

  // ─── health apps (phones only) ───
  if (screen.id === 'health_app') {
    const name = healthPlatform() === 'apple_health' ? 'Apple Health' : 'Health Connect';
    const connect = async () => {
      setBusy(true);
      setErr(null);
      const okay = await enableHealthSync(userId, profile).catch(() => false);
      setBusy(false);
      if (!okay) {
        setErr(`${name} didn't give access. You can connect it later in Profile.`);
        return;
      }
      await refreshProfile();
      go(index + 1);
    };
    return (
      <QuestionShell
        title={`Connect ${name}?`}
        helper={`BUILT reads your steps, active calories, workouts, weight and sleep, and saves the workouts you finish to ${name}. You can turn it off any time in Profile.`}
        progress={progress}
        progressLabel={progressLabel}
        onBack={back}
        primaryLabel={`Connect ${name}`}
        onPrimary={connect}
        busy={busy}
        error={err}
        secondaryLabel="Not now"
        onSecondary={() => go(index + 1)}
      />
    );
  }

  // ─── waiver ───
  if (screen.id === 'waiver') return <WaiverStep {...{ progress, progressLabel, back, onDone: () => go(index + 1) }} />;

  // ─── finish ───
  return (
    <FinishStep
      onFix={(code) => {
        if (code === 'waiver_required') goTo('waiver');
        else if (code === 'guardian_required') goTo('guardian');
        else goTo('birth_date');
      }}
      onDone={() => {
        notifyPlanChanged();
        router.replace('/(tabs)');
      }}
      applyProfile={applyProfile}
    />
  );
}

type StepProps = { progress: number; progressLabel: string; back?: () => void; onDone: () => void; nextStep?: OnboardingStep };

function GuardianStep({ progress, progressLabel, back, onDone, nextStep }: StepProps) {
  const { userId, profile, applyProfile, saveProfile } = useAuth();
  const [name, setName] = useState(profile?.guardian_name ?? '');
  const [agree, setAgree] = useState(!!profile?.guardian_consent_at);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!userId || !profile) return;
    if (name.trim().length < 2) return setErr("Enter your parent or guardian's full name.");
    if (!agree) return setErr('Your parent or guardian needs to tick the box.');
    setBusy(true);
    setErr(null);
    try {
      const p = await giveGuardianConsent(userId, name, profile);
      applyProfile(p);
      const r = await saveProfile({ onboarding_step: nextStep ?? 'gender' });
      if (r.error) throw new Error(r.error);
      onDone();
    } catch (e) {
      setErr(asApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuestionShell
      title={GUARDIAN_TITLE}
      helper={GUARDIAN_TEXT}
      lead={<StepObject screen="guardian" />}
      progress={progress}
      progressLabel={progressLabel}
      onBack={back}
      primaryLabel="Continue"
      onPrimary={submit}
      busy={busy}
      error={err}
    >
      <Text style={[T.meta, { color: C.stone }]}>Hand your phone to your parent or guardian for this part.</Text>
      <Field label={GUARDIAN_NAME_LABEL} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />
      <CheckRow checked={agree} onChange={setAgree} label={GUARDIAN_ACCEPT_LABEL} />
    </QuestionShell>
  );
}

function PhotoStep({ progress, progressLabel, back, onDone, nextStep }: StepProps) {
  const { userId, saveProfile } = useAuth();
  const [setId, setSetId] = useState<string | null>(null);
  const set = usePhotoSet(setId);
  const analysis = useBodyAnalysis(userId, setId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // One set per sign-up, kept across restarts; photos already uploaded to
  // it are picked up from the server.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const key = `built.signupPhotoSet:${userId}`;
    (async () => {
      let id = await AsyncStorage.getItem(key).catch(() => null);
      if (!id) {
        id = newPhotoSetId();
        await AsyncStorage.setItem(key, id).catch(() => {});
      }
      if (!alive) return;
      setSetId(id);
      const rows = await listBodyPhotos(userId).catch(() => []);
      seedPhotoSet(id, rows.filter((r) => r.set_id === id));
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  async function next() {
    setBusy(true);
    setErr(null);
    const r = await saveProfile({ onboarding_step: nextStep ?? 'waiver' });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onDone();
  }

  const s = analysis.state;
  if (s.phase === 'running') {
    return (
      <QuestionShell title="Reading your starting point" progress={progress} progressLabel={progressLabel} primaryLabel="Working" onPrimary={() => {}} busy noActions>
        <AnalysisWaiting />
      </QuestionShell>
    );
  }
  if (s.phase === 'done' || s.phase === 'skipped') {
    return (
      <QuestionShell
        title={s.phase === 'done' ? 'Your starting point' : 'Photos saved'}
        helper={s.phase === 'done' ? 'From your photos and answers. Your plan is built around it.' : undefined}
        progress={progress}
        progressLabel={progressLabel}
        onBack={() => analysis.reset()}
        primaryLabel="Continue"
        onPrimary={next}
        busy={busy}
        error={err}
        secondaryLabel={s.phase === 'skipped' && s.retry ? 'Try the estimate again' : undefined}
        onSecondary={s.phase === 'skipped' && s.retry ? () => void analysis.run() : undefined}
      >
        {s.phase === 'done' ? <AnalysisResult analysis={s.analysis} /> : <Notice>{s.message}</Notice>}
      </QuestionShell>
    );
  }

  return (
    <QuestionShell
      title="Body photos"
      helper="A front photo helps your coach pick the right starting point. Side and back are optional."
      progress={progress}
      progressLabel={progressLabel}
      onBack={back}
      primaryLabel={set.front ? 'Continue' : 'Add a front photo to continue'}
      primaryDisabled={!set.front}
      onPrimary={() => void analysis.run()}
      error={err}
    >
      {setId ? <PhotoSetPanel setId={setId} source="signup" /> : null}
      <View style={{ gap: 6, padding: 16, borderRadius: R.tile, backgroundColor: C.surface }}>
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Your face is blurred on your phone</Text>
        <Text style={T.meta}>
          Before any photo is uploaded, BUILT finds your face and blurs it into the image. Photos are stored privately, only you can see them, and they are sent to
          our AI provider only to estimate your starting point.
        </Text>
      </View>
    </QuestionShell>
  );
}

function WaiverStep({ progress, progressLabel, back, onDone }: StepProps) {
  const { userId, profile, applyProfile } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!userId || !profile) return;
    if (!agree) return setErr('Tick the box to accept and finish.');
    setBusy(true);
    setErr(null);
    try {
      applyProfile(await acceptWaiver(userId, profile));
      onDone();
    } catch (e) {
      setErr(asApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QuestionShell
      title={WAIVER_TITLE}
      helper="Read this once. It's short."
      lead={<StepObject screen="waiver" />}
      progress={progress}
      progressLabel={progressLabel}
      onBack={back}
      primaryLabel="Accept and build my plan"
      onPrimary={submit}
      primaryDisabled={!agree}
      busy={busy}
      error={err}
      footerLead={
        <CheckRow
          checked={agree}
          onChange={(v) => {
            setAgree(v);
            setErr(null);
          }}
          label={WAIVER_ACCEPT_LABEL}
        />
      }
    >
      <View style={{ backgroundColor: C.card, borderRadius: R.card, padding: 20, gap: 14 }} accessibilityLabel="Waiver text">
        {WAIVER_PARAGRAPHS.map((p) => (
          <Text key={p} style={[T.body, { color: C.stone }]}>
            {p}
          </Text>
        ))}
      </View>
    </QuestionShell>
  );
}

type FinishState =
  | { phase: 'working' }
  | { phase: 'ready'; plan: PlanResult | null }
  | { phase: 'plan_error'; message: string };

function FinishStep({ onFix, onDone, applyProfile }: { onFix: (code: string) => void; onDone: () => void; applyProfile: (p: NonNullable<ReturnType<typeof useAuth>['profile']>) => void }) {
  const { userId, profile, refreshProfile } = useAuth();
  const [state, setState] = useState<FinishState>({ phase: 'working' });
  const [remind, setRemind] = useState<'idle' | 'on' | 'off'>('idle');
  const started = useRef(false);
  const cloud = isCloudUser(userId);

  const buildPlan = useCallback(async () => {
    if (!userId) return;
    setState({ phase: 'working' });
    if (!cloud) {
      setState({ phase: 'ready', plan: null });
      return;
    }
    try {
      const plan = await generatePlan(userId);
      await refreshProfile();
      setState({ phase: 'ready', plan });
    } catch (e) {
      setState({ phase: 'plan_error', message: asApiError(e).message });
    }
  }, [userId, cloud, refreshProfile]);

  const finish = useCallback(async () => {
    if (!userId || !profile) return;
    setState({ phase: 'working' });
    try {
      const done = profile.onboarding_done_at ? profile : await completeOnboarding(userId, profile);
      // Shown on the success screen; the gate sees it on the way out.
      applyProfile(done);
    } catch (e) {
      const err = asApiError(e);
      if (err.code === 'waiver_required' || err.code === 'guardian_required' || err.code === 'birth_date_required') {
        onFix(err.code);
        return;
      }
      setState({ phase: 'plan_error', message: err.message });
      return;
    }
    await buildPlan();
  }, [userId, profile, applyProfile, onFix, buildPlan]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finish();
  }, [finish]);

  if (state.phase === 'working') {
    return (
      <QuestionShell title="Building your plan" primaryLabel="Working" onPrimary={() => {}} noActions>
        <AnalysisWaiting lines={PLAN_LINES} note="Your coach is putting your first week together." />
      </QuestionShell>
    );
  }

  if (state.phase === 'plan_error') {
    return (
      <QuestionShell
        title="Your plan isn't ready yet"
        helper={state.message}
        primaryLabel="Try again"
        onPrimary={() => void (profile?.onboarding_done_at ? buildPlan() : finish())}
        secondaryLabel={profile?.onboarding_done_at ? 'Start with the starter plan' : undefined}
        onSecondary={profile?.onboarding_done_at ? onDone : undefined}
        lead={<BuiltMark size={40} />}
      >
        <Text style={[T.meta, { color: C.stone }]}>Your answers are saved. The starter plan works right away, and you can build your AI plan later from Profile.</Text>
      </QuestionShell>
    );
  }

  const t = profile ? targetsFor(profile) : null;
  const plan = state.plan?.plan;
  const kcal = plan?.kcal_target ?? profile?.kcal_target ?? t?.kcal;
  const days = plan?.training_days ?? profile?.training_days ?? [];
  const nativeReminders = Platform.OS !== 'web';

  return (
    <QuestionShell
      title={`You're set${profile?.name ? `, ${profile.name}` : ''}.`}
      helper={state.plan?.summary || (cloud ? 'Your first week is ready.' : 'Your starter plan is ready. It stays on this phone.')}
      primaryLabel="Open my plan"
      onPrimary={onDone}
      secondaryLabel={nativeReminders && remind === 'idle' ? 'Turn on reminders' : undefined}
      onSecondary={
        nativeReminders && remind === 'idle'
          ? () => void requestReminderPermission().then((granted) => setRemind(granted ? 'on' : 'off'))
          : undefined
      }
      lead={<BuiltMark size={40} />}
    >
      <View style={{ flexDirection: 'row', backgroundColor: C.card, borderRadius: R.card, padding: 20 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[T.number, { fontSize: 32, lineHeight: 38 }]}>{kcal ? kcal.toLocaleString() : 'Set'}</Text>
          <Text style={T.small}>kcal a day</Text>
        </View>
        <View style={{ width: 1, backgroundColor: C.lineStrong, marginHorizontal: 16 }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[T.number, { fontSize: 32, lineHeight: 38 }]}>{days.length}</Text>
          <Text style={T.small}>training days</Text>
        </View>
      </View>
      <Text style={[T.meta, { color: C.stone }]}>Training on {daysText(days)}.</Text>
      {remind === 'on' ? <Notice tone="success">Reminders are on. Change them any time in Profile.</Notice> : null}
      {remind === 'off' ? <Notice>Notifications are off for BUILT. You can allow them in your phone settings.</Notice> : null}
    </QuestionShell>
  );
}
