import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accent?: boolean;
}

export function Card({ children, style, padded = true, accent }: Props) {
  return (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        accent && styles.accent,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: { padding: spacing.md },
  accent: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
});
