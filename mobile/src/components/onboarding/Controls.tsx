/* Questionnaire controls, built on the BUILT tokens: a list of options with
   plain descriptions, chips (the shared training Chip), a number stepper,
   a weekday picker and a check row. Single choices in a row use the shared
   training Segmented. Every target is 44px or more, every control says
   what it is to screen readers. */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { C, FONT, R, T } from '../../design';
import { CheckBox } from '../Bits';
import { Icon } from '../Icon';
import { useReduceMotion } from '../motion';
import { Chip } from '../training/Controls';
import { DAY_LONG, DAY_SHORT, WEEK_ORDER, type Option } from './options';

/** A small label above a group of controls. */
export function GroupLabel({ children, nativeID }: { children: React.ReactNode; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} style={{ fontFamily: FONT.bodySemi, fontSize: 15, lineHeight: 20, color: C.stone }}>
      {children}
    </Text>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: on ? C.green : C.inputBorder,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.green }} /> : null}
    </View>
  );
}

/** Single choice from a short list, each with a plain description. */
export function OptionList<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<T>[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  label: string;
}) {
  const reduce = useReduceMotion();
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <Pressable
            key={String(o.id)}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on }}
            aria-checked={on}
            accessibilityLabel={o.detail ? `${o.label}. ${o.detail}` : o.label}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              minHeight: 56,
              paddingVertical: 14,
              paddingHorizontal: 16,
              borderRadius: R.tile,
              borderWidth: 1,
              borderColor: on ? C.greenBorder : 'transparent',
              backgroundColor: on ? C.greenTint : pressed ? C.raised : C.card,
              transform: [{ scale: pressed && !reduce ? 0.99 : 1 }],
            })}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.bodyStrong}>{o.label}</Text>
              {o.detail ? <Text style={T.meta}>{o.detail}</Text> : null}
            </View>
            <Radio on={on} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chips that wrap: pick several, or one with `single`. Uses the app's one
    chip style (training/Controls Chip). */
export function ChipGroup<T extends string | number>({
  options,
  values,
  onChange,
  label,
  single,
}: {
  options: readonly Option<T>[];
  values: readonly T[];
  onChange: (v: T[]) => void;
  label: string;
  single?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole={single ? 'radiogroup' : undefined} accessibilityLabel={label}>
      {options.map((o) => {
        const on = values.includes(o.id);
        return (
          <Chip
            key={String(o.id)}
            label={o.label}
            selected={on}
            multi={!single}
            onPress={() => onChange(single ? [o.id] : on ? values.filter((v) => v !== o.id) : [...values, o.id])}
          />
        );
      })}
    </View>
  );
}

/** A number with minus and plus buttons. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  unit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  label: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 10) / 10)));
  const btn = (icon: 'minus' | 'plus', delta: number, disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => set(value + delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? C.pressed : C.raised,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Icon name={icon} size={24} color={C.text} />
    </Pressable>
  );
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: R.card, padding: 12 }}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: `${value} ${unit}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
    >
      {btn('minus', -step, value <= min, `Less, ${label}`)}
      <View style={{ alignItems: 'center' }}>
        <Text style={T.number}>{value}</Text>
        <Text style={T.small}>{unit}</Text>
      </View>
      {btn('plus', step, value >= max, `More, ${label}`)}
    </View>
  );
}

/** Seven day toggles, Monday first. Values use 0 = Sunday. Training days
    get the green tint (never a solid fill), like the selected chips. */
export function DayPicker({ value, onChange }: { value: readonly number[]; onChange: (v: number[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, marginHorizontal: -6 }} accessibilityLabel="Training days">
      {WEEK_ORDER.map((d) => {
        const on = value.includes(d);
        return (
          <Pressable
            key={d}
            onPress={() => onChange(on ? value.filter((x) => x !== d) : [...value, d])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={`${DAY_LONG[d]}, ${on ? 'training' : 'rest'}`}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 44,
              minHeight: 64,
              borderRadius: R.tile,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              borderWidth: 1,
              borderColor: on ? C.greenBorder : C.lineStrong,
              backgroundColor: pressed ? C.raised : on ? C.greenTint : C.card,
            })}
          >
            <Text style={{ fontFamily: FONT.displaySemi, fontSize: 13, color: on ? C.text : C.stone }}>{DAY_SHORT[d]}</Text>
            <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 12, color: on ? C.green : C.muted }}>{on ? 'Train' : 'Rest'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable row with a check box and wrapping text. */
export function CheckRow({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 14,
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: R.tile,
        borderWidth: 1,
        borderColor: checked ? C.greenBorder : C.lineStrong,
        backgroundColor: checked ? C.greenTint : pressed ? C.surface : 'transparent',
      })}
    >
      <CheckBox checked={checked} />
      <Text style={{ flex: 1, fontFamily: FONT.body, fontSize: 15, lineHeight: 22, color: C.stone }}>{label}</Text>
    </Pressable>
  );
}

/** A warning or caution line (amber), for safe-pace and doctor notes. */
export function Caution({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ gap: 12, padding: 16, borderRadius: R.tile, backgroundColor: 'rgba(255,197,61,0.10)', borderWidth: 1, borderColor: 'rgba(255,197,61,0.35)' }}
    >
      <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, lineHeight: 22, color: C.warn }}>{children}</Text>
      {action}
    </View>
  );
}
