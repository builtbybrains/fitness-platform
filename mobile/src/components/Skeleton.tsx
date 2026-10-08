/* Loading placeholders shaped like the screen that is on its way: Carbon
   blocks (rounded rects and circles) with a soft light band sweeping across
   each one, 1300ms a pass, the same sweep as a meal photo that is still
   loading (food/MealImage). One clock drives every block in a group, but
   each block's pass starts later the lower it sits on screen, so the
   sweep rolls down the layout instead of crossing every block in one
   stripe. A block that only frames others (a card) holds still.
   Reduce Motion: the blocks hold still.

   <Skeleton label="Loading your plan"> wraps a layout of <Bone>s and is
   what a screen reader hears; the blocks themselves are hidden from it.
   `tone="raised"` is for a block that sits on a Carbon card. */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
    // Linear clock; each block applies the easing to its own shifted pass.
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
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

/** Screen pixels per full pass of delay: a block 700px lower runs about
    half a pass behind the top one. */
const PHASE_PX = 1400;
const easeInOutQuad = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

/** The band's x for clock value v (0 to 1) when this block's pass is
    shifted by `phase` (0 to 1): an eased pass from just off the left edge
    to just off the right, wrapping while it is out of sight. */
function sweepCurve(phase: number, band: number, w: number) {
  const x = (v: number) => {
    const p = v - phase < 0 ? v - phase + 1 : v - phase;
    return -band + (w + band) * easeInOutQuad(p);
  };
  const steps = 16;
  const input: number[] = [];
  const output: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const v = i / steps;
    // The wrap point: end the pass off the right edge, restart off the left.
    if (phase > 0 && input.length && input[input.length - 1] < phase && v >= phase) {
      input.push(phase - 1e-4);
      output.push(w);
      if (v > phase) {
        input.push(phase);
        output.push(-band);
      }
    }
    input.push(v);
    output.push(x(v));
  }
  return { inputRange: input, outputRange: output };
}

export function Bone({ width = '100%', height, radius = R.tile, circle, tone = 'card', style, children }: BoneProps) {
  // A block that wraps others stays plain; only the innermost ones sweep,
  // so two bands never cross.
  const clock = useContext(Sweep);
  const sweep = children ? null : clock;
  const ref = useRef<View>(null);
  const [w, setW] = useState(0);
  const [phase, setPhase] = useState(0);
  const band = Math.max(24, w * 0.45);
  const translateX = useMemo(() => (sweep && w > 0 ? sweep.interpolate(sweepCurve(phase, band, w)) : null), [sweep, phase, band, w]);
  return (
    <View
      ref={ref}
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        if (sweep) ref.current?.measureInWindow((_x, y) => setPhase(Math.round((((y / PHASE_PX) % 1) + 1) % 1 * 1000) / 1000));
      }}
      style={[
        { width: circle ? height : width, height, borderRadius: circle && height ? height / 2 : radius, backgroundColor: tone === 'raised' ? C.raised : C.card, overflow: 'hidden' },
        style,
      ]}
    >
      {translateX ? (
        <Animated.View
          style={{ pointerEvents: 'none', position: 'absolute', top: 0, bottom: 0, left: 0, width: band, backgroundColor: 'rgba(255,255,255,0.05)', transform: [{ translateX }] }}
        />
      ) : null}
      {children}
    </View>
  );
}
