/* Today: the greeting, the coach's note for the day, this week at a
   glance, one ring for the whole day, the day's workout right under it
   (on short phones the note and the week follow the workout instead),
   any check-in due, the four pillars, then activities, food and water. The
   ring and the numbers count every macro, food off the plan and logged
   activities, and count up on first view. Every control saves at once (to
   the account, or to this device). The blocks fade in on the first open
   of the day only. */

import { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { Ring } from '../../src/components/Ring';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { FadeIn } from '../../src/components/FadeIn';
import { useTween } from '../../src/components/motion';
import { usePop } from '../../src/components/usePop';
import { CoachNote } from '../../src/components/today/CoachNote';
import { WeekStrip } from '../../src/components/today/WeekStrip';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { ProgressBar } from '../../src/components/Bits';
import { MealImage } from '../../src/components/food/MealImage';
import { greetingWord } from '../../src/components/copy';
import { Meter } from '../../src/components/training/Controls';
import { MuscleMap } from '../../src/components/training/MuscleMap';
import { CheckinDueCard } from '../../src/components/profile/CheckinDue';
import { plural } from '../../src/components/training/labels';
import { usePlan } from '../../src/planStore';
import { DoneMap, setsOf, WeekDay, WeekSchedule } from '../../src/planData';
import { useWater } from '../../src/useWater';
import { useFoodLogs } from '../../src/foodLogs';
import { useAuth } from '../../src/auth';
import { daySummary } from '../../src/stats';
import { activityDef } from '../../src/data/activities';
import { getHealthDays } from '../../src/api/health';
import { healthPlatform } from '../../src/api/device/health';
import type { DailyNoteSummary } from '../../src/api/coach';
import { haptic } from '../../src/lib/haptics';
import { musclesForExercises } from '../../src/lib/muscles';
import { addDays, mondayIndex, parseDay, todayId as localToday } from '../../src/lib/dates';
import type { Activity, HealthDaily } from '../../src/types';

// The day Today last played its entrance, so tab switches and re-mounts
// later the same day show the screen in place.
let enteredOn: string | null = null;

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
        <Text style={T.h3}>{title}</Text>
        <Text style={T.meta}>{detail}</Text>
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
  const muscles = musclesForExercises(w.exercises.map((e) => e.id ?? e.name));
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
        {muscles.primary.length > 0 ? <MuscleMap primary={muscles.primary} secondary={muscles.secondary} size="small" /> : null}
        <IconButton
          icon={done ? 'check' : 'play'}
          variant={done ? 'carbon' : 'green'}
          size={56}
          onPress={() => router.push(`/workout/${day.id}`)}
          accessibilityLabel={done ? `${w.focus}, done. Review it.` : s.done > 0 ? `Continue ${w.focus}` : `Start ${w.focus}`}
        />
      </View>
      <ProgressBar value={s.total ? s.done / s.total : 0} color={C.stone} />
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
                <Text style={T.bodyStrong}>{a.label || activityDef(a.kind).label}</Text>
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
          onPress={() => {
            haptic.tap();
            void toggleMeal(day.id, next.slot);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: false }}
          accessibilityLabel={`Next: ${next.slot}, ${next.label}, ${next.kcal} kcal. Tick it when eaten.`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8, opacity: pressed ? 0.75 : 1 })}
        >
          <MealImage label={next.label} items={next.items} size="thumb" checked={false} />
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

/** One glass; the one just filled pops in. */
function Drop({ filled }: { filled: boolean }) {
  const scale = usePop(filled);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Icon name="drop" size={26} color={filled ? C.stone : '#4A4A4A'} />
    </Animated.View>
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
          <Drop key={i} filled={i < count} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <IconButton
          icon="minus"
          size={52}
          onPress={() => {
            haptic.tap();
            water.sub();
          }}
          disabled={count === 0}
          accessibilityLabel="Remove a glass of water"
        />
        <Button
          variant="secondary"
          label="Add a glass"
          icon="plus"
          onPress={() => {
            haptic.tap();
            water.add();
          }}
          style={{ flex: 1 }}
          accessibilityLabel="Add a glass of water"
        />
      </View>
    </View>
  );
}

