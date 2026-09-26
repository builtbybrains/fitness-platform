/* Global workout-completion celebration. Any screen can trigger it; the
   overlay renders above everything and optionally calls onDone when it
   closes (used to navigate back to the Plan tab). Tap to dismiss early. */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, Text, Vibration, View } from 'react-native';

import { C } from './design';

export type CelebrationOpts = {
  done: number;
  total: number;
  focus: string;
  caption?: string;
  onDone?: () => void;
};

const Ctx = createContext<{ show: (o: CelebrationOpts) => void } | null>(null);

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
      Vibration.vibrate([0, 120, 80, 120]);
      optsRef.current = o;
      setOpts(o);
      timer.current = setTimeout(dismiss, 1900);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show }), [show]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {opts ? (
        <Pressable
          onPress={dismiss}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: 'rgba(5,7,10,0.96)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 32,
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              borderWidth: 2,
              borderColor: C.mint,
              backgroundColor: C.mintDim,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 6,
            }}
          >
            <Text style={{ color: C.mint, fontSize: 38, fontWeight: '800' }}>✓</Text>
          </View>
          <Text style={{ color: C.text, fontSize: 24, fontWeight: '800' }}>Workout complete</Text>
          <Text style={{ color: C.mint, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
            {opts.done}/{opts.total} sets · {opts.focus}
          </Text>
          <Text style={{ color: C.muted, fontSize: 13, textAlign: 'center' }}>
            {opts.caption ?? 'Tap to continue'}
          </Text>
        </Pressable>
      ) : null}
    </Ctx.Provider>
  );
}

export function useCelebration() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCelebration must be used inside <CelebrationProvider>');
  return ctx;
}
