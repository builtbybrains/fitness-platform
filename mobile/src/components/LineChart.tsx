/* Minimal line chart on react-native-svg. Width is measured via onLayout so
   coordinates (and the point circles) stay undistorted. No axes — the caller
   renders labels with regular Text. */

import React, { useState } from 'react';
import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';
import { View } from 'react-native';

import { C } from '../design';

type Props = {
  values: number[];
  height?: number;
  color?: string;
};

export function LineChart({ values, height = 120, color = C.mint }: Props) {
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
  const area =
    `M ${pts[0].x} ${height - padY} ` +
    pts.map((p) => `L ${p.x} ${p.y}`).join(' ') +
    ` L ${pts[pts.length - 1].x} ${height - padY} Z`;

  return (
    <View
      onLayout={(e) => setWidth(Math.max(120, e.nativeEvent.layout.width))}
      style={{ width: '100%', height }}
    >
      <Svg width={width} height={height}>
        <Line x1={padX} y1={padY} x2={width - padX} y2={padY} stroke={C.line} strokeWidth={1} strokeDasharray="3 4" />
        <Line x1={padX} y1={height / 2} x2={width - padX} y2={height / 2} stroke={C.line} strokeWidth={1} strokeDasharray="3 4" />
        <Line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke={C.line} strokeWidth={1} strokeDasharray="3 4" />
        <Path d={area} fill="rgba(92,224,184,0.10)" />
        <Polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {pts.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === pts.length - 1 ? 4.5 : 3}
            fill={i === pts.length - 1 ? color : C.bg}
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </Svg>
    </View>
  );
}