function syncLine(state: 'local' | 'offline' | 'synced'): string {
  if (state === 'local') return 'Saved on this device';
  if (state === 'offline') return "Offline. Changes are saved here and upload when you're back online.";
  return 'Synced to your account';
}

/** What the coach's daily note is written from (see api/coach dailyNote). */
function noteSummary(p: { day: WeekDay; yesterday: WeekDay | undefined; history: DoneMap; schedule: WeekSchedule; streak: number; today: string }): DailyNoteSummary {
  let done7 = 0;
  let planned7 = 0;
  for (let i = 0; i < 7; i++) {
    const id = addDays(p.today, -i);
    const done = !!p.history[id]?.workout;
    if (done) done7++;
    if (done || p.schedule[mondayIndex(parseDay(id))] === 'workout') planned7++;
  }
  const w = p.day.session.kind === 'workout' ? p.day.session : null;
  const y = p.yesterday;
  return {
    day: w ? 'workout' : 'rest',
    focus: w?.focus,
    minutes: w?.minutes,
    workoutDone: p.day.done.workout,
    done7,
    planned7,
    streak: p.streak,
    mealsYesterday: y ? { eaten: y.meals.filter((m) => y.done.meals.includes(m.slot)).length, planned: y.meals.length } : null,
  };
}

