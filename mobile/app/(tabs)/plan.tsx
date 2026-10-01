/* Plan: the week at a glance. A seven-day strip, the chosen day's workout
   (tap to open the set-by-set screen) and its meals. Check-offs save to the
   account, or to this device without one. */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { exerciseLabel, PlanDay, PlanMeal, PlanWorkout } from '../../src/planData';
import { usePlan } from '../../src/planStore';
import { useCelebration } from '../../src/celebration';
import { Button, IconButton } from '../../src/components/Button';
import { CheckBox, ProgressBar, ScreenHeader } from '../../src/components/Bits';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function DayChip({ day, today, selected, onPress }: { day: PlanDay; today: boolean; selected: boolean; onPress: () => void }) {
  const workoutDone = day.session.kind === 'workout' && day.done.workout;
  const fg = selected ? C.onGreen : C.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${DAY_FULL[day.index]}${today ? ', today' : ''}. ${day.session.kind === 'rest' ? 'Rest day' : day.session.focus}${workoutDone ? ', done' : ''}`}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 44,
        minHeight: 72,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        borderRadius: R.tile,
        backgroundColor: selected ? C.green : pressed ? C.raised : C.card,
        borderWidth: 1.5,
        borderColor: selected ? C.green : today ? C.greenBorder : 'transparent',
      })}
    >
      <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 12, color: selected ? C.onGreen : C.muted }}>{DAY_NAMES[day.index]}</Text>
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 17, color: fg }}>{Number(day.id.slice(8))}</Text>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: workoutDone ? (selected ? C.onGreen : C.green) : 'transparent',
        }}
      />
    </Pressable>
  );
}

export default function PlanTab() {
  const { days, todayIdx, todayId, aiPlan, syncState, setWorkoutDone, toggleExercise, toggleMeal } = usePlan();
  const celebration = useCelebration();
  const [selected, setSelected] = useState(todayIdx);
  // Midnight rollover (or a new week): jump back to the new today.
  useEffect(() => {
    setSelected(todayIdx);
  }, [todayId, todayIdx]);
  const day = days[selected] ?? days[todayIdx];
  if (!day) return <SafeAreaView style={screen} edges={['top']} />;

  const kcal = day.meals.reduce((a, m) => a + (day.done.meals.includes(m.slot) ? m.kcal : 0), 0);
  const kcalTarget = day.meals.reduce((a, m) => a + m.kcal, 0);
  const protein = day.meals.reduce((a, m) => a + m.protein, 0);
  const openWorkout = () => router.push(`/workout/${day.id}`);

  // Mark complete from here: fills every set and celebrates. Tapping again undoes it.
  function markComplete() {
    if (day.session.kind !== 'workout') return;
    const w = day.session as PlanWorkout;
    if (!day.done.workout) {
      void setWorkoutDone(day.id, true);
      const total = w.exercises.reduce((a, e) => a + e.sets, 0);
      celebration.show({ done: total, total, focus: w.focus, caption: 'Marked complete from your plan' });
    } else {
      void setWorkoutDone(day.id, false);
    }
  }

  const footer = aiPlan
    ? 'Built by your coach from your stats.'
    : syncState === 'local'
      ? 'Starter plan. Create an account and your coach builds one around you.'
      : 'Starter plan. Save your stats in Profile and your coach builds one around you.';

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Your plan" subtitle={selected === todayIdx ? 'Today' : DAY_FULL[day.index]} />

        <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: -6 }} accessibilityRole="tablist">
          {days.map((d, i) => (
            <DayChip key={d.id} day={d} today={i === todayIdx} selected={d.id === day.id} onPress={() => setSelected(i)} />
          ))}
        </View>

        {day.session.kind === 'workout' ? (
          <WorkoutCard day={day} onOpen={openWorkout} onToggleExercise={(i) => toggleExercise(day.id, i)} onMarkComplete={markComplete} />
        ) : (
          <View style={[cardStyle, { gap: 8 }]}>
            <Text style={T.small}>Recovery</Text>
            <Text style={T.h2}>Rest day</Text>
            <Text style={T.meta}>{day.session.note}</Text>
          </View>
        )}

        <View style={[cardStyle, { gap: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <Text style={T.h3} accessibilityRole="header">
              Meals
            </Text>
            <Text style={T.small}>
              <Text style={{ color: C.text, fontFamily: FONT.displaySemi }}>{kcal.toLocaleString()}</Text> / {kcalTarget.toLocaleString()} kcal · {protein} g protein
            </Text>
          </View>
          <View>
            {day.meals.map((m: PlanMeal, i) => {
              const on = day.done.meals.includes(m.slot);
              return (
                <Pressable
                  key={m.slot}
                  onPress={() => toggleMeal(day.id, m.slot)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${m.slot}: ${m.label}, ${m.kcal} kcal, ${m.protein} grams protein`}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    minHeight: 60,
                    paddingVertical: 10,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: C.line,
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <CheckBox checked={on} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[T.bodyStrong, { color: on ? C.muted : C.text }]}>{m.label}</Text>
                    <Text style={T.small}>
                      {m.slot} · {m.kcal} kcal · {m.protein} g protein
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[T.small, { textAlign: 'center', color: C.faint }]}>{footer}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function WorkoutCard({
  day,
  onOpen,
  onToggleExercise,
  onMarkComplete,
}: {
  day: PlanDay;
  onOpen: () => void;
  onToggleExercise: (i: number) => void;
  onMarkComplete: () => void;
}) {
  const w = day.session as PlanWorkout;
  const exDone = w.exercises.filter((ex, i) => (day.done.exercises[i] ?? []).length >= ex.sets).length;
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Workout</Text>
          <Text style={T.h2}>{w.focus}</Text>
          <Text style={T.meta}>
            {w.minutes} min · {exDone}/{w.exercises.length} exercises done
          </Text>
        </View>
        <IconButton icon="play" variant="green" size={52} onPress={onOpen} accessibilityLabel={`Open ${w.focus}`} />
      </View>
      <ProgressBar value={w.exercises.length ? exDone / w.exercises.length : 0} />

      <View>
        {w.exercises.map((ex, i) => {
          const on = (day.done.exercises[i] ?? []).length >= ex.sets;
          return (
            <Pressable
              key={`${ex.name}-${i}`}
              onPress={() => onToggleExercise(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${ex.name}, ${exerciseLabel(ex)}`}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                minHeight: 60,
                paddingVertical: 10,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: C.line,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <CheckBox checked={on} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[T.bodyStrong, { color: on ? C.muted : C.text }]}>{ex.name}</Text>
                <Text style={T.small}>{exerciseLabel(ex)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Button
        variant="secondary"
        label={day.done.workout ? 'Mark as not done' : 'Mark workout complete'}
        icon={day.done.workout ? undefined : 'check'}
        onPress={onMarkComplete}
      />
    </View>
  );
}
