/* Workout detail: set-by-set logging with a rest timer. Route param `day` is
   the plan-day id (yyyy-mm-dd); state lives in the shared plan store backed
   by Supabase. Completing all sets triggers the global celebration. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, card as cardStyle, screen, sectionLabel } from '../../src/design';
import { exerciseLabel, PlanWorkout, restFor } from '../../src/planData';
import { usePlan } from '../../src/planStore';
import { useRestTimer } from '../../src/useRestTimer';
import { useCelebration } from '../../src/celebration';

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function WorkoutScreen() {
  const params = useLocalSearchParams<{ day: string }>();
  const dayId = params.day;
  const { days, toggleSet, toggleWorkout, toggleExercise } = usePlan();
  const day = days.find((d) => d.id === dayId);
  const inset = useSafeAreaInsets();
  const celebration = useCelebration();

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

  const progress = useMemo(() => {
    if (!day || day.session.kind !== 'workout') return { total: 0, done: 0 };
    const total = day.session.exercises.reduce((a, e) => a + e.sets, 0);
    const done = day.session.exercises.reduce(
      (a, e, i) => a + Math.min(e.sets, day.done.exercises[i]?.length ?? 0),
      0,
    );
    return { total, done };
  }, [day]);

  // Complete-on-last-set: celebrate once when every set is ticked by hand.
  useEffect(() => {
    if (!day || day.session.kind !== 'workout') return;
    const complete = progress.total > 0 && progress.done === progress.total;
    if (complete && userTouchedRef.current && !celebratedRef.current) {
      celebratedRef.current = true;
      timer.stop();
      if (!day.done.workout) toggleWorkout(dayId);
      celebration.show({
        done: progress.done,
        total: progress.total,
        focus: (day.session as PlanWorkout).focus,
        onDone: () => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/plan');
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.done, progress.total, day?.id]);

  if (!day || day.session.kind !== 'workout') {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <View style={{ padding: 20, gap: 10 }}>
          <Text style={sectionLabel}>Workout</Text>
          <Text style={{ color: C.muted, fontSize: 15 }}>Rest day — nothing to log.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const w = day.session as PlanWorkout;
  const allSetsDone = progress.total > 0 && progress.done === progress.total;

  function completeWorkout() {
    if (!day || day.session.kind !== 'workout') return;
    timer.stop();
    const wasDone = day.done.workout;
    if (!wasDone) {
      toggleWorkout(dayId);
      celebratedRef.current = true;
      celebration.show({
        done: progress.total,
        total: progress.total,
        focus: w.focus,
        onDone: () => {
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/plan');
        },
      });
    }
  }

  function clearAll() {
    const d = day as NonNullable<typeof day>;
    if (d.session.kind !== 'workout') return;
    d.session.exercises.forEach((_, i) => {
      if ((d.done.exercises[i] ?? []).length > 0) toggleExercise(d.id, i);
    });
    if (d.done.workout) toggleWorkout(d.id);
    celebratedRef.current = false;
  }

  return (
    <View style={[screen, { paddingBottom: inset.bottom }]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}>
        <View style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={() => router.back()}
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.line,
                backgroundColor: C.card,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: C.text, fontSize: 18, fontWeight: '700' }}>←</Text>
            </Pressable>
            <Text style={sectionLabel}>PLAN</Text>
          </View>

          <View style={{ gap: 2 }}>
            <Text style={{ color: C.text, fontSize: 26, fontWeight: '800' }}>{w.focus}</Text>
            <Text style={{ color: C.muted, fontSize: 14 }}>
              {w.minutes} min · {w.exercises.length} exercises · {progress.total} sets
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: C.cardStrong,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: 6,
              backgroundColor: C.mint,
              width: progress.total
                ? `${Math.round((progress.done / progress.total) * 100)}%`
                : '0%',
            }}
          />
        </View>

        {timer.running ? (
          <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View style={{ flex: 1 }}>
              <Text style={sectionLabel}>Rest</Text>
              <Text
                style={{
                  color: C.mint,
                  fontSize: 32,
                  fontWeight: '800',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {mmss(timer.remaining ?? 0)}
              </Text>
            </View>
            <Pressable
              onPress={() => timer.add(30)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.line,
              }}
            >
              <Text style={{ color: C.text, fontWeight: '700' }}>+30s</Text>
            </Pressable>
            <Pressable
              onPress={timer.stop}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 12,
                backgroundColor: C.cardStrong,
              }}
            >
              <Text style={{ color: C.muted, fontWeight: '700' }}>Skip</Text>
            </Pressable>
          </View>
        ) : null}

        {w.exercises.map((ex, i) => {
          const open = expanded === i;
          const setDone = day.done.exercises[i] ?? [];
          const all = setDone.length >= ex.sets;
          return (
            <View key={`${ex.name}-${i}`} style={[cardStyle, { gap: 10 }]}>
              <Pressable onPress={() => setExpanded(open ? null : i)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 10,
                      backgroundColor: all ? C.mintDim : C.cardStrong,
                      borderWidth: 1,
                      borderColor: all ? C.mint : C.line,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: all ? C.mint : C.muted, fontWeight: '800', fontSize: 13 }}>
                      {all ? '✓' : i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: all ? C.muted : C.text,
                        fontSize: 16,
                        fontWeight: '700',
                        textDecorationLine: all ? 'line-through' : 'none',
                      }}
                    >
                      {ex.name}
                    </Text>
                    <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                      {exerciseLabel(ex)} · rest {restFor(ex)}s
                    </Text>
                  </View>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    {setDone.length}/{ex.sets}
                  </Text>
                </View>
              </Pressable>

              {open ? (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {Array.from({ length: ex.sets }, (_, s) => {
                    const on = setDone.includes(s);
                    const load =
                      ex.kg != null
                        ? `${ex.kg} kg`
                        : ex.unit === 's'
                          ? `${ex.reps}s`
                          : ex.unit === 'm'
                            ? `${ex.reps}m`
                            : `${ex.reps} reps`;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => {
                          userTouchedRef.current = true;
                          toggleSet(dayId, i, s);
                          if (!on) timer.start(restFor(ex));
                        }}
                        style={{
                          minWidth: 64,
                          paddingVertical: 12,
                          borderRadius: 12,
                          backgroundColor: on ? C.mint : C.cardStrong,
                          borderWidth: 1,
                          borderColor: on ? C.mint : C.line,
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: on ? '#04120C' : C.text,
                            fontWeight: '800',
                            fontSize: 14,
                          }}
                        >
                          {on ? '✓' : `Set ${s + 1}`}
                        </Text>
                        <Text
                          style={{
                            color: on ? 'rgba(4,18,12,0.7)' : C.muted,
                            fontSize: 11,
                            marginTop: 1,
                          }}
                        >
                          {load}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: 16,
          backgroundColor: 'rgba(5,7,10,0.95)',
          borderTopWidth: 1,
          borderTopColor: C.line,
        }}
      >
        <Pressable
          onPress={allSetsDone ? clearAll : completeWorkout}
          style={[
            { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
            allSetsDone
              ? { backgroundColor: C.mintDim, borderWidth: 1, borderColor: C.mint }
              : { backgroundColor: C.mint },
          ]}
        >
          <Text
            style={{
              color: allSetsDone ? C.mint : '#04120C',
              fontWeight: '800',
              fontSize: 15,
            }}
          >
            {allSetsDone ? 'Clear all sets' : 'Complete workout'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
