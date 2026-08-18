import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, s, spacing } from '@/theme';
import { Icon, IconName } from './Icon';
import { Txt } from './Txt';

interface Props {
  icon?: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
}

export function ListRow({ icon, label, value, onPress, right, danger, last }: Props) {
  const tint = danger ? colors.danger : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      style={({ pressed }) => [
        styles.row,
        !last && styles.divider,
        pressed && onPress ? styles.pressed : null,
      ]}
    >
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon name={icon} size={18} color={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}

      <Txt variant="bodyMed" color={tint} style={styles.label} numberOfLines={1}>
        {label}
      </Txt>

      {value ? (
        <Txt variant="small" color={colors.muted} numberOfLines={1} style={styles.value}>
          {value}
        </Txt>
      ) : null}

      {right ?? (onPress ? <Icon name="chevron" size={16} color={colors.faint} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: s(56),
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.surfacePressed },
  iconWrap: {
    width: s(34),
    height: s(34),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  label: { flex: 1 },
  value: { maxWidth: '45%', textAlign: 'right' },
});
