/* Progress tab — what the database says about your last weeks: weight trend,
   weekly workouts, and streak history. */

import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, card as cardStyle, screen, sectionLabel, subtitle, title } from '../../src/design';
import { LineChart } from '../../src/components/LineChart';
import { BarChart } from '../../src/components/BarChart';
import { usePlan } from '../../src/planStore';
import { useAuth } from '../../src/auth';
import { fetchWeights, fetchWeekDone, DoneRow, WeightEntry } from '../../src/data';
import { weeklyHistory, streakHistory, WeekBucket } from '../../src/stats';
import { isoDay } from '../../src/planData';

export default function ProgressTab() {
  const { days } = usePlan();
  const { userId } = useAuth();
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [weeks, setWeeks] = useState<WeekBucket[]>([]);
  const [streaks, setStreaks] = useState<number[]>([]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchWeights(userId).then(({ entries }) => {
      if (alive && entries) setWeights(entries);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // Full 8-week done-map: DB history merged with the live plan store.
  const doneById = useMemo(() => {
    const map: Record<string, DoneRow> = {};
    for (const d of days) map[d.id] = d.done;
    return map;
  }, [days]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * 7); // 8 Mondays back
    const end = new Date(start);
    end.setDate(start.getDate() + 6 * 7 + 6);
    fetchWeekDone(userId, isoDay(start), isoDay(end)).then(({ done }) => {
      if (!alive) return;
      const merged: Record<string, DoneRow> = { ...(done ?? {}), ...doneById };
      setWeeks(weeklyHistory(merged, 8));
      setStreaks(streakHistory(merged, 8));
    });
    return () => {
      alive = false;
    };
  }, [userId, doneById]);

  const weightValues = weights.map((w) => w.kg);
  const latest = weights.length ? weights[weights.length - 1] : null;
  const first = weights.length ? weights[0] : null;
  const delta = latest && first ? Math.round((latest.kg - first.kg) * 10) / 10 : 0;

  const doneThisWeek = weeks.length ? weeks[weeks.length - 1].workoutsDone : 0;
  const plannedThisWeek = weeks.length ? weeks[weeks.length - 1].workoutsPlanned : 0;
  const currentStreak = streaks.length ? streaks[streaks.length - 1] : 0;
  const bestStreak = streaks.length ? Math.max(...streaks) : 0;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
        <View style={{ gap: 2 }}>
          <Text style={sectionLabel}>VITAL</Text>
          <Text style={title}>Progress</Text>
          <Text style={subtitle}>Your last 8 weeks, from your account</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={[cardStyle, { flex: 1, alignItems: 'center', gap: 4 }]}>
            <Text style={{ color: C.mint, fontSize: 30, fontWeight: '800' }}>{currentStreak}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>week streak</Text>
          </View>
          <View style={[cardStyle, { flex: 1, alignItems: 'center', gap: 4 }]}>
            <Text style={{ color: C.text, fontSize: 30, fontWeight: '800' }}>{bestStreak}</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>best recent</Text>
          </View>
        </View>

        <View style={[cardStyle, { gap: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={sectionLabel}>Workouts per week</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>
              {doneThisWeek}/{plannedThisWeek} this week
            </Text>
          </View>
          <BarChart
            values={weeks.map((w) => w.workoutsDone)}
            labels={weeks.map((w) => w.label)}
            height={150}
          />
        </View>

        <View style={[cardStyle, { gap: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={sectionLabel}>Streak history</Text>
            <Text style={{ color: C.muted, fontSize: 12 }}>consecutive workouts</Text>
          </View>
          <BarChart
            values={streaks}
            labels={weeks.map((w) => w.label)}
            height={150}
          />
        </View>

        <View style={[cardStyle, { gap: 12 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={sectionLabel}>Weight</Text>
            {delta !== 0 ? (
              <Text style={{ color: delta < 0 ? C.mint : C.warn, fontSize: 13, fontWeight: '700' }}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)} kg
              </Text>
            ) : null}
          </View>
          {weightValues.length >= 2 ? (
            <LineChart values={weightValues} height={140} />
          ) : (
            <Text style={{ color: C.muted, fontSize: 13, lineHeight: 20 }}>
              Log your weight in Profile a couple of times and your trend shows up here.
            </Text>
          )}
          {latest ? (
            <Text style={{ color: C.muted, fontSize: 12 }}>
              Latest: {latest.kg.toFixed(1)} kg on {latest.date}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
