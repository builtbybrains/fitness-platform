/* Today's ring in 3D: a solid ring tilted back 12 degrees, its green arc
   filling to the day's share in 400ms (as the 2D ring does), then still.
   Drag sideways to turn it; it springs back on release. The text inside
   ("Today", the percent) sits on top, centred, as before, and the whole
   box is one progressbar for screen readers with the same label.

   Same box as the 2D ring, so the card keeps its height. Under Reduce
   Motion, without WebGL, or if the 3D cannot load, the 2D Ring shows. */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Ring } from '../Ring';
import { Lazy3DScene } from '../three/Lazy3D';
import { useCan3D } from '../three/support';

type Props = {
  size: number;
  stroke: number;
  progress: number;
  accessibilityLabel: string;
  children?: React.ReactNode;
};

export function TodayRing({ size, stroke, progress, accessibilityLabel, children }: Props) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  const share = Math.max(0, Math.min(1, progress));

  if (!can3D || failed) {
    return (
      <Ring size={size} stroke={stroke} progress={progress} accessibilityLabel={accessibilityLabel}>
        {children}
      </Ring>
    );
  }

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
    >
      <Lazy3DScene
        kind="ring"
        params={{ progress: share }}
        width={size}
        height={size}
        drag="spring"
        // While the 3D code loads, the empty track holds the place.
        placeholder={<Ring size={size} stroke={stroke} progress={0} />}
        fallback={<Ring size={size} stroke={stroke} progress={progress} />}
        onFail={() => setFailed(true)}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', paddingHorizontal: stroke, pointerEvents: 'none' }]}>{children}</View>
    </View>
  );
}
