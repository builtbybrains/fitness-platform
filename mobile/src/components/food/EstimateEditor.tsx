/* The estimate the person confirms before it counts: a name, the meal
   slot, every macro (editable), and the items it was built from (any item
   can be removed and the totals follow). */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { C, FONT, R, T } from '../../design';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { Chip } from '../training/Controls';
import type { FoodItem, MealSlot } from '../../types';

export type EditableEstimate = {
  label: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  slot: MealSlot | '';
  items: FoodItem[];
};

const SLOTS: MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/** The meal slot that fits the time of day. */
export function slotForNow(h = new Date().getHours()): MealSlot {
  return h < 11 ? 'Breakfast' : h < 16 ? 'Lunch' : h < 21 ? 'Dinner' : 'Snack';
}

function num(s: string): number {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function parsed(e: EditableEstimate): { kcal: number; protein: number; carbs: number; fat: number } {
  return { kcal: num(e.kcal), protein: num(e.protein), carbs: num(e.carbs), fat: num(e.fat) };
}

/** Problems that stop saving, in words. */
export function estimateProblem(e: EditableEstimate): string | null {
  const m = parsed(e);
  if (!e.label.trim()) return 'Give it a name.';
  if (m.kcal <= 0) return 'Add the calories.';
  if (m.kcal > 5000) return 'That is more than 5,000 kcal. Check the number.';
  return null;
}

export function EstimateEditor({ value, onChange }: { value: EditableEstimate; onChange: (v: EditableEstimate) => void }) {
  const set = (patch: Partial<EditableEstimate>) => onChange({ ...value, ...patch });

  function removeItem(i: number) {
    const it = value.items[i];
    const m = parsed(value);
    onChange({
      ...value,
      items: value.items.filter((_, k) => k !== i),
      kcal: String(Math.max(0, m.kcal - it.kcal)),
      protein: String(Math.max(0, m.protein - it.protein)),
      carbs: String(Math.max(0, m.carbs - it.carbs)),
      fat: String(Math.max(0, m.fat - it.fat)),
    });
  }

  const numField = (key: 'kcal' | 'protein' | 'carbs' | 'fat', label: string) => (
    <View style={{ flex: 1, minWidth: 130 }}>
      <Field
        label={label}
        value={value[key]}
        onChangeText={(t) => set({ [key]: t.replace(/[^0-9.,]/g, '') } as Partial<EditableEstimate>)}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={5}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <View style={{ gap: 16 }}>
      <Field label="Name" value={value.label} onChangeText={(t) => set({ label: t })} maxLength={120} />
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>Meal</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Which meal">
          {SLOTS.map((s) => (
            <Chip key={s} label={s} selected={value.slot === s} onPress={() => set({ slot: value.slot === s ? '' : s })} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {numField('kcal', 'Calories (kcal)')}
        {numField('protein', 'Protein (g)')}
        {numField('carbs', 'Carbs (g)')}
        {numField('fat', 'Fat (g)')}
      </View>
      {value.items.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>What&apos;s in it</Text>
          {value.items.map((it, i) => (
            <View
              key={`${it.name}-${i}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingLeft: 14, borderRadius: R.input, backgroundColor: C.surface }}
            >
              <View style={{ flex: 1, gap: 1, paddingVertical: 6 }}>
                <Text style={T.body}>
                  {it.name}
                  {it.portion ? <Text style={{ color: C.muted }}> · {it.portion}</Text> : null}
                </Text>
                <Text style={T.small}>
                  {it.kcal} kcal · P {it.protein}g · C {it.carbs}g · F {it.fat}g
                </Text>
              </View>
              <Pressable
                onPress={() => removeItem(i)}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${it.name}`}
                style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: pressed ? C.raised : 'transparent' })}
              >
                <Icon name="close" size={18} color={C.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
