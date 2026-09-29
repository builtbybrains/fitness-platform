/* Progress: the last eight weeks from real history. Workouts per week and
   the streak come from the plan store (same numbers as Today); the weight
   trend reloads whenever the tab comes into view. */

import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { C, card as cardStyle, FONT, screen, T } from '../../src/design';
import { LineChart } from '../../src/components/LineChart';
import { BarChart } from '../../src/components/BarChart';
import { Button, LinkButton } from '../../src/components/Button';
import { Icon } from '../../src/components/Icon';
import { ScreenHeader } from '../../src/components/Bits';
import { usePlan } from '../../src/planStore';
import { useAuth } from '../../src/auth';
import { fetchWeights, WeightEntry } from '../../src/data';
import { weeklyHistory, streakHistory } from '../../src/stats';
import { parseDay } from '../../src/lib/dates';

function shortLabel(label: string): string {
  if (label === 'This wk') return 'Now';
  if (label === 'Last wk') return '1w';
  return label.replace(' ago', '');
}

function shortDate(id: string): string {
  return parseDay(id).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function ProgressTab() {
  const { history, schedule, historyLoaded, todayId, todayIdx, days } = usePlan();
  const { userId } = useAuth();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [weightsLoaded, setWeightsLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let alive = true;
      fetchWeights(userId).then(({ entries }) => {
        if (!alive) return;
        if (entries) setWeights(entries);
        setWeightsLoaded(true);
      });
      return () => {
        alive = false;
      };
    }, [userId]),
  );

  const weeks = useMemo(() => weeklyHistory(history, 8, new Date(), schedule), [history, schedule, todayId]); // eslint-disable-line react-hooks/exhaustive-deps
  const streaks = useMemo(() => streakHistory(history, 8, new Date(), schedule), [history, schedule, todayId]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyWorkout = weeks.some((w) => w.workoutsDone > 0);

  const weightValues = weights.map((w) => w.kg);
  const latest = weights.length ? weights[weights.length - 1] : null;
  const first = weights.length ? weights[0] : null;
  const delta = latest && first ? Math.round((latest.kg - first.kg) * 10) / 10 : 0;

  const thisWeek = weeks[weeks.length - 1];
  const currentStreak = streaks.length ? streaks[streaks.length - 1] : 0;
  const bestStreak = streaks.length ? Math.max(...streaks) : 0;
  const today = days[todayIdx];

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Progress" subtitle="Your last 8 weeks" />

        {!historyLoaded ? (
          <View style={[cardStyle, { alignItems: 'center', gap: 12, paddingVertical: 40 }]} accessibilityLiveRegion="polite">
            <ActivityIndicator color={C.green} />
            <Text style={T.meta}>Loading your history</Text>
          </View>
        ) : !anyWorkout ? (
          <View style={[cardStyle, { alignItems: 'center', gap: 16, paddingVertical: 36 }]}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bars" size={32} />
            </View>
            <View style={{ gap: 6, alignItems: 'center' }}>
              <Text style={[T.h2, { textAlign: 'center' }]}>No workouts yet</Text>
              <Text style={[T.meta, { textAlign: 'center', maxWidth: 280 }]}>Finish a workout and it shows up here.</Text>
            </View>
            <Button
              label={today?.session.kind === 'workout' && !today.done.workout ? "Start today's workout" : 'Open your plan'}
              onPress={() =>
                today?.session.kind === 'workout' && !today.done.workout ? router.push(`/workout/${today.id}`) : router.push('/(tabs)/plan')
              }
            />
          </View>
        ) : (
          <>
            <View style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 20 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: FONT.displaySemi, fontSize: 56, lineHeight: 62, letterSpacing: -2, color: C.green }}>{currentStreak}</Text>
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

            <View style={[cardStyle, { gap: 16 }]}>
              <Text style={T.h3} accessibilityRole="header">
                Workouts per week
              </Text>
              <BarChart
                values={weeks.map((w) => w.workoutsDone)}
                labels={weeks.map((w) => shortLabel(w.label))}
                height={150}
                accessibilityLabel={`Workouts per week, oldest first: ${weeks.map((w) => w.workoutsDone).join(', ')}`}
              />
            </View>

            <View style={[cardStyle, { gap: 16 }]}>
              <View style={{ gap: 2 }}>
                <Text style={T.h3} accessibilityRole="header">
                  Streak history
                </Text>
                <Text style={T.small}>Workouts in a row at the end of each week</Text>
              </View>
              <BarChart
                values={streaks}
                labels={weeks.map((w) => shortLabel(w.label))}
                height={150}
                accessibilityLabel={`Streak at the end of each week, oldest first: ${streaks.join(', ')}`}
              />
            </View>
          </>
        )}

        <View style={[cardStyle, { gap: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={T.h3} accessibilityRole="header">
              Weight
            </Text>
            {delta !== 0 ? (
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: C.text }}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)} kg
              </Text>
            ) : null}
          </View>
          {!weightsLoaded ? (
            <ActivityIndicator color={C.green} />
          ) : weightValues.length >= 2 ? (
            <LineChart values={weightValues} height={140} accessibilityLabel={`Weight trend from ${first?.kg} to ${latest?.kg} kilograms`} />
          ) : (
            <Text style={T.meta}>Log your weight in Profile a couple of times and your trend shows up here.</Text>
          )}
          {latest ? (
            <Text style={T.small}>
              Latest: {latest.kg.toFixed(1)} kg on {shortDate(latest.date)}
            </Text>
          ) : null}
          <LinkButton align="flex-start" onPress={() => router.push('/(tabs)/profile')} accessibilityLabel="Log your weight in Profile">
            <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.green }}>Log your weight</Text>
          </LinkButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
