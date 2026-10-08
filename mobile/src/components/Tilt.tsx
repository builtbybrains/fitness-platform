/* TiltPressable: a drop-in Pressable for cards and tiles. On press the
   card tips toward the finger (up to 5 degrees each way, perspective 800,
   see lib/tilt.ts) and settles to 0.98 scale; on release it springs back.
   Every Pressable prop passes through, onPress included; `style` and
   `children` can still be functions of `{ pressed }`. Reduce Motion: no
   tilt, just a still 0.98 press state. Transform only, so nothing around
   the card moves. */

import React, { useRef, useState } from 'react';
import { Animated, GestureResponderEvent, Platform, Pressable, PressableProps, StyleProp, View, ViewStyle } from 'react-native';

import { useReduceMotion } from './motion';
import { TILT_MAX, TILT_PERSPECTIVE, TILT_SCALE, tiltAngles } from '../lib/tilt';

const NATIVE = Platform.OS !== 'web';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type State = { pressed: boolean };

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle> | ((state: State) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: State) => React.ReactNode);
  /** Largest tilt in degrees on each axis. */
  maxTilt?: number;
};

// A touch spring: quick, settles in about 250ms with the faintest overshoot.
function spring(v: Animated.Value, toValue: number) {
  Animated.spring(v, { toValue, stiffness: 320, damping: 30, mass: 1, useNativeDriver: NATIVE }).start();
}

export function TiltPressable({ style, children, onPressIn, onPressOut, maxTilt = TILT_MAX, ...rest }: Props) {
  const reduce = useReduceMotion();
  const ref = useRef<View>(null);
  const down = useRef(false);
  const [pressed, setPressed] = useState(false);
  const rx = useRef(new Animated.Value(0)).current;
  const ry = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const deg = useRef({
    x: rx.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }),
    y: ry.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }),
  }).current;

  function pressIn(e: GestureResponderEvent) {
    down.current = true;
    setPressed(true);
    if (!reduce) {
      spring(scale, TILT_SCALE);
      // Measured against the card itself, since the touch's own location is
      // relative to whichever child was hit.
      const { pageX, pageY } = e.nativeEvent;
      ref.current?.measure((_x, _y, w, h, left, top) => {
        if (!down.current) return;
        const a = tiltAngles(pageX - left, pageY - top, w, h, maxTilt);
        spring(rx, a.rotateX);
        spring(ry, a.rotateY);
      });
    }
    onPressIn?.(e);
  }

  function pressOut(e: GestureResponderEvent) {
    down.current = false;
    setPressed(false);
    spring(rx, 0);
    spring(ry, 0);
    spring(scale, 1);
    onPressOut?.(e);
  }

  const state = { pressed };
  const own = typeof style === 'function' ? style(state) : style;
  const motion = reduce
    ? { transform: [{ scale: pressed ? TILT_SCALE : 1 }] }
    : {
        transform: [
          { perspective: TILT_PERSPECTIVE },
          { rotateX: deg.x },
          { rotateY: deg.y },
          { scale },
        ],
      };

  return (
    <AnimatedPressable ref={ref} {...rest} onPressIn={pressIn} onPressOut={pressOut} style={[own, motion]}>
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}
