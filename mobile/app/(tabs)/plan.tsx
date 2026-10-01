/* Plan: the week, rendered through weekView (moved days and swaps
   applied). Pick a day; open, tick or move its workout; replace any
   exercise with one of three that fit your kit and injuries; switch
   between home and gym for the week; ask for a change in your own words
   and read what changed. Check-offs save to the account, or to this
   device without one. */

import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { LOCATION_LABEL, movableDays, setsLabel, setsOf, WeekDay } from '../../src/planData';
import { usePlan } from '../../src/planStore';
import { useCelebration } from '../../src/celebration';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { CheckBox, Notice, ProgressBar, ScreenHeader } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { MacroLine, Segmented, StateBlock } from '../../src/components/training/Controls';
import { MoveDaySheet } from '../../src/components/training/MoveDaySheet';
import { ReplaceExerciseSheet } from '../../src/components/training/ReplaceExerciseSheet';
import { ChangePlanCard } from '../../src/components/training/PlanChange';
import { OfflineBlock, OfflineNotice } from '../../src/components/OfflineNotice';
import { useAuth } from '../../src/auth';
import { DAY_FULL, DAY_SHORT, dayTitle, plural, timeLabel } from '../../src/components/training/labels';
import type { PlanWorkoutV2 } from '../../src/types';

function DayChip({ day, today, selected, onPress }: { day: WeekDay; today: boolean; selected: boolean; onPress: () => void }) {
  const workoutDone = day.session.kind === 'workout' && day.done.workout;
  const rest = day.session.kind === 'rest';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${DAY_FULL[day.index]}${today ? ', today' : ''}. ${rest ? 'Rest day' : day.session.focus}${workoutDone ? ', done' : ''}${day.moved ? ', moved this week' : ''}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 44,
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: R.tile,
        backgroundColor: selected ? C.stone : pressed ? C.raised : rest ? C.surface : C.card,
        borderWidth: 1.5,
        borderColor: selected ? C.stone : today ? C.greenBorder : 'transparent',
      })}
    >
      <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 12, color: selected ? C.bg : C.muted }}>{DAY_SHORT[day.index]}</Text>
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 17, color: selected ? C.bg : C.text }}>{Number(day.id.slice(8))}</Text>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: workoutDone ? (selected ? C.bg : C.green) : 'transparent',
          borderWidth: day.moved && !workoutDone ? 1.5 : 0,
          borderColor: selected ? C.bg : C.muted,
        }}
      />
    </Pressable>
  );
}

