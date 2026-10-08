/* Today: the greeting, the coach's note for the day, one ring for the
   whole day, the day's workout right under it, any check-in due, this week
   at a glance, the four pillars, then activities, food and water. On
   phones shorter than 900px the ring is smaller, and under 700px the
   day's calories and macros sit beside it, so the workout's play button
   is on the first screen. The ring and the numbers count every
   macro, food off the plan and logged activities, and count up on first
   view. Every control saves at once (to the account, or to this device).
   The greeting, the note and the ring fade in on the first open of the day
   only; everything else is simply there. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useRouter } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { TodayRing } from '../../src/components/today/TodayRing';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { FadeIn } from '../../src/components/FadeIn';
import { useReduceMotion, useTween } from '../../src/components/motion';
import { usePop } from '../../src/components/usePop';
import { TiltPressable } from '../../src/components/Tilt';
import { Bone, Skeleton } from '../../src/components/Skeleton';
import { usePullRefresh } from '../../src/components/usePullRefresh';
import { SwipeRow } from '../../src/components/SwipeRow';
import { CoachNote } from '../../src/components/today/CoachNote';
import { WeekStrip } from '../../src/components/today/WeekStrip';
import { Icon, IconName } from '../../src/components/Icon';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { ProgressBar } from '../../src/components/Bits';
import { MealImage } from '../../src/components/food/MealImage';
import { greetingWord } from '../../src/components/copy';
import { Meter } from '../../src/components/training/Controls';
import { MuscleMap } from '../../src/components/training/MuscleMap';
import { Lazy3D, preload3D } from '../../src/components/three/Lazy3D';
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

const NATIVE = Platform.OS !== 'web';
const COUNT_LINE = 20;

/** The streak's flame. It flickers twice (two 1.6s beats, growing 6% from
    its base and swaying 2 degrees a quarter-beat behind) when Today first
    shows a live streak and again each time the count goes up, then rests.
    A rise while Today is out of view plays once Today is back. Reduce
    Motion, or no streak: still. */
function Flame({ count, live }: { count: number; live: boolean }) {
  const reduce = useReduceMotion();
  const grow = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  // The count the flame last flickered for; null until the first one.
  const playedFor = useRef<number | null>(null);
  const hot = count > 0;

  useEffect(() => {
    if (!hot || reduce) {
      playedFor.current = hot ? count : null;
      return;
    }
    if (!live) return;
    if (playedFor.current !== null && count <= playedFor.current) {
      playedFor.current = count;
      return;
    }
    playedFor.current = count;
    const step = (v: Animated.Value, toValue: number, duration: number, easing: (t: number) => number) =>
      Animated.timing(v, { toValue, duration, easing, useNativeDriver: NATIVE });
    const burst = Animated.parallel([
      Animated.loop(Animated.sequence([step(grow, 1, 800, Easing.inOut(Easing.sin)), step(grow, 0, 800, Easing.inOut(Easing.sin))]), { iterations: 2 }),
      Animated.loop(Animated.sequence([step(sway, 1, 400, Easing.out(Easing.sin)), step(sway, -1, 800, Easing.inOut(Easing.sin)), step(sway, 0, 400, Easing.in(Easing.sin))]), {
        iterations: 2,
      }),
    ]);
    grow.setValue(0);
    sway.setValue(0);
    burst.start();
    return () => {
      burst.stop();
      grow.setValue(0);
      sway.setValue(0);
    };
  }, [count, hot, live, reduce, grow, sway]);

  const scaleY = grow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  // Half the 6% of 18px, so the flame grows up from its base.
  const translateY = grow.interpolate({ inputRange: [0, 1], outputRange: [0, -0.54] });
  const rotate = sway.interpolate({ inputRange: [-1, 1], outputRange: ['-2deg', '2deg'] });
  return (
    <Animated.View style={{ transform: [{ translateY }, { rotate }, { scaleY }] }}>
      <Icon name="flame" size={18} color={hot ? C.green : C.faint} />
    </Animated.View>
  );
}

