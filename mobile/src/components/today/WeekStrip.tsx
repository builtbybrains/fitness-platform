/* This week on Today: the plan's week, Monday to Sunday (the Plan tab's
   week), one column a day. A green tint with a green tick when the workout
   is done (so the solid green stays on today's ring and the play button), a
   green ring for today's open workout, a grey ring for a planned one, a
   quieter ring for a past one not logged (no red, no guilt) and a small dot
   for rest. A workout day opens that workout; a rest day opens the plan,
   and a pressed day tilts under the finger (components/Tilt). States come
   from lib/weekStrip. */

import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, FONT, T } from '../../design';
import { weekCounts, weekStrip, type StripDay, type StripInput } from '../../lib/weekStrip';
import { plural } from '../training/labels';
import { Icon } from '../Icon';
import { TiltPressable } from '../Tilt';

const DOT = 34;

function Mark({ state }: { state: StripDay['state'] }) {
  if (state === 'done') {
    return (
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: C.greenTint, borderWidth: 2, borderColor: C.greenBorder, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={16} color={C.green} strokeWidth={2.5} />
      </View>
    );
  }
  if (state === 'rest') {
    return (
      <View style={{ width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.faint }} />
      </View>
    );
  }
  const ring = state === 'today' ? C.green : state === 'planned' ? C.inputBorder : C.pressed;
  return <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: ring }} />;
}

function Column({ day }: { day: StripDay }) {
  const rest = day.state === 'rest';
  return (
    <TiltPressable
      onPress={() => (rest ? router.push('/(tabs)/plan') : router.push(`/workout/${day.id}`))}
      accessibilityRole="button"
      accessibilityLabel={day.label}
      accessibilityHint={rest ? 'Opens your plan' : 'Opens the workout'}
      style={({ pressed }) => ({ flex: 1, alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}
    >
      <Text style={[T.small, day.isToday ? { color: C.text, fontFamily: FONT.bodySemi } : null]}>{day.letter}</Text>
      <Mark state={day.state} />
    </TiltPressable>
  );
}

export function WeekStrip({ days, today }: { days: readonly StripInput[]; today: string }) {
  const strip = useMemo(() => weekStrip(days, today), [days, today]);
  const { done, planned } = weekCounts(strip);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Text style={T.h3} accessibilityRole="header">
          This week
        </Text>
        <Text style={T.small}>{planned ? `${done} of ${plural(planned, 'workout')} done` : 'Rest week'}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {strip.map((d) => (
          <Column key={d.id} day={d} />
        ))}
      </View>
    </View>
  );
}
