/* Progress ring drawn with react-native-svg. Fills once on first view
   (ease-out quart), follows later changes briefly, and holds still when
   Reduce Motion is on. */

import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { StyleSheet, View } from 'react-native';

import { C } from '../design';
import { useTween } from './motion';

type Props = {
  size: number;
  stroke: number;
  progress: number; // 0..1
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  accessibilityLabel?: string;
};

export function Ring({ size, stroke, progress, color = C.green, trackColor = C.raised, children, accessibilityLabel }: Props) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const shown = useTween(Math.max(0, Math.min(1, progress)), 400);

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible={!!accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={accessibilityLabel ? { min: 0, max: 100, now: Math.round(progress * 100) } : undefined}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={cx} cy={cx} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {shown > 0.001 ? (
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - shown)}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        ) : null}
      </Svg>
      {children != null ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: stroke }]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
