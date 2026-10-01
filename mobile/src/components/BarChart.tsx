/* Bar chart on react-native-svg. Past weeks in grey, the current week in
   Built Green; labels below in Inter. Bars grow once on first view. */

import React, { useState } from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

import { C, FONT } from '../design';
import { useTween } from './motion';

type Props = {
  values: number[];
  labels: string[];
  height?: number;
  maxValue?: number;
  accessibilityLabel?: string;
};

export function BarChart({ values, labels, height = 140, maxValue, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(300);
  const grow = useTween(1, 700);
  if (values.length === 0) return <View style={{ height }} />;

  const max = Math.max(maxValue ?? 0, ...values, 1);
  const padB = 24;
  const innerH = height - padB - 6;
  const slot = width / values.length;
  const barW = Math.min(24, slot * 0.55);

  return (
    <View
      onLayout={(e) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
      style={{ width: '100%', height }}
      accessible={!!accessibilityLabel}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const h = (v / max) * innerH * grow;
          const x = slot * i + (slot - barW) / 2;
          const y = 6 + innerH - h;
          const isLast = i === values.length - 1;
          return (
            <Rect key={i} x={x} y={Math.min(y, 6 + innerH - 3)} width={barW} height={Math.max(h, 3)} rx={4} fill={isLast ? C.green : '#3A3A3A'} />
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
