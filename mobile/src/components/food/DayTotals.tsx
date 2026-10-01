/* The day's food against target: calories as the big number, then
   protein, carbs and fat. Off-plan food and activity are named so the
   person sees where the numbers come from. */

import React from 'react';
import { Text, View } from 'react-native';

import { C, card as cardStyle, FONT, T } from '../../design';
import { ProgressBar } from '../Bits';
import { Meter } from '../training/Controls';
import type { Macros } from '../../stats';

export function DayTotals({ eaten, offPlan, burned, targets }: { eaten: Macros; offPlan: number; burned: number; targets: Macros }) {
  const left = Math.max(0, targets.kcal - eaten.kcal);
  const over = eaten.kcal > targets.kcal ? eaten.kcal - targets.kcal : 0;
  const notes = [
    offPlan > 0 ? `Includes ${offPlan.toLocaleString()} kcal of food off your plan.` : null,
    burned > 0 ? `${burned.toLocaleString()} kcal burned in activities today.` : null,
  ].filter(Boolean);
  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }} accessible accessibilityLabel={`${eaten.kcal} of ${targets.kcal} calories eaten today`}>
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: C.text }}>{eaten.kcal.toLocaleString()}</Text>
          <Text style={T.meta}>of {targets.kcal.toLocaleString()} kcal today</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 20, color: over ? C.warn : C.text }}>{(over || left).toLocaleString()}</Text>
          <Text style={T.small}>{over ? 'kcal over' : 'kcal left'}</Text>
        </View>
      </View>
      <ProgressBar value={targets.kcal ? eaten.kcal / targets.kcal : 0} height={8} />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Meter label="Protein" value={eaten.protein} target={targets.protein} unit="g" />
        <Meter label="Carbs" value={eaten.carbs} target={targets.carbs} unit="g" />
        <Meter label="Fat" value={eaten.fat} target={targets.fat} unit="g" />
      </View>
      {notes.length ? <Text style={T.small}>{notes.join(' ')}</Text> : null}
    </View>
  );
}
