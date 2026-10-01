/* Today: the greeting, one ring for the whole day, the four pillars, then
   the day's workout, meals, water and photo log. Every control saves at
   once (to the account, or to this device without one). */

import { ScrollView, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { Ring } from '../../src/components/Ring';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { CheckBox, ProgressBar } from '../../src/components/Bits';
import { greetingWord } from '../../src/components/copy';
import { usePlan } from '../../src/planStore';
import { PlanDay, PlanWorkout } from '../../src/planData';
import { useWater } from '../../src/useWater';
import { useFoodLogs } from '../../src/foodLogs';
import { useAuth } from '../../src/auth';

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function StreakChip({ count }: { count: number }) {
  const hot = count > 0;
  return (
    <View
      accessible
      accessibilityLabel={`Workout streak: ${plural(count, 'workout')}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        minHeight: 36,
        borderRadius: R.pill,
        backgroundColor: hot ? C.greenTint : C.card,
      }}
    >
      <Icon name="flame" size={18} color={hot ? C.green : C.faint} />
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: hot ? C.green : C.muted }}>{count}</Text>
    </View>
  );
}

function Greeting() {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const name = profile?.name?.trim().split(/\s+/)[0];
  const size = width < 380 ? 24 : 27;
  return (
    <View style={{ gap: 2 }} accessibilityRole="header">
      <Text style={{ fontFamily: FONT.display, fontSize: size, lineHeight: size * 1.25, letterSpacing: -0.4, color: C.text }}>
        {greetingWord()}
        {name ? `, ${name},` : ','}
      </Text>
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: size, lineHeight: size * 1.25, letterSpacing: -0.5, color: C.text }}>
        Let&apos;s <Text style={{ color: C.green }}>build your best.</Text>
      </Text>
    </View>
  );
}

function setsOf(day: PlanDay): { done: number; total: number } {
  if (day.session.kind !== 'workout') return { done: 0, total: 0 };
  const total = day.session.exercises.reduce((a, e) => a + e.sets, 0);
  const done = day.session.exercises.reduce((a, e, i) => a + Math.min(e.sets, day.done.exercises[i]?.length ?? 0), 0);
  return { done, total };
}

function TodayRing({ progress, summary }: { progress: number; summary: string }) {
  const pct = Math.round(progress * 100);
  return (
    <View style={[cardStyle, { alignItems: 'center', paddingVertical: 28, gap: 20 }]}>
      <Ring size={208} stroke={16} progress={progress} accessibilityLabel={`Today ${pct} percent done`}>
        <Text style={{ fontFamily: FONT.body, fontSize: 16, color: C.stone }}>Today</Text>
        <Text style={{ fontFamily: FONT.displaySemi, fontSize: 48, lineHeight: 56, letterSpacing: -1.5, color: C.text }}>{pct}%</Text>
      </Ring>
      <Text style={[T.meta, { textAlign: 'center' }]}>{summary}</Text>
    </View>
  );
}

function PillarTile({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 128,
        padding: 16,
        gap: 14,
        borderRadius: R.tile,
        backgroundColor: pressed ? C.raised : C.card,
        justifyContent: 'space-between',
      })}
    >
      <Icon name={icon} size={30} />
      <View style={{ gap: 2 }}>
        <Text style={T.h3} numberOfLines={1}>
          {title}
        </Text>
        <Text style={T.meta} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

function WorkoutCard({ day }: { day: PlanDay }) {
  const router = useRouter();

  if (day.session.kind === 'rest') {
    return (
      <Pressable
        onPress={() => router.push('/(tabs)/plan')}
        accessibilityRole="button"
        accessibilityLabel="Rest day. Open your plan."
        style={({ pressed }) => [cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: pressed ? C.raised : C.card }]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Training</Text>
          <Text style={T.h2}>Rest day</Text>
          <Text style={T.meta}>{day.session.note}</Text>
        </View>
        <Icon name="chevronRight" size={22} color={C.muted} />
      </Pressable>
    );
  }

  const w = day.session as PlanWorkout;
  const s = setsOf(day);
  const done = day.done.workout;
  const open = () => router.push(`/workout/${day.id}`);
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Today&apos;s workout</Text>
          <Text style={T.h2}>{w.focus}</Text>
          <Text style={T.meta}>
            {w.minutes} min · {plural(w.exercises.length, 'exercise')}
          </Text>
        </View>
        <IconButton
          icon={done ? 'check' : 'play'}
          variant={done ? 'carbon' : 'green'}
          size={52}
          onPress={open}
          accessibilityLabel={done ? `${w.focus}, done. Review it.` : s.done > 0 ? `Continue ${w.focus}` : `Start ${w.focus}`}
        />
      </View>
      <ProgressBar value={s.total ? s.done / s.total : 0} />
      <Text style={T.small}>{done ? 'Done today. Nice work.' : s.done > 0 ? `${s.done} of ${s.total} sets logged` : `${s.total} sets to go`}</Text>
    </View>
  );
}

function MealsCard({ day, kcalTarget, photoKcal }: { day: PlanDay; kcalTarget: number; photoKcal: number }) {
  const { toggleMeal } = usePlan();
  const eaten = day.meals.filter((m) => day.done.meals.includes(m.slot)).reduce((a, m) => a + m.kcal, 0) + photoKcal;
  return (
    <View style={[cardStyle, { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={T.h3} accessibilityRole="header">
          Meals
        </Text>
        <Text style={T.small}>
          <Text style={{ color: C.text, fontFamily: FONT.displaySemi }}>{eaten.toLocaleString()}</Text> / {kcalTarget.toLocaleString()} kcal
        </Text>
      </View>
      <ProgressBar value={kcalTarget > 0 ? eaten / kcalTarget : 0} />
      {photoKcal > 0 ? <Text style={T.small}>Includes {photoKcal} kcal from your photo log.</Text> : null}
      <View>
        {day.meals.map((m, i) => {
          const done = day.done.meals.includes(m.slot);
          return (
            <Pressable
              key={m.slot}
              onPress={() => toggleMeal(day.id, m.slot)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
              accessibilityLabel={`${m.slot}: ${m.label}, ${m.kcal} kcal`}
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
              <CheckBox checked={done} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[T.bodyStrong, { color: done ? C.muted : C.text }]}>{m.label}</Text>
                <Text style={T.small}>
                  {m.slot} · {m.kcal} kcal
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function WaterCard({ water }: { water: ReturnType<typeof useWater> }) {
  const { count, target } = water;
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={T.h3} accessibilityRole="header">
          Water
        </Text>
        <Text style={T.small} accessibilityLiveRegion="polite">
          <Text style={{ color: C.text, fontFamily: FONT.displaySemi }}>{count}</Text> of {plural(target, 'glass', 'glasses')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }} accessible accessibilityLabel={`${count} of ${target} glasses`}>
        {Array.from({ length: Math.max(target, count) }, (_, i) => (
          <Icon key={i} name="drop" size={26} color={i < count ? C.green : '#4A4A4A'} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconButton icon="minus" size={52} onPress={water.sub} disabled={count === 0} accessibilityLabel="Remove a glass of water" />
        <Button label="Add a glass" icon="plus" onPress={water.add} style={{ flex: 1 }} accessibilityLabel="Add a glass of water" />
      </View>
    </View>
  );
}

function PhotoLogCard() {
  const router = useRouter();
  const food = useFoodLogs();
  return (
    <View style={[cardStyle, { gap: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={T.h3} accessibilityRole="header">
          Photo log
        </Text>
        {food.logs.length ? <Text style={[T.small, { color: C.green }]}>+{food.kcal} kcal</Text> : null}
      </View>
      {food.logs.length === 0 ? (
        <View style={{ gap: 4 }}>
          <Text style={T.meta}>Snap a meal in Coach and its calories land here.</Text>
          <LinkButton align="flex-start" onPress={() => router.push('/(tabs)/coach')} accessibilityLabel="Open Coach to log a meal">
            <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.green }}>Log a meal</Text>
          </LinkButton>
        </View>
      ) : (
        food.logs.map((log, i) => (
          <View
            key={log.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}
          >
            <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>
              {log.label}
            </Text>
            <Text style={T.small}>{log.kcal} kcal</Text>
            <IconButton icon="close" variant="bare" size={44} onPress={() => void food.remove(log.id)} accessibilityLabel={`Delete ${log.label}`} />
          </View>
        ))
      )}
    </View>
  );
}

function coachTip(p: { workoutOpen: boolean; mealsLeft: number; waterLeft: number; kcalRemaining: number }): string {
  if (p.workoutOpen) {
    return p.kcalRemaining < 400
      ? 'Your workout is still open. Even half of it counts, so log what you do and close the day strong.'
      : 'Your workout is still open. Smallest next step: one set of the first exercise.';
  }
  if (p.waterLeft > 0) return `Training is covered. ${plural(p.waterLeft, 'glass', 'glasses')} of water left. Finish them before 6pm.`;
  if (p.mealsLeft > 0) return `Training and water are done. ${plural(p.mealsLeft, 'meal')} left. Keep protein on every plate.`;
  return p.kcalRemaining > 600
    ? `Everything is logged and ${p.kcalRemaining} kcal are still open. A protein snack fits.`
    : 'Every box ticked. Recovery is the work now, so sleep well tonight.';
}

function syncLine(state: 'local' | 'offline' | 'synced'): string {
  if (state === 'local') return 'Saved on this device';
  if (state === 'offline') return "Offline. Changes are saved here and upload when you're back online.";
  return 'Synced to your account';
}

export default function TodayTab() {
  const router = useRouter();
  const { days, todayIdx, syncState, streak } = usePlan();
  const { profile } = useAuth();
  const water = useWater();
  const food = useFoodLogs();
  const day = days[todayIdx];
  if (!day) return <SafeAreaView style={screen} edges={['top']} />;

  const meals = day.meals;
  const mealsDone = meals.filter((m) => day.done.meals.includes(m.slot)).length;
  const kcalTarget = profile?.kcal_target ?? meals.reduce((a, m) => a + m.kcal, 0);
  const eaten = meals.filter((m) => day.done.meals.includes(m.slot)).reduce((a, m) => a + m.kcal, 0) + food.kcal;
  const isWorkout = day.session.kind === 'workout';
  const sets = setsOf(day);
  const waterFrac = water.target > 0 ? Math.min(1, water.count / water.target) : 0;

  // One number for the day: training (when scheduled), meals and water.
  const parts: number[] = [];
  if (isWorkout) parts.push(day.done.workout ? 1 : sets.total ? sets.done / sets.total : 0);
  if (meals.length) parts.push(mealsDone / meals.length);
  parts.push(waterFrac);
  const progress = parts.reduce((a, b) => a + b, 0) / parts.length;

  const summary = [
    isWorkout ? (day.done.workout ? 'Workout done' : 'Workout open') : 'Rest day',
    `${mealsDone} of ${plural(meals.length, 'meal')}`,
    `${water.count} of ${plural(water.target, 'glass', 'glasses')}`,
  ].join(' · ');

  const tip = coachTip({
    workoutOpen: isWorkout && !day.done.workout,
    mealsLeft: meals.length - mealsDone,
    waterLeft: Math.max(0, water.target - water.count),
    kcalRemaining: Math.max(0, kcalTarget - eaten),
  });

  const trainDetail = !isWorkout
    ? 'Rest day'
    : day.done.workout
      ? 'Done today'
      : `${day.done.exercises.filter((r, i) => day.session.kind === 'workout' && (r ?? []).length >= (day.session.exercises[i]?.sets ?? 99)).length}/${(day.session as PlanWorkout).exercises.length} completed`;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BuiltMark size={24} />
          <StreakChip count={streak} />
        </View>

        <Greeting />

        <TodayRing progress={progress} summary={summary} />

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile
              icon="dumbbell"
              title="Train"
              detail={trainDetail}
              onPress={() => (isWorkout ? router.push(`/workout/${day.id}`) : router.push('/(tabs)/plan'))}
            />
            <PillarTile icon="burger" title="Nutrition" detail={`${eaten.toLocaleString()} kcal eaten`} onPress={() => router.push('/(tabs)/plan')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="brain" title="AI Coach" detail="Ask anything" onPress={() => router.push('/(tabs)/coach')} />
            <PillarTile
              icon="bars"
              title="Progress"
              detail={streak > 0 ? `${plural(streak, 'workout')} in a row` : 'Your weeks'}
              onPress={() => router.push('/(tabs)/progress')}
            />
          </View>
        </View>

        <WorkoutCard day={day} />

        <MealsCard day={day} kcalTarget={kcalTarget} photoKcal={food.kcal} />

        <WaterCard water={water} />

        <PhotoLogCard />

        <Pressable
          onPress={() => router.push('/(tabs)/coach')}
          accessibilityRole="button"
          accessibilityLabel={`Coach tip: ${tip} Open Coach.`}
          style={({ pressed }) => [cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pressed ? C.raised : C.card }]}
        >
          <BuiltMark size={26} />
          <Text style={[T.body, { flex: 1, color: C.stone }]}>
            {tip}
          </Text>
          <Icon name="chevronRight" size={20} color={C.muted} />
        </Pressable>

        <Text style={[T.small, { textAlign: 'center', color: C.faint }]}>{syncLine(syncState)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
