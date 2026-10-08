/* The day's food against target: calories as the big number, then
   protein, carbs and fat. When the macro donut shows above it (3D), the
   protein, carbs and fat row is left out (`macros={false}`): the donut's
   chips carry those numbers. Off-plan food and activity are named so the
   person sees where the numbers come from. The numbers and bar count up
   on first view (Reduce Motion: they show at once). */

import React from 'react';
import { Text, View } from 'react-native';

import { C, card as cardStyle, FONT, T } from '../../design';
import { ProgressBar } from '../Bits';
import { Meter } from '../training/Controls';
import { useTween } from '../motion';
import type { Macros } from '../../stats';

export function DayTotals({ eaten, offPlan, burned, targets, macros = true }: { eaten: Macros; offPlan: number; burned: number; targets: Macros; macros?: boolean }) {
  const kcal = Math.round(useTween(eaten.kcal));
  const protein = useTween(eaten.protein);
  const carbs = useTween(eaten.carbs);
  const fat = useTween(eaten.fat);
  const left = Math.max(0, targets.kcal - kcal);
  const over = kcal > targets.kcal ? kcal - targets.kcal : 0;
  const notes = [
    offPlan > 0 ? `Includes ${offPlan.toLocaleString()} kcal of food off your plan.` : null,
    burned > 0 ? `${burned.toLocaleString()} kcal burned in activities today.` : null,
  ].filter(Boolean);
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }} accessible accessibilityLabel={`${eaten.kcal} of ${targets.kcal} calories eaten today`}>
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: C.text }}>{kcal.toLocaleString()}</Text>
          <Text style={T.meta}>of {targets.kcal.toLocaleString()} kcal today</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 20, color: over ? C.warn : C.text }}>{(over || left).toLocaleString()}</Text>
          <Text style={T.small}>{over ? 'kcal over' : 'kcal left'}</Text>
        </View>
      </View>
      <ProgressBar value={targets.kcal ? kcal / targets.kcal : 0} height={8} />
      {macros ? (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Meter label="Protein" value={protein} target={targets.protein} unit="g" />
          <Meter label="Carbs" value={carbs} target={targets.carbs} unit="g" />
          <Meter label="Fat" value={fat} target={targets.fat} unit="g" />
        </View>
      ) : null}
      {notes.length ? <Text style={T.small}>{notes.join(' ')}</Text> : null}
    </View>
  );
}
