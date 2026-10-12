/* Bar chart on react-native-svg. Past weeks in grey, the current week in
   Built Green; labels below in Inter. On first view the bars grow from the
   baseline one after another (50ms apart, 420ms each, ease-out quart),
   once a third of the chart is on screen.
   `tone="sample"` draws every bar in one faint grey, for an illustrative
   empty state. */

import React, { useRef, useState } from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

import { C, FONT } from '../design';
import { useElapsed, useInView } from './motion';
import { staggered, staggerTotal } from '../lib/motionMath';

type Props = {
  values: number[];
  labels: string[];
  height?: number;
  maxValue?: number;
  accessibilityLabel?: string;
  tone?: 'live' | 'sample';
};

export function BarChart({ values, labels, height = 140, maxValue, accessibilityLabel, tone = 'live' }: Props) {
  const [width, setWidth] = useState(300);
  const box = useRef<View>(null);
  const elapsed = useElapsed(staggerTotal(values.length), useInView(box));
  if (values.length === 0) return <View style={{ height }} />;

  const max = Math.max(maxValue ?? 0, ...values, 1);
  const padB = 24;
  const innerH = height - padB - 6;
  const slot = width / values.length;
  const barW = Math.min(24, slot * 0.55);

  return (
    <View
      ref={box}
      onLayout={(e) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
      style={{ width: '100%', height }}
      accessible={!!accessibilityLabel}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const h = (v / max) * innerH * staggered(elapsed, i);
          const x = slot * i + (slot - barW) / 2;
          const y = 6 + innerH - h;
          const isLast = i === values.length - 1;
          return (
            <Rect key={i} x={x} y={Math.min(y, 6 + innerH - 3)} width={barW} height={Math.max(h, 3)} rx={4} fill={tone === 'sample' ? C.pressed : isLast ? C.green : '#3A3A3A'} />
          );
        })}
        {labels.map((l, i) => (
          <SvgText
            key={i}
            x={slot * i + slot / 2}
            y={height - 6}
            fontSize={11}
            fontFamily={FONT.body}
            fill={C.faint}
            textAnchor="middle"
          >
            {l}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
