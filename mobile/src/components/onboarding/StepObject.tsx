/* The 3D object above each questionnaire screen (see objects.ts for which
   one). When the topic changes, the current object shrinks and spins away
   in 250ms and the next one spins in over 300ms; within a topic it stays
   put. Still between changes, never a loop.

   120px tall, 88px on phones under 700px tall, where it also steps aside
   while the keyboard is up so the field stays in view. Decorative. Under
   Reduce Motion, without WebGL, or if the 3D cannot load, `fallback`
   shows (nothing by default). */

import React, { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

import { Lazy3DScene } from '../three/Lazy3D';
import { useCan3D } from '../three/support';
import { objectForScreen } from './objects';

function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}

export function StepObject({ screen, fallback = null }: { screen: string; fallback?: React.ReactNode }) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
  const { height } = useWindowDimensions();
  const keyboardUp = useKeyboardUp();
  const short = height < 700;
  if (!can3D || failed) return <>{fallback}</>;
  if (short && keyboardUp) return null;
  const size = short ? 88 : 120;
  return (
    <Lazy3DScene
      kind="object"
      params={{ kind: objectForScreen(screen) }}
      width={Math.round(size * 1.4)}
      height={size}
      onFail={() => setFailed(true)}
    />
  );
}
