/* The object at the centre of the celebration overlay, as an image.

   - Workout done: the dumbbell drops in from 56px above with a 28 degree
     turn that levels out as it lands (500ms, ease-out quart, fading in
     over the first 150ms), then floats: a bob of a few px and a slow sway.
   - Milestone: the medal, carrying the milestone's icon in green on its
     face, flips in from edge-on to face-on (600ms, ease-out quart, no
     overshoot): the edge image shows first and hands over to the face as
     it turns toward the viewer. Then it sways in a slow turn and bobs.

   The overlay closes itself at 2.2s, so the float runs for under two
   seconds. Under Reduce Motion each one is a still image in its settled
   pose. Decorative: the overlay's own label says what happened. */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

import { C } from '../../design';
import { Icon, type IconName } from '../Icon';
import { useReduceMotion } from '../motion';
import { objectFrame } from '../../lib/objects/layout';
import { bob, dropIn, flipIn, floatPose, sampleCurve } from '../../lib/objects/pose';
import { OBJECT_BOUNDS } from './images';
import { ObjectImage } from './ObjectImage';

const NATIVE = Platform.OS !== 'web';
const DROP = 0.5;
const FLIP = 0.6;
const DUMBBELL_IDLE = 6.4; // s: two bobs, one sway
const MEDAL_IDLE = 7.2; // s: two bobs of 3.6s, one sway

const deg = (s: { inputRange: number[]; outputRange: number[] }) => ({ inputRange: s.inputRange, outputRange: s.outputRange.map((v) => `${v}deg`) });

// The entrance, sampled over a linear 0..1 so the curves stay the tested ones in pose.ts.
const drop = {
  y: sampleCurve((p) => dropIn(p * DROP).y),
  rotate: deg(sampleCurve((p) => dropIn(p * DROP).rotate)),
  opacity: sampleCurve((p) => dropIn(p * DROP).opacity),
};
// The edge image is on screen while the medal is within about 20 degrees of edge-on.
const edgeShare = (angle: number) => Math.max(0, Math.min(1, (angle - 62) / 12));
const flip = {
  face: deg(sampleCurve((p) => flipIn(p * FLIP), 30)),
  faceOpacity: sampleCurve((p) => 1 - edgeShare(flipIn(p * FLIP)), 30),
  edgeOpacity: sampleCurve((p) => edgeShare(flipIn(p * FLIP)), 30),
};
const dumbbellIdle = {
  y: sampleCurve((c) => floatPose(c, 5, 2, 0).y),
  rotate: deg(sampleCurve((c) => floatPose(c, 5, 2, 0).rotate)),
};
const medalIdle = {
  y: sampleCurve((c) => bob(c * MEDAL_IDLE, 3, MEDAL_IDLE / 2)),
  turn: deg(sampleCurve((c) => Math.sin(c * Math.PI * 2) * 12)),
};

type Props = {
  kind: 'dumbbell' | 'medal';
  /** Medal only: the icon on its face. */
  icon?: IconName;
  width?: number;
  height?: number;
};

export function CelebrationObject({ kind, icon = 'medal', width = 240, height = 200 }: Props) {
  const reduce = useReduceMotion();
  const enter = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  const idle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      enter.setValue(1);
      idle.setValue(0);
      return;
    }
    let loop: Animated.CompositeAnimation | null = null;
    let alive = true;
    enter.setValue(0);
    idle.setValue(0);
    const duration = (kind === 'medal' ? FLIP : DROP) * 1000;
    const a = Animated.timing(enter, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: NATIVE });
    a.start(({ finished }) => {
      if (!finished || !alive) return;
      const period = (kind === 'medal' ? MEDAL_IDLE : DUMBBELL_IDLE) * 1000;
      loop = Animated.loop(Animated.timing(idle, { toValue: 1, duration: period, easing: Easing.linear, useNativeDriver: NATIVE }));
      loop.start();
    });
    return () => {
      alive = false;
      a.stop();
      loop?.stop();
    };
  }, [kind, reduce, enter, idle]);

  const box = { width, height, alignItems: 'center' as const, justifyContent: 'center' as const };
  const hidden = { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  if (kind === 'dumbbell') {
    // About 186 by 86 in the 240 by 200 box, as the model was.
    const f = objectFrame(OBJECT_BOUNDS.dumbbellFloat, Math.min(width, height) * 0.63, width - 24, height - 40);
    return (
      <View style={box} {...hidden}>
        <ObjectImage
          name="dumbbellFloat"
          width={f.side}
          height={f.side}
          style={{
            left: f.dx,
            top: f.dy,
            opacity: enter.interpolate(drop.opacity),
            transform: [{ translateY: Animated.add(enter.interpolate(drop.y), idle.interpolate(dumbbellIdle.y)) }, { rotate: enter.interpolate(drop.rotate) }, { rotate: idle.interpolate(dumbbellIdle.rotate) }],
          }}
        />
      </View>
    );
  }

  // The disc fills 92% of its image: about 184px across in the 200 box.
  const size = Math.min(width, height);
  const lift = { transform: [{ translateY: idle.interpolate(medalIdle.y) }] };
  return (
    <View style={box} {...hidden}>
      <Animated.View style={[{ width: size, height: size }, lift]}>
        <ObjectImage
          name="medalEdge"
          width={size}
          height={size}
          style={{ position: 'absolute', left: 0, top: 0, opacity: enter.interpolate(flip.edgeOpacity) }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: enter.interpolate(flip.faceOpacity),
            transform: [{ perspective: 800 }, { rotateY: enter.interpolate(flip.face) }, { rotateY: idle.interpolate(medalIdle.turn) }],
          }}
        >
          <ObjectImage name="medalFace" width={size} height={size} style={{ position: 'absolute', left: 0, top: 0 }} />
          {/* Its own layer, so it paints over the medal image on every platform. */}
          <View style={{ zIndex: 1 }}>
            <Icon name={icon} size={Math.round(size * 0.42)} color={C.green} strokeWidth={2} />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
