/* Small shared pieces: screen header, check box, progress bar, notice. */

import React from 'react';
import { Text, View, ViewStyle, useWindowDimensions } from 'react-native';

import { C, FONT, R, T } from '../design';
import { Icon } from './Icon';
import { useTween } from './motion';
import type { HeaderStat } from '../lib/headerStats';

/** A screen's title block. Plain by default (Coach, Profile). Plan and Food
    add a date eyebrow tracked wide like the BUILD YOUR BEST. tagline, a
    phrase in Built Green after the title (Today's greeting pattern) and up
    to three quiet stat chips. The richer title steps down a size under
    380px wide so it stays on one line. No motion: it is simply there. */
export function ScreenHeader({
  title,
  subtitle,
  right,
  eyebrow,
  accent,
  stats,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  eyebrow?: string;
  accent?: string;
  stats?: readonly HeaderStat[];
}) {
  const { width } = useWindowDimensions();
  const rich = !!(eyebrow || accent);
  const size = width < 380 ? 24 : 28;
  const chips = (stats ?? []).slice(0, 3);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        {eyebrow ? (
          <Text numberOfLines={1} style={{ fontFamily: FONT.display, fontSize: 12, lineHeight: 16, letterSpacing: 2.6, color: C.muted }}>
            {eyebrow}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={rich ? [T.h1, { fontSize: size, lineHeight: Math.round(size * 1.22) }] : T.h1} accessibilityRole="header">
              {title}
              {accent ? (
                <>
                  {' '}
                  <Text style={{ color: C.green }}>{accent}</Text>
                </>
              ) : null}
            </Text>
            {subtitle ? <Text style={T.meta}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </View>
      {chips.length ? (
        <View accessible accessibilityLabel={chips.map((s) => s.label ?? s.text).join('. ')} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((s) => (
            <View
              key={`${s.icon}-${s.text}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, maxWidth: '100%', paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: C.card }}
            >
              <Icon name={s.icon} size={16} color={C.stone} />
              <Text numberOfLines={1} style={[T.small, { flexShrink: 1, color: C.stone }]}>
                {s.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
