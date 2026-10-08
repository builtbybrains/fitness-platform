/* The trophy shelf at the top of Milestones: every earned milestone as a
   small 3D B medal standing on a thin Carbon shelf, oldest on the left.
   The newest one catches the light. Swipe sideways to turn the shelf; it
   springs back when let go. Nothing moves on its own.

   Decorative: the badge grid below names every milestone and its date.
   Nothing earned yet, Reduce Motion, no WebGL, or a load failure: no
   shelf, and the grid stands alone as before. */

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';

import type { Milestone } from '../../lib/milestones';
import { shelfOrder } from '../three/layout';
import { Lazy3DScene } from '../three/Lazy3D';
import { useCan3D } from '../three/support';

const HEIGHT = 100;

export function TrophyShelf({ items }: { items: readonly Milestone[] }) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(0);
  const order = useMemo(() => shelfOrder(items), [items]);

  if (!can3D || failed || order.count === 0) return null;

  return (
    <View style={{ height: HEIGHT, marginHorizontal: -8 }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width > 0 ? <Lazy3DScene kind="shelf" params={order} width={width} height={HEIGHT} drag="spring" onFail={() => setFailed(true)} /> : null}
    </View>
  );
}
