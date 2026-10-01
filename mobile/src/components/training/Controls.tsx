/* Small controls shared by the Plan, Food and Activity screens: a
   segmented control, answer chips, a selectable row, a state block for
   loading, empty and error, and a macro line. */

import React from 'react';
import { ActivityIndicator, Pressable, Text, View, ViewStyle } from 'react-native';

import { C, FONT, R, T } from '../../design';
import { Icon, IconName } from '../Icon';
import { Button } from '../Button';
import { useReduceMotion } from '../motion';

/** One choice out of a few, side by side (radio group). The one segmented
    control in the app: the selected segment is raised Carbon with a white
    label, never a green fill. */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: V; label: string }[];
  value: V | null | undefined;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.pill, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={o.label}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 44,
              borderRadius: R.pill,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
              backgroundColor: on ? C.raised : pressed ? C.card : 'transparent',
              borderWidth: 1,
              borderColor: on ? C.lineStrong : 'transparent',
            })}
          >
            <Text style={{ fontFamily: on ? FONT.bodySemi : FONT.bodyMedium, fontSize: 14, lineHeight: 18, textAlign: 'center', color: on ? C.text : C.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tap answer or quick choice, the one chip style in the app: selected
    chips get the green tint, a green border and green text. `multi` chips
    (pick several) are checkboxes and show a check when on; the rest are
    radios, or plain buttons when `selected` is left out. */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
  multi,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  multi?: boolean;
}) {
  const reduce = useReduceMotion();
  const role = selected === undefined ? 'button' : multi ? 'checkbox' : 'radio';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      aria-checked={selected === undefined ? undefined : selected}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        paddingHorizontal: 16,
        borderRadius: R.pill,
        borderWidth: 1,
        borderColor: selected ? C.greenBorder : C.lineStrong,
        backgroundColor: selected ? C.greenTint : pressed ? C.raised : 'transparent',
        transform: [{ scale: pressed && !reduce ? 0.97 : 1 }],
      })}
    >
      {multi && selected ? <Icon name="check" size={16} color={C.green} strokeWidth={2.6} /> : null}
      <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, color: selected ? C.green : C.text }}>{label}</Text>
    </Pressable>
  );
}

/** A full-width choice row (radio) with a title, detail and a check. */
export function ChoiceRow({
  title,
  detail,
  selected,
  disabled,
  onPress,
  right,
  accessibilityLabel,
}: {
  title: string;
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  right?: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel ?? (detail ? `${title}. ${detail}` : title)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 60,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: R.tile,
        backgroundColor: selected ? C.greenTint : pressed ? C.raised : C.surface,
        borderWidth: 1,
        borderColor: selected ? C.greenBorder : 'transparent',
        opacity: disabled ? 0.45 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.bodyStrong}>{title}</Text>
        {detail ? <Text style={T.meta}>{detail}</Text> : null}
      </View>
      {right ?? (selected ? <Icon name="check" size={20} color={C.green} strokeWidth={2.6} /> : null)}
    </Pressable>
  );
}

/** Loading, empty and error blocks, designed instead of defaulted. */
export function StateBlock({
  kind,
  title,
  body,
  icon,
  action,
  style,
}: {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  body?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' };
  style?: ViewStyle;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[{ alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 12 }, style]}
    >
      {kind === 'loading' ? (
        <ActivityIndicator color={C.green} />
      ) : (
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon ?? (kind === 'error' ? 'refresh' : 'plus')} size={26} color={kind === 'error' ? C.warn : C.stone} />
        </View>
      )}
      <View style={{ gap: 4, alignItems: 'center' }}>
        <Text style={[kind === 'loading' ? T.meta : T.h3, { textAlign: 'center' }]}>{title}</Text>
        {body ? <Text style={[T.meta, { textAlign: 'center', maxWidth: 320 }]}>{body}</Text> : null}
      </View>
      {action ? <Button compact variant={action.variant ?? 'secondary'} label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

/** "520 kcal · 30 P · 44 C · 22 F" with the units spelled out for screen readers. */
export function macroText(m: { kcal: number; protein: number; carbs?: number; fat?: number }): string {
  return `${Math.round(m.kcal)} kcal · ${Math.round(m.protein)}g protein · ${Math.round(m.carbs ?? 0)}g carbs · ${Math.round(m.fat ?? 0)}g fat`;
}

export function MacroLine({ m, strong }: { m: { kcal: number; protein: number; carbs?: number; fat?: number }; strong?: boolean }) {
  return (
    <Text style={[T.small, strong ? { color: C.stone } : null]} accessibilityLabel={macroText(m)}>
      <Text style={{ fontFamily: FONT.displaySemi, color: strong ? C.text : C.stone }}>{Math.round(m.kcal)}</Text> kcal · P {Math.round(m.protein)}g · C {Math.round(m.carbs ?? 0)}g · F {Math.round(m.fat ?? 0)}g
    </Text>
  );
}

/** A labelled meter with its target: "Protein 96 / 140 g". */
export function Meter({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const frac = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ flex: 1, gap: 6 }} accessible accessibilityLabel={`${label}: ${Math.round(value)} of ${Math.round(target)} ${unit === 'g' ? 'grams' : unit}`}>
      <Text style={T.small}>{label}</Text>
      <Text style={{ fontFamily: FONT.displaySemi, fontSize: 16, color: C.text }}>
        {Math.round(value)}
        <Text style={{ fontFamily: FONT.body, fontSize: 13, color: C.muted }}>
          /{Math.round(target)}
          {unit}
        </Text>
      </Text>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.raised, overflow: 'hidden' }}>
        <View style={{ height: 4, width: `${frac * 100}%`, backgroundColor: C.stone, borderRadius: 2 }} />
      </View>
    </View>
  );
}
