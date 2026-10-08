/* Loading placeholders shaped like the screen that is on its way: Carbon
   blocks (rounded rects and circles) with a soft light band sweeping across
   each one, 1300ms a pass, the same sweep as a meal photo that is still
   loading (food/MealImage). One clock drives every block in a group; a
   block that only frames others (a card) holds still.
   Reduce Motion: the blocks hold still.

   <Skeleton label="Loading your plan"> wraps a layout of <Bone>s and is
   what a screen reader hears; the blocks themselves are hidden from it.
   `tone="raised"` is for a block that sits on a Carbon card. */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, DimensionValue, Easing, Platform, StyleProp, View, ViewStyle } from 'react-native';

import { C, R } from '../design';
import { useReduceMotion } from './motion';

const Sweep = createContext<Animated.Value | null>(null);

export function Skeleton({ label, style, children }: { label: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, sweep]);

  return (
    <Sweep.Provider value={reduce ? null : sweep}>
      <View style={style} accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityState={{ busy: true }}>
        {children}
      </View>
    </Sweep.Provider>
  );
}

type BoneProps = {
  width?: DimensionValue;
  /** Leave out on a block that wraps other blocks: it grows to fit them. */
  height?: number;
  /** Corner radius; defaults to the small-tile radius. */
  radius?: number;
  /** A circle `height` across (width is ignored). */
  circle?: boolean;
  tone?: 'card' | 'raised';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function Bone({ width = '100%', height, radius = R.tile, circle, tone = 'card', style, children }: BoneProps) {
  // A block that wraps others stays plain; only the innermost ones sweep,
  // so two bands never cross.
  const clock = useContext(Sweep);
  const sweep = children ? null : clock;
  const [w, setW] = useState(0);
  const band = Math.max(24, w * 0.45);
  const translateX = sweep?.interpolate({ inputRange: [0, 1], outputRange: [-band, w] });
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        { width: circle ? height : width, height, borderRadius: circle && height ? height / 2 : radius, backgroundColor: tone === 'raised' ? C.raised : C.card, overflow: 'hidden' },
        style,
      ]}
    >
      {translateX && w > 0 ? (
        <Animated.View
          style={{ pointerEvents: 'none', position: 'absolute', top: 0, bottom: 0, left: 0, width: band, backgroundColor: 'rgba(255,255,255,0.05)', transform: [{ translateX }] }}
        />
      ) : null}
      {children}
    </View>
  );
}
