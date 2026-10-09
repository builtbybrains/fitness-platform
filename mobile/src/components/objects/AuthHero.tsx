/* The floating dumbbell above the sign-in and sign-up forms, as an image.
   It bobs a few px and sways in a slow turn and drift (one 6.4s cycle,
   two bobs to a sway), the app's one ambient loop. Drag it sideways and it
   tilts after the finger; let go and it springs back.

   180px tall on most phones, 120px under 700px of screen height, and gone
   while the keyboard is up on a short screen so the fields and the button
   stay in view. On taller screens it stays but holds still while the
   keyboard is up or the screen is out of focus, so the loop never runs
   while someone types. Under Reduce Motion it is a still image and does
   not tilt. Decorative. */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, PanResponder, Platform, useWindowDimensions, View } from 'react-native';
import { useIsFocused } from 'expo-router';

import { useReduceMotion } from '../motion';
import { objectFrame } from '../../lib/objects/layout';
import { floatPose, heroSize, sampleCurve, softClamp } from '../../lib/objects/pose';
import { OBJECT_BOUNDS } from './images';
import { ObjectImage } from './ObjectImage';

const NATIVE = Platform.OS !== 'web';
const PERIOD = 6400; // ms: one sway, two bobs of 3.2s
const DRAG_RANGE = 320; // px either side the tilt curve covers
const MAX_TILT = 12; // degrees
const MAX_SHIFT = 18; // px

const deg = (v: number) => `${v}deg`;
const pose = {
  y: sampleCurve((c) => floatPose(c).y),
  x: sampleCurve((c) => floatPose(c).x),
  rotate: sampleCurve((c) => floatPose(c).rotate),
};
const dragCurve = (f: (dx: number) => number) => {
  const s = sampleCurve((p) => f(p * 2 * DRAG_RANGE - DRAG_RANGE), 32);
  return { inputRange: s.inputRange.map((p) => p * 2 * DRAG_RANGE - DRAG_RANGE), outputRange: s.outputRange };
};
const dragTilt = dragCurve((dx) => softClamp(dx / 14, MAX_TILT));
const dragShift = dragCurve((dx) => softClamp(dx / 6, MAX_SHIFT));

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

export function AuthHero() {
  const { width, height } = useWindowDimensions();
  const keyboardUp = useKeyboardUp();
  const focused = useIsFocused();
  const reduce = useReduceMotion();
  const cycle = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const running = !reduce && !keyboardUp && focused;

  useEffect(() => {
    if (reduce) {
      cycle.stopAnimation();
      cycle.setValue(0);
      drag.setValue(0);
      return;
    }
    if (!running) {
      cycle.stopAnimation();
      return;
    }
    let alive = true;
    let loop: Animated.CompositeAnimation | null = null;
    // Carry on from where it stopped, then loop whole cycles (the pose at
    // 1 is the pose at 0, so the loop joins with no jump).
    cycle.stopAnimation((v) => {
      if (!alive) return;
      Animated.timing(cycle, { toValue: 1, duration: Math.max(16, (1 - v) * PERIOD), easing: Easing.linear, useNativeDriver: NATIVE }).start(({ finished }) => {
        if (!finished || !alive) return;
        cycle.setValue(0);
        loop = Animated.loop(Animated.timing(cycle, { toValue: 1, duration: PERIOD, easing: Easing.linear, useNativeDriver: NATIVE }));
        loop.start();
      });
    });
    return () => {
      alive = false;
      loop?.stop();
      cycle.stopAnimation();
    };
  }, [running, reduce, cycle, drag]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => !reduceRef.current && Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => drag.setValue(g.dx),
      onPanResponderRelease: () => Animated.spring(drag, { toValue: 0, stiffness: 180, damping: 24, mass: 1, useNativeDriver: NATIVE }).start(),
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, stiffness: 180, damping: 24, mass: 1, useNativeDriver: NATIVE }).start(),
    }),
  ).current;

  const size = heroSize(height, keyboardUp);
  if (!size) return null;
  // The form column is at most 480 wide with 24 padding each side.
  const w = Math.min(width, 480) - 48;
  // About 190 by 88 in the 180 box: the size the spinning model had. Room
  // is kept for the sway, the drag and the bob, so it never leaves the box.
  const f = objectFrame(OBJECT_BOUNDS.dumbbellFloat, size * 0.72, w - 2 * MAX_SHIFT - 8, size - 24);

  const transform = [
    { translateX: Animated.add(cycle.interpolate(pose.x), drag.interpolate({ ...dragShift, extrapolate: 'clamp' })) },
    { translateY: cycle.interpolate(pose.y) },
    { rotate: cycle.interpolate({ inputRange: pose.rotate.inputRange, outputRange: pose.rotate.outputRange.map(deg) }) },
    { rotate: drag.interpolate({ inputRange: dragTilt.inputRange, outputRange: dragTilt.outputRange.map(deg), extrapolate: 'clamp' }) },
  ];

  return (
    <View
      {...pan.panHandlers}
      style={{ width: w, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <ObjectImage name="dumbbellFloat" width={f.side} height={f.side} style={{ left: f.dx, top: f.dy, transform }} />
    </View>
  );
}
