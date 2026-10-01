/* Log what I have: type it ("2 eggs, 1 pita, labneh") or snap it. The
   estimate comes back with every macro; when it needs to know more
   (portion, oil, sauce, what's in the drink) it asks first, with tap
   answers and room to type. The person checks or edits the numbers before
   anything counts. Without an account the numbers can be entered by hand. */

import { useEffect, useState } from 'react';
import { Image, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { useFoodLogs } from '../../src/foodLogs';
import { analyzeFood, answerFoodQuestions } from '../../src/api/food';
import { asApiError } from '../../src/api/errors';
import { showAlert } from '../../src/lib/dialog';
import { todayId } from '../../src/lib/dates';
import { isCloudUser } from '../../src/lib/cloud';
import { Button, LinkButton } from '../../src/components/Button';
import { Notice } from '../../src/components/Bits';
import { Field } from '../../src/components/Field';
import { Icon } from '../../src/components/Icon';
import { BackHeader, goBack } from '../../src/components/training/BackHeader';
import { Chip, MacroLine, Segmented, StateBlock } from '../../src/components/training/Controls';
import { NeedsAccount } from '../../src/components/training/PlanChange';
import { EditableEstimate, EstimateEditor, estimateProblem, parsed, slotForNow } from '../../src/components/food/EstimateEditor';
import { permissionText, PermissionDenied, takeMealPhoto } from '../../src/components/food/photo';
import type { ApiErrorCode, FoodEstimate, FoodQuestion, FoodSource } from '../../src/types';

type Step = 'input' | 'questions' | 'review' | 'saved';
type Mode = 'text' | 'photo';

const CONFIDENCE_NOTE: Record<string, string> = {
  low: 'A rough estimate. Check the portions before you save.',
  medium: 'A good estimate. Adjust anything that looks off.',
  high: 'A close estimate.',
};

function toEditable(e: FoodEstimate | null): EditableEstimate {
  return {
    label: e?.label ?? '',
    kcal: e ? String(Math.round(e.kcal)) : '',
    protein: e ? String(Math.round(e.protein)) : '',
    carbs: e ? String(Math.round(e.carbs)) : '',
    fat: e ? String(Math.round(e.fat)) : '',
    slot: slotForNow(),
    items: e?.items ?? [],
  };
}

export default function LogFoodScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { userId } = useAuth();
  const food = useFoodLogs(todayId());
  const inset = useSafeAreaInsets();

  const local = !isCloudUser(userId);
  const [mode, setMode] = useState<Mode>(params.mode === 'photo' && !local ? 'photo' : 'text');
  const [step, setStep] = useState<Step>('input');
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [photo, setPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ApiErrorCode; message: string } | null>(null);
  const [draft, setDraft] = useState<FoodEstimate | null>(null);
  const [questions, setQuestions] = useState<FoodQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [estimate, setEstimate] = useState<FoodEstimate | null>(null);
  const [edit, setEdit] = useState<EditableEstimate>(toEditable(null));
  const [source, setSource] = useState<FoodSource>('text');
  const [saved, setSaved] = useState<{ label: string; kcal: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (params.mode === 'photo' || params.mode === 'text') setMode(local ? 'text' : params.mode);
  }, [params.mode, local]);

  function reset() {
    setStep('input');
    setText('');
    setPhoto(null);
    setError(null);
    setDraft(null);
    setQuestions([]);
    setAnswers({});
    setTyped({});
    setEstimate(null);
    setSaved(null);
    setSaveError(null);
  }

  function toReview(e: FoodEstimate | null, src: FoodSource) {
    setEstimate(e);
    setEdit(e ? toEditable(e) : { ...toEditable(null), label: text.trim().slice(0, 120) });
    setSource(src);
    setStep('review');
  }

  async function pick(camera: boolean) {
    if (picking) return;
    setPicking(true);
    setError(null);
    try {
      const shot = await takeMealPhoto(camera);
      if (shot) setPhoto(shot);
    } catch (e) {
      if (e instanceof PermissionDenied) {
        const t = permissionText(e.kind);
        await showAlert(t.title, t.body);
      } else {
        setError({ code: 'bad_request', message: String((e as Error)?.message ?? "Couldn't open that photo.") });
      }
    } finally {
      setPicking(false);
    }
  }

  async function analyse() {
    if (!userId || busy) return;
    setBusy(true);
    setError(null);
    const src: FoodSource = mode === 'photo' ? 'photo' : 'text';
    try {
      const a = await analyzeFood(userId, mode === 'photo' ? { photoBase64: photo?.base64 ?? '', note: text.trim() || undefined } : { text });
      if (a.status === 'questions' && a.questions.length) {
        setDraft(a.draft);
        setQuestions(a.questions);
        setSource(src);
        setStep('questions');
      } else {
        toReview(a.status === 'final' ? a.estimate : a.draft, src);
      }
    } catch (e) {
      const err = asApiError(e);
      setError({ code: err.code, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function answer(skip = false) {
    if (!userId || !draft || busy) return;
    setBusy(true);
    setError(null);
    const list = skip
      ? []
      : questions
          .map((q) => ({ id: q.id, answer: (typed[q.id] ?? '').trim() || answers[q.id] || '' }))
          .filter((a) => a.answer);
    try {
      const est = await answerFoodQuestions(userId, draft, questions, list);
      toReview(est, source);
    } catch (e) {
      const err = asApiError(e);
      setError({ code: err.code, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const problem = estimateProblem(edit);
    if (problem) {
      setSaveError(problem);
      return;
    }
    setBusy(true);
    setSaveError(null);
    const m = parsed(edit);
    const followUp = questions
      .map((q) => ({ question: q.question, answer: (typed[q.id] ?? '').trim() || answers[q.id] || '' }))
      .filter((x) => x.answer);
    try {
      await food.add({
        label: edit.label.trim(),
        ...m,
        confidence: estimate?.confidence ?? 'medium',
        source,
        slot: edit.slot,
        items: edit.items,
        followUp,
      });
      setSaved({ label: edit.label.trim(), kcal: m.kcal });
      setStep('saved');
    } catch (e) {
      setSaveError(asApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const answeredCount = questions.filter((q) => (typed[q.id] ?? '').trim() || answers[q.id]).length;
  const canAnalyse = mode === 'text' ? !!text.trim() : !!photo;

  // ─────────── the sticky action for each step ───────────
  let action: React.ReactNode = null;
  if (step === 'input' && local) {
    action = <Button icon="edit" label="Enter the numbers" onPress={() => toReview(null, 'text')} />;
  } else if (step === 'input') {
    action = <Button label={busy ? 'Reading it' : 'Get the estimate'} onPress={() => void analyse()} busy={busy} disabled={!canAnalyse} />;
  } else if (step === 'questions') {
    action = (
      <Button
        label={busy ? 'Working it out' : answeredCount ? 'Get my estimate' : 'Answer to get my estimate'}
        onPress={() => void answer()}
        busy={busy}
        disabled={!answeredCount}
      />
    );
  } else if (step === 'review') {
    action = <Button icon="check" label={parsed(edit).kcal ? `Save ${parsed(edit).kcal.toLocaleString()} kcal to today` : 'Save to today'} onPress={() => void save()} busy={busy} />;
  } else if (step === 'saved') {
    action = <Button label="Back to Food" onPress={() => goBack('/(tabs)/food')} />;
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 140, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <BackHeader
          title={step === 'review' ? 'Check the numbers' : step === 'questions' ? 'A quick question' : step === 'saved' ? 'Logged' : 'Log what I have'}
          subtitle={
            step === 'review'
              ? 'Edit anything that looks off. It counts once you save.'
              : step === 'questions'
                ? 'Answer what you can. It makes the estimate closer.'
                : step === 'saved'
                  ? undefined
                  : 'Off-plan food counts toward today.'
          }
          fallback="/(tabs)/food"
        />

        {step === 'input' && local ? (
          <>
            <NeedsAccount message={params.mode === 'photo' ? 'Photo estimates need an account. Without one, type what you ate and enter the numbers yourself.' : 'Estimates need an account. Without one, type what you ate and enter the numbers yourself.'} />
            <Field label="What did you eat?" value={text} onChangeText={setText} placeholder="2 eggs, 1 pita, labneh" maxLength={120} />
          </>
        ) : null}

        {step === 'input' && !local ? (
          <>
            <Segmented
              label="How to log it"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setError(null);
              }}
              options={[
                { value: 'text', label: 'Type it' },
                { value: 'photo', label: 'Photo' },
              ]}
            />
            {mode === 'text' ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>What did you eat?</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder="2 eggs, 1 pita, labneh"
                  placeholderTextColor={C.faint}
                  accessibilityLabel="What did you eat"
                  multiline
                  maxLength={600}
                  autoFocus={Platform.OS !== 'web'}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  style={[
                    {
                      minHeight: 120,
                      color: C.text,
                      backgroundColor: C.card,
                      borderWidth: 1,
                      borderColor: focused ? C.green : C.inputBorder,
                      borderRadius: R.input,
                      padding: 14,
                      fontSize: 17,
                      lineHeight: 24,
                      fontFamily: FONT.body,
                      textAlignVertical: 'top',
                    },
                    Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                  ]}
                />
                <Text style={T.small}>Amounts help: &quot;a bowl&quot;, &quot;2 slices&quot;, &quot;150 g&quot;.</Text>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {photo ? (
                  <View style={[cardStyle, { padding: 12, gap: 12 }]}>
                    <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: R.tile, backgroundColor: C.raised }} accessibilityLabel="Your meal photo" accessibilityIgnoresInvertColors />
                    <Button compact variant="secondary" icon="refresh" label="Choose another" onPress={() => void pick(false)} disabled={picking} />
                  </View>
                ) : (
                  <View style={[cardStyle, { alignItems: 'center', gap: 16, paddingVertical: 32 }]}>
                    <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="camera" size={30} color={C.stone} />
                    </View>
                    <Text style={[T.meta, { textAlign: 'center', maxWidth: 300 }]}>Photograph the plate from above in good light. The photo is only used for this estimate.</Text>
                    <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
                      {Platform.OS !== 'web' ? <Button variant="secondary" icon="camera" label="Camera" onPress={() => void pick(true)} busy={picking} style={{ flex: 1 }} accessibilityLabel="Take a photo of your meal" /> : null}
                      <Button
                        variant="secondary"
                        icon="image"
                        label={Platform.OS !== 'web' ? 'Photos' : 'Choose a photo'}
                        onPress={() => void pick(false)}
                        busy={picking && Platform.OS === 'web'}
                        style={{ flex: 1 }}
                        accessibilityLabel="Choose a photo of your meal"
                      />
                    </View>
                  </View>
                )}
                <Field label="Anything the photo can't show? (optional)" value={text} onChangeText={setText} placeholder="Cooked in butter, half the rice" maxLength={200} />
              </View>
            )}
            {busy ? <StateBlock kind="loading" title={mode === 'photo' ? 'Reading your plate' : 'Working out the numbers'} style={{ paddingVertical: 8 }} /> : null}
            {error ? <ErrorBlock error={error} onManual={() => toReview(null, mode === 'photo' ? 'photo' : 'text')} onRetry={() => void analyse()} /> : null}
            {!error ? (
              <LinkButton align="flex-start" onPress={() => toReview(null, mode === 'photo' ? 'photo' : 'text')} accessibilityLabel="Enter the numbers yourself">
                <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>I know the numbers, enter them myself</Text>
              </LinkButton>
            ) : null}
          </>
        ) : null}

        {step === 'questions' ? (
          <>
            {draft ? (
              <View style={[cardStyle, { gap: 4 }]}>
                <Text style={T.small}>First guess</Text>
                <Text style={T.bodyStrong}>{draft.label}</Text>
                <MacroLine m={draft} />
              </View>
            ) : null}
            {questions.map((q, qi) => (
              <View key={q.id} style={{ gap: 12 }}>
                <Text style={T.h3}>
                  {questions.length > 1 ? `${qi + 1}. ` : ''}
                  {q.question}
                </Text>
                {q.options.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={q.question}>
                    {q.options.map((o) => (
                      <Chip
                        key={o}
                        label={o}
                        selected={answers[q.id] === o && !(typed[q.id] ?? '').trim()}
                        onPress={() => {
                          setAnswers((a) => ({ ...a, [q.id]: a[q.id] === o ? '' : o }));
                          setTyped((t) => ({ ...t, [q.id]: '' }));
                        }}
                      />
                    ))}
                  </View>
                ) : null}
                {q.allowFreeText !== false ? (
                  <Field
                    value={typed[q.id] ?? ''}
                    onChangeText={(t) => setTyped((x) => ({ ...x, [q.id]: t }))}
                    placeholder={q.options.length ? 'Or type your answer' : 'Type your answer'}
                    accessibilityLabel={`Your answer: ${q.question}`}
                    maxLength={160}
                  />
                ) : null}
              </View>
            ))}
            {busy ? <StateBlock kind="loading" title="Working out the numbers" style={{ paddingVertical: 8 }} /> : null}
            {error ? <ErrorBlock error={error} onManual={() => toReview(draft, source)} onRetry={() => void answer()} /> : null}
            <LinkButton align="flex-start" onPress={() => void answer(true)} accessibilityLabel="Skip the questions and use the first guess">
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>Skip, use the first guess</Text>
            </LinkButton>
          </>
        ) : null}

        {step === 'review' ? (
          <>
            {estimate ? <Notice>{CONFIDENCE_NOTE[estimate.confidence] ?? CONFIDENCE_NOTE.medium}</Notice> : <Notice>Enter what you know. Calories are enough to count it; macros make the day more accurate.</Notice>}
            <EstimateEditor value={edit} onChange={(v) => {
              setEdit(v);
              setSaveError(null);
            }} />
            {saveError ? <Notice tone="error">{saveError}</Notice> : null}
          </>
        ) : null}

        {step === 'saved' && saved ? (
          <View style={[cardStyle, { alignItems: 'center', gap: 12, paddingVertical: 32 }]} accessibilityLiveRegion="polite">
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={30} color={C.green} strokeWidth={2.6} />
            </View>
            <Text style={[T.h2, { textAlign: 'center' }]}>{saved.kcal.toLocaleString()} kcal added to today</Text>
            <Text style={[T.meta, { textAlign: 'center' }]}>{saved.label}</Text>
            <LinkButton onPress={reset} accessibilityLabel="Log something else">
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Log something else</Text>
            </LinkButton>
          </View>
        ) : null}
      </ScrollView>

      {action ? (
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
          <View style={{ maxWidth: 600, width: '100%', alignSelf: 'center' }}>{action}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ErrorBlock({ error, onManual, onRetry }: { error: { code: ApiErrorCode; message: string }; onManual: () => void; onRetry: () => void }) {
  if (error.code === 'needs_account') {
    return (
      <View style={{ gap: 8 }}>
        <NeedsAccount message="Estimates from a photo or a description need an account. You can still enter the numbers yourself." />
        <Button variant="secondary" icon="edit" label="Enter the numbers myself" onPress={onManual} />
      </View>
    );
  }
  const retry = error.code === 'offline' || error.code === 'ai_busy' || error.code === 'server_error';
  return (
    <View style={{ gap: 8 }}>
      <Notice tone="error">{error.message}</Notice>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {retry ? <Button compact variant="secondary" icon="refresh" label="Try again" onPress={onRetry} style={{ flex: 1 }} /> : null}
        <Button compact variant="secondary" icon="edit" label="Enter it myself" onPress={onManual} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

