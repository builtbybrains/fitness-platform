import React from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';
import { colors, MAX_FONT_SCALE, type } from '@/theme';

type Variant = keyof typeof type;

export interface TxtProps extends TextProps {
  variant?: Variant;
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * Every piece of text in the app goes through here so nothing can escape the
 * type scale, and so accessibility font scaling is capped consistently instead
 * of bursting card layouts apart at 200%.
 */
export function Txt({
  variant = 'body',
  color = colors.text,
  center,
  style,
  maxFontSizeMultiplier = MAX_FONT_SCALE,
  ...rest
}: TxtProps) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[type[variant], { color }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}
