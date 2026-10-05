/* Workout: set-by-set logging with a rest timer. The route param `day` is
   the calendar day id (yyyy-mm-dd) in the current week, so a workout moved
   to another day opens on that day; state lives in the shared plan store.
   Swapped exercises say what they replace, every exercise shows its coaching
   note, and any exercise can be replaced from here. The header maps the
   muscles the session works. Ticking the last set completes the workout
   and triggers the celebration. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, card as cardStyle, FONT, screen, T } from '../../src/design';
import { exerciseLabel, restFor } from '../../src/planData';
import { usePlan } from '../../src/planStore';
import { useRestTimer } from '../../src/useRestTimer';
import { useCelebration } from '../../src/celebration';
import { Button } from '../../src/components/Button';
import { ProgressBar } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { ReplaceExerciseSheet } from '../../src/components/training/ReplaceExerciseSheet';
import { SetTile } from '../../src/components/training/Controls';
import { MuscleLegend, MuscleMap } from '../../src/components/training/MuscleMap';
import { muscleNames, musclesForExercises } from '../../src/lib/muscles';
import { BackHeader } from '../../src/components/training/BackHeader';
import { useExerciseVideo, WatchHowButton } from '../../src/components/training/ExerciseVideo';
import type { PlanWorkoutV2 } from '../../src/types';

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <View style={{ padding: 20, paddingTop: 8, gap: 24, flex: 1, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <BackHeader title={title} subtitle={body} fallback="/(tabs)/plan" />
        <Button label="Back to your plan" variant="secondary" icon="dumbbell" onPress={() => router.replace('/(tabs)/plan')} style={{ alignSelf: 'flex-start' }} />
      </View>
    </SafeAreaView>
  );
}

export default function WorkoutScreen() {
  const params = useLocalSearchParams<{ day: string }>();
  const dayId = String(params.day ?? '');
  const { days, toggleSet, setWorkoutDone, optionsFor, replaceExercise } = usePlan();
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const day = days.find((d) => d.id === dayId);
  const inset = useSafeAreaInsets();
  const celebration = useCelebration();
  const video = useExerciseVideo();

  const timer = useRestTimer();
  const [expanded, setExpanded] = useState<number | null>(0);
  const celebratedRef = useRef(false);
  const userTouchedRef = useRef(false);

  useEffect(() => {
    setExpanded(0);
    timer.stop();
    celebratedRef.current = false;
    userTouchedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId]);

  const muscles = useMemo(
    () => (day?.session.kind === 'workout' ? musclesForExercises(day.session.exercises.map((e) => e.id ?? e.name)) : { primary: [], secondary: [] }),
    [day],
  );

  const progress = useMemo(() => {
    if (!day || day.session.kind !== 'workout') return { total: 0, done: 0 };
    const total = day.session.exercises.reduce((a, e) => a + e.sets, 0);
    const done = day.session.exercises.reduce((a, e, i) => a + Math.min(e.sets, day.done.exercises[i]?.length ?? 0), 0);
    return { total, done };
  }, [day]);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/plan');
  };

  // Complete on the last set: celebrate once when every set is ticked by hand.
  useEffect(() => {
    if (!day || day.session.kind !== 'workout') return;
    const complete = progress.total > 0 && progress.done === progress.total;
    if (complete && userTouchedRef.current && !celebratedRef.current) {
      celebratedRef.current = true;
      timer.stop();
      void setWorkoutDone(dayId, true);
      celebration.show({ done: progress.done, total: progress.total, focus: (day.session as PlanWorkoutV2).focus, onDone: leave });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.done, progress.total, day?.id]);

  if (!day) {
    return <EmptyState title="Workout not found" body="That day isn't in this week's plan. Pick a day from your plan to start training." />;
  }
  if (day.session.kind !== 'workout') {
    return <EmptyState title="Rest day" body={day.session.note} />;
  }

  const w = day.session as PlanWorkoutV2;
  const replacing = replaceIdx != null ? w.exercises[replaceIdx] ?? null : null;
  const allSetsDone = progress.total > 0 && progress.done === progress.total;

  function completeWorkout() {
    timer.stop();
    if (day?.done.workout) return;
    celebratedRef.current = true;
    void setWorkoutDone(dayId, true);
    celebration.show({ done: progress.total, total: progress.total, focus: w.focus, onDone: leave });
  }

  function clearAll() {
    timer.stop();
    void setWorkoutDone(dayId, false);
    celebratedRef.current = false;
    userTouchedRef.current = false;
  }

  return (
    <View style={[screen, { paddingTop: inset.top }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 20, paddingBottom: 132, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <BackHeader title={w.focus} subtitle={`${w.minutes} min · ${w.exercises.length} exercises · ${progress.total} sets`} fallback="/(tabs)/plan" />

        {muscles.primary.length || muscles.secondary.length ? (
          <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 20, padding: 16 }]}>
            <MuscleMap primary={muscles.primary} secondary={muscles.secondary} size="large" />
            <View style={{ flex: 1 }}>
              <MuscleLegend primary={muscleNames(muscles.primary)} secondary={muscleNames(muscles.secondary)} />
            </View>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <ProgressBar value={progress.total ? progress.done / progress.total : 0} height={8} />
          <Text style={T.small} accessibilityLiveRegion="polite">
            {progress.done} of {progress.total} sets done
          </Text>
        </View>

        {timer.running ? (
          <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.greenBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={T.small}>Rest</Text>
              <Text
                style={{ fontFamily: FONT.displaySemi, fontSize: 36, lineHeight: 42, color: C.green, fontVariant: ['tabular-nums'] }}
                accessibilityLabel={`Rest, ${timer.remaining ?? 0} seconds left`}
              >
                {mmss(timer.remaining ?? 0)}
              </Text>
            </View>
            <Button compact variant="secondary" label="+30s" onPress={() => timer.add(30)} accessibilityLabel="Add 30 seconds of rest" />
            <Button compact variant="secondary" label="Skip" onPress={timer.stop} accessibilityLabel="Skip rest" />
          </View>
        ) : null}

        {w.exercises.map((ex, i) => {
          const open = expanded === i;
          const setDone = day.done.exercises[i] ?? [];
          const all = setDone.length >= ex.sets;
          return (
            <View key={`${ex.name}-${i}`} style={[cardStyle, { gap: 14, padding: 16 }]}>
              <Pressable
                onPress={() => setExpanded(open ? null : i)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                accessibilityLabel={`${ex.name}, ${exerciseLabel(ex)}, ${setDone.length} of ${ex.sets} sets done`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: all ? C.greenTint : C.raised,
                    borderWidth: all ? 2 : 0,
                    borderColor: C.green,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {all ? (
                    <Icon name="check" size={20} color={C.green} strokeWidth={2.6} />
                  ) : (
                    <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: C.text }}>{i + 1}</Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.h3, { color: all ? C.muted : C.text }]}>{ex.name}</Text>
                  <Text style={T.small}>
                    {exerciseLabel(ex)} · rest {restFor(ex)}s
                  </Text>
                </View>
                <Text style={[T.small, { color: all ? C.green : C.muted }]}>
                  {setDone.length}/{ex.sets}
                </Text>
                <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
                  <Icon name="chevronRight" size={18} color={C.muted} />
                </View>
              </Pressable>

              {ex.replaced_from ? <Text style={[T.small, { color: C.stone }]}>Replaces {ex.replaced_from}</Text> : null}
              {ex.note ? <Text style={T.small}>{ex.note}</Text> : null}
              <WatchHowButton exercise={ex} onWatch={video.watch} />

              {open ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {Array.from({ length: ex.sets }, (_, s) => {
                    const on = setDone.includes(s);
                    const load =
                      ex.kg != null ? `${ex.kg} kg` : ex.unit === 's' ? `${ex.reps}s` : ex.unit === 'm' ? `${ex.reps}m` : `${ex.reps} reps`;
                    return (
                      <SetTile
                        key={s}
                        index={s}
                        load={load}
                        on={on}
                        onToggle={() => {
                          userTouchedRef.current = true;
                          void toggleSet(dayId, i, s);
                          if (!on) timer.start(restFor(ex));
                        }}
                      />
                    );
                  })}
                </View>
              ) : null}
              {open && setDone.length === 0 ? (
                <Button compact variant="secondary" icon="swap" label="Replace this exercise" onPress={() => setReplaceIdx(i)} accessibilityLabel={`Replace ${ex.name}`} />
              ) : null}
            </View>
          );
        })}

        {swapNote ? <Text style={[T.small, { color: C.stone }]} accessibilityLiveRegion="polite">{swapNote}</Text> : null}
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
        <View style={{ maxWidth: 600, width: '100%', alignSelf: 'center', flexDirection: 'row', gap: 12 }}>
          {allSetsDone ? (
            <>
              <Button variant="secondary" label="Clear all sets" onPress={clearAll} style={{ flex: 1 }} />
              <Button label="Done" icon="check" onPress={leave} style={{ flex: 1 }} accessibilityLabel="Done, back to your plan" />
            </>
          ) : (
            <Button label="Complete workout" icon="check" onPress={completeWorkout} style={{ flex: 1 }} />
          )}
        </View>
      </View>

      <ReplaceExerciseSheet
        visible={replaceIdx != null}
        onClose={() => setReplaceIdx(null)}
        exercise={replacing}
        options={replaceIdx != null ? optionsFor(dayId, replaceIdx) : []}
        onReplace={async (rep, scope) => {
          const name = replacing?.name;
          const r = await replaceExercise(dayId, replaceIdx ?? 0, rep, scope);
          if (r.ok) setSwapNote(`${name} replaced with ${rep.name}${scope === 'always' ? ' for good' : ' this week'}.`);
          return r;
        }}
      />
      {video.sheet}
    </View>
  );
}