/** The streak number. When it goes up it rolls like an odometer: the old
    number slides up and out as the new one slides in from below (300ms,
    ease-out quart). A rise that happens while Today is out of view (a
    workout finished on its own screen) waits and rolls once Today is back.
    Down or Reduce Motion: it simply changes. */
function RollingCount({ value, color, live }: { value: number; color: string; live: boolean }) {
  const reduce = useReduceMotion();
  const [shown, setShown] = useState(value);
  const [from, setFrom] = useState<number | null>(null);
  const t = useRef(new Animated.Value(1)).current;
  const waited = useRef(false);

  // Before paint, so the new number never flashes in place first.
  useLayoutEffect(() => {
    if (value === shown) return;
    if (!live && !reduce && value > shown) {
      waited.current = true;
      return;
    }
    if (value < shown || reduce) {
      setFrom(null);
      setShown(value);
      t.setValue(1);
      return;
    }
    setFrom(shown);
    setShown(value);
    t.setValue(0);
    // After a wait, let the screen settle into view first.
    const delay = waited.current ? 250 : 0;
    waited.current = false;
    Animated.timing(t, { toValue: 1, duration: 300, delay, easing: Easing.out(Easing.poly(4)), useNativeDriver: NATIVE }).start(({ finished }) => finished && setFrom(null));
  }, [value, shown, live, reduce, t]);

  const text = { fontFamily: FONT.displaySemi, fontSize: 15, lineHeight: COUNT_LINE, color };
  return (
    <View style={{ height: COUNT_LINE, overflow: 'hidden' }}>
      <Animated.Text style={[text, { transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [COUNT_LINE, 0] }) }] }]}>{shown}</Animated.Text>
      {from != null ? (
        <Animated.Text
          style={[
            text,
            { position: 'absolute', left: 0, top: 0, opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -COUNT_LINE] }) }] },
          ]}
        >
          {from}
        </Animated.Text>
      ) : null}
    </View>
  );
}

function StreakChip({ count, onPress }: { count: number; onPress: () => void }) {
  const hot = count > 0;
  // Motion only while Today is on screen.
  const live = useIsFocused();
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
      <Flame count={count} live={live} />
      <RollingCount value={count} color={hot ? C.green : C.muted} live={live} />
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
    <TiltPressable
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
    </TiltPressable>
  );
}

