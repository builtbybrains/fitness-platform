/* Small shared pieces: screen header, check box, progress bar, notice. */

import React from 'react';
import { Text, View, ViewStyle } from 'react-native';

import { C, FONT, R, T } from '../design';
import { Icon } from './Icon';
import { useTween } from './motion';

export function ScreenHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={T.h1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={T.meta}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Visual check box. Put accessibilityRole="checkbox" and
    accessibilityState={{ checked }} on the row that toggles it. Checked is
    a green ring and tick on the tint, not a solid fill, so a list of ticked
    rows doesn't flood the screen with green. */
export function CheckBox({ checked, size = 26 }: { checked: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: checked ? C.green : C.inputBorder,
        backgroundColor: checked ? C.greenTint : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Icon name="check" size={size * 0.62} color={C.green} strokeWidth={2.8} /> : null}
    </View>
  );
}

/** A thin progress bar. Green by default; pass `color` (Stone) where the
    screen already has its green moment (Today's ring, a play button). */
export function ProgressBar({ value, height = 6, style, color = C.green }: { value: number; height?: number; style?: ViewStyle; color?: string }) {
  const v = useTween(Math.max(0, Math.min(1, value)));
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: C.raised, overflow: 'hidden' }, style]}>
      <View style={{ height, width: `${v * 100}%`, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

/** An inline message: error (danger), warn (amber, for "can't reach
    BUILT"), success, or a quiet note. An optional action sits under the
    text (e.g. Try again). */
export function Notice({
  tone = 'note',
  children,
  action,
}: {
  tone?: 'error' | 'warn' | 'note' | 'success';
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const color = tone === 'error' ? C.danger : tone === 'warn' ? C.warn : tone === 'success' ? C.green : C.muted;
  const bg = tone === 'error' ? 'rgba(255,90,78,0.10)' : tone === 'warn' ? 'rgba(255,197,61,0.10)' : tone === 'success' ? C.greenTint : C.surface;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        gap: 10,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: R.input,
        backgroundColor: bg,
        borderWidth: tone === 'warn' ? 1 : 0,
        borderColor: 'rgba(255,197,61,0.35)',
      }}
    >
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 7 }} />
        <Text style={{ flex: 1, fontFamily: FONT.bodyMedium, fontSize: 14, lineHeight: 20, color: tone === 'note' ? C.stone : color }}>{children}</Text>
      </View>
      {action ? <View style={{ paddingLeft: 16 }}>{action}</View> : null}
    </View>
  );
}
