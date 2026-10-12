/* A short pop for something that just got ticked: scale 0.8 to 1, 180ms,
   ease-out quart, each time `on` turns true. Nothing pops on mount unless
   `from` says the thing was off a moment ago (a row that re-mounts right
   after its tick). Reduce Motion: no pop. */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

import { useReduceMotion } from './motion';

export function usePop(on: boolean, from: boolean = on): Animated.Value {
  const reduce = useReduceMotion();
  const scale = useRef(new Animated.Value(on && !from && !reduce ? 0.8 : 1)).current;
  const was = useRef(from);

  useEffect(() => {
    const popped = on && !was.current;
    was.current = on;
    if (!popped || reduce) {
      scale.setValue(1);
      return;
    }
    scale.setValue(0.8);
    const a = Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.out(Easing.poly(4)), useNativeDriver: Platform.OS !== 'web' });
    a.start();
    return () => a.stop();
  }, [on, reduce, scale]);

  return scale;
}
