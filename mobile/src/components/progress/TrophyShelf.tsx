/* The trophy shelf at the top of Milestones: the latest milestone earned as
   a 3D medal standing on a short Carbon shelf, its badge icon raised in
   green on a Carbon face inside the green ring, with "Latest: <title>"
   under it. Swipe sideways to turn it; it springs back when let go.
   Nothing moves on its own.

   Decorative: the caption and the badge grid below say the same. Nothing
   earned yet, Reduce Motion, no WebGL, or a load failure: no shelf, and the
   grid stands alone as before. */

import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { T } from '../../design';
import type { Milestone } from '../../lib/milestones';
import type { MedalIcon } from '../three/iconStrokes';
import { Lazy3DScene } from '../three/Lazy3D';
import { useCan3D } from '../three/support';

const HEIGHT = 100;

export function TrophyShelf({ latest, icon }: { latest: Milestone | null; icon: MedalIcon }) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);

  if (!can3D || failed || !latest) return null;

  return (
    <View style={{ gap: 4 }}>
      <View style={{ height: HEIGHT, marginHorizontal: -8 }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 ? <Lazy3DScene kind="shelf" params={{ icon }} width={width} height={HEIGHT} drag="spring" onFail={() => setFailed(true)} /> : null}
      </View>
      <Text style={[T.small, { textAlign: 'center' }]}>Latest: {latest.title}</Text>
    </View>
  );
}
