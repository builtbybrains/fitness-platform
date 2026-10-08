/* Stack transitions. On phones a pushed screen slides in from the right
   (the native push) and a task screen (log food, log an activity, a meal
   from what's at home) rises from the bottom like a sheet. On the web the
   stack has no native slide, so each screen fades in instead as it comes to
   the front, forward or back: 200ms, ease-out quart, opacity only.
   Reduce Motion: no fade. */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

import { useReduceMotion } from './motion';

type FocusSource = { addListener: (type: 'focus', cb: () => void) => () => void };

function ScreenFade({ navigation, children }: { navigation: FocusSource; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) {
      opacity.setValue(1);
      return;
    }
    return navigation.addListener('focus', () => {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.poly(4)), useNativeDriver: false }).start();
    });
  }, [navigation, reduce, opacity]);

  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}

/** `screenLayout` for a Stack: the web fade; nothing on phones. */
export const webFadeLayout =
  Platform.OS === 'web'
    ? ({ navigation, children }: { navigation: FocusSource; children: React.ReactElement }) => <ScreenFade navigation={navigation}>{children}</ScreenFade>
    : undefined;

/** Options every stack shares: the push slides in from the right. */
export const PUSH = { animation: 'slide_from_right' } as const;
/** A task screen that opens like a sheet. */
export const SHEET = { animation: 'slide_from_bottom' } as const;
