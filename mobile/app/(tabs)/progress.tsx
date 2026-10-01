/* Progress: the last eight weeks from real history. The streak and its
   training calendar, workouts per week, activities by kind, this week's
   calories and macros against target, and the weight trend. Each chart
   reads differently, and each has its own loading and empty state.
   Opened from Today (Progress tile, streak) and Profile. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { C, card as cardStyle, FONT, screen, T } from '../../src/design';
import { LineChart } from '../../src/components/LineChart';
import { BarChart } from '../../src/components/BarChart';
import { Button, LinkButton } from '../../src/components/Button';
import { BackHeader } from '../../src/components/training/BackHeader';
import { Meter, StateBlock } from '../../src/components/training/Controls';
import { HBars, TargetColumns, TrainingCalendar } from '../../src/components/training/Charts';
import { DAY_SHORT, plural } from '../../src/components/training/labels';
import { usePlan } from '../../src/planStore';
import { OfflineBlock, OfflineNotice } from '../../src/components/OfflineNotice';
import { useAuth } from '../../src/auth';
import { fetchWeights, WeightEntry } from '../../src/data';
import { fetchFoodRange, FoodLog } from '../../src/foodLogs';
import { activityByKind, activityTotals, addMacros, averageMacros, Macros, streakHistory, trainingCalendar, weeklyActivity, weeklyHistory, ZERO_MACROS } from '../../src/stats';
import { activityDef } from '../../src/data/activities';
import { addDays, parseDay } from '../../src/lib/dates';

function shortLabel(label: string): string {
  if (label === 'This wk') return 'Now';
  if (label === 'Last wk') return '1w';
  return label.replace(' ago', '');
}

function shortDate(id: string): string {
  return parseDay(id).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={T.h3} accessibilityRole="header">
        {title}
      </Text>
      {detail ? <Text style={T.small}>{detail}</Text> : null}
    </View>
  );
}

export default function ProgressTab() {
  const { history, schedule, historyLoaded, historyOffline, reload, todayId, todayIdx, days, weekStart, activities, activitiesLoaded, targets } = usePlan();
  const { userId, profile, session, profileLoaded, profileError } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [weightsLoaded, setWeightsLoaded] = useState(false);
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [foodLoaded, setFoodLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      fetchWeights(userId).then(({ entries }) => {
        if (!alive) return;
        if (entries) setWeights(entries);
        setWeightsLoaded(true);
      });
      fetchFoodRange(userId, weekStart, todayId)
        .then(({ logs }) => alive && setFoodLogs(logs))
        .finally(() => alive && setFoodLoaded(true));
      return () => {
        alive = false;
      };
    }, [userId, weekStart, todayId, reloadKey]),
  );
  const retry = useCallback(async () => {
    setReloadKey((k) => k + 1);
    await reload();
  }, [reload]);
  useEffect(() => setFoodLoaded(false), [weekStart]);

  const now = useMemo(() => parseDay(todayId), [todayId]);
  const weeks = useMemo(() => weeklyHistory(history, 8, now, schedule), [history, schedule, now]);
  const streaks = useMemo(() => streakHistory(history, 8, now, schedule), [history, schedule, now]);
  const since = profile?.onboarding_done_at?.slice(0, 10) ?? null;
  const calendar = useMemo(() => trainingCalendar(history, schedule, 8, now, since && Object.keys(history).every((d) => d >= since) ? since : null), [history, schedule, now, since]);
  const anyWorkout = weeks.some((w) => w.workoutsDone > 0);
  const thisWeek = weeks[weeks.length - 1];
  const currentStreak = streaks.length ? streaks[streaks.length - 1] : 0;
  const bestStreak = streaks.length ? Math.max(...streaks) : 0;
  const today = days[todayIdx];

  const fourWeeksFrom = addDays(weekStart, -21);
  const byKind = useMemo(() => activityByKind(activities, fourWeeksFrom, todayId), [activities, fourWeeksFrom, todayId]);
  const actWeeks = useMemo(() => weeklyActivity(activities, 8, now), [activities, now]);
  const actThisWeek = useMemo(() => activityTotals(activities, weekStart, todayId), [activities, weekStart, todayId]);

  const foodDays = useMemo(
    () =>
      days.map((d) => {
        if (d.id > todayId) return { id: d.id, totals: { ...ZERO_MACROS } };
        let t: Macros = { ...ZERO_MACROS };
        for (const m of d.meals) if (d.done.meals.includes(m.slot)) t = addMacros(t, m);
        for (const l of foodLogs) if (l.day === d.id) t = addMacros(t, l);
        return { id: d.id, totals: t };
      }),
    [days, foodLogs, todayId],
  );
  const macroAvg = useMemo(() => averageMacros(foodDays.filter((d) => d.id <= todayId).map((d) => d.totals)), [foodDays, todayId]);

  const latest = weights.length ? weights[weights.length - 1] : null;
  const first = weights.length ? weights[0] : null;
  const delta = latest && first ? Math.round((latest.kg - first.kg) * 10) / 10 : 0;

  // Never show zeros for history we couldn't read: wait for it, or say the
  // server can't be reached when this device has no saved copy either.
  const waiting = !historyLoaded || (!!session && !profileLoaded);
  const unreachable = (!!session && profileLoaded && !profile && !!profileError) || (historyLoaded && historyOffline && Object.keys(history).length === 0);
  if (waiting || unreachable) {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <BackHeader title="Progress" subtitle="Your last 8 weeks" fallback="/(tabs)" />
          {unreachable ? (
            <OfflineBlock body="Your streak, workouts and weight trend show here as soon as BUILT answers again. Nothing you logged is lost." onRetry={retry} />
          ) : (
            <View style={cardStyle}>
              <StateBlock kind="loading" title="Loading your training history" />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <BackHeader title="Progress" subtitle="Your last 8 weeks" fallback="/(tabs)" />

        <OfflineNotice text="Can't reach BUILT. Showing your last saved progress." onRetry={retry} />

        <View style={[cardStyle, { gap: 20 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 56, lineHeight: 62, letterSpacing: -2, color: C.text }} accessibilityLabel={`Workout streak ${currentStreak}`}>
                {currentStreak}
              </Text>
              <Text style={T.bodyStrong}>workout streak</Text>
            </View>
            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.lineStrong }} />
            <View style={{ flex: 1, gap: 14 }}>
              <View>
                <Text style={{ fontFamily: FONT.displaySemi, fontSize: 22, color: C.text }}>{bestStreak}</Text>
                <Text style={T.small}>best streak, 8 weeks</Text>
              </View>
              <View>
                <Text style={{ fontFamily: FONT.displaySemi, fontSize: 22, color: C.text }}>
                  {thisWeek?.workoutsDone ?? 0}
                  <Text style={{ fontSize: 16, color: C.muted }}>/{thisWeek?.workoutsPlanned ?? 0}</Text>
                </Text>
                <Text style={T.small}>workouts this week</Text>
              </View>
            </View>
          </View>
          <TrainingCalendar rows={calendar} />
          {!anyWorkout ? (
            <View style={{ gap: 12 }}>
              <Text style={T.meta}>No workouts yet. Finish one and the calendar starts to fill.</Text>
              <Button
                label={today?.session.kind === 'workout' && !today.done.workout ? "Start today's workout" : 'Open your plan'}
                onPress={() => (today?.session.kind === 'workout' && !today.done.workout ? router.push(`/workout/${today.id}`) : router.push('/(tabs)/plan'))}
              />
            </View>
          ) : null}
        </View>

        {historyLoaded && anyWorkout ? (
          <View style={[cardStyle, { gap: 16 }]}>
            <SectionTitle title="Workouts per week" detail="This week is the bright bar" />
            <BarChart
              values={weeks.map((w) => w.workoutsDone)}
              labels={weeks.map((w) => shortLabel(w.label))}
              height={150}
              accessibilityLabel={`Workouts per week, oldest first: ${weeks.map((w) => w.workoutsDone).join(', ')}`}
            />
          </View>
        ) : null}

        <View style={[cardStyle, { gap: 16 }]}>
          <SectionTitle
            title="Activities"
            detail={actThisWeek.count ? `This week: ${actThisWeek.minutes} min, about ${actThisWeek.kcal.toLocaleString()} kcal burned` : 'Walking, football, padel and more'}
          />
          {!activitiesLoaded ? (
            <StateBlock kind="loading" title="Loading your activities" />
          ) : byKind.length === 0 ? (
            <StateBlock kind="empty" icon="pulse" title="No activities in the last 4 weeks" body="Log a walk or a game and the minutes and calories show up here." action={{ label: 'Log an activity', onPress: () => router.push('/activity/log') }} />
          ) : (
            <>
              <Text style={T.small}>Last 4 weeks, by activity</Text>
              <HBars unit="min" rows={byKind.map((k) => ({ label: activityDef(k.kind).label, value: k.minutes, detail: `${k.kcal.toLocaleString()} kcal` }))} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 }} accessible accessibilityLabel={`Activity minutes per week, oldest first: ${actWeeks.map((w) => w.minutes).join(', ')}`}>
                {actWeeks.map((w, i) => (
                  <View key={w.weekStartId} style={{ alignItems: 'center', gap: 4, flex: 1 }}>
                    <Text style={{ fontFamily: FONT.displaySemi, fontSize: 14, color: i === actWeeks.length - 1 ? C.text : C.muted }}>{w.minutes}</Text>
                    <Text style={[T.small, { fontSize: 11, color: C.faint }]}>{i === actWeeks.length - 1 ? 'Now' : `${actWeeks.length - 1 - i}w`}</Text>
                  </View>
                ))}
              </View>
              <LinkButton align="flex-start" onPress={() => router.push('/activity/log')} accessibilityLabel="Log an activity">
                <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Log an activity</Text>
              </LinkButton>
            </>
          )}
        </View>

        <View style={[cardStyle, { gap: 16 }]}>
          <SectionTitle title="Food this week" detail={`Calories each day against ${targets.kcal.toLocaleString()} kcal`} />
          {!foodLoaded || !historyLoaded ? (
            <StateBlock kind="loading" title="Loading this week's food" />
          ) : macroAvg.days === 0 ? (
            <StateBlock kind="empty" icon="burger" title="Nothing logged this week" body="Tick meals in Food or log what you eat, and your week shows up here." action={{ label: 'Open Food', onPress: () => router.push('/(tabs)/food') }} />
          ) : (
            <>
              <TargetColumns days={foodDays.map((d, i) => ({ id: d.id, label: DAY_SHORT[i], value: d.totals.kcal }))} target={targets.kcal} todayId={todayId} />
              <Text style={T.small}>
                Daily average over {plural(macroAvg.days, 'logged day')}: {macroAvg.avg.kcal.toLocaleString()} kcal
              </Text>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Meter label="Protein" value={macroAvg.avg.protein} target={targets.protein} unit="g" />
                <Meter label="Carbs" value={macroAvg.avg.carbs} target={targets.carbs} unit="g" />
                <Meter label="Fat" value={macroAvg.avg.fat} target={targets.fat} unit="g" />
              </View>
            </>
          )}
        </View>

        <View style={[cardStyle, { gap: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <SectionTitle title="Weight" />
            {delta !== 0 ? (
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: C.text }}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)} kg
              </Text>
            ) : null}
          </View>
          {!weightsLoaded ? (
            <StateBlock kind="loading" title="Loading your weight" />
          ) : weights.length >= 2 ? (
            <LineChart values={weights.map((w) => w.kg)} height={140} color={C.stone} accessibilityLabel={`Weight trend from ${first?.kg} to ${latest?.kg} kilograms`} />
          ) : (
            <Text style={T.meta}>Weigh in a couple of times and your trend shows up here.</Text>
          )}
          {latest ? (
            <Text style={T.small}>
              Latest: {latest.kg.toFixed(1)} kg on {shortDate(latest.date)}
            </Text>
          ) : null}
          <LinkButton align="flex-start" onPress={() => router.push('/checkin/weekly')} accessibilityLabel="Log your weight">
            <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Log your weight</Text>
          </LinkButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
