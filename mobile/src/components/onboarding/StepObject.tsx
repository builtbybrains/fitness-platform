/* The object image above each questionnaire screen (see objects.ts for
   which one). When the topic changes, the current object shrinks, turns
   edge-on and fades away in 250ms (ease-in), and the next one turns in,
   grows and fades up over 300ms (ease-out quart, no overshoot); within a
   topic it stays put. The first one only comes in. Still between changes,
   never a loop. The curve is swapPose (lib/objects/layout.ts).

   120px tall, 88px on phones under 700px tall, where it also steps aside
   while the keyboard is up so the field stays in view. Under Reduce Motion
   it simply changes. Decorative. */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Platform, useWindowDimensions, View } from 'react-native';

import { useReduceMotion } from '../motion';
import { KIND_IMAGE, OBJECT_BOUNDS } from '../objects/images';
import { ObjectImage } from '../objects/ObjectImage';
import { objectFrame, swapPose } from '../../lib/objects/layout';
import { sampleCurve } from '../../lib/objects/pose';
import type { ObjectKind } from '../../lib/objects/sceneTypes';
import { objectForScreen } from './objects';

const NATIVE = Platform.OS !== 'web';
const OUT = 0.25;
const IN = 0.3;
/** Where the way out ends on the 0..1 timeline. */
const MID = OUT / (OUT + IN);

const at = (p: number) => swapPose(p * (OUT + IN));
const curve = {
  scale: sampleCurve((p) => at(p).scale, 44),
  opacity: sampleCurve((p) => at(p).opacity, 44),
  spin: sampleCurve((p) => (at(p).spin * 180) / Math.PI, 44),
};

function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}

export function StepObject({ screen }: { screen: string }) {
  const reduce = useReduceMotion();
  const kind = objectForScreen(screen);
  const [shown, setShown] = useState<ObjectKind>(kind);
  const t = useRef(new Animated.Value(reduce ? 1 : MID)).current;
  const target = useRef(kind);
  const phase = useRef<'out' | 'in' | 'rest'>(reduce ? 'rest' : 'in');
  const anim = useRef<Animated.CompositeAnimation | null>(null);
  const { height } = useWindowDimensions();
  const keyboardUp = useKeyboardUp();

  function comeIn() {
    phase.current = 'in';
    t.setValue(MID);
    anim.current = Animated.timing(t, { toValue: 1, duration: IN * 1000, easing: Easing.linear, useNativeDriver: NATIVE });
    anim.current.start(({ finished }) => {
      if (finished) phase.current = 'rest';
    });
  }

  // First mount: the first object only comes in.
  useEffect(() => {
    if (!reduce) comeIn();
    return () => anim.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (kind === target.current) return;
    target.current = kind;
    if (reduce) {
      anim.current?.stop();
      phase.current = 'rest';
      t.setValue(1);
      setShown(kind);
      return;
    }
    // Still leaving: the new object simply follows when the old one is gone.
    if (phase.current === 'out') return;
    // Already coming in: it gives way at once and the new one comes in.
    if (phase.current === 'in') {
      anim.current?.stop();
      setShown(kind);
      comeIn();
      return;
    }
    phase.current = 'out';
    t.setValue(0);
    anim.current = Animated.timing(t, { toValue: MID, duration: OUT * 1000, easing: Easing.linear, useNativeDriver: NATIVE });
    anim.current.start(({ finished }) => {
      if (!finished) return;
      setShown(target.current);
      comeIn();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, reduce]);

  const short = height < 700;
  if (short && keyboardUp) return null;
  const size = short ? 88 : 120;
  const width = Math.round(size * 1.4);
  // Every object at one visual mass (about 85px in the 168 by 120 box), so
  // the long, low dumbbell does not read bigger than the tall shaker.
  const name = KIND_IMAGE[shown];
  const f = objectFrame(OBJECT_BOUNDS[name], (size * 85) / 120, width * 0.94, size * 0.975);

  return (
    <View style={{ width, height: size, alignItems: 'center', justifyContent: 'center' }} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <ObjectImage
        name={name}
        width={f.side}
        height={f.side}
        style={{
          left: f.dx,
          top: f.dy,
          opacity: t.interpolate(curve.opacity),
          transform: [
            { perspective: 600 },
            { rotateY: t.interpolate({ inputRange: curve.spin.inputRange, outputRange: curve.spin.outputRange.map((v) => `${v}deg`) }) },
            { scale: t.interpolate(curve.scale) },
          ],
        }}
      />
    </View>
  );
}
