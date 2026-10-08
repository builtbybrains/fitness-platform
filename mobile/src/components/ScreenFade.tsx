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
   - Swipe between tabs: drag a tab screen left for the next tab, right for
     the one before. The screen follows the finger and the neighbour's name
     slides in at the edge it uncovers; past the first or last tab it only
     gives a little and springs back. Let go past 28% of the width, or flick,
     and the screen slides out (180ms), the tab changes with a selection
     tick, and the new tab comes in from 48px out. Otherwise it springs home.
     The rules for when a drag is the pager's are in lib/tabPager.ts: a drag
     that starts on a swipe row (rightward), a 3D object, a text field or a
     NoTabSwipe area stays theirs, and nothing starts within 20px of either
     side of the screen.

   Reduce Motion: no slides or fades; the edge swipe still goes back, and a
   tab swipe still changes tab, without the screen following the finger. */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing, GestureResponderEvent, PanResponder, Platform, StyleProp, Text, useWindowDimensions, View, ViewStyle } from 'react-native';

import { C, FONT } from '../design';
import { haptic } from '../lib/haptics';
import { markTouch, neighbourIndex, PAGER_COMMIT, PAGER_TABS, pagerDecision, pagerIndex, pagerOffset, shouldClaimTab, touchStart } from '../lib/tabPager';
import { Icon } from './Icon';
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
type Nav = { getState: () => NavState; goBack: () => void; navigate?: (name: string) => void };
type LayoutArgs = {
  route: { key: string; name?: string };
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
/** Tab navigators whose next tab change came from a swipe, and which way
    the finger went (1: toward the next tab). */
const swiped = new Map<string, 1 | -1>();
/** A swiped-to tab comes in from further out than a tapped one. */
const SWIPE_SHIFT = 48;
const SWIPE_OUT_MS = 180;

/** A touch that starts on a text field never turns the page (web: the
    browser's own text selection and caret moves keep it). */
function startsOnEditable(e: GestureResponderEvent): boolean {
  if (!WEB || typeof Element === 'undefined') return false;
  const t = (e.nativeEvent as unknown as { target?: unknown }).target ?? (e as unknown as { target?: unknown }).target;
  return t instanceof Element && !!t.closest('input, textarea, select, [contenteditable="true"]');
}

/** Wrap an area whose sideways drags are its own (a text composer, a
    horizontal list): a swipe that starts inside it never changes tab. */
export function NoTabSwipe({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <View
      style={style}
      onStartShouldSetResponderCapture={() => {
        markTouch('exempt');
        return false;
      }}
    >
      {children}
    </View>
  );
}

function TabScreen({ route, navigation, children }: LayoutArgs) {
  const reduce = useReduceMotion();
  const { width } = useWindowDimensions();
  const s = navigation.getState();
  const i = indexOf(s, route.key);
  const top = s.index === i;
  const order = pagerIndex(route.name ?? '');
  const x = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  // The swipe: the whole screen follows the finger, a peek of the
  // neighbour's name waits in the strip it uncovers.
  const drag = useRef(new Animated.Value(0)).current;
  const [peek, setPeek] = useState<{ title: string; dir: 1 | -1 } | null>(null);

  const live = useRef({ width, reduce, order, top, navKey: s.key, startX: 0, dx: 0, dir: 0, busy: false, navigation });
  live.current = { ...live.current, width, reduce, order, top, navKey: s.key, navigation };

  // Phone browsers: no overscroll back/forward on a sideways drag; the
  // pager owns it (Android's own edge gesture is left alone by PAGER_EDGE).
  useEffect(() => {
    if (!WEB || typeof document === 'undefined') return;
    document.documentElement.style.overscrollBehaviorX = 'none';
    document.body.style.overscrollBehaviorX = 'none';
  }, []);

  useLayoutEffect(() => {
    if (!top) {
      // Left by a swipe: back in place for the next visit, while hidden.
      drag.setValue(0);
      live.current.busy = false;
      setPeek(null);
      return;
    }
    const was = lastTab.get(s.key);
    lastTab.set(s.key, i);
    const from = swiped.get(s.key);
    swiped.delete(s.key);
    if (was === undefined || was === i || reduce) {
      x.setValue(0);
      opacity.setValue(1);
      return;
    }
    // From the right when moving right along the bar, from the left when moving left.
    const shift = from ? SWIPE_SHIFT : TAB_SHIFT;
    x.setValue(i > was ? shift : -shift);
    opacity.setValue(TAB_FROM_OPACITY);
    const a = Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: TAB_MS, easing: OUT_QUART, useNativeDriver: !WEB }),
      Animated.timing(opacity, { toValue: 1, duration: TAB_MS, easing: OUT_QUART, useNativeDriver: !WEB }),
    ]);
    a.start();
    return () => a.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  const pan = useRef(
    PanResponder.create({
      // Outermost, so this runs first for every touch on the screen: note
      // where it started and clear what the views under it will mark.
      onStartShouldSetPanResponderCapture: (e) => {
        touchStart.owner = startsOnEditable(e) ? 'exempt' : null;
        live.current.startX = e.nativeEvent.pageX;
        live.current.dx = 0;
        return false;
      },
      // Bubble phase: a child that wants the drag (a swipe row, a 3D
      // object) is asked first and keeps it.
      onMoveShouldSetPanResponder: (e, g) => {
        const l = live.current;
        if (!l.top || l.order < 0 || l.busy || g.numberActiveTouches > 1) return false;
        return shouldClaimTab({ dx: e.nativeEvent.pageX - l.startX, dy: g.dy, startX: l.startX, width: l.width, owner: touchStart.owner });
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        drag.stopAnimation();
        live.current.dir = 0;
      },
      onPanResponderMove: (e) => {
        const l = live.current;
        const dx = e.nativeEvent.pageX - l.startX;
        l.dx = dx;
        const next = neighbourIndex(l.order, dx);
        const dir = next == null ? 0 : dx < 0 ? 1 : -1;
        if (dir !== l.dir) {
          l.dir = dir;
          setPeek(next == null ? null : { title: PAGER_TABS[next].title, dir: dir as 1 | -1 });
        }
        if (!l.reduce) drag.setValue(pagerOffset(dx, l.width, next != null));
      },
      onPanResponderRelease: (_e, g) => {
        const l = live.current;
        const next = neighbourIndex(l.order, l.dx);
        if (next != null && pagerDecision({ dx: l.dx, vx: g.vx, width: l.width, hasNeighbour: true }) === 'commit') {
          commit(next, l.dx < 0 ? 1 : -1);
        } else home();
      },
      onPanResponderTerminate: () => home(),
    }),
  ).current;

  function commit(next: number, dir: 1 | -1) {
    const l = live.current;
    l.busy = true;
    haptic.select();
    const go = () => {
      swiped.set(l.navKey, dir);
      l.navigation.navigate?.(PAGER_TABS[next].name);
    };
    if (l.reduce) return go();
    Animated.timing(drag, { toValue: -dir * l.width, duration: SWIPE_OUT_MS, easing: OUT_QUART, useNativeDriver: !WEB }).start(go);
  }

  function home() {
    const l = live.current;
    l.dir = 0;
    if (l.reduce) {
      drag.setValue(0);
      setPeek(null);
      return;
    }
    Animated.spring(drag, { toValue: 0, stiffness: 400, damping: 34, mass: 1, useNativeDriver: !WEB }).start(({ finished }) => {
      if (finished && live.current.dir === 0) setPeek(null);
    });
  }

  // The peek fades in and slides 24px toward the middle as the screen
  // moves; it is fully there at the commit point.
  const reach = Math.max(1, width * PAGER_COMMIT);
  const peekStyle =
    peek && !reduce
      ? {
          opacity: drag.interpolate({ inputRange: peek.dir === 1 ? [-reach, -12] : [12, reach], outputRange: peek.dir === 1 ? [1, 0] : [0, 1], extrapolate: 'clamp' }),
          transform: [
            {
              translateX: drag.interpolate({ inputRange: peek.dir === 1 ? [-reach, 0] : [0, reach], outputRange: peek.dir === 1 ? [0, 24] : [-24, 0], extrapolate: 'clamp' }),
            },
          ],
        }
      : null;
  // Web: vertical scrolling stays the browser's; sideways moves reach the pager.
  const webTouch = WEB ? ({ touchAction: 'pan-y' } as unknown as ViewStyle) : null;

  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, webTouch]} {...(order >= 0 ? pan.panHandlers : null)}>
      {peekStyle && peek ? (
        <Animated.View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            { pointerEvents: 'none', position: 'absolute', top: '42%', flexDirection: 'row', alignItems: 'center', gap: 4 },
            peek.dir === 1 ? { right: 20 } : { left: 20 },
            peekStyle,
          ]}
        >
          {peek.dir === -1 ? <Icon name="chevronLeft" size={18} color={C.muted} /> : null}
          <Text style={{ fontFamily: FONT.displaySemi, fontSize: 17, lineHeight: 22, color: C.stone }}>{peek.title}</Text>
          {peek.dir === 1 ? <Icon name="chevronRight" size={18} color={C.muted} /> : null}
        </Animated.View>
      ) : null}
      <Animated.View style={{ flex: 1, backgroundColor: C.bg, transform: [{ translateX: drag }] }}>
        <Animated.View style={{ flex: 1, opacity, transform: [{ translateX: x }] }}>{children}</Animated.View>
      </Animated.View>
    </View>
  );
}

/** `screenLayout` for the tab navigator: the slide and fade on a tab
    change, and the swipe between tabs, phones and web. */
export const tabLayout = (props: LayoutArgs) => <TabScreen {...props} />;

/** Options every stack shares: the push slides in from the right. */
export const PUSH = { animation: 'slide_from_right' } as const;
/** A task screen that opens like a sheet. */
export const SHEET = { animation: 'slide_from_bottom' } as const;
