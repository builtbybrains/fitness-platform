/* Progress ring drawn with react-native-svg. Used for calories and water. */

import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { View, Text, StyleSheet } from 'react-native';

import { C } from '../design';

type Props = {
  size: number;
  stroke: number;
  progress: number; // 0..1
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
};

export function Ring({
  size,
  stroke,
  progress,
  color = C.mint,
  trackColor = C.card,
  children,
}: Props) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - clamped)}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>
      {children != null ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: 'center',
              justifyContent: 'center',
              // Keep the value inside the ring's inner circle.
              paddingHorizontal: stroke,
            },
          ]}
        >
          {children}
        </View>
      ) : null}
    </View>
  );
}

export function RingValue({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: C.text, fontSize: 22, fontWeight: '800' }} adjustsFontSizeToFit numberOfLines={1}>
        {value}
      </Text>
      <Text style={{ color: C.muted, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}
