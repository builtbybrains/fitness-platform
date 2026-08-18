import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Card, FadeIn, Header, Screen, Txt } from '@/components';
import { useStore } from '@/state/store';
import { colors, radius, s, spacing } from '@/theme';

const TIMES = Array.from({ length: 24 * 2 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

export default function Reminders() {
  const reminders = useStore((s) => s.reminders);
  const toggle = useStore((s) => s.toggleReminder);
  const setTime = useStore((s) => s.setReminderTime);
  const [editing, setEditing] = useState<string | null>(null);

  const active = reminders.filter((r) => r.enabled).length;

  return (
    <Screen contentStyle={styles.content}>
      <Header title="Reminders" subtitle={`${active} of ${reminders.length} turned on`} back />

      <FadeIn>
        <Card padded={false}>
          {reminders.map((r, i) => (
            <View
              key={r.id}
              style={[styles.row, i < reminders.length - 1 && styles.divider]}
            >
              <View style={styles.flex}>
                <Txt variant="bodyMed" numberOfLines={1}>
                  {r.label}
                </Txt>
                <Txt variant="small" color={colors.muted} numberOfLines={1}>
                  {r.detail}
                </Txt>
              </View>

              <Pressable
                onPress={() => setEditing(r.id)}
                disabled={!r.enabled}
                accessibilityRole="button"
                accessibilityLabel={`${r.label} time, ${r.time}`}
                style={({ pressed }) => [
                  styles.timeChip,
                  !r.enabled && styles.timeDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <Txt variant="smallMed" color={r.enabled ? colors.primaryLight : colors.faint}>
                  {r.time}
                </Txt>
              </Pressable>

              <Switch
                value={r.enabled}
                onValueChange={() => toggle(r.id)}
                trackColor={{ false: colors.surfaceAlt, true: colors.primaryDeep }}
                thumbColor={Platform.OS === 'android' ? (r.enabled ? colors.primaryLight : colors.muted) : undefined}
                ios_backgroundColor={colors.surfaceAlt}
                accessibilityLabel={`${r.label} reminder`}
              />
            </View>
          ))}
        </Card>
      </FadeIn>

      <FadeIn delay={80}>
        <Txt variant="small" color={colors.muted} style={styles.note}>
          Reminders are context aware. If you have already logged a meal, you will not be reminded
          about it.
        </Txt>
      </FadeIn>

      <Modal
        visible={!!editing}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.grabber} />
            <Txt variant="h3" center style={styles.sheetTitle}>
              Choose a time
            </Txt>
            <ScrollView style={styles.times} showsVerticalScrollIndicator={false}>
              {TIMES.map((t) => {
                const current = reminders.find((r) => r.id === editing)?.time === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => {
                      if (editing) setTime(editing, t);
                      setEditing(null);
                    }}
                    style={({ pressed }) => [styles.timeRow, current && styles.timeRowActive, pressed && styles.pressed]}
                  >
                    <Txt variant="bodyMed" color={current ? colors.primaryLight : colors.text}>
                      {t}
                    </Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.md },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    minHeight: s(64),
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  timeChip: {
    minWidth: s(58),
    minHeight: s(36),
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  timeDisabled: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  pressed: { opacity: 0.7 },
  note: { paddingHorizontal: spacing.xxs },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
    maxHeight: '70%',
  },
  grabber: {
    width: s(38),
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  sheetTitle: { paddingVertical: spacing.md },
  times: { paddingHorizontal: spacing.lg },
  timeRow: {
    minHeight: s(48),
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  timeRowActive: { backgroundColor: colors.primarySoft },
});
