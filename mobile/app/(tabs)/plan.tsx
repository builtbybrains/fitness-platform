/* Plan: the week, rendered through weekView (moved days and swaps
   applied). Pick a day; open, tick or move its workout; replace any
   exercise with one of three that fit your kit and injuries; switch
   between home and gym for the week; ask for a change in your own words
   and read what changed. Check-offs save to the account, or to this
   device without one. Day chips tilt under the finger; pull down to
   re-read the plan; while it loads, the week's shape stands in. Picking a
   day slides the Stone pill along the strip to it. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { LOCATION_LABEL, movableDays, setsLabel, setsOf, WeekDay } from '../../src/planData';
import { usePlan } from '../../src/planStore';
import { useCelebration } from '../../src/celebration';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { CheckBox, Notice, ProgressBar, ScreenHeader } from '../../src/components/Bits';
import { MacroLine, Segmented, StateBlock } from '../../src/components/training/Controls';
import { MoveDaySheet } from '../../src/components/training/MoveDaySheet';
import { ReplaceExerciseSheet } from '../../src/components/training/ReplaceExerciseSheet';
import { ChangePlanCard } from '../../src/components/training/PlanChange';
import { MealImage } from '../../src/components/food/MealImage';
import { Ring } from '../../src/components/Ring';
import { TiltPressable } from '../../src/components/Tilt';
import { useReduceMotion } from '../../src/components/motion';
import { segmentAt, segmentX } from '../../src/lib/motionMath';
import { Bone, Skeleton } from '../../src/components/Skeleton';
import { usePullRefresh } from '../../src/components/usePullRefresh';
import { OfflineBlock, OfflineNotice } from '../../src/components/OfflineNotice';
import { useAuth } from '../../src/auth';
import { DAY_FULL, DAY_SHORT, plural, timeLabel } from '../../src/components/training/labels';
import { weekCounts, weekStrip } from '../../src/lib/weekStrip';
import { dateEyebrow, planHeaderStats, weekCountLabel } from '../../src/lib/headerStats';
import type { PlanWorkoutV2 } from '../../src/types';

/** One day in the strip. Its plate (Carbon, Surface for rest, the green
    edge for today) and the Stone pill for the selected day are drawn by
    DayStrip underneath, so the pill can slide between chips; the chip
    itself is the label and the touch target. `lit` is the chip the pill
    covers right now, which takes the dark label. Before the strip is
    measured the chip draws its own fill. */
