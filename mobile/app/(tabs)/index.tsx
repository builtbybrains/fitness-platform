/* Today: the greeting, one ring for the whole day, the four pillars, then
   the day's workout, activities, food, water and a coach tip. The ring and
   the numbers count every macro, food off the plan and logged activities.
   Every control saves at once (to the account, or to this device). */

import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { Ring } from '../../src/components/Ring';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { CheckBox, ProgressBar } from '../../src/components/Bits';
import { greetingWord } from '../../src/components/copy';
import { Meter } from '../../src/components/training/Controls';
import { CheckinDueCard } from '../../src/components/profile/CheckinDue';
import { plural } from '../../src/components/training/labels';
import { usePlan } from '../../src/planStore';
import { setsOf, WeekDay } from '../../src/planData';
import { useWater } from '../../src/useWater';
import { useFoodLogs } from '../../src/foodLogs';
import { useAuth } from '../../src/auth';
import { daySummary } from '../../src/stats';
import { activityDef } from '../../src/data/activities';
import { getHealthDays } from '../../src/api/health';
import { healthPlatform } from '../../src/api/device/health';
import type { Activity, HealthDaily } from '../../src/types';

function StreakChip({ count, onPress }: { count: number; onPress: () => void }) {
  const hot = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Workout streak: ${plural(count, 'workout')}. Open Progress.`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        minHeight: 44,
        borderRadius: R.pill,
        backgroundColor: pressed ? C.raised : hot ? C.greenTint : C.card,
      })}
    >
      <Icon name="flame" size={18} color={hot ? C.green : C.faint} />
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: hot ? C.green : C.muted }}>{count}</Text>
    </Pressable>
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

function PillarTile({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
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

function WorkoutCard({ day }: { day: WeekDay }) {
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
  const w = day.session;
  const s = setsOf(day);
  const done = day.done.workout;
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Today&apos;s workout{day.moved ? ', moved here' : ''}</Text>
          <Text style={T.h2}>{w.focus}</Text>
          <Text style={T.meta}>
            {w.minutes} min · {plural(w.exercises.length, 'exercise')}
          </Text>
        </View>
        <IconButton
          icon={done ? 'check' : 'play'}
          variant={done ? 'carbon' : 'green'}
          size={56}
          onPress={() => router.push(`/workout/${day.id}`)}
          accessibilityLabel={done ? `${w.focus}, done. Review it.` : s.done > 0 ? `Continue ${w.focus}` : `Start ${w.focus}`}
        />
      </View>
      <ProgressBar value={s.total ? s.done / s.total : 0} />
      <Text style={T.small}>{done ? 'Done today. Nice work.' : s.done > 0 ? `${s.done} of ${s.total} sets logged` : `${s.total} sets to go`}</Text>
    </View>
  );
}

function ActivityCard({ list, health, onRemove }: { list: Activity[]; health: HealthDaily | null; onRemove: (id: string) => void }) {
  const router = useRouter();
  const kcal = list.reduce((a, x) => a + x.kcal, 0);
  return (
    <View style={[cardStyle, { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={T.h3} accessibilityRole="header">
          Activity
        </Text>
        {kcal > 0 ? <Text style={T.small}>{kcal.toLocaleString()} kcal burned</Text> : null}
      </View>
      {health && (health.steps != null || health.active_kcal != null) ? (
        <View style={{ flexDirection: 'row', gap: 16 }} accessible accessibilityLabel={`From your health app: ${health.steps ?? 0} steps, ${health.active_kcal ?? 0} active calories`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="steps" size={20} color={C.stone} />
            <Text style={T.bodyStrong}>{(health.steps ?? 0).toLocaleString()} steps</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="flame" size={20} color={C.stone} />
            <Text style={T.bodyStrong}>{(health.active_kcal ?? 0).toLocaleString()} active kcal</Text>
          </View>
        </View>
      ) : null}
      {list.length === 0 ? (
        <Text style={T.meta}>A walk, a game of football, padel with friends: log it and it counts.</Text>
      ) : (
        <View>
          {list.map((a, i) => (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={T.bodyStrong} numberOfLines={1}>
                  {a.label || activityDef(a.kind).label}
                </Text>
                <Text style={T.small}>
                  {a.minutes} min · {a.effort} · {a.kcal} kcal{a.source === 'health' ? ' · from your health app' : ''}
                </Text>
              </View>
              {a.source === 'manual' ? (
                <IconButton icon="trash" variant="bare" onPress={() => onRemove(a.id)} accessibilityLabel={`Delete ${a.label || activityDef(a.kind).label}`} />
              ) : null}
            </View>
          ))}
        </View>
      )}
      <Button variant="secondary" icon="plus" label="Log an activity" onPress={() => router.push('/activity/log')} />
    </View>
  );
}

function FoodCard({ day, offPlanKcal, offPlanCount }: { day: WeekDay; offPlanKcal: number; offPlanCount: number }) {
  const router = useRouter();
  const { toggleMeal } = usePlan();
  const next = day.meals.find((m) => !day.done.meals.includes(m.slot));
  const eaten = day.meals.filter((m) => day.done.meals.includes(m.slot)).length;
  return (
    <View style={[cardStyle, { gap: 8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={T.h3} accessibilityRole="header">
          Food
        </Text>
        <Text style={T.small}>
          {eaten} of {plural(day.meals.length, 'meal')}
          {offPlanCount ? ` · ${offPlanKcal.toLocaleString()} kcal logged` : ''}
        </Text>
      </View>
      {next ? (
        <Pressable
          onPress={() => void toggleMeal(day.id, next.slot)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: false }}
          accessibilityLabel={`Next: ${next.slot}, ${next.label}, ${next.kcal} kcal. Tick it when eaten.`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8, opacity: pressed ? 0.75 : 1 })}
        >
          <CheckBox checked={false} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.small}>Next: {next.slot}</Text>
            <Text style={T.bodyStrong}>{next.label}</Text>
            <Text style={T.small}>
              {next.kcal} kcal · P {next.protein}g · C {next.carbs}g · F {next.fat}g
            </Text>
          </View>
        </Pressable>
      ) : (
        <Text style={[T.meta, { paddingVertical: 8 }]}>Every planned meal is ticked. Log anything extra in Food.</Text>
      )}
      <LinkButton align="flex-start" onPress={() => router.push('/(tabs)/food')} accessibilityLabel="Open Food: meals, swaps and logging">
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Meals, swaps and logging</Text>
      </LinkButton>
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
          <Icon key={i} name="drop" size={26} color={i < count ? C.stone : '#4A4A4A'} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconButton icon="minus" size={52} onPress={water.sub} disabled={count === 0} accessibilityLabel="Remove a glass of water" />
        <Button variant="secondary" label="Add a glass" icon="plus" onPress={water.add} style={{ flex: 1 }} accessibilityLabel="Add a glass of water" />
      </View>
    </View>
  );
}

function coachTip(p: { workoutOpen: boolean; proteinLeft: number; waterLeft: number; kcalLeft: number; moved: boolean }): string {
  if (p.workoutOpen) return 'Your workout is still open. Smallest next step: one set of the first exercise.';
  if (p.waterLeft > 0) return `Training is covered. ${plural(p.waterLeft, 'glass', 'glasses')} of water left. Finish them before 6pm.`;
  if (p.proteinLeft > 25) return `${p.proteinLeft}g of protein still to go. Eggs, labneh, chicken or lentils get you there.`;
  return p.kcalLeft > 600 ? `${p.kcalLeft} kcal are still open today. A protein snack fits.` : 'Every box ticked. Recovery is the work now, so sleep well tonight.';
}

function syncLine(state: 'local' | 'offline' | 'synced'): string {
  if (state === 'local') return 'Saved on this device';
  if (state === 'offline') return "Offline. Changes are saved here and upload when you're back online.";
  return 'Synced to your account';
}

export default function TodayTab() {
  const router = useRouter();
  const { days, todayIdx, todayId, syncState, streak, targets, activities, removeActivity, profile } = usePlan();
  const { userId } = useAuth();
  const water = useWater();
  const food = useFoodLogs(todayId);
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const day = days[todayIdx];

  const healthOn = Platform.OS !== 'web' && !!healthPlatform() && !!profile?.health_sync?.enabled;
  useEffect(() => {
    if (!healthOn || !userId) {
      setHealth(null);
      return;
    }
    let alive = true;
    getHealthDays(userId, todayId, todayId)
      .then((rows) => alive && setHealth(rows[0] ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [healthOn, userId, todayId]);

  const todaysActivities = useMemo(() => activities.filter((a) => a.day === todayId), [activities, todayId]);
  const summary = useMemo(
    () =>
      day
        ? daySummary({
            day,
            logs: food.logs,
            activityKcal: todaysActivities.reduce((a, x) => a + x.kcal, 0),
            activityMinutes: todaysActivities.reduce((a, x) => a + x.minutes, 0),
            water: { count: water.count, target: water.target },
            targets,
          })
        : null,
    [day, food.logs, todaysActivities, water.count, water.target, targets],
  );

  if (!day || !summary) return <SafeAreaView style={screen} edges={['top']} />;

  const isWorkout = day.session.kind === 'workout';
  const pct = Math.round(summary.progress * 100);
  const ringLine = [
    isWorkout ? (day.done.workout ? 'Workout done' : 'Workout open') : todaysActivities.length ? 'Active rest day' : 'Rest day',
    `${summary.eaten.kcal.toLocaleString()} of ${targets.kcal.toLocaleString()} kcal`,
    `${water.count} of ${plural(water.target, 'glass', 'glasses')}`,
  ].join(' · ');

  const tip = coachTip({
    workoutOpen: isWorkout && !day.done.workout,
    proteinLeft: Math.max(0, targets.protein - summary.eaten.protein),
    waterLeft: Math.max(0, water.target - water.count),
    kcalLeft: summary.kcalLeft,
    moved: day.moved,
  });

  const s = setsOf(day);
  const trainDetail = !isWorkout ? (todaysActivities.length ? `${todaysActivities.reduce((a, x) => a + x.minutes, 0)} min active` : 'Rest day') : day.done.workout ? 'Done today' : `${s.done}/${s.total} sets`;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BuiltMark size={24} />
          <StreakChip count={streak} onPress={() => router.push('/(tabs)/progress')} />
        </View>

        <Greeting />

        <View style={[cardStyle, { alignItems: 'center', paddingVertical: 28, gap: 20 }]}>
          <Ring size={208} stroke={16} progress={summary.progress} accessibilityLabel={`Today ${pct} percent done`}>
            <Text style={{ fontFamily: FONT.body, fontSize: 16, color: C.stone }}>Today</Text>
            <Text style={{ fontFamily: FONT.displaySemi, fontSize: 48, lineHeight: 56, letterSpacing: -1.5, color: C.text }}>{pct}%</Text>
          </Ring>
          <Text style={[T.meta, { textAlign: 'center' }]}>{ringLine}</Text>
          <View style={{ flexDirection: 'row', gap: 16, alignSelf: 'stretch' }}>
            <Meter label="Protein" value={summary.eaten.protein} target={targets.protein} unit="g" />
            <Meter label="Carbs" value={summary.eaten.carbs} target={targets.carbs} unit="g" />
            <Meter label="Fat" value={summary.eaten.fat} target={targets.fat} unit="g" />
          </View>
          {summary.offPlan.kcal > 0 || summary.burned > 0 ? (
            <Text style={[T.small, { textAlign: 'center' }]}>
              {[summary.offPlan.kcal > 0 ? `${summary.offPlan.kcal.toLocaleString()} kcal off-plan counted` : null, summary.burned > 0 ? `${summary.burned.toLocaleString()} kcal burned in activities` : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>

        <CheckinDueCard />

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="dumbbell" title="Train" detail={trainDetail} onPress={() => (isWorkout ? router.push(`/workout/${day.id}`) : router.push('/(tabs)/plan'))} />
            <PillarTile icon="burger" title="Nutrition" detail={`${summary.kcalLeft.toLocaleString()} kcal left`} onPress={() => router.push('/(tabs)/food')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="brain" title="AI Coach" detail="Ask anything" onPress={() => router.push('/(tabs)/coach')} />
            <PillarTile icon="bars" title="Progress" detail={streak > 0 ? `${plural(streak, 'workout')} in a row` : 'Your weeks'} onPress={() => router.push('/(tabs)/progress')} />
          </View>
        </View>

        <WorkoutCard day={day} />

        <ActivityCard list={todaysActivities} health={health} onRemove={(id) => void removeActivity(id)} />

        <FoodCard day={day} offPlanKcal={summary.offPlan.kcal} offPlanCount={food.logs.length} />

        <WaterCard water={water} />

        <Pressable
          onPress={() => router.push('/(tabs)/coach')}
          accessibilityRole="button"
          accessibilityLabel={`Coach tip: ${tip} Open Coach.`}
          style={({ pressed }) => [cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: pressed ? C.raised : C.card }]}
        >
          <BuiltMark size={26} />
          <Text style={[T.body, { flex: 1, color: C.stone }]}>{tip}</Text>
          <Icon name="chevronRight" size={20} color={C.muted} />
        </Pressable>

        <Text style={[T.small, { textAlign: 'center', color: C.faint }]}>{syncLine(syncState)}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