export default function PlanTab() {
  const {
    days,
    todayIdx,
    todayId,
    aiPlan,
    syncState,
    planLoaded,
    location,
    locations,
    setLocation,
    weekChanged,
    generating,
    setWorkoutDone,
    toggleExercise,
    moveDay,
    resetWeek,
    optionsFor,
    replaceExercise,
    regenerate,
  } = usePlan();
  const { session, profileLoaded, profile, profileError } = useAuth();
  const celebration = useCelebration();
  const [selected, setSelected] = useState(todayIdx);
  const [moveOpen, setMoveOpen] = useState(false);
  const [replaceIdx, setReplaceIdx] = useState<number | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // Midnight rollover (or a new week): jump back to the new today.
  useEffect(() => {
    setSelected(todayIdx);
  }, [todayId, todayIdx]);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(t);
  }, [note]);

  const day = days[selected] ?? days[todayIdx];
  const movable = useMemo(() => movableDays(days, todayId), [days, todayId]);
  const options = useMemo(() => (day && replaceIdx != null ? optionsFor(day.id, replaceIdx) : []), [day, replaceIdx, optionsFor]);

  const waiting = !planLoaded || (!!session && !profileLoaded);
  const unreachable = !!session && profileLoaded && !profile && !!profileError;
  if (!day || waiting || unreachable) {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <View style={{ padding: 20, gap: 24, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <ScreenHeader title="Your plan" subtitle={day ? `Today, ${dayTitle(day.index, day.id)}` : undefined} />
          {unreachable ? (
            <OfflineBlock body="Your plan shows here as soon as BUILT answers again. Nothing you saved is lost." />
          ) : (
            <View style={cardStyle}>
              <StateBlock kind="loading" title="Loading your plan" />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const isWorkout = day.session.kind === 'workout';
  const canMove = movable.has(day.id) && days.some((d) => d.id !== day.id && movable.has(d.id));
  const replacing = isWorkout && replaceIdx != null ? (day.session as PlanWorkoutV2).exercises[replaceIdx] ?? null : null;

  function markComplete() {
    if (day.session.kind !== 'workout') return;
    const w = day.session;
    if (!day.done.workout) {
      void setWorkoutDone(day.id, true);
      const total = w.exercises.reduce((a, e) => a + e.sets, 0);
      celebration.show({ done: total, total, focus: w.focus, caption: 'Marked complete from your plan' });
    } else {
      void setWorkoutDone(day.id, false);
    }
  }

  async function onMove(toIdx: number) {
    const fromName = DAY_FULL[day.index];
    const r = await moveDay(day.index, toIdx);
    if (r.ok) {
      setSelected(toIdx);
      setNote({ tone: 'success', text: `${day.session.kind === 'rest' ? 'Rest day' : day.session.focus} moved from ${fromName} to ${DAY_FULL[toIdx]}.` });
    }
    return r;
  }

  async function onReset() {
    const r = await resetWeek();
    setNote(r.ok ? { tone: 'success', text: 'This week is back to your plan.' } : { tone: 'error', text: r.error ?? "That didn't save. Try again." });
  }

  const footer = aiPlan
    ? 'Built by your coach from your answers.'
    : syncState === 'local'
      ? 'Starter plan from your answers. With an account your coach builds and adjusts one around you.'
      : 'Starter plan from your answers. Ask for a change below and your coach builds one around you.';

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Your plan" subtitle={selected === todayIdx ? `Today, ${dayTitle(day.index, day.id)}` : dayTitle(day.index, day.id)} />

        <OfflineNotice />

        {locations.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Text style={T.small}>Training this week at</Text>
            <Segmented label="Where you train this week" value={location} onChange={setLocation} options={locations.map((l) => ({ value: l, label: LOCATION_LABEL[l] }))} />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: -6 }} accessibilityRole="tablist">
          {days.map((d, i) => (
            <DayChip key={d.id} day={d} today={i === todayIdx} selected={d.id === day.id} onPress={() => setSelected(i)} />
          ))}
        </View>

        {note ? <Notice tone={note.tone}>{note.text}</Notice> : null}

        {isWorkout ? (
          <WorkoutCard
            day={day}
            onOpen={() => router.push(`/workout/${day.id}`)}
            onToggleExercise={(i) => void toggleExercise(day.id, i)}
            onReplace={(i) => setReplaceIdx(i)}
            onMarkComplete={markComplete}
            onMove={canMove ? () => setMoveOpen(true) : undefined}
          />
        ) : (
          <View style={[cardStyle, { gap: 12 }]}>
            <View style={{ gap: 6 }}>
              <Text style={T.small}>Recovery</Text>
              <Text style={T.h2}>Rest day</Text>
              <Text style={T.meta}>{day.session.kind === 'rest' ? day.session.note : ''}</Text>
            </View>
            {canMove ? <Button variant="secondary" icon="calendar" label="Move rest day" onPress={() => setMoveOpen(true)} /> : null}
            <LinkButton align="flex-start" onPress={() => router.push('/activity/log')} accessibilityLabel="Log an activity">
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Went for a walk or a game? Log it</Text>
            </LinkButton>
          </View>
        )}

        {weekChanged ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={[T.meta, { flex: 1 }]}>This week has your changes.</Text>
            <Button compact variant="secondary" label="Undo them" onPress={() => void onReset()} accessibilityLabel="Undo this week's moved days and swaps" />
          </View>
        ) : null}

        <MealsCard day={day} isToday={selected === todayIdx} />

        <ChangePlanCard regenerate={regenerate} generating={generating} />

        <Text style={[T.small, { textAlign: 'center', color: C.faint }]}>{footer}</Text>
      </ScrollView>

      <MoveDaySheet visible={moveOpen} onClose={() => setMoveOpen(false)} days={days} from={day} movable={movable} today={todayId} onMove={onMove} />
      <ReplaceExerciseSheet
        visible={replaceIdx != null}
        onClose={() => setReplaceIdx(null)}
        exercise={replacing}
        options={options}
        onReplace={async (rep, scope) => {
          const name = replacing?.name;
          const r = await replaceExercise(day.id, replaceIdx ?? 0, rep, scope);
          if (r.ok) setNote({ tone: 'success', text: `${name} replaced with ${rep.name}${scope === 'always' ? ' for good' : ' this week'}.` });
          return r;
        }}
      />
    </SafeAreaView>
  );
}

function WorkoutCard({
  day,
  onOpen,
  onToggleExercise,
  onReplace,
  onMarkComplete,
  onMove,
}: {
  day: WeekDay;
  onOpen: () => void;
  onToggleExercise: (i: number) => void;
  onReplace: (i: number) => void;
  onMarkComplete: () => void;
  onMove?: () => void;
}) {
  const w = day.session as PlanWorkoutV2;
  const exDone = w.exercises.filter((ex, i) => (day.done.exercises[i] ?? []).length >= ex.sets).length;
  const sets = setsOf(day);
  const when = timeLabel(w.time);
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>{day.moved ? 'Workout, moved here this week' : 'Workout'}</Text>
          <Text style={T.h2}>{w.focus}</Text>
          <Text style={T.meta}>
            {w.minutes} min{when ? ` · ${when}` : ''} · {exDone}/{plural(w.exercises.length, 'exercise')} done
          </Text>
        </View>
        <IconButton icon="play" variant="green" size={56} onPress={onOpen} accessibilityLabel={sets.done > 0 ? `Continue ${w.focus}` : `Start ${w.focus}`} />
      </View>
      <ProgressBar value={sets.total ? sets.done / sets.total : 0} color={C.stone} />

      <View>
        {w.exercises.map((ex, i) => {
          const on = (day.done.exercises[i] ?? []).length >= ex.sets;
          return (
            <View
              key={`${ex.name}-${i}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 64, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}
            >
              <Pressable
                onPress={() => onToggleExercise(i)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${ex.name}, ${setsLabel(ex)}`}
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, opacity: pressed ? 0.75 : 1 })}
              >
                <CheckBox checked={on} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[T.bodyStrong, { color: on ? C.muted : C.text }]}>{ex.name}</Text>
                  <Text style={T.small}>
                    {setsLabel(ex)}
                    {ex.replaced_from ? ` · replaces ${ex.replaced_from}` : ''}
                  </Text>
                </View>
              </Pressable>
              <IconButton icon="swap" variant="bare" onPress={() => onReplace(i)} accessibilityLabel={`Replace ${ex.name}`} />
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        {onMove ? <Button compact variant="secondary" icon="calendar" label="Move" onPress={onMove} style={{ flex: 1 }} accessibilityLabel={`Move ${w.focus} to another day`} /> : null}
        <Button
          compact
          variant="secondary"
          label={day.done.workout ? 'Not done' : 'Mark done'}
          onPress={onMarkComplete}
          style={{ flex: 1 }}
          accessibilityLabel={day.done.workout ? 'Mark as not done' : 'Mark workout complete'}
        />
      </View>
    </View>
  );
}

function MealsCard({ day, isToday }: { day: WeekDay; isToday: boolean }) {
  const total = day.meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein, carbs: a.carbs + (m.carbs || 0), fat: a.fat + (m.fat || 0) }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return (
    <View style={[cardStyle, { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.h3} accessibilityRole="header">
            Meals for {isToday ? 'today' : DAY_FULL[day.index]}
          </Text>
          <MacroLine m={total} />
        </View>
        <Icon name="burger" size={24} />
      </View>
      <View>
        {day.meals.map((m, i) => (
          <View key={m.slot} style={{ minHeight: 52, paddingVertical: 8, gap: 2, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line, justifyContent: 'center' }}>
            <Text style={T.body}>{m.label}</Text>
            <Text style={T.small}>
              {m.slot}
              {m.swapped ? ' · swapped' : ''} · {m.kcal} kcal · {m.protein}g protein
            </Text>
          </View>
        ))}
      </View>
      {isToday ? (
        <Button variant="secondary" icon="burger" label="Open Food" onPress={() => router.push('/(tabs)/food')} accessibilityLabel="Open Food to tick, swap or log meals" />
      ) : null}
    </View>
  );
}
