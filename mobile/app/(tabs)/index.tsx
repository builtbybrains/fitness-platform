/* Today tab — the first live screen. Sample data (labeled as such), but every
   interaction is real: meal check-off, water +/-, all persisted on-device.
   Step 3 replaces the sample source with the API; this screen won't change. */

import { ScrollView, Text, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { C, card as cardStyle, screen, sectionLabel, subtitle, title } from '../../src/design';
import { Ring, RingValue } from '../../src/components/Ring';
import { usePlan } from '../../src/planStore';
import { PlanWorkout } from '../../src/planData';
import { workoutStreak } from '../../src/streak';
import { useWater } from '../../src/useWater';
import { useAuth } from '../../src/auth';

function StreakChip({ count }: { count: number }) {
  const hot = count > 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: hot ? C.mintDim : C.card,
        borderWidth: 1,
        borderColor: hot ? C.mint : C.line,
      }}
    >
      <Text style={{ fontSize: 14, color: hot ? C.mint : C.muted }}>🔥</Text>
      <Text style={{ color: hot ? C.mint : C.muted, fontSize: 13, fontWeight: '800' }}>
        {count}
      </Text>
    </View>
  );
}

function Greeting({ streak }: { streak: number }) {
  const { profile } = useAuth();
  const h = new Date().getHours();
  const word = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = profile?.name?.trim();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={sectionLabel}>VITAL</Text>
        <Text style={title}>{name ? `${word}, ${name}` : word}</Text>
        <Text style={subtitle}>Your day at a glance</Text>
      </View>
      <StreakChip count={streak} />
    </View>
  );
}

function TrainingCard() {
  const { days, todayIdx } = usePlan();
  const router = useRouter();
  const day = days[todayIdx];
  if (!day) return null;

  const open = () => {
    if (day.session.kind === 'rest') {
      router.push('/(tabs)/plan');
    } else {
      router.push(`/workout/${day.id}`);
    }
  };

  if (day.session.kind === 'rest') {
    return (
      <View style={[cardStyle, { flexDirection: 'row', gap: 12 }]}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={sectionLabel}>Training</Text>
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Recovery</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>Rest day — see your plan</Text>
        </View>
        <Pressable
          onPress={open}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: C.line,
            backgroundColor: C.cardStrong,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: C.muted, fontWeight: '800', fontSize: 13 }}>Plan</Text>
        </Pressable>
      </View>
    );
  }

  const w = day.session as PlanWorkout;
  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [
        cardStyle,
        { flexDirection: 'row', gap: 12, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={sectionLabel}>Training</Text>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{w.focus}</Text>
        <Text style={{ color: C.muted, fontSize: 13 }}>
          {day.done.workout ? 'Completed today · ' : ''}
          {w.minutes} min · {w.exercises.length} exercises
        </Text>
      </View>
      <View
        style={{
          alignSelf: 'center',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 10,
          backgroundColor: day.done.workout ? C.cardStrong : C.mintDim,
          borderWidth: 1,
          borderColor: day.done.workout ? C.line : C.mint,
        }}
      >
        <Text style={{ color: day.done.workout ? C.muted : C.mint, fontWeight: '800', fontSize: 13 }}>
          {day.done.workout ? 'Done' : 'Start'}
        </Text>
      </View>
    </Pressable>
  );
}

function CalorieRing({
  total,
  target,
  remaining,
  progress,
}: {
  total: number;
  target: number;
  remaining: number;
  progress: number;
}) {
  return (
    <View style={[cardStyle, { alignItems: 'center', paddingVertical: 22, gap: 16 }]}>
      <Text style={sectionLabel}>Calories</Text>
      <Ring size={168} stroke={14} progress={progress}>
        <RingValue value={`${total}`} label={`of ${target.toLocaleString()} kcal`} />
      </Ring>
      <Text style={{ color: C.muted, fontSize: 13 }}>{remaining} kcal remaining</Text>
    </View>
  );
}

function WaterCard({
  count,
  target,
  onAdd,
  onSub,
}: {
  count: number;
  target: number;
  onAdd: () => void;
  onSub: () => void;
}) {
  return (
    <View style={[cardStyle, { gap: 14 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={sectionLabel}>Water</Text>
        <Text style={{ color: C.text, fontWeight: '700' }}>
          {count} / {target}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {Array.from({ length: target }, (_, i) => (
          <View
            key={i}
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              backgroundColor: i < count ? C.mintDim : C.card,
              borderWidth: 1,
              borderColor: i < count ? C.mint : C.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 13, color: i < count ? C.mint : C.muted }}>●</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable
          onPress={onSub}
          style={{
            flex: 1,
            paddingVertical: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.line,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 16 }}>−</Text>
        </Pressable>
        <Pressable
          onPress={onAdd}
          style={{
            flex: 2,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: C.mint,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#04120C', fontWeight: '800', fontSize: 16 }}>+ Glass</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TodayTab() {
  const { days, todayIdx, toggleMeal, offline } = usePlan();
  const { profile } = useAuth();
  const streak = workoutStreak(days, todayIdx);
  const water = useWater();
  const day = days[todayIdx];
  const meals = day?.meals ?? [];
  const doneMeals = day?.done.meals ?? [];
  // The editable profile target drives the ring; the plan's meals drive "eaten".
  const kcalTarget = profile?.kcal_target ?? meals.reduce((a, m) => a + m.kcal, 0);
  const kcalEaten = meals
    .filter((m) => doneMeals.includes(m.slot))
    .reduce((a, m) => a + m.kcal, 0);

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <Greeting streak={streak} />

        <TrainingCard />

        <CalorieRing
          total={kcalEaten}
          target={kcalTarget}
          remaining={Math.max(0, kcalTarget - kcalEaten)}
          progress={kcalTarget > 0 ? kcalEaten / kcalTarget : 0}
        />

        <View style={[cardStyle, { gap: 10 }]}>
          <Text style={sectionLabel}>Meals</Text>
          {meals.map((m) => {
            const slot = m.slot;
            const done = doneMeals.includes(slot);
            return (
              <Pressable
                key={slot}
                onPress={() => toggleMeal(day.id, slot)}
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
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: done ? C.mint : C.line,
                    backgroundColor: done ? C.mintDim : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done ? <Text style={{ color: C.mint, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: done ? C.muted : C.text,
                      fontSize: 15,
                      fontWeight: '600',
                      textDecorationLine: done ? 'line-through' : 'none',
                    }}
                  >
                    {m.label}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{m.slot}</Text>
                </View>
                <Text style={{ color: C.muted, fontSize: 13 }}>{m.kcal} kcal</Text>
              </Pressable>
            );
          })}
        </View>

        <WaterCard count={water.count} target={water.target} onAdd={water.add} onSub={water.sub} />

        <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={sectionLabel}>Coach</Text>
            <Text style={{ color: C.text, fontSize: 14, marginTop: 4 }}>
              “Protein is on track. Push water before 6pm.”
            </Text>
          </View>
          <Text style={{ color: C.mint, fontSize: 20 }}>✦</Text>
        </View>

        <Text style={{ color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
          {offline ? 'Offline mode — changes will sync when you sign in' : 'Synced to your account'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
