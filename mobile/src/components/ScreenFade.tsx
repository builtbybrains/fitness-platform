/* Screen transitions.

   Phones: a pushed screen slides in from the right (the native push) and a
   task screen (log food, log an activity, a meal from what's at home) rises
   from the bottom like a sheet. The native stack does both, with its own
   swipe back.

   Web: the stack has no animation of its own, so each stack screen is
   wrapped here and moves itself.
   - Push: the new screen slides in from the right edge (320ms, ease-out
     quart) while the one it covers drifts 30% left and dims to 0.6.
   - Back: the screen underneath returns from 30% left, 0.6 to full
     opacity (280ms).
   - Sheet: the task screen rises from the bottom (340ms) over the dimmed
     screen it opened from; closing it brings that screen back to full.
   - Edge swipe: a drag that starts within 24px of the left edge of a
     pushed screen moves it with the finger, the screen underneath following.
     Let go past 35% of the width, or flick, and it goes back with a light
     tap; otherwise it springs home.
   The covered screen stays painted while it is being covered or revealed, so
   nothing flashes black. Everything is clipped to the screen, so no
   horizontal scroll appears.

   Tabs (phones and web): the new tab's content slides 16px in from the side
   it came from and fades from half to full opacity (220ms, ease-out quart),
   so the first frame already shows the screen, never black.

   Reduce Motion: no slides or fades; the edge swipe still goes back. */

import React, { useLayoutEffect, useRef } from 'react';
import { Animated, Easing, PanResponder, Platform, useWindowDimensions, View } from 'react-native';

import { C } from '../design';
import { haptic } from '../lib/haptics';
import { useReduceMotion } from './motion';

const WEB = Platform.OS === 'web';
const OUT_QUART = Easing.out(Easing.poly(4));

/** Width of the invisible strip at the left edge that starts a swipe back. */
export const EDGE = 24;
const PUSH_MS = 320;
const BACK_MS = 280;
const SHEET_MS = 340;
const TAB_MS = 220;
const TAB_SHIFT = 16;
/** A tab starts half shown, so its first frame is never a black screen. */
const TAB_FROM_OPACITY = 0.5;
const COVER_X = -0.3;
const COVER_OPACITY = 0.6;

type Kind = 'push' | 'sheet';
type NavState = { key: string; index: number; routes: { key: string }[] };
type Nav = { getState: () => NavState; goBack: () => void };
type LayoutArgs = {
  route: { key: string };
  navigation: Nav;
  options: { animation?: string; gestureEnabled?: boolean };
  children: React.ReactElement;
};

/** Each stack's top screen as last drawn: its index and how it came in. */
const depth = new Map<string, { index: number; kind: Kind }>();
/** Stacks whose next back was finished by the edge swipe (already in place). */
const swipedBack = new Set<string>();
/** Screens currently on top of their stack. */
const tops = new Set<string>();

/** What a screen lets the screen above it do while it covers or reveals it. */
type Peer = {
  host: HTMLElement | null;
  /** 0 = covered (30% left, dimmed), 1 = in place. */
  follow: (p: number) => void;
  settle: (p: number, ms: number, done?: () => void) => void;
  dim: (ms: number) => void;
};
const peers = new Map<string, Peer>();

/** Keep a covered screen painted (the stack hides it) until `restore`. */
function show(key: string | undefined): () => void {
  const host = key ? peers.get(key)?.host : null;
  if (!host || !key) return () => {};
  const display = host.style.display;
  const pointer = host.style.pointerEvents;
  host.style.display = 'flex';
  host.style.pointerEvents = 'none';
  return () => {
    host.style.pointerEvents = pointer;
    if (!tops.has(key)) host.style.display = display === 'flex' ? 'none' : display;
  };
}

/** The positioned box the stack shows and hides for this screen. Its
    background, and that of the boxes between it and this screen, is made
    clear: the moving layer carries the Deep Black itself, so the screen
    underneath shows wherever this one has moved away. */
