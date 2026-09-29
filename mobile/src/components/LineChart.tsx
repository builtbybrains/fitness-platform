/* Line chart on react-native-svg. Width is measured via onLayout so the
   points stay round. No axes: the caller renders labels with Text. */

import React, { useState } from 'react';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { View } from 'react-native';

import { C } from '../design';

type Props = {
  values: number[];
  height?: number;
  color?: string;
  accessibilityLabel?: string;
};

export function LineChart({ values, height = 120, color = C.green, accessibilityLabel }: Props) {
  const [width, setWidth] = useState(300);

  if (values.length < 2) {
    return <View style={{ height }} />;
  }

  const padX = 8;
  const padY = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const pts = values.map((v, i) => ({
    x: padX + (i / (values.length - 1)) * innerW,
    y: padY + innerH - ((v - min) / span) * innerH,
  }));

  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View
      onLayout={(e) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
      style={{ width: '100%', height }}
      accessible={!!accessibilityLabel}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width={width} height={height}>
        {[padY, height / 2, height - padY].map((y) => (
          <Line key={y} x1={padX} y1={y} x2={width - padX} y2={y} stroke={C.lineStrong} strokeWidth={1} strokeDasharray="3 5" />
        ))}
        <Polyline points={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 5 : 3}
            fill={i === pts.length - 1 ? color : C.card}
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </Svg>
    </View>
  );
}