export default function TodayTab() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  // Short phones (360x640): a smaller ring and tighter rhythm, so today's
  // workout and its play button are on the first screen.
  const compact = height < 700;
  const ring = compact ? { size: 140, stroke: 12, label: 14, pct: 34 } : { size: 208, stroke: 16, label: 16, pct: 48 };
  const { days, todayIdx, todayId, syncState, streak, targets, activities, removeActivity, profile, history, historyLoaded, planLoaded, schedule } = usePlan();
  const { userId } = useAuth();
  const water = useWater();
  const food = useFoodLogs(todayId);
  const [health, setHealth] = useState<HealthDaily | null>(null);
  const day = days[todayIdx];
  const [enter] = useState(() => enteredOn !== localToday());
  useEffect(() => {
    enteredOn = localToday();
  }, []);

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
  const note = useMemo(
    () => (day ? noteSummary({ day, yesterday: days[todayIdx - 1], history, schedule, streak, today: todayId }) : null),
    [day, days, todayIdx, history, schedule, streak, todayId],
  );

  // The numbers count up with the ring (Reduce Motion: shown at once).
  const pctShown = Math.round(useTween(summary ? summary.progress * 100 : 0, 900));
  const protein = useTween(summary?.eaten.protein ?? 0);
  const carbs = useTween(summary?.eaten.carbs ?? 0);
  const fat = useTween(summary?.eaten.fat ?? 0);

  if (!day || !summary || !note) return <SafeAreaView style={screen} edges={['top']} />;

  const isWorkout = day.session.kind === 'workout';
  const pct = Math.round(summary.progress * 100);
  const ringLine = [
    isWorkout ? (day.done.workout ? 'Workout done' : 'Workout open') : todaysActivities.length ? 'Active rest day' : 'Rest day',
    `${summary.eaten.kcal.toLocaleString()} of ${targets.kcal.toLocaleString()} kcal`,
    `${water.count} of ${plural(water.target, 'glass', 'glasses')}`,
  ].join(' · ');

  const s = setsOf(day);
  const trainDetail = !isWorkout ? (todaysActivities.length ? `${todaysActivities.reduce((a, x) => a + x.minutes, 0)} min active` : 'Rest day') : day.done.workout ? 'Done today' : `${s.done}/${s.total} sets`;

  // Each top-level block enters 40ms after the one above it.
  let block = 0;
  const enterAt = () => ({ delay: block++ * 40, play: enter });
  // The coach's note and this week sit under the greeting; on short phones
  // they follow the workout card so its play button stays on the first screen.
  const coachAndWeek = () => (
    <>
      <FadeIn {...enterAt()}>
        <CoachNote today={todayId} summary={note} ready={planLoaded && historyLoaded} />
      </FadeIn>
      <FadeIn {...enterAt()}>
        <WeekStrip days={days} today={todayId} />
      </FadeIn>
    </>
  );

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: compact ? 8 : 20, gap: compact ? 16 : 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <FadeIn {...enterAt()} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BuiltMark size={24} />
          <StreakChip count={streak} onPress={() => router.push('/(tabs)/progress')} />
        </FadeIn>

        <FadeIn {...enterAt()}>
          <Greeting />
        </FadeIn>

        {compact ? null : coachAndWeek()}

        <FadeIn {...enterAt()} style={[cardStyle, { alignItems: 'center', paddingVertical: compact ? 20 : 28, gap: compact ? 12 : 20 }]}>
          <Ring size={ring.size} stroke={ring.stroke} progress={summary.progress} accessibilityLabel={`Today ${pct} percent done`}>
            <Text style={{ fontFamily: FONT.body, fontSize: ring.label, color: C.stone }}>Today</Text>
            <Text style={{ fontFamily: FONT.displaySemi, fontSize: ring.pct, lineHeight: Math.round(ring.pct * 1.17), letterSpacing: -1.5, color: C.text }}>{pctShown}%</Text>
          </Ring>
          <Text style={[T.meta, { textAlign: 'center' }]}>{ringLine}</Text>
          <View style={{ flexDirection: 'row', gap: 16, alignSelf: 'stretch' }}>
            <Meter label="Protein" value={protein} target={targets.protein} unit="g" />
            <Meter label="Carbs" value={carbs} target={targets.carbs} unit="g" />
            <Meter label="Fat" value={fat} target={targets.fat} unit="g" />
          </View>
          {summary.offPlan.kcal > 0 || summary.burned > 0 ? (
            <Text style={[T.small, { textAlign: 'center' }]}>
              {[summary.offPlan.kcal > 0 ? `${summary.offPlan.kcal.toLocaleString()} kcal off-plan counted` : null, summary.burned > 0 ? `${summary.burned.toLocaleString()} kcal burned in activities` : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </FadeIn>

        {/* The check-in card renders nothing when none is due, so it shares this block's gap. */}
        <FadeIn {...enterAt()} style={{ gap: compact ? 16 : 24 }}>
          <WorkoutCard day={day} />
          <CheckinDueCard />
        </FadeIn>

        {compact ? coachAndWeek() : null}

        <FadeIn {...enterAt()} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="dumbbell" title="Train" detail={trainDetail} onPress={() => (isWorkout ? router.push(`/workout/${day.id}`) : router.push('/(tabs)/plan'))} />
            <PillarTile icon="burger" title="Nutrition" detail={`${summary.kcalLeft.toLocaleString()} kcal left`} onPress={() => router.push('/(tabs)/food')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="brain" title="AI Coach" detail="Ask anything" onPress={() => router.push('/(tabs)/coach')} />
            <PillarTile icon="bars" title="Progress" detail={streak > 0 ? `${streak} in a row` : 'Your weeks'} onPress={() => router.push('/(tabs)/progress')} />
          </View>
        </FadeIn>

        <FadeIn {...enterAt()}>
          <ActivityCard list={todaysActivities} health={health} onRemove={(id) => void removeActivity(id)} />
        </FadeIn>

        <FadeIn {...enterAt()}>
          <FoodCard day={day} offPlanKcal={summary.offPlan.kcal} offPlanCount={food.logs.length} />
        </FadeIn>

        <FadeIn {...enterAt()}>
          <WaterCard water={water} />
        </FadeIn>

        <FadeIn {...enterAt()}>
          <Text style={[T.small, { textAlign: 'center', color: C.faint }]}>{syncLine(syncState)}</Text>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}
