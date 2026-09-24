/* Plan tab — the week at a glance, in the site's dark glass + mint language.
   Tapping a workout day's card opens the set-by-set workout screen. All
   check-offs persist to the user's Supabase account (local fallback offline). */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, screen, sectionLabel, subtitle, title } from '../../src/design';
import { PlanDay, PlanMeal, PlanWorkout } from '../../src/planData';
import { usePlan } from '../../src/planStore';
import { useCelebration } from '../../src/celebration';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Checkbox({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: on ? C.mint : C.line,
        backgroundColor: on ? C.mintDim : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Text style={{ color: C.mint, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
    </View>
  );
}

function DayChip({
  day,
  today,
  selected,
  onPress,
}: {
  day: PlanDay;
  today: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const workoutDone = day.session.kind === 'workout' && day.done.workout;
  const bg = selected ? C.mint : C.card;
  const fg = selected ? '#04120C' : workoutDone ? C.mint : C.text;
  return (
    <Pressable
      onPress={onPress}
      style={{
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderRadius: 14,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: selected ? C.mint : today ? C.mintDim : C.line,
      }}
    >
      <Text style={{ color: fg, fontSize: 13, fontWeight: '700' }}>{DAY_NAMES[day.index]}</Text>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: workoutDone
            ? selected
              ? '#04120C'
              : C.mint
            : selected
              ? 'rgba(4,18,12,0.35)'
              : C.line,
        }}
      />
    </Pressable>
  );
}

export default function PlanTab() {
  const { days, todayIdx, toggleWorkout, toggleExercise, toggleMeal } = usePlan();
  const celebration = useCelebration();
  const [selected, setSelected] = useState(todayIdx);
  const day = days[selected];

  const kcal = day.meals.reduce((a, m) => a + (day.done.meals.includes(m.slot) ? m.kcal : 0), 0);
  const kcalTarget = day.meals.reduce((a, m) => a + m.kcal, 0);
  const allMeals = day.meals.every((m) => day.done.meals.includes(m.slot));

  const openWorkout = useMemo(
    () => () => router.push(`/workout/${day.id}`),
    [day.id],
  );

  // Mark-complete from outside: fill the set log, celebrate, and undoable.
  function markComplete() {
    if (day.session.kind !== 'workout') return;
    const w = day.session as PlanWorkout;
    if (!day.done.workout) {
      toggleWorkout(day.id);
      const total = w.exercises.reduce((a, e) => a + e.sets, 0);
      celebration.show({
        done: total,
        total,
        focus: w.focus,
        caption: 'Marked complete from your plan',
      });
    } else {
      toggleWorkout(day.id);
    }
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <View style={{ gap: 2 }}>
          <Text style={sectionLabel}>VITAL</Text>
          <Text style={title}>Your plan</Text>
          <Text style={subtitle}>This week's training and meals</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {days.map((d, i) => (
            <DayChip
              key={d.id}
              day={d}
              today={i === todayIdx}
              selected={i === selected}
              onPress={() => setSelected(i)}
            />
          ))}
        </ScrollView>

        {day.session.kind === 'workout' ? (
          <Pressable onPress={openWorkout}>
            <View style={[cardStyle, { gap: 14 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ gap: 3 }}>
                  <Text style={sectionLabel}>Workout</Text>
                  <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>
                    {(day.session as PlanWorkout).focus}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>
                    {(day.session as PlanWorkout).minutes} min ·{' '}
                    {(day.session as PlanWorkout).exercises.length} exercises
                  </Text>
                </View>
                <View
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: day.done.workout ? C.mintDim : C.cardStrong,
                    borderWidth: 1,
                    borderColor: day.done.workout ? C.mint : C.line,
                  }}
                >
                  <Text
                    style={{
                      color: day.done.workout ? C.mint : C.muted,
                      fontWeight: '800',
                      fontSize: 12,
                    }}
                  >
                    {day.done.exercises.filter((r) => (r ?? []).length > 0).length}/{(day.session as PlanWorkout).exercises.length}
                  </Text>
                </View>
              </View>

              {(day.session as PlanWorkout).exercises.map((ex, i) => {
                const on = (day.done.exercises[i] ?? []).length >= ex.sets;
                return (
                  <Pressable
                    key={`${ex.name}-${i}`}
                    onPress={() => toggleExercise(day.id, i)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: C.line,
                    }}
                  >
                    <View
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 9,
                        backgroundColor: on ? C.mint : C.cardStrong,
                        borderWidth: 1,
                        borderColor: on ? C.mint : C.line,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: on ? '#04120C' : C.muted, fontSize: 12, fontWeight: '800' }}>
                        {on ? '✓' : i + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: on ? C.muted : C.text,
                          fontSize: 15,
                          fontWeight: '600',
                          textDecorationLine: on ? 'line-through' : 'none',
                        }}
                      >
                        {ex.name}
                      </Text>
                      <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
                        {ex.sets} × {ex.reps}
                        {ex.unit === 's' ? 's' : ex.unit === 'm' ? 'm' : ''}
                        {ex.kg != null ? ` · ${ex.kg} kg` : ''}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={markComplete}
                  style={[
                    { flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center' },
                    day.done.workout
                      ? { backgroundColor: C.mintDim, borderWidth: 1, borderColor: C.mint }
                      : { backgroundColor: C.mint },
                  ]}
                >
                  <Text
                    style={{
                      color: day.done.workout ? C.mint : '#04120C',
                      fontWeight: '800',
                      fontSize: 15,
                    }}
                  >
                    {day.done.workout ? 'Completed — tap to undo' : 'Mark workout complete'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={openWorkout}
                  style={{
                    paddingHorizontal: 18,
                    paddingVertical: 13,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: C.mint,
                    backgroundColor: C.mintDim,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: C.mint, fontWeight: '800', fontSize: 15 }}>Log →</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        ) : (
          <View style={[cardStyle, { gap: 8 }]}>
            <Text style={sectionLabel}>Recovery</Text>
            <Text style={{ color: C.text, fontSize: 17, fontWeight: '800' }}>Rest day</Text>
            <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>{day.session.note}</Text>
          </View>
        )}

        <View style={[cardStyle, { gap: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={sectionLabel}>Meals</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {kcal} / {kcalTarget} kcal
            </Text>
          </View>
          {day.meals.map((m: PlanMeal) => {
            const on = day.done.meals.includes(m.slot);
            return (
              <Pressable
                key={m.slot}
                onPress={() => toggleMeal(day.id, m.slot)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: C.line,
                }}
              >
                <Checkbox on={on} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text
                    style={{
                      color: on ? C.muted : C.text,
                      fontSize: 14,
                      fontWeight: '600',
                      textDecorationLine: on ? 'line-through' : 'none',
                    }}
                  >
                    {m.label}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    {m.slot} · {m.kcal} kcal · {m.protein}g protein
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {allMeals && day.session.kind === 'workout' ? (
            <Text style={{ color: C.mint, fontSize: 12, marginTop: 2 }}>
              All meals logged for {DAY_NAMES[day.index]} 💪
            </Text>
          ) : null}
        </View>

        <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
          Sample plan — generated on-device, backend connects in Step 3
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