function hostOf(el: unknown): HTMLElement | null {
  if (typeof window === 'undefined' || !(el instanceof HTMLElement)) return null;
  let node = el.parentElement;
  while (node && window.getComputedStyle(node).position !== 'absolute') {
    node.style.backgroundColor = 'transparent';
    node = node.parentElement;
  }
  if (node) node.style.backgroundColor = 'transparent';
  return node;
}

function indexOf(s: NavState, key: string): number {
  return s.routes.findIndex((r) => r.key === key);
}

function StackScreen({ route, navigation, options, children }: LayoutArgs) {
  const reduce = useReduceMotion();
  const { width, height } = useWindowDimensions();
  const s = navigation.getState();
  const i = indexOf(s, route.key);
  const top = s.index === i;
  const kind: Kind = options.animation === 'slide_from_bottom' ? 'sheet' : 'push';

  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const outer = useRef<View>(null);

  // What the gesture handlers need, fresh on every render.
  const live = useRef({ width, height, reduce, stack: s.key, below: s.routes[i - 1]?.key, canSwipe: false });
  live.current = { width, height, reduce, stack: s.key, below: s.routes[i - 1]?.key, canSwipe: top && i > 0 && options.gestureEnabled !== false };

  const run = (anims: Animated.CompositeAnimation[], done?: () => void) =>
    Animated.parallel(anims).start(({ finished }) => {
      if (finished) done?.();
    });
  const timing = (v: Animated.Value, toValue: number, duration: number) => Animated.timing(v, { toValue, duration, easing: OUT_QUART, useNativeDriver: false });

  // Register as a peer so the screen above can move this one.
  useLayoutEffect(() => {
    const coverX = (p: number) => COVER_X * live.current.width * (1 - p);
    const coverO = (p: number) => COVER_OPACITY + (1 - COVER_OPACITY) * p;
    peers.set(route.key, {
      host: hostOf(outer.current),
      follow: (p) => {
        x.setValue(coverX(p));
        opacity.setValue(coverO(p));
      },
      settle: (p, ms, done) => {
        if (live.current.reduce) {
          x.setValue(coverX(p));
          opacity.setValue(coverO(p));
          done?.();
          return;
        }
        run([timing(x, coverX(p), ms), timing(opacity, coverO(p), ms)], done);
      },
      dim: (ms) => {
        x.setValue(0);
        if (live.current.reduce) opacity.setValue(COVER_OPACITY);
        else run([timing(opacity, COVER_OPACITY, ms)]);
      },
    });
    return () => {
      peers.delete(route.key);
      tops.delete(route.key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.key]);

  // Coming to the top of the stack: decide forward or back before the frame is painted.
  useLayoutEffect(() => {
    if (!top) {
      tops.delete(route.key);
      return;
    }
    tops.add(route.key);
    const was = depth.get(s.key);
    depth.set(s.key, { index: i, kind });
    const home = () => {
      x.setValue(0);
      y.setValue(0);
      opacity.setValue(1);
    };
    if (swipedBack.delete(s.key) || !was || was.index === i || reduce) return home();

    if (i > was.index) {
      // Forward: this screen comes in over the one below, which stays painted.
      const below = s.routes[i - 1]?.key;
      const restore = show(below);
      const peer = below ? peers.get(below) : undefined;
      opacity.setValue(1);
      if (kind === 'sheet') {
        x.setValue(0);
        y.setValue(height);
        peer?.dim(SHEET_MS);
        run([timing(y, 0, SHEET_MS)], restore);
      } else {
        y.setValue(0);
        x.setValue(width);
        peer?.settle(0, PUSH_MS);
        run([timing(x, 0, PUSH_MS)], restore);
      }
      return;
    }

    // Back: this screen returns from under the one that closed.
    y.setValue(0);
    if (was.kind === 'sheet') x.setValue(0);
    else x.setValue(COVER_X * width);
    opacity.setValue(COVER_OPACITY);
    run([timing(x, 0, BACK_MS), timing(opacity, 1, BACK_MS)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  // Edge swipe back.
  const drag = useRef<{ restore: () => void; below?: string }>({ restore: () => {} });
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => {
        if (!live.current.canSwipe) return false;
        const startX = g.moveX - g.dx;
        return startX <= EDGE && g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const below = live.current.below;
        drag.current = { below, restore: show(below) };
        if (!live.current.reduce) peers.get(below ?? '')?.follow(0);
      },
      onPanResponderMove: (_e, g) => {
        if (live.current.reduce) return;
        const w = live.current.width;
        const dx = Math.max(0, Math.min(w, g.dx));
        x.setValue(dx);
        peers.get(drag.current.below ?? '')?.follow(dx / w);
      },
      onPanResponderRelease: (_e, g) => {
        const { width: w, reduce: still, stack } = live.current;
        const peer = peers.get(drag.current.below ?? '');
        if (g.dx > 0.35 * w || (g.vx > 0.5 && g.dx > 0)) {
          haptic.tap();
          const leave = () => {
            swipedBack.add(stack);
            const host = peer?.host;
            if (host) host.style.pointerEvents = '';
            navigation.goBack();
          };
          if (still) {
            peer?.follow(1);
            return leave();
          }
          const ms = 200;
          peer?.settle(1, ms);
          run([timing(x, w, ms)], leave);
          return;
        }
        springHome();
      },
      onPanResponderTerminate: () => springHome(),
    }),
  ).current;

  function springHome() {
    const restore = drag.current.restore;
    const peer = peers.get(drag.current.below ?? '');
    if (live.current.reduce) {
      x.setValue(0);
      restore();
      return;
    }
    peer?.settle(0, 220);
    Animated.spring(x, { toValue: 0, stiffness: 400, damping: 34, mass: 1, useNativeDriver: false }).start(() => restore());
  }

  return (
    <View ref={outer} style={{ flex: 1, overflow: 'hidden' }} {...pan.panHandlers}>
      <Animated.View style={{ flex: 1, backgroundColor: C.bg, opacity, transform: [{ translateX: x }, { translateY: y }] }}>{children}</Animated.View>
    </View>
  );
}

/** `screenLayout` for a Stack: the web slides and edge swipe; nothing on phones. */
export const stackLayout = WEB ? (props: LayoutArgs) => <StackScreen {...props} /> : undefined;
/** Old name, kept for layouts that still import it. */
export const webFadeLayout = stackLayout;

/** Each tab navigator's tab as last drawn. */
const lastTab = new Map<string, number>();

function TabScreen({ route, navigation, children }: LayoutArgs) {
  const reduce = useReduceMotion();
  const s = navigation.getState();
  const i = indexOf(s, route.key);
  const top = s.index === i;
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    if (!top) return;
    const was = lastTab.get(s.key);
    lastTab.set(s.key, i);
    if (was === undefined || was === i || reduce) {
      x.setValue(0);
      opacity.setValue(1);
      return;
    }
    // From the right when moving right along the bar, from the left when moving left.
    x.setValue(i > was ? TAB_SHIFT : -TAB_SHIFT);
    opacity.setValue(TAB_FROM_OPACITY);
    const a = Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: TAB_MS, easing: OUT_QUART, useNativeDriver: !WEB }),
      Animated.timing(opacity, { toValue: 1, duration: TAB_MS, easing: OUT_QUART, useNativeDriver: !WEB }),
    ]);
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <Animated.View style={{ flex: 1, opacity, transform: [{ translateX: x }] }}>{children}</Animated.View>
    </View>
  );
}

/** `screenLayout` for the tab navigator: the 16px slide and fade, phones and web. */
export const tabLayout = (props: LayoutArgs) => <TabScreen {...props} />;

/** Options every stack shares: the push slides in from the right. */
export const PUSH = { animation: 'slide_from_right' } as const;
/** A task screen that opens like a sheet. */
export const SHEET = { animation: 'slide_from_bottom' } as const;
