/* Food: today's meal plan with every macro, tick what you ate, swap a meal
   for one with similar calories and protein. The second option is to log
   what you actually have: type it or snap it, answer a quick question or
   two, check the numbers, save. Or ask for a meal made from what's at home.
   Off-plan food counts toward the day. */

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { C, card as cardStyle, FONT, screen, T } from '../../src/design';
import { usePlan } from '../../src/planStore';
import { useFoodLogs } from '../../src/foodLogs';
import { daySummary } from '../../src/stats';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { CheckBox, ScreenHeader } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { MacroLine, StateBlock } from '../../src/components/training/Controls';
import { DayTotals } from '../../src/components/food/DayTotals';
import { MealSwapSheet } from '../../src/components/food/MealSwapSheet';
import { dayTitle } from '../../src/components/training/labels';
import type { DayMeal } from '../../src/planData';

const SOURCE_LABEL: Record<string, string> = { photo: 'From a photo', text: 'Typed', generated: 'Made from what you had', plan: 'Plan meal' };

export default function FoodTab() {
  const { days, todayIdx, todayId, targets, activities, profile, plan, swapMeal, toggleMeal } = usePlan();
  const food = useFoodLogs(todayId);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const day = days[todayIdx];

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

  if (!day || !summary) {
    return (
      <SafeAreaView style={screen} edges={['top']}>
        <StateBlock kind="loading" title="Loading today's food" />
      </SafeAreaView>
    );
  }

  const swapping = day.meals.find((m) => m.slot === swapSlot) ?? null;
  const original = swapping ? plan.days[day.planIndex]?.meals.find((m) => m.slot === swapping.slot) ?? null : null;
  const mealsDone = day.meals.filter((m) => day.done.meals.includes(m.slot)).length;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <ScreenHeader title="Food" subtitle={`Today, ${dayTitle(day.index, day.id)}`} />

        <DayTotals eaten={summary.eaten} offPlan={summary.offPlan.kcal} burned={summary.burned} targets={targets} />

        <View style={[cardStyle, { gap: 4 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 4 }}>
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
            day.meals.map((m, i) => (
              <MealRow key={m.slot} meal={m} first={i === 0} done={day.done.meals.includes(m.slot)} onToggle={() => void toggleMeal(day.id, m.slot)} onSwap={() => setSwapSlot(m.slot)} />
            ))
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
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.bodyStrong} numberOfLines={2}>
                    {log.label}
                  </Text>
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

function MealRow({ meal, first, done, onToggle, onSwap }: { meal: DayMeal; first: boolean; done: boolean; onToggle: () => void; onSwap: () => void }) {
  return (
    <View style={{ paddingVertical: 8, borderTopWidth: first ? 0 : 1, borderTopColor: C.line }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${meal.slot}: ${meal.label}. ${meal.kcal} kcal, ${meal.protein} grams protein, ${meal.carbs} grams carbs, ${meal.fat} grams fat`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 4, opacity: pressed ? 0.75 : 1 })}
      >
        <CheckBox checked={done} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={T.small}>
            {meal.slot}
            {meal.swapped ? ' · swapped' : ''}
          </Text>
          <Text style={[T.bodyStrong, { color: done ? C.muted : C.text }]}>{meal.label}</Text>
          <MacroLine m={meal} />
        </View>
      </Pressable>
      <Pressable
        onPress={onSwap}
        accessibilityRole="button"
        accessibilityLabel={`Swap ${meal.slot.toLowerCase()}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, marginLeft: 34, paddingHorizontal: 6, borderRadius: 22, backgroundColor: pressed ? C.raised : 'transparent' })}
      >
        <Icon name="swap" size={18} color={C.stone} />
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.stone }}>Swap</Text>
      </Pressable>
    </View>
  );
}
