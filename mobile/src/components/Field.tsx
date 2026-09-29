/* Labelled text input: Carbon fill, a visible border (3:1 or better), 48px
   tall. The label sits above; the placeholder is only ever a hint. */

import React, { useState } from 'react';
import { Platform, Text, TextInput, TextInputProps, View } from 'react-native';

import { C, FONT, R } from '../design';

type Props = TextInputProps & { label?: string; hint?: string; error?: boolean };

export function Field({ label, hint, error, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {label ? <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, color: C.stone }}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.faint}
        accessibilityLabel={rest.accessibilityLabel ?? label}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          {
            minHeight: 48,
            color: C.text,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: error ? C.danger : focused ? C.green : C.inputBorder,
            borderRadius: R.input,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: 16,
            fontFamily: FONT.body,
          },
          // Focus shows as a green border; drop the browser's second outline.
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
          style,
        ]}
        {...rest}
      />
      {hint ? <Text style={{ fontFamily: FONT.body, fontSize: 13, lineHeight: 18, color: C.muted }}>{hint}</Text> : null}
    </View>
  );
}
