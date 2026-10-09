/* One BUILT object image (see images.ts), fitted inside its box without
   cropping. Decorative everywhere it appears: the words beside it carry
   the meaning, so it is hidden from screen readers. Pass Animated values
   in `style` to move it. */

import React from 'react';
import { Animated, type ImageStyle, type StyleProp } from 'react-native';

import { OBJECT_IMAGES, type ObjectImageName } from './images';

type Props = {
  name: ObjectImageName;
  width: number;
  height: number;
  style?: StyleProp<Animated.WithAnimatedValue<ImageStyle>>;
};

export function ObjectImage({ name, width, height, style }: Props) {
  return (
    <Animated.Image
      source={OBJECT_IMAGES[name]}
      resizeMode="contain"
      // pointerEvents is a View style; Image honours it on web, where it matters.
      style={[{ width, height, pointerEvents: 'none' } as ImageStyle, style]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