/** One macro on a line, for the ring card's side column on short phones. */
function MacroRow({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const frac = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={`${label}: ${Math.round(value)} of ${Math.round(target)} ${unit === 'g' ? 'grams' : unit}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Text style={T.small}>{label}</Text>
        <Text style={{ fontFamily: FONT.displaySemi, fontSize: 14, lineHeight: 18, color: C.text }}>
          {Math.round(value)}
          <Text style={{ fontFamily: FONT.body, fontSize: 12, color: C.muted }}>
            /{Math.round(target)}
            {unit}
          </Text>
        </Text>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised, overflow: 'hidden' }}>
        <View style={{ height: 4, width: `${frac * 100}%`, backgroundColor: C.stone, borderRadius: 2 }} />
      </View>
    </View>
  );
}

function WorkoutCard({ day }: { day: WeekDay }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
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
        {/* Still: drawn once, no loop. The extra margin opens 8 more before the chevron. */}
        <Lazy3D kind="dumbbell" motion="rest" width={88} height={88} paused style={{ marginRight: 8 }} />
        <Icon name="chevronRight" size={22} color={C.muted} />
      </Pressable>
    );
  }
  const w = day.session;
  const s = setsOf(day);
  const muscles = musclesForExercises(w.exercises.map((e) => e.id ?? e.name));
  const done = day.done.workout;
  const hasMap = muscles.primary.length > 0;
  // "Upper body · Strength" on one line when it fits beside the play
  // button (about 10.5px a character at this size); otherwise the part
  // after the dot moves to the line below rather than breaking the title.
  const [head, ...rest] = w.focus.split(' · ');
  const room = Math.min(width, 640) - 40 - 40 - 72;
  const split = rest.length > 0 && w.focus.length * 10.5 > room;
  const title = split ? head : w.focus;
  const meta = [split ? rest.join(' · ') : null, `${w.minutes} min`, plural(w.exercises.length, 'exercise')].filter(Boolean).join(' · ');
  const status = done ? 'Done today. Nice work.' : s.done > 0 ? `${s.done} of ${s.total} sets logged` : `${s.total} sets to go`;
  // The whole card opens the workout on touch and tilts under the finger;
  // screen readers get the play button, which says the same thing.
  return (
    <TiltPressable onPress={() => router.push(`/workout/${day.id}`)} accessible={false} focusable={false} style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={T.small}>Today&apos;s workout{day.moved ? ', moved here' : ''}</Text>
          <Text style={T.h2}>{title}</Text>
          <Text style={T.meta}>{meta}</Text>
        </View>
        <IconButton
          icon={done ? 'check' : 'play'}
          variant={done ? 'carbon' : 'green'}
          size={56}
          onPress={() => router.push(`/workout/${day.id}`)}
          accessibilityLabel={done ? `${w.focus}, done. Review it.` : s.done > 0 ? `Continue ${w.focus}` : `Start ${w.focus}`}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {hasMap ? <MuscleMap primary={muscles.primary} secondary={muscles.secondary} size="small" /> : null}
        <View style={{ flex: 1, gap: 8 }}>
          <ProgressBar value={s.total ? s.done / s.total : 0} color={C.stone} />
          <Text style={T.small}>{status}</Text>
        </View>
      </View>
    </TiltPressable>
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
  const eat = () => {
    if (!next) return;
    haptic.tap();
    void toggleMeal(day.id, next.slot);
  };
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
        // Tap or swipe right to tick it eaten.
        <SwipeRow label="Eaten" onCommit={eat} background={C.card}>
          <Pressable
            onPress={eat}
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
        </SwipeRow>
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

/** Today while the day loads: the same blocks in the same places. */
function TodaySkeleton({ ringSize, compact, tight }: { ringSize: number; compact: boolean; tight: boolean }) {
  const { width } = useWindowDimensions();
  const line = Math.round((width < 380 ? 24 : 27) * 1.25);
  return (
    <Skeleton label="Loading your day" style={{ padding: 20, paddingTop: tight ? 8 : 20, gap: tight ? 16 : 24, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BuiltMark size={24} />
        <Bone width={64} height={44} radius={R.pill} />
      </View>
      <View style={{ gap: 2 }}>
        {(['62%', '84%'] as const).map((w) => (
          <View key={w} style={{ height: line, justifyContent: 'center' }}>
            <Bone width={w} height={Math.round(line * 0.7)} radius={8} />
          </View>
        ))}
      </View>
      <Bone height={88} radius={R.card} />
      {tight ? (
        <Bone radius={R.card} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }}>
          <Bone circle height={ringSize} tone="raised" />
          <View style={{ flex: 1, gap: 14 }}>
            <Bone width="60%" height={18} radius={6} tone="raised" />
            <Bone height={22} radius={6} tone="raised" />
            <Bone height={22} radius={6} tone="raised" />
            <Bone height={22} radius={6} tone="raised" />
          </View>
        </Bone>
      ) : (
        <Bone radius={R.card} style={{ alignItems: 'center', paddingVertical: compact ? 20 : 28, paddingHorizontal: 20, gap: compact ? 12 : 20 }}>
          <Bone circle height={ringSize} tone="raised" />
          <Bone width="70%" height={14} radius={6} tone="raised" />
          <View style={{ flexDirection: 'row', gap: 16, alignSelf: 'stretch' }}>
            {[0, 1, 2].map((i) => (
              <Bone key={i} height={44} radius={8} tone="raised" style={{ flex: 1 }} />
            ))}
          </View>
        </Bone>
      )}
      <Bone radius={R.card} style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <View style={{ flex: 1, gap: 8 }}>
            <Bone width="40%" height={14} radius={6} tone="raised" />
            <Bone width="75%" height={22} radius={6} tone="raised" />
            <Bone width="55%" height={14} radius={6} tone="raised" />
          </View>
          <Bone circle height={56} tone="raised" />
        </View>
        <Bone height={4} radius={2} tone="raised" />
      </Bone>
      <View style={{ gap: 12 }}>
        <Bone width={96} height={18} radius={6} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Bone key={i} circle height={34} />
          ))}
        </View>
      </View>
      <View style={{ gap: 12 }}>
        {[0, 1].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 12 }}>
            <Bone height={128} style={{ flex: 1 }} />
            <Bone height={128} style={{ flex: 1 }} />
          </View>
        ))}
      </View>
    </Skeleton>
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

/** Once Today has drawn and gone quiet (2s, then the browser's next idle
    moment where it has one), fetch the 3D code, so the first visit to Food
    paints its donut without waiting on the download. */
function usePreload3DWhenIdle() {
  useEffect(() => {
    let idle: number | null = null;
    const timer = setTimeout(() => {
      const run = () => void preload3D().catch(() => {});
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(run, { timeout: 2000 });
      else run();
    }, 2000);
    return () => {
      clearTimeout(timer);
      const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (idle !== null) cic?.(idle);
    };
  }, []);
}

export default function TodayTab() {
  const router = useRouter();
  usePreload3DWhenIdle();
  const { height } = useWindowDimensions();
  // Below 900px tall the ring shrinks so today's workout and its play
  // button are on the first screen; below 700px the rhythm tightens too.
  const compact = height < 900;
  const tight = height < 700;
  const ring = compact ? { size: 140, stroke: 12, label: 14, pct: 34 } : { size: 208, stroke: 16, label: 16, pct: 48 };
  const { days, todayIdx, todayId, syncState, streak, targets, activities, removeActivity, profile, history, historyLoaded, planLoaded, schedule, reload } = usePlan();
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
  const pctShown = Math.round(useTween(summary ? summary.progress * 100 : 0, 400));
  const protein = useTween(summary?.eaten.protein ?? 0);
  const carbs = useTween(summary?.eaten.carbs ?? 0);
  const fat = useTween(summary?.eaten.fat ?? 0);
  const kcal = useTween(summary?.eaten.kcal ?? 0);

  // Pull to refresh: the plan, history and activities, today's food and water.
  const refreshFood = food.refresh;
  const refreshWater = water.refresh;
  const refreshControl = usePullRefresh(useCallback(() => Promise.all([reload(), refreshFood(), refreshWater()]), [reload, refreshFood, refreshWater]));

  // Never flash the starter plan: the day's shape holds until the stored plan is in.
  if (!day || !summary || !note || !planLoaded) {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <TodaySkeleton ringSize={ring.size} compact={compact} tight={tight} />
      </SafeAreaView>
    );
  }

  const isWorkout = day.session.kind === 'workout';
  const pct = Math.round(summary.progress * 100);
  const ringLine = [
    isWorkout ? (day.done.workout ? 'Workout done' : 'Workout open') : todaysActivities.length ? 'Active rest day' : 'Rest day',
    `${summary.eaten.kcal.toLocaleString()} of ${targets.kcal.toLocaleString()} kcal`,
    `${water.count} of ${plural(water.target, 'glass', 'glasses')}`,
  ].join(' · ');

  const s = setsOf(day);
  const trainDetail = !isWorkout ? (todaysActivities.length ? `${todaysActivities.reduce((a, x) => a + x.minutes, 0)} min active` : 'Rest day') : day.done.workout ? 'Done today' : `${s.done}/${s.total} sets`;

  // The greeting, the note and the ring enter 40ms apart; the rest is in place.
  let block = 0;
  const enterAt = () => ({ delay: block++ * 40, play: enter });
  const gap = tight ? 16 : 24;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: 20, paddingTop: tight ? 8 : 20, gap, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <BuiltMark size={24} />
          <StreakChip count={streak} onPress={() => router.push('/(tabs)/progress')} />
        </View>

        <FadeIn {...enterAt()}>
          <Greeting />
        </FadeIn>

        <FadeIn {...enterAt()}>
          <CoachNote today={todayId} summary={note} ready={planLoaded && historyLoaded} />
        </FadeIn>

        {tight ? (
          // Under 700px tall: the ring with the day's numbers beside it, so
          // the workout card's play button is on the first screen. The
          // workout and water have their own cards right below.
          <FadeIn {...enterAt()} style={[cardStyle, { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }]}>
            <TodayRing size={ring.size} stroke={ring.stroke} progress={summary.progress} accessibilityLabel={`Today ${pct} percent done. ${ringLine}`}>
              <Text style={{ fontFamily: FONT.body, fontSize: ring.label, color: C.stone }}>Today</Text>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: ring.pct, lineHeight: Math.round(ring.pct * 1.17), letterSpacing: -1.5, color: C.text }}>{pctShown}%</Text>
            </TodayRing>
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 18, lineHeight: 24, color: C.text }} accessibilityLabel={`${summary.eaten.kcal} of ${targets.kcal} calories`}>
                {Math.round(kcal).toLocaleString()}
                <Text style={{ fontFamily: FONT.body, fontSize: 12, color: C.muted }}>/{targets.kcal.toLocaleString()} kcal</Text>
              </Text>
              <MacroRow label="Protein" value={protein} target={targets.protein} unit="g" />
              <MacroRow label="Carbs" value={carbs} target={targets.carbs} unit="g" />
              <MacroRow label="Fat" value={fat} target={targets.fat} unit="g" />
            </View>
          </FadeIn>
        ) : (
          <FadeIn {...enterAt()} style={[cardStyle, { alignItems: 'center', paddingVertical: compact ? 20 : 28, gap: compact ? 12 : 20 }]}>
            <TodayRing size={ring.size} stroke={ring.stroke} progress={summary.progress} accessibilityLabel={`Today ${pct} percent done`}>
              <Text style={{ fontFamily: FONT.body, fontSize: ring.label, color: C.stone }}>Today</Text>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: ring.pct, lineHeight: Math.round(ring.pct * 1.17), letterSpacing: -1.5, color: C.text }}>{pctShown}%</Text>
            </TodayRing>
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
        )}

        {/* The check-in card renders nothing when none is due, so it shares this block's gap. */}
        <View style={{ gap }}>
          <WorkoutCard day={day} />
          <CheckinDueCard />
        </View>

        <WeekStrip days={days} today={todayId} />

        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="dumbbell" title="Train" detail={trainDetail} onPress={() => (isWorkout ? router.push(`/workout/${day.id}`) : router.push('/(tabs)/plan'))} />
            <PillarTile icon="burger" title="Nutrition" detail={`${summary.kcalLeft.toLocaleString()} kcal left`} onPress={() => router.push('/(tabs)/food')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PillarTile icon="brain" title="AI Coach" detail="Ask anything" onPress={() => router.push('/(tabs)/coach')} />
            <PillarTile icon="bars" title="Progress" detail={streak > 0 ? `${streak} in a row` : 'Your weeks'} onPress={() => router.push('/(tabs)/progress')} />
          </View>
        </View>

        <View>
          <ActivityCard list={todaysActivities} health={health} onRemove={(id) => void removeActivity(id)} />
        </View>

        <View>
          <FoodCard day={day} offPlanKcal={summary.offPlan.kcal} offPlanCount={food.logs.length} />
        </View>

        <View>
          <WaterCard water={water} />
        </View>

        <View>
          <Text style={[T.small, { textAlign: 'center', color: C.faint }]}>{syncLine(syncState)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
