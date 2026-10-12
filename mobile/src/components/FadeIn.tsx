/* Entrance for a block of content: fades in and rises 8px, ease-out quart,
   280ms, after `delay` ms. Use a small stagger (about 40ms) between
   siblings. `play={false}` (for example on a revisit the same day) and
   Reduce Motion both render the content in place with no animation. */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleProp, ViewStyle } from 'react-native';

import { useReduceMotion } from './motion';

type Props = {
  delay?: number;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export function FadeIn({ delay = 0, play = true, style, children }: Props) {
  const reduce = useReduceMotion();
  const still = reduce || !play;
  const t = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) {
      t.setValue(1);
      return;
    }
    const a = Animated.timing(t, {
      toValue: 1,
      duration: 280,
      delay,
      easing: Easing.out(Easing.poly(4)),
      useNativeDriver: Platform.OS !== 'web',
    });
    a.start();
    return () => a.stop();
  }, [still, delay, t]);

  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={[style, { opacity: t, transform: [{ translateY }] }]}>{children}</Animated.View>;
}
