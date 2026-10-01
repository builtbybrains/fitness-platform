/* Progress charts that each read differently:
   - TrainingCalendar: the last 8 weeks as a day grid (done, missed, rest).
   - HBars: horizontal bars with a label and value (activities by kind).
   - TargetColumns: one column per day against a target line (calories). */

import React from 'react';
import { Text, View } from 'react-native';

import { C, FONT, T } from '../../design';
import { useTween } from '../motion';
import type { DayCell } from '../../stats';
import { DAY_SHORT } from './labels';

const CELL_FILL: Record<DayCell['state'], string> = {
  done: C.green,
  missed: 'transparent',
  rest: C.surface,
  open: 'transparent',
  future: 'transparent',
  none: 'transparent',
};

export function TrainingCalendar({ rows }: { rows: DayCell[][] }) {
  const done = rows.flat().filter((c) => c.state === 'done').length;
  const missed = rows.flat().filter((c) => c.state === 'missed').length;
  return (
    <View style={{ gap: 10 }} accessible accessibilityRole="image" accessibilityLabel={`Last ${rows.length} weeks: ${done} workouts done, ${missed} training days missed.`}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {DAY_SHORT.map((d) => (
          <Text key={d} style={[T.small, { flex: 1, textAlign: 'center', fontSize: 11, color: C.faint }]}>
            {d.slice(0, 1)}
          </Text>
        ))}
      </View>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
          {row.map((c) => (
            <View
              key={c.id}
              style={{
                flex: 1,
                height: 24,
                borderRadius: 6,
                backgroundColor: CELL_FILL[c.state],
                borderWidth: c.state === 'missed' || c.state === 'open' ? 1.5 : c.state === 'future' || c.state === 'none' ? 1 : 0,
                borderColor: c.state === 'open' ? C.greenBorder : c.state === 'missed' ? C.inputBorder : C.line,
              }}
            />
          ))}
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', paddingTop: 2 }}>
        <Legend swatch={{ backgroundColor: C.green }} label="Workout done" />
        <Legend swatch={{ borderWidth: 1.5, borderColor: C.inputBorder }} label="Missed" />
        <Legend swatch={{ backgroundColor: C.surface }} label="Rest" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: object; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[{ width: 12, height: 12, borderRadius: 3 }, swatch]} />
      <Text style={T.small}>{label}</Text>
    </View>
  );
}

export function HBars({ rows, unit }: { rows: { label: string; value: number; detail?: string }[]; unit: string }) {
  const grow = useTween(1, 600);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 6 }} accessible accessibilityLabel={`${r.label}: ${r.value} ${unit}${r.detail ? `, ${r.detail}` : ''}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text style={T.bodyStrong} numberOfLines={1}>
              {r.label}
            </Text>
            <Text style={T.small}>
              <Text style={{ fontFamily: FONT.displaySemi, color: C.text }}>{r.value}</Text> {unit}
              {r.detail ? ` · ${r.detail}` : ''}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: C.raised, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${(r.value / max) * 100 * grow}%`, borderRadius: 5, backgroundColor: C.stone }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function TargetColumns({ days, target, height = 132, todayId }: { days: { id: string; label: string; value: number }[]; target: number; height?: number; todayId: string }) {
  const grow = useTween(1, 700);
  const top = Math.max(target * 1.25, ...days.map((d) => d.value), 1);
  const lineY = height - (target / top) * height;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Calories each day against your target of ${target}: ${days.map((d) => `${d.label} ${d.value}`).join(', ')}`}
      style={{ gap: 6 }}
    >
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: lineY, borderTopWidth: 1, borderStyle: 'dashed', borderColor: C.muted }} />
        {days.map((d) => {
          const h = (d.value / top) * height * grow;
          const future = d.id > todayId;
          const near = target > 0 && d.value >= target * 0.9 && d.value <= target * 1.1;
          return (
            <View key={d.id} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height }}>
              <View
                style={{
                  width: '70%',
                  maxWidth: 28,
                  height: future ? 3 : Math.max(3, h),
                  borderRadius: 6,
                  backgroundColor: future ? C.raised : near ? C.stone : '#5A5A5A',
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {days.map((d) => (
          <Text key={d.id} style={[T.small, { flex: 1, textAlign: 'center', fontSize: 11, color: d.id === todayId ? C.text : C.faint }]}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