function DayChip({
  day,
  today,
  selected,
  lit,
  layered,
  onPress,
  onPressed,
}: {
  day: WeekDay;
  today: boolean;
  selected: boolean;
  lit: boolean;
  layered: boolean;
  onPress: () => void;
  onPressed: (on: boolean) => void;
}) {
  const workoutDone = day.session.kind === 'workout' && day.done.workout;
  const rest = day.session.kind === 'rest';
  const dark = layered ? lit : selected;
  return (
    <TiltPressable
      onPress={onPress}
      onPressIn={() => onPressed(true)}
      onPressOut={() => onPressed(false)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      accessibilityLabel={`${DAY_FULL[day.index]}${today ? ', today' : ''}. ${rest ? 'Rest day' : day.session.focus}${workoutDone ? ', done' : ''}${day.moved ? ', moved this week' : ''}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 44,
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: R.tile,
        backgroundColor: layered ? 'transparent' : selected ? C.stone : pressed ? C.raised : rest ? C.surface : C.card,
        borderWidth: 1.5,
        borderColor: layered ? 'transparent' : selected ? C.stone : today ? C.greenBorder : 'transparent',
      })}
    >
      <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 12, color: dark ? C.bg : C.muted }}>{DAY_SHORT[day.index]}</Text>
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 17, color: dark ? C.bg : C.text }}>{Number(day.id.slice(8))}</Text>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: workoutDone ? (dark ? C.bg : C.green) : 'transparent',
          borderWidth: day.moved && !workoutDone ? 1.5 : 0,
          borderColor: dark ? C.bg : C.muted,
        }}
      />
    </TiltPressable>
  );
}

const CHIP_GAP = 4;

/** The week's seven day chips. A Stone pill slides under the chips to the
    picked day on a touch spring (about 300ms, the faintest overshoot); the
    labels it passes over turn dark as it covers them. Reduce Motion: the
    pill jumps. */
function DayStrip({ days, todayIdx, selectedId, onSelect }: { days: WeekDay[]; todayIdx: number; selectedId: string; onSelect: (i: number) => void }) {
  const reduce = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);
  const index = Math.max(0, days.findIndex((d) => d.id === selectedId));
  const [lit, setLit] = useState(index);
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const seg = segmentX(width, days.length, index, CHIP_GAP);
  const layered = seg != null;

  // The label under the pill follows the pill, not the tap.
  useEffect(() => {
    if (!seg) return;
    const id = x.addListener(({ value }) => setLit(segmentAt(value, seg.w, CHIP_GAP, days.length)));
    return () => x.removeListener(id);
  }, [x, seg?.w, days.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!seg) return;
    if (!placed.current || reduce) {
      placed.current = true;
      x.setValue(seg.x);
      setLit(index);
      return;
    }
    const a = Animated.spring(x, { toValue: seg.x, stiffness: 380, damping: 32, mass: 1, useNativeDriver: Platform.OS !== 'web' });
    a.start(({ finished }) => finished && setLit(index));
    return () => a.stop();
  }, [seg?.x, index, reduce, x]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', gap: CHIP_GAP, marginHorizontal: -6 }} accessibilityRole="tablist">
      {layered
        ? days.map((d, i) => {
            const plate = segmentX(width, days.length, i, CHIP_GAP)!;
            return (
              <View
                key={`plate-${d.id}`}
                style={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: plate.x,
                  width: plate.w,
                  borderRadius: R.tile,
                  backgroundColor: pressedIdx === i ? C.raised : d.session.kind === 'rest' ? C.surface : C.card,
                  borderWidth: 1.5,
                  borderColor: i === todayIdx ? C.greenBorder : 'transparent',
                }}
              />
            );
          })
        : null}
      {layered ? (
        <Animated.View
          style={{
            pointerEvents: 'none',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: seg.w,
            borderRadius: R.tile,
            backgroundColor: C.stone,
            transform: [{ translateX: x }],
          }}
        />
      ) : null}
      {days.map((d, i) => (
        <DayChip
          key={d.id}
          day={d}
          today={i === todayIdx}
          selected={d.id === selectedId}
          lit={i === lit}
          layered={layered}
          onPress={() => onSelect(i)}
          onPressed={(on) => setPressedIdx((p) => (on ? i : p === i ? null : p))}
        />
      ))}
    </View>
  );
}

/** Plan while it loads: header stats, the seven day chips, the workout and the meals. */
function PlanSkeleton() {
  return (
    <Skeleton label="Loading your plan" style={{ gap: 24 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[88, 72, 96].map((w) => (
          <Bone key={w} width={w} height={32} radius={R.pill} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: -6 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Bone key={i} height={72} style={{ flex: 1, minWidth: 44 }} />
        ))}
      </View>
      <Bone radius={R.card} style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="30%" height={14} radius={6} tone="raised" />
            <Bone width="70%" height={22} radius={6} tone="raised" />
            <Bone width="50%" height={14} radius={6} tone="raised" />
          </View>
          <Bone circle height={56} tone="raised" />
        </View>
        <Bone height={4} radius={2} tone="raised" />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
            <Bone circle height={24} tone="raised" />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone width="60%" height={16} radius={6} tone="raised" />
              <Bone width="35%" height={12} radius={6} tone="raised" />
            </View>
          </View>
        ))}
      </Bone>
      <Bone radius={R.card} style={{ padding: 20, gap: 12 }}>
        <Bone width="45%" height={18} radius={6} tone="raised" />
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Bone height={52} width={52} tone="raised" />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone width="65%" height={16} radius={6} tone="raised" />
              <Bone width="45%" height={12} radius={6} tone="raised" />
            </View>
          </View>
        ))}
      </Bone>
    </Skeleton>
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
    reload,
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
  // The same done/planned count as Today's week strip.
  const week = useMemo(() => weekCounts(weekStrip(days, todayId)), [days, todayId]);
  const refreshControl = usePullRefresh(reload);

  const waiting = !planLoaded || (!!session && !profileLoaded);
  const unreachable = !!session && profileLoaded && !profile && !!profileError;
  if (!day || waiting || unreachable) {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <View style={{ padding: 20, gap: 24, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <ScreenHeader eyebrow={day ? dateEyebrow(day.index, day.id, true) : undefined} title="Time to" accent="train." />
          {unreachable ? (
            <OfflineBlock body="Your plan shows here as soon as BUILT answers again. Nothing you saved is lost." />
          ) : (
            <PlanSkeleton />
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
      <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader
          eyebrow={dateEyebrow(day.index, day.id, selected === todayIdx)}
          title="Time to"
          accent="train."
          stats={planHeaderStats(day.session, week)}
          right={week.planned > 0 ? <WeekRing done={week.done} planned={week.planned} /> : undefined}
        />

        <OfflineNotice />

        {locations.length > 1 ? (
          <View style={{ gap: 8 }}>
            <Text style={T.small}>Training this week at</Text>
            <Segmented label="Where you train this week" value={location} onChange={setLocation} options={locations.map((l) => ({ value: l, label: LOCATION_LABEL[l] }))} />
          </View>
        ) : null}

        <DayStrip days={days} todayIdx={todayIdx} selectedId={day.id} onSelect={setSelected} />

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

/** The week's workouts as a small ring. The arc is Stone: on Plan the
    green goes to the title word, today's chip, done dots and the play
    button. */
function WeekRing({ done, planned }: { done: number; planned: number }) {
  return (
    <Ring size={48} stroke={4} progress={planned ? done / planned : 0} color={C.stone} accessibilityLabel={weekCountLabel(done, planned)}>
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 13, lineHeight: 16, letterSpacing: -0.2, color: C.text }}>
        {done}/{planned}
      </Text>
    </Ring>
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
      </View>
      <View>
        {day.meals.map((m, i) => (
          <View key={m.slot} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
            <MealImage label={m.label} items={m.items} size="thumb" />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.body}>{m.label}</Text>
              <Text style={T.small}>
                {m.slot}
                {m.swapped ? ' · swapped' : ''} · {m.kcal} kcal · {m.protein}g protein
              </Text>
            </View>
          </View>
        ))}
      </View>
      {isToday ? (
        <Button variant="secondary" icon="burger" label="Open Food" onPress={() => router.push('/(tabs)/food')} accessibilityLabel="Open Food to tick, swap or log meals" />
      ) : null}
    </View>
  );
}
