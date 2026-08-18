import React, { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { colors, fs, MAX_FONT_SCALE_TIGHT, radius, s, spacing, type } from '@/theme';
import { Txt } from './Txt';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  secure?: boolean;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, secure, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);

  return (
    <View style={styles.wrap}>
      <Txt variant="caption" color={colors.textSoft} style={styles.label}>
        {label.toUpperCase()}
      </Txt>

      <View
        style={[
          styles.field,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={colors.faint}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}
          secureTextEntry={hidden}
          onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
          accessibilityLabel={label}
          {...rest}
        />

        {secure ? (
          <Pressable
            hitSlop={12}
            onPress={() => setHidden((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Txt variant="smallMed" color={colors.muted}>
              {hidden ? 'Show' : 'Hide'}
            </Txt>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Txt variant="small" color={colors.danger} style={styles.error}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xxs },
  label: { marginLeft: spacing.xxs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: s(54),
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  focused: { borderColor: colors.primaryBorder, backgroundColor: colors.surfaceAlt },
  errored: { borderColor: colors.danger },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: type.body.fontFamily,
    fontSize: fs(15),
    paddingVertical: spacing.sm,
  },
  error: { marginLeft: spacing.xxs },
});
