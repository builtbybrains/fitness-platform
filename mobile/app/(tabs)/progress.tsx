/* Progress: the last eight weeks from real history. The streak and its
   training calendar, milestones, workouts per week, activities by kind,
   this week's calories and macros against target, and the weight trend.
   Each chart reads differently, and each has its own loading and empty
   state; trends with no data yet show a faint sample of what's coming.
   The streak card and milestones ease in on the first open of the day
   only; the sections below them are simply there. While the history
   loads, the streak card, milestones and a chart stand in as shapes.
   Opened from Today (Progress tile, streak) and Profile. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { LineChart } from '../../src/components/LineChart';
import { BarChart } from '../../src/components/BarChart';
import { Button, LinkButton } from '../../src/components/Button';
import { BackHeader } from '../../src/components/training/BackHeader';
import { Meter, StateBlock } from '../../src/components/training/Controls';
import { HBars, SampleChart, sampleWeightTrend, TargetColumns, TrainingCalendar } from '../../src/components/training/Charts';
import { Milestones } from '../../src/components/progress/Milestones';
import { FadeIn } from '../../src/components/FadeIn';
import { Bone, Skeleton } from '../../src/components/Skeleton';
import { DAY_SHORT, plural } from '../../src/components/training/labels';
import { usePlan } from '../../src/planStore';
import { OfflineBlock, OfflineNotice } from '../../src/components/OfflineNotice';
import { useAuth } from '../../src/auth';
import { fetchWeights, WeightEntry } from '../../src/data';
import { fetchFoodRange, FoodLog } from '../../src/foodLogs';
import { activityByKind, activityTotals, addMacros, averageMacros, bestStreak as bestStreakIn, Macros, streakHistory, trainingCalendar, weeklyActivity, weeklyHistory, ZERO_MACROS } from '../../src/stats';
import { weekCounts, weekStrip } from '../../src/lib/weekStrip';
import { activityDef } from '../../src/data/activities';
import { addDays, parseDay } from '../../src/lib/dates';
import { milestones } from '../../src/lib/milestones';
import { listCheckins } from '../../src/api/checkins';

/** The day the sections last eased in: they play once a day, not on every visit. */
let enteredOn: string | null = null;

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

/** Progress while the history loads: the streak card, milestones, a chart. */
function ProgressSkeleton() {
  return (
    <Skeleton label="Loading your training history" style={{ gap: 24 }}>
      <Bone radius={R.card} style={{ padding: 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width={56} height={56} radius={8} tone="raised" />
            <Bone width="70%" height={16} radius={6} tone="raised" />
          </View>
          <View style={{ flex: 1, gap: 14 }}>
            <Bone width="60%" height={36} radius={6} tone="raised" />
            <Bone width="60%" height={36} radius={6} tone="raised" />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          {[0, 1, 2, 3].map((r) => (
            <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
              {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                <Bone key={c} height={14} radius={4} tone="raised" style={{ flex: 1 }} />
              ))}
            </View>
          ))}
        </View>
      </Bone>
      <Bone radius={R.card} style={{ padding: 20, gap: 12 }}>
        <Bone width="35%" height={18} radius={6} tone="raised" />
        {[0, 1].map((r) => (
          <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 }}>
            {[0, 1, 2, 3].map((c) => (
              <Bone key={c} circle height={56} tone="raised" />
            ))}
          </View>
        ))}
      </Bone>
      <Bone radius={R.card} style={{ padding: 20, gap: 16 }}>
        <Bone width="45%" height={18} radius={6} tone="raised" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 150 }}>
          {[40, 70, 55, 90, 60, 100, 75, 85].map((h, i) => (
            <Bone key={i} height={h} radius={6} tone="raised" style={{ flex: 1 }} />
          ))}
        </View>
      </Bone>
    </Skeleton>
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
  const [checkinDays, setCheckinDays] = useState<string[]>([]);
  const [checkinsLoaded, setCheckinsLoaded] = useState(false);
  const [play] = useState(() => enteredOn !== todayId);
  useEffect(() => {
    enteredOn = todayId;
  }, [todayId]);

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
      listCheckins(userId, undefined, 120)
        .then((list) => alive && setCheckinDays(list.map((c) => c.day)))
        .catch(() => undefined)
        .finally(() => alive && setCheckinsLoaded(true));
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
  const currentStreak = streaks.length ? streaks[streaks.length - 1] : 0;
  // Every day of the window, not just each week's Sunday, so a streak that
  // peaked midweek still counts.
  const bestStreak = useMemo(() => bestStreakIn(history, 8, now, schedule), [history, now, schedule]);
  // The plan's whole week, counted the way Today's week strip counts it.
  const week = useMemo(() => weekCounts(weekStrip(days, todayId)), [days, todayId]);
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

  const badges = useMemo(() => milestones({ history, schedule, todayId, checkinDays }), [history, schedule, todayId, checkinDays]);

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
            <ProgressSkeleton />
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

        <FadeIn play={play} delay={0}>
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
                {/* Counted like Today's week strip: done of every workout in the plan's week. */}
                <View accessible accessibilityLabel={`${week.done} of ${plural(week.planned, 'workout')} done this week`}>
                  <Text style={{ fontFamily: FONT.displaySemi, fontSize: 22, color: C.text }}>
                    {week.done}
                    <Text style={{ fontSize: 16, color: C.muted }}>/{week.planned}</Text>
                  </Text>
                  <Text style={T.small}>done this week</Text>
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
        </FadeIn>

        <FadeIn play={play} delay={40}>
          <Milestones items={badges} userId={userId} ready={historyLoaded && checkinsLoaded} />
        </FadeIn>

        <View>
          <View style={[cardStyle, { gap: 16 }]}>
            {anyWorkout ? (
              <>
                <SectionTitle title="Workouts per week" detail="This week is the bright bar" />
                <BarChart
                  values={weeks.map((w) => w.workoutsDone)}
                  labels={weeks.map((w) => shortLabel(w.label))}
                  height={150}
                  accessibilityLabel={`Workouts per week, oldest first: ${weeks.map((w) => w.workoutsDone).join(', ')}`}
                />
              </>
            ) : (
              <>
                <SectionTitle title="Workouts per week" />
                <SampleChart kind="bars" height={150} caption="Your weeks fill in here after your first workout." />
              </>
            )}
          </View>
        </View>

        <View>
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
        </View>

        <View>
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
        </View>

        <View>
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
              <SampleChart
                kind="line"
                trend={sampleWeightTrend(profile)}
                caption={latest ? `Latest: ${latest.kg.toFixed(1)} kg on ${shortDate(latest.date)}. One more weigh-in and your trend appears here.` : 'Your trend appears here after your first check\u2011in.'}
                action={{
                  label: latest ? 'Log your weight' : 'Log your first check\u2060-\u2060in',
                  onPress: () => router.push('/checkin/weekly'),
                  // The streak card already holds the green button until the first workout.
                  variant: anyWorkout ? 'primary' : 'secondary',
                }}
              />
            )}
            {weightsLoaded && weights.length >= 2 && latest ? (
              <>
                <Text style={T.small}>
                  Latest: {latest.kg.toFixed(1)} kg on {shortDate(latest.date)}
                </Text>
                <LinkButton align="flex-start" onPress={() => router.push('/checkin/weekly')} accessibilityLabel="Log your weight">
                  <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Log your weight</Text>
                </LinkButton>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
