/* Make me a meal from what I have: list what's in the kitchen, pick the
   meal, and the coach writes one recipe that fits the day's calories and
   the person's diet, with every macro and the steps. Log it as eaten, or
   put it in today's plan in place of that meal. Needs an account. */

import { useState } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { usePlan } from '../../src/planStore';
import { useFoodLogs } from '../../src/foodLogs';
import { generateMealFromHome } from '../../src/api/food';
import { asApiError } from '../../src/api/errors';
import { isCloudUser } from '../../src/lib/cloud';
import { Button, LinkButton } from '../../src/components/Button';
import { Notice } from '../../src/components/Bits';
import { BackHeader, goBack } from '../../src/components/training/BackHeader';
import { Chip, MacroLine, StateBlock } from '../../src/components/training/Controls';
import { NeedsAccount } from '../../src/components/training/PlanChange';
import { slotForNow } from '../../src/components/food/EstimateEditor';
import { MealImage } from '../../src/components/food/MealImage';
import type { ApiErrorCode, GeneratedMeal, MealSlot } from '../../src/types';

const SLOTS: MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export default function FromHomeScreen() {
  const { userId } = useAuth();
  const { days, todayIdx, todayId, swapMeal } = usePlan();
  const food = useFoodLogs(todayId);
  const inset = useSafeAreaInsets();
  const [have, setHave] = useState('');
  const [focused, setFocused] = useState(false);
  const [slot, setSlot] = useState<MealSlot>(slotForNow());
  const [busy, setBusy] = useState(false);
  const [meal, setMeal] = useState<GeneratedMeal | null>(null);
  const [error, setError] = useState<{ code: ApiErrorCode; message: string } | null>(null);
  const [done, setDone] = useState<'logged' | 'planned' | null>(null);
  const [saving, setSaving] = useState(false);

  const planned = days[todayIdx]?.meals.find((m) => m.slot === slot);
  const local = !isCloudUser(userId);

  async function make() {
    if (!userId || busy || !have.trim()) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setMeal(await generateMealFromHome(userId, have, { slot, kcal: planned?.kcal }));
    } catch (e) {
      const err = asApiError(e);
      setError({ code: err.code, message: err.code === 'not_configured' ? "Meal ideas aren't switched on yet. Your plan's meals and swaps still work." : err.message });
    } finally {
      setBusy(false);
    }
  }

  async function logIt() {
    if (!meal || saving) return;
    setSaving(true);
    try {
      await food.add({
        label: meal.label,
        kcal: meal.kcal,
        protein: meal.protein,
        carbs: meal.carbs,
        fat: meal.fat,
        confidence: 'medium',
        source: 'generated',
        slot,
        items: (meal.items ?? []).map((name) => ({ name, portion: '', kcal: 0, protein: 0, carbs: 0, fat: 0 })),
      });
      setDone('logged');
    } catch (e) {
      setError({ code: 'server_error', message: asApiError(e).message });
    } finally {
      setSaving(false);
    }
  }

  async function planIt() {
    if (!meal || saving) return;
    setSaving(true);
    await swapMeal(todayId, slot, { slot, label: meal.label, kcal: meal.kcal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, items: meal.items, portion: meal.portion });
    setSaving(false);
    setDone('planned');
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_bottom' }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 140, maxWidth: 640, width: '100%', alignSelf: 'center' }}>
        <BackHeader title="Make me a meal" subtitle="From what you have at home, sized for your day." fallback="/(tabs)/food" />

        {local ? (
          <NeedsAccount message="Meals from what you have need an account. Your plan's meals and the library swaps in Food work without one." />
        ) : null}

        {!local ? (
        <>
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>What do you have?</Text>
          <TextInput
            value={have}
            onChangeText={setHave}
            placeholder="Eggs, tomatoes, pita, labneh, cucumber"
            placeholderTextColor={C.faint}
            accessibilityLabel="What you have at home"
            multiline
            maxLength={500}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
              {
                minHeight: 104,
                color: C.text,
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: focused ? C.green : C.inputBorder,
                borderRadius: R.input,
                padding: 14,
                fontSize: 17,
                lineHeight: 24,
                fontFamily: FONT.body,
                textAlignVertical: 'top',
              },
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>For which meal</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="For which meal">
            {SLOTS.map((s) => (
              <Chip key={s} label={s} selected={slot === s} onPress={() => setSlot(s)} />
            ))}
          </View>
          {planned ? <Text style={T.small}>Aiming for about {planned.kcal} kcal, like today&apos;s planned {slot.toLowerCase()}.</Text> : null}
        </View>
        </>
        ) : null}

        {busy ? <StateBlock kind="loading" title="Putting a meal together" /> : null}

        {error ? (
          error.code === 'needs_account' ? (
            <NeedsAccount message="Meals from what you have need an account. Your plan's meals and the library swaps work without one." />
          ) : (
            <View style={{ gap: 8 }}>
              <Notice tone="error">{error.message}</Notice>
              {error.code === 'offline' || error.code === 'ai_busy' || error.code === 'server_error' ? (
                <Button compact variant="secondary" icon="refresh" label="Try again" onPress={() => void make()} />
              ) : null}
            </View>
          )
        ) : null}

        {meal && !busy ? (
          <View style={[cardStyle, { gap: 16 }]}>
            <MealImage label={meal.label} items={meal.items} size="card" />
            <View style={{ gap: 6 }}>
              <Text style={T.small}>{slot}</Text>
              <Text style={T.h2}>{meal.label}</Text>
              <MacroLine m={meal} strong />
            </View>
            {meal.items?.length ? (
              <View style={{ gap: 6 }}>
                <Text style={[T.small, { color: C.stone }]}>You&apos;ll use</Text>
                {meal.items.map((it, i) => (
                  <Text key={`${it}-${i}`} style={T.body}>
                    {it}
                  </Text>
                ))}
              </View>
            ) : null}
            {meal.steps?.length ? (
              <View style={{ gap: 8 }}>
                <Text style={[T.small, { color: C.stone }]}>How to make it</Text>
                {meal.steps.map((s, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                    <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: C.muted, width: 20 }}>{i + 1}</Text>
                    <Text style={[T.body, { flex: 1 }]}>{s}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {done ? (
              <Notice tone="success">{done === 'logged' ? `Logged. ${meal.kcal} kcal added to today.` : `It's today's ${slot.toLowerCase()} now. Tick it in Food when you eat it.`}</Notice>
            ) : (
              <Button variant="secondary" icon="calendar" label={`Make it today's ${slot.toLowerCase()}`} onPress={() => void planIt()} disabled={saving} />
            )}
            <LinkButton align="flex-start" onPress={() => void make()} accessibilityLabel="Make another meal">
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>Make another</Text>
            </LinkButton>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 12 + inset.bottom,
          backgroundColor: C.bg,
          borderTopWidth: 1,
          borderTopColor: C.line,
        }}
      >
        <View style={{ maxWidth: 600, width: '100%', alignSelf: 'center' }}>
          {done || local ? (
            <Button variant={local ? 'secondary' : 'primary'} label="Back to Food" onPress={() => goBack('/(tabs)/food')} />
          ) : meal && !busy ? (
            <Button icon="check" label="I ate this, log it" onPress={() => void logIt()} busy={saving} />
          ) : (
            <Button label={busy ? 'Making your meal' : 'Make me a meal'} onPress={() => void make()} busy={busy} disabled={!have.trim()} />
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}
