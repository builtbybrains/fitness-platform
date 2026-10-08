/* Pull to refresh for a tab's ScrollView: a Built Green spinner on a
   Carbon disc while `run` re-reads the data. Letting go past the point gives
   a firm buzz, and a light tap says it is done. A failed read keeps what is
   on screen (each store falls back to its saved copy).

   Phones use the platform's RefreshControl. The browser has no pull gesture
   for a scroll area inside the page, so on the web the same disc is drawn
   here: at the top of the list, pull down and the list follows the finger
   (at half speed), opening a space above the header where the disc slides
   in with an arrow that turns as it fills; past 64px it is armed, and
   letting go refreshes. While it refreshes the list holds 72px down (the
   disc plus a 16px margin above and below it), so the disc never covers the
   headline; it slides back up when done. Reduce Motion: the disc and the
   list move in place instead of sliding. */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Platform, RefreshControl, StyleProp, View, ViewStyle } from 'react-native';

import { C } from '../design';
import { haptic } from '../lib/haptics';
import { Icon } from './Icon';
import { useReduceMotion } from './motion';

const TRIGGER = 64;
const MAX_PULL = 96;
const DISC = 40;
const REST = 16; // where the disc waits while refreshing
/** How far the list stays down while refreshing: the disc with REST above and below. */
const HOLD = DISC + 2 * REST;

export function usePullRefresh(run: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    haptic.heavy();
    setRefreshing(true);
    try {
      await run();
    } catch {
      /* the stores keep their last good copy */
    } finally {
      setRefreshing(false);
      haptic.tap();
    }
  }, [run]);
  if (Platform.OS === 'web') return <WebPullRefresh refreshing={refreshing} onRefresh={onRefresh} />;
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.green} colors={[C.green]} progressBackgroundColor={C.card} />;
}

/** The web pull. react-native-web's ScrollView hands its scroller to this as
    `children` (as it does with RefreshControl) along with its style. */
function WebPullRefresh({ refreshing, onRefresh, style, children }: { refreshing: boolean; onRefresh: () => void; style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const reduce = useReduceMotion();
  const box = useRef<View>(null);
  const pull = useRef(new Animated.Value(0)).current;
  const [armed, setArmed] = useState(false);
  const live = useRef({ refreshing, onRefresh, reduce });
  live.current = { refreshing, onRefresh, reduce };

  const settle = useCallback(
    (to: number) => {
      if (live.current.reduce) pull.setValue(to);
      else Animated.timing(pull, { toValue: to, duration: 220, easing: Easing.out(Easing.poly(4)), useNativeDriver: false }).start();
    },
    [pull],
  );

  // Hold the disc (and the list under it) while refreshing; tuck it away when done.
  useEffect(() => {
    settle(refreshing ? HOLD : 0);
    if (!refreshing) setArmed(false);
  }, [refreshing, settle]);

  useEffect(() => {
    const el = box.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    // The scroller sits inside the view that moves the list.
    const scroller = () => (el.firstElementChild?.firstElementChild ?? null) as HTMLElement | null;
    // The page itself must not bounce or reload when the list is pulled at its top.
    const sc = scroller();
    if (sc) sc.style.overscrollBehaviorY = 'contain';

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let decided = false;
    let distance = 0;

    const start = (e: TouchEvent) => {
      const s = scroller();
      tracking = !!s && s.scrollTop <= 0 && e.touches.length === 1 && !live.current.refreshing;
      decided = false;
      distance = 0;
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
    };
    const move = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        // Only a downward pull from the very top is ours.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || (scroller()?.scrollTop ?? 0) > 0) {
          tracking = false;
          return;
        }
      }
      distance = Math.max(0, Math.min(MAX_PULL, dy * 0.5));
      pull.setValue(distance);
      setArmed(distance >= TRIGGER);
    };
    const end = () => {
      if (!tracking) return;
      tracking = false;
      if (distance >= TRIGGER) {
        live.current.onRefresh();
      } else {
        setArmed(false);
        settle(0);
      }
      distance = 0;
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [pull, settle]);

  // The disc comes down to REST and stops there; the list keeps moving with the finger.
  const translateY = pull.interpolate({ inputRange: [0, TRIGGER], outputRange: [-DISC - 8, REST], extrapolate: 'clamp' });
  const shift = pull.interpolate({ inputRange: [0, TRIGGER], outputRange: [0, TRIGGER], extrapolateLeft: 'clamp' });
  const opacity = pull.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' });
  const rotate = pull.interpolate({ inputRange: [0, TRIGGER], outputRange: ['0deg', '270deg'], extrapolate: 'clamp' });

  return (
    <View ref={box} style={[{ flex: 1, overflow: 'hidden' }, style]}>
      <Animated.View style={{ flex: 1, transform: [{ translateY: shift }] }}>{children}</Animated.View>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityLabel={refreshing ? 'Refreshing' : undefined}
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          alignSelf: 'center',
          width: DISC,
          height: DISC,
          borderRadius: DISC / 2,
          backgroundColor: C.card,
          borderWidth: 1,
          borderColor: C.lineStrong,
          alignItems: 'center',
          justifyContent: 'center',
          opacity,
          transform: [{ translateY }],
        }}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={C.green} />
        ) : (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Icon name="refresh" size={20} color={armed ? C.green : C.stone} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
