/* Swipe right to tick something off: a meal row, a set tile. The row
   follows the finger and uncovers a green-tint track with a check and the
   word for what happens ("Eaten", "Done"). Past 40% of the row's width the
   track fills Built Green and the phone gives a firm buzz: letting go there
   commits (the row's own tap feedback follows) and the row springs home
   without overshoot. Short of it, it just springs home.

   Tapping the row works exactly as before, so the swipe is never the only
   way. The gesture is only claimed when the finger moves sideways (more than
   12px, and half again more across than down), so the list still scrolls;
   it never starts in the left 24px, which belongs to the swipe back.
   Reduce Motion: the row still follows the finger (it is direct touch) but
   snaps home instead of springing.

   A rightward drag that starts on the row is always the row's: it marks
   the touch, so the swipe between tabs leaves it alone (a leftward drag
   still turns the page). */

import React, { useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, PanResponder, Platform, StyleProp, Text, View, ViewStyle } from 'react-native';

import { C, FONT, R } from '../design';
import { haptic } from '../lib/haptics';
import { Icon } from './Icon';
import { useReduceMotion } from './motion';
import { EDGE } from './ScreenFade';
import { markTouch } from '../lib/tabPager';

const NATIVE = Platform.OS !== 'web';
/** Share of the row's width the finger must pass to commit. */
export const SWIPE_COMMIT = 0.4;

export function SwipeRow({
  label,
  onCommit,
  enabled = true,
  compact,
  radius = R.tile,
  background,
  style,
  children,
}: {
  /** What a full swipe does, shown on the track: "Eaten", "Done". */
  label: string;
  onCommit: () => void;
  enabled?: boolean;
  /** A small tile: the track shows the check without the word. */
  compact?: boolean;
  radius?: number;
  /** The surface the row sits on, so the moving row hides the track. */
  background?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reduce = useReduceMotion();
  const tx = useRef(new Animated.Value(0)).current;
  const [armed, setArmed] = useState(false);
  // `startX` is where the finger first touched, so the row tracks the finger
  // exactly, including the travel before the gesture was claimed.
  const live = useRef({ width: 0, enabled, reduce, onCommit, armed: false, startX: 0 });
  live.current = { ...live.current, enabled, reduce, onCommit };

  const arm = (on: boolean) => {
    if (live.current.armed === on) return;
    live.current.armed = on;
    setArmed(on);
    if (on) haptic.heavy();
  };

  const home = () => {
    arm(false);
    if (live.current.reduce) tx.setValue(0);
    else Animated.spring(tx, { toValue: 0, stiffness: 400, damping: 40, mass: 1, useNativeDriver: NATIVE }).start();
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => {
        live.current.startX = e.nativeEvent.pageX;
        // Rightward drags from here are the row's, not the tab pager's.
        if (live.current.enabled) markTouch('row');
        return false;
      },
      onMoveShouldSetPanResponder: (_e, g) => {
        if (!live.current.enabled || live.current.width === 0) return false;
        return live.current.startX > EDGE && g.dx > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        tx.stopAnimation();
        live.current.armed = false;
      },
      onPanResponderMove: (e) => {
        const w = live.current.width;
        const dx = Math.max(0, Math.min(w * 0.85, e.nativeEvent.pageX - live.current.startX));
        tx.setValue(dx);
        arm(dx >= w * SWIPE_COMMIT);
      },
      onPanResponderRelease: () => {
        const commit = live.current.armed;
        home();
        if (commit) live.current.onCommit();
      },
      onPanResponderTerminate: () => home(),
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    live.current.width = e.nativeEvent.layout.width;
  };

  const trackOpacity = tx.interpolate({ inputRange: [0, 8], outputRange: [0, 1], extrapolate: 'clamp' });
  const ink = armed ? C.onGreen : C.green;
  // Web: let the browser keep vertical scrolling and hand sideways moves to the row.
  const webTouch = NATIVE ? null : ({ touchAction: 'pan-y' } as unknown as ViewStyle);

  return (
    <View onLayout={onLayout} style={[{ borderRadius: radius, overflow: 'hidden' }, webTouch, style]} {...pan.panHandlers}>
      <Animated.View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          borderRadius: radius,
          backgroundColor: armed ? C.green : C.greenTint,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: compact ? 12 : 16,
          opacity: trackOpacity,
        }}
      >
        <Icon name="check" size={compact ? 18 : 20} color={ink} strokeWidth={2.6} />
        {compact ? null : <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: ink }}>{label}</Text>}
      </Animated.View>
      <Animated.View style={{ backgroundColor: background, borderRadius: radius, transform: [{ translateX: tx }] }}>{children}</Animated.View>
    </View>
  );
}
