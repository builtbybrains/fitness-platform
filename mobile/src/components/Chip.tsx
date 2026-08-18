import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, s, spacing } from '@/theme';
import { Txt } from './Txt';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Txt
        variant="smallMed"
        color={selected ? colors.primaryLight : colors.textSoft}
        maxFontSizeMultiplier={1.2}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: s(40),
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  selected: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  pressed: { opacity: 0.7 },
});
