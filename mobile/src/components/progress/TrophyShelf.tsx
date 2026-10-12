/* The trophy shelf at the top of Milestones: the latest milestone earned as
   a medal image standing on a short shelf, its badge icon drawn in green
   on the medal's face, with "Latest: <title>" under it. Press and hold the
   medal and it tips toward the finger (up to 10 degrees, perspective 600)
   and springs back on release. Nothing moves on its own; under Reduce
   Motion it does not tilt.

   Decorative: the caption and the badge grid below say the same. Nothing
   earned yet: no shelf, and the grid stands alone. */

import React, { useRef, useState } from 'react';
import { Animated, Platform, Text, View, type GestureResponderEvent } from 'react-native';

import { C, T } from '../../design';
import type { Milestone } from '../../lib/milestones';
import type { MedalIcon } from '../../lib/objects/iconStrokes';
import { tiltAngles } from '../../lib/tilt';
import { Icon } from '../Icon';
import { useReduceMotion } from '../motion';
import { ObjectImage } from '../objects/ObjectImage';

const NATIVE = Platform.OS !== 'web';
/** The shelf image is 2.5 times as wide as tall. The medal stands centred
    at 0.478 of its height in a square box 0.949 of that height (README in
    assets/images/objects). */
const SHELF_RATIO = 2.5;
const MEDAL_Y = 0.478;
const MEDAL_SHARE = 0.949;
const MAX_HEIGHT = 100;
/** The badge icon's size, as a share of the medal image. */
const ICON = 0.42;
const TILT = 10;

function spring(v: Animated.Value, toValue: number) {
  Animated.spring(v, { toValue, stiffness: 320, damping: 30, mass: 1, useNativeDriver: NATIVE }).start();
}

export function TrophyShelf({ latest, icon }: { latest: Milestone | null; icon: MedalIcon }) {
  const reduce = useReduceMotion();
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  const [room, setRoom] = useState(0);

  if (!latest) return null;

  // 100 tall, or less where the card is narrower than the shelf.
  const height = room > 0 ? Math.min(MAX_HEIGHT, Math.floor(room / SHELF_RATIO)) : MAX_HEIGHT;
  const width = height * SHELF_RATIO;
  const medal = Math.round(height * MEDAL_SHARE);

  const press = (e: GestureResponderEvent) => {
    if (reduce) return;
    const { locationX, locationY } = e.nativeEvent;
    const a = tiltAngles(locationX, locationY, medal, medal, TILT);
    spring(rx, a.rotateX);
    spring(ry, a.rotateY);
  };
  const release = () => {
    spring(rx, 0);
    spring(ry, 0);
  };
  const deg = (v: Animated.Value) => v.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] });

  return (
    <View style={{ gap: 4 }}>
      <View
        style={{ height, alignItems: 'center' }}
        onLayout={(e) => setRoom(Math.round(e.nativeEvent.layout.width))}
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={{ width, height }}>
          <ObjectImage name="shelf" width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} />
          <Animated.View
            onStartShouldSetResponder={() => !reduce}
            onResponderGrant={press}
            onResponderRelease={release}
            onResponderTerminate={release}
            style={{
              position: 'absolute',
              left: (width - medal) / 2,
              top: height * MEDAL_Y - medal / 2,
              width: medal,
              height: medal,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ perspective: 600 }, { rotateX: deg(rx) }, { rotateY: deg(ry) }],
            }}
          >
            <ObjectImage name="medalFace" width={medal} height={medal} style={{ position: 'absolute', left: 0, top: 0 }} />
            {/* Its own layer, so it paints over the medal image on every platform. */}
            <View style={{ zIndex: 1 }}>
              <Icon name={icon} size={Math.round(medal * ICON)} color={C.green} strokeWidth={2.2} />
            </View>
          </Animated.View>
        </View>
      </View>
      <Text style={[T.small, { textAlign: 'center' }]}>Latest: {latest.title}</Text>
    </View>
  );
}
