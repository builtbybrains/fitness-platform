/* Food: today's meal plan with every macro, tick what you ate, swap a meal
   for one with similar calories and protein. The second option is to log
   what you actually have: type it or snap it, answer a quick question or
   two, check the numbers, save. Or ask for a meal made from what's at home.
   Off-plan food counts toward the day. Pull down to re-read the plan and
   what was logged; while they load, the screen's shape stands in. */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { usePlan } from '../../src/planStore';
import { useFoodLogs } from '../../src/foodLogs';
import { daySummary } from '../../src/stats';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { CheckBox, ScreenHeader } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { MacroLine, StateBlock } from '../../src/components/training/Controls';
import { DayTotals } from '../../src/components/food/DayTotals';
import { MealSwapSheet } from '../../src/components/food/MealSwapSheet';
import { MealImage } from '../../src/components/food/MealImage';
import { Bone, Skeleton } from '../../src/components/Skeleton';
import { usePullRefresh } from '../../src/components/usePullRefresh';
import { dateEyebrow, foodHeaderStats } from '../../src/lib/headerStats';
import { OfflineBlock, OfflineNotice } from '../../src/components/OfflineNotice';
import { useAuth } from '../../src/auth';
import { haptic } from '../../src/lib/haptics';
import type { DayMeal } from '../../src/planData';

const SOURCE_LABEL: Record<string, string> = { photo: 'From a photo', text: 'Typed', generated: 'Made from what you had', plan: 'Plan meal' };

