/* Today's ring: the SVG Ring (components/Ring.tsx), filling to the day's
   share in 400ms on first view and in 250ms on a later change (ease-out
   quart), then still; under Reduce Motion it shows the share at once. A
   soft shadow under the ring keeps the weight it had as an object. The
   text inside ("Today", the percent) sits on top, centred, and the whole
   box is one progressbar for screen readers with the label passed in and
   the percent as its value. */

import React from 'react';
import { View } from 'react-native';

import { Ring } from '../Ring';

type Props = {
  size: number;
  stroke: number;
  progress: number;
  accessibilityLabel: string;
  children?: React.ReactNode;
};

/** Soft and dark, straight down: a shadow on Carbon, never a glow. */
const SHADOW = '0px 10px 24px rgba(0, 0, 0, 0.55)';

export function TodayRing({ size, stroke, progress, accessibilityLabel, children }: Props) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, boxShadow: SHADOW }}>
      <Ring size={size} stroke={stroke} progress={progress} accessibilityLabel={accessibilityLabel}>
        {children}
      </Ring>
    </View>
  );
}
