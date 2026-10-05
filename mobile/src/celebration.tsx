/* Global celebration: a finished workout, or (variant 'milestone') a
   milestone earned on the Progress tab. Any screen can trigger it; the
   overlay renders above everything and optionally calls onDone when it
   closes (used to navigate back to the Plan tab). Tap to dismiss early.
   It fades and settles in over 300ms; with Reduce Motion it just appears.
   Native gets a success haptic; no confetti, no sound. */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';

import { C, FONT, T } from './design';
import { Icon, type IconName } from './components/Icon';
import { useReduceMotion } from './components/motion';
import { haptic } from './lib/haptics';

export type CelebrationOpts =
  | {
      variant?: 'workout';
      done: number;
      total: number;
      focus: string;
      caption?: string;
      onDone?: () => void;
    }
  | {
      variant: 'milestone';
      /** The milestone's title ("Streak of 7"). */
      title: string;
      /** One line under it. */
      detail: string;
      /** The badge's own icon; the medal when not given. */
      icon?: IconName;
      caption?: string;
      onDone?: () => void;
    };

const Ctx = createContext<{ show: (o: CelebrationOpts) => void } | null>(null);

function Overlay({ opts, onPress }: { opts: CelebrationOpts; onPress: () => void }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(reduce ? 1 : 0)).current;

  useEffect(() => {
    if (reduce) {
      t.setValue(1);
      return;
    }
    Animated.timing(t, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.poly(4)),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [reduce, t]);

  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const milestone = opts.variant === 'milestone';
  const heading = milestone ? opts.title : 'Workout complete';
  const line = milestone ? 'New milestone' : `${opts.done}/${opts.total} sets · ${opts.focus}`;
  const spoken = milestone ? `New milestone: ${opts.title}. ${opts.detail}` : `Workout complete. ${opts.done} of ${opts.total} sets. ${opts.focus}.`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${spoken} Tap to continue.`}
      style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
    >
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(8,8,8,0.97)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 32,
          opacity: t,
        }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: C.green,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <Icon name={milestone ? (opts.icon ?? 'medal') : 'check'} size={52} color={C.onGreen} strokeWidth={milestone ? 2.2 : 2.6} />
          </View>
          <Text style={[T.hero, { textAlign: 'center' }]}>{heading}</Text>
          <Text style={{ fontFamily: FONT.displayMedium, fontSize: 16, color: C.green, textAlign: 'center' }}>{line}</Text>
          {milestone ? <Text style={[T.body, { color: C.stone, textAlign: 'center', maxWidth: 320 }]}>{opts.detail}</Text> : null}
          <Text style={[T.meta, { textAlign: 'center' }]}>{opts.caption ?? 'Tap to continue'}</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<CelebrationOpts | null>(null);
  const optsRef = useRef<CelebrationOpts | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const o = optsRef.current;
    optsRef.current = null;
    setOpts(null);
    o?.onDone?.();
  }, []);

  const show = useCallback(
    (o: CelebrationOpts) => {
      if (timer.current) clearTimeout(timer.current);
      haptic.success();
      optsRef.current = o;
      setOpts(o);
      timer.current = setTimeout(dismiss, 2200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {opts ? <Overlay opts={opts} onPress={dismiss} /> : null}
    </Ctx.Provider>
  );
}

export function useCelebration() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCelebration must be used inside <CelebrationProvider>');
  return ctx;
}
