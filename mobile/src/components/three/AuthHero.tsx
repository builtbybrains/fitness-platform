/* The floating dumbbell above the sign-in and sign-up forms. 180px tall on
   most phones, 120px under 700px of screen height, and gone while the
   keyboard is up on a short screen so the fields and the button stay in
   view. On taller screens it stays but stops while the keyboard is up, so
   the one ambient loop in the app never runs while someone types. Drag
   sideways to spin it. Decorative. */

import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

import { Lazy3D } from './Lazy3D';
import { heroSize } from './pose';

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

export function AuthHero() {
  const { width, height } = useWindowDimensions();
  const keyboardUp = useKeyboardUp();
  const size = heroSize(height, keyboardUp);
  if (!size) return null;
  // The form column is at most 480 wide with 24 padding each side.
  const w = Math.min(width, 480) - 48;
  return <Lazy3D kind="dumbbell" motion="float" interactive paused={keyboardUp} width={w} height={size} />;
}