export default function FoodTab() {
  const { days, todayIdx, todayId, targets, activities, profile, plan, planLoaded, swapMeal, toggleMeal, reload } = usePlan();
  const { session, profileLoaded, profileError } = useAuth();
  const unreachable = !!session && profileLoaded && !profile && !!profileError;
  const food = useFoodLogs(todayId);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  // The meal ticked last: its row re-mounts as eaten, and its tick pops in.
  const [justAte, setJustAte] = useState<string | null>(null);
  const day = days[todayIdx];
  const refreshFood = food.refresh;
  const refreshControl = usePullRefresh(useCallback(() => Promise.all([reload(), refreshFood()]), [reload, refreshFood]));

  const activityToday = useMemo(() => activities.filter((a) => a.day === todayId), [activities, todayId]);
  const summary = useMemo(
    () =>
      day
        ? daySummary({
            day,
            logs: food.logs,
            activityKcal: activityToday.reduce((a, x) => a + x.kcal, 0),
            activityMinutes: activityToday.reduce((a, x) => a + x.minutes, 0),
            water: { count: 0, target: 0 },
            targets,
          })
        : null,
    [day, food.logs, activityToday, targets],
  );

  // Never flash the starter meals: wait for the stored plan and, with an
  // account, the profile that sets the calorie target.
  if (!day || !summary || !planLoaded || (session && !profileLoaded) || unreachable) {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <View style={{ padding: 20, gap: 24, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
          <ScreenHeader
            eyebrow={day ? dateEyebrow(day.index, day.id, true) : undefined}
            title="Time to"
            accent="fuel up."
            right={unreachable ? undefined : <PhotoLogButton />}
          />
          {unreachable ? (
            <OfflineBlock body="Your meals and what you logged show here as soon as BUILT answers again." />
          ) : (
            <FoodSkeleton />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const swapping = day.meals.find((m) => m.slot === swapSlot) ?? null;
  const original = swapping ? plan.days[day.planIndex]?.meals.find((m) => m.slot === swapping.slot) ?? null : null;
  const mealsDone = day.meals.filter((m) => day.done.meals.includes(m.slot)).length;
  // The next meal to eat leads with a big photo; the rest are rows.
  const next = day.meals.find((m) => !day.done.meals.includes(m.slot)) ?? null;
  const rest = day.meals.filter((m) => m !== next);

  function tick(slot: string, eaten: boolean) {
    if (!eaten) {
      haptic.tap();
      setJustAte(slot);
    }
    void toggleMeal(day.id, slot);
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader
          eyebrow={dateEyebrow(day.index, day.id, true)}
          title="Time to"
          accent="fuel up."
          stats={foodHeaderStats({ eatenKcal: summary.eaten.kcal, targetKcal: targets.kcal, meals: day.meals, eatenSlots: day.done.meals })}
          right={<PhotoLogButton />}
        />

        <OfflineNotice />

        <DayTotals eaten={summary.eaten} offPlan={summary.offPlan.kcal} burned={summary.burned} targets={targets} />

        <View style={[cardStyle, { gap: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 8 }}>
            <Text style={T.h3} accessibilityRole="header">
              Today&apos;s meals
            </Text>
            <Text style={T.small}>
              {mealsDone} of {day.meals.length} eaten
            </Text>
          </View>
          {day.meals.length === 0 ? (
            <StateBlock kind="empty" icon="burger" title="No meals planned today" body="Log what you eat below and it counts toward your day." />
          ) : (
            <>
              {next ? <NextMeal meal={next} onToggle={() => tick(next.slot, false)} onSwap={() => setSwapSlot(next.slot)} /> : null}
              {rest.map((m, i) => (
                <MealRow
                  key={m.slot}
                  meal={m}
                  first={i === 0 && !next}
                  done={day.done.meals.includes(m.slot)}
                  justTicked={justAte === m.slot}
                  onToggle={() => tick(m.slot, day.done.meals.includes(m.slot))}
                  onSwap={() => setSwapSlot(m.slot)}
                />
              ))}
            </>
          )}
        </View>

        <View style={[cardStyle, { gap: 16 }]}>
          <View style={{ gap: 4 }}>
            <Text style={T.h3} accessibilityRole="header">
              Ate something else?
            </Text>
            <Text style={T.meta}>Log what you have. Type it or snap it, and it counts toward today.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button icon="edit" label="Type it" onPress={() => router.push('/food/log?mode=text')} style={{ flex: 1 }} accessibilityLabel="Log food by typing it" />
            <Button variant="secondary" icon="camera" label="Photo" onPress={() => router.push('/food/log?mode=photo')} style={{ flex: 1 }} accessibilityLabel="Log food from a photo" />
          </View>
          <Pressable
            onPress={() => router.push('/meals/from-home')}
            accessibilityRole="button"
            accessibilityLabel="Make me a meal from what I have"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, borderRadius: 14, backgroundColor: pressed ? C.raised : C.surface })}
          >
            <Icon name="burger" size={22} color={C.stone} />
            <View style={{ flex: 1 }}>
              <Text style={T.bodyStrong}>Make me a meal from what I have</Text>
              <Text style={T.small}>List what&apos;s in the kitchen, get a recipe that fits.</Text>
            </View>
            <Icon name="chevronRight" size={20} color={C.muted} />
          </Pressable>
        </View>

        <View style={[cardStyle, { gap: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 4 }}>
            <Text style={T.h3} accessibilityRole="header">
              Logged today
            </Text>
            {food.logs.length ? <Text style={T.small}>{summary.offPlan.kcal.toLocaleString()} kcal</Text> : null}
          </View>
          {!food.loaded && food.logs.length === 0 ? (
            <StateBlock kind="loading" title="Loading what you logged" />
          ) : food.logs.length === 0 ? (
            <Text style={[T.meta, { paddingVertical: 8 }]}>Nothing off your plan yet. A coffee, a snack, a meal out: log it and it counts.</Text>
          ) : (
            food.logs.map((log, i) => (
              <View key={log.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 64, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                {/* Only meals the coach made get a picture; food the person typed or snapped never gets an invented one. */}
                {log.source === 'generated' ? <MealImage label={log.label} items={(log.items ?? []).map((it) => it.name)} size="thumb" style={{ marginRight: 6 }} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.bodyStrong}>{log.label}</Text>
                  <MacroLine m={log} />
                  <Text style={T.small}>
                    {SOURCE_LABEL[log.source ?? 'photo'] ?? 'Logged'}
                    {log.slot ? ` · ${log.slot}` : ''}
                    {log.pending ? ' · waiting to upload' : ''}
                  </Text>
                </View>
                <IconButton icon="trash" variant="bare" onPress={() => void food.remove(log.id)} accessibilityLabel={`Delete ${log.label}`} />
              </View>
            ))
          )}
        </View>

        <LinkButton onPress={() => router.push('/(tabs)/plan')} accessibilityLabel="See this week's meals in your plan">
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>See the rest of the week in your plan</Text>
        </LinkButton>
      </ScrollView>

      <MealSwapSheet
        visible={swapSlot != null}
        onClose={() => setSwapSlot(null)}
        meal={swapping}
        original={original}
        profile={profile}
        onPick={(meal) => (swapping ? swapMeal(day.id, swapping.slot, meal) : Promise.resolve())}
      />
    </SafeAreaView>
  );
}

/** Food while it loads: header stats, the day's totals, then the next meal's photo and the rest as rows. */
function FoodSkeleton() {
  return (
    <Skeleton label="Loading today's meals" style={{ gap: 24 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[96, 80, 72].map((w) => (
          <Bone key={w} width={w} height={32} radius={R.pill} />
        ))}
      </View>
      <Bone radius={R.card} style={{ padding: 20, gap: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Bone width="40%" height={28} radius={8} tone="raised" />
          <Bone width="25%" height={14} radius={6} tone="raised" />
        </View>
        <Bone height={8} radius={4} tone="raised" />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {[0, 1, 2].map((i) => (
            <Bone key={i} height={40} radius={8} tone="raised" style={{ flex: 1 }} />
          ))}
        </View>
      </Bone>
      <Bone radius={R.card} style={{ padding: 20, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Bone width="40%" height={18} radius={6} tone="raised" />
          <Bone width="20%" height={14} radius={6} tone="raised" />
        </View>
        <Bone height={180} radius={R.card} tone="raised" />
        <Bone width="70%" height={22} radius={6} tone="raised" />
        {[0, 1].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 8 }}>
            <Bone height={52} width={52} tone="raised" />
            <View style={{ flex: 1, gap: 6 }}>
              <Bone width="60%" height={16} radius={6} tone="raised" />
              <Bone width="40%" height={12} radius={6} tone="raised" />
            </View>
          </View>
        ))}
      </Bone>
    </Skeleton>
  );
}

/** Snap a meal straight from the header. */
function PhotoLogButton() {
  return <IconButton icon="camera" size={48} onPress={() => router.push('/food/log?mode=photo')} accessibilityLabel="Log food from a photo" />;
}

/** The next meal to eat: a full-width photo, then the tick row and Swap. */
function NextMeal({ meal, onToggle, onSwap }: { meal: DayMeal; onToggle: () => void; onSwap: () => void }) {
  return (
    <View style={{ gap: 8, paddingBottom: 8 }}>
      <MealImage label={meal.label} items={meal.items} size="card" />
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: false }}
        accessibilityLabel={`Next, ${meal.slot}: ${meal.label}. ${meal.kcal} kcal, ${meal.protein} grams protein, ${meal.carbs} grams carbs, ${meal.fat} grams fat`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingTop: 8, opacity: pressed ? 0.75 : 1 })}
      >
        <CheckBox checked={false} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.small}>
            Next · {meal.slot}
            {meal.swapped ? ' · swapped' : ''}
          </Text>
          <Text style={T.h3}>{meal.label}</Text>
          <MacroLine m={meal} />
        </View>
      </Pressable>
      <SwapButton slot={meal.slot} onPress={onSwap} indent={34} />
    </View>
  );
}

function MealRow({ meal, first, done, justTicked, onToggle, onSwap }: { meal: DayMeal; first: boolean; done: boolean; justTicked: boolean; onToggle: () => void; onSwap: () => void }) {
  return (
    <View style={{ paddingTop: 12, paddingBottom: 4, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${meal.slot}: ${meal.label}. ${meal.kcal} kcal, ${meal.protein} grams protein, ${meal.carbs} grams carbs, ${meal.fat} grams fat`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.75 : 1 })}
      >
        <MealImage label={meal.label} items={meal.items} size="thumb" checked={done} justTicked={justTicked} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.small}>
            {meal.slot}
            {meal.swapped ? ' · swapped' : ''}
          </Text>
          <Text style={[T.bodyStrong, { color: done ? C.muted : C.text }]}>{meal.label}</Text>
          <MacroLine m={meal} />
        </View>
      </Pressable>
      <SwapButton slot={meal.slot} onPress={onSwap} indent={60} />
    </View>
  );
}

/** "Swap", lined up under the meal's name. */
function SwapButton({ slot, onPress, indent }: { slot: string; onPress: () => void; indent: number }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Swap ${slot.toLowerCase()}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginLeft: indent, paddingHorizontal: 6, borderRadius: 22, backgroundColor: pressed ? C.raised : 'transparent' })}
    >
      <Icon name="swap" size={18} color={C.stone} />
      <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.stone }}>Swap</Text>
    </Pressable>
  );
}
