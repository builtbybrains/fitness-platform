/* Minimal bar chart on react-native-svg. Values map to rounded bars with a
   mint highlight for the last one (the current week); labels render below. */

import React, { useState } from 'react';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { View } from 'react-native';

import { C } from '../design';

type Props = {
  values: number[];
  labels: string[];
  height?: number;
  maxValue?: number;
};

export function BarChart({ values, labels, height = 140, maxValue }: Props) {
  const [width, setWidth] = useState(300);
  if (values.length === 0) return <View style={{ height }} />;

  const max = Math.max(maxValue ?? 0, ...values, 1);
  const padB = 22;
  const innerH = height - padB - 6;
  const slot = width / values.length;
  const barW = Math.min(26, slot * 0.55);

  return (
    <View
      onLayout={(e) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
      style={{ width: '100%', height }}
    >
      <Svg width={width} height={height}>
        {values.map((v, i) => {
          const h = (v / max) * innerH;
          const x = slot * i + (slot - barW) / 2;
          const y = 6 + innerH - h;
          const isLast = i === values.length - 1;
          return (
            <Rect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 2)}
              rx={5}
              fill={isLast ? C.mint : 'rgba(92,224,184,0.35)'}
            />
          );
        })}
        {labels.map((l, i) => (
          <SvgText
            key={i}
            x={slot * i + slot / 2}
            y={height - 6}
            fontSize={10}
            fill={C.muted}
            textAnchor="middle"
          >
            {l}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}
