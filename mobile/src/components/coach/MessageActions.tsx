/* What a long press on a message offers, in a small sheet:
   - a coach reply: Copy, and Regenerate on the latest reply (asks again
     with the message before it and replaces the answer);
   - your message: Copy, and Edit and resend on your latest message (puts
     the text back in the composer and takes that turn off the screen).
   Copy uses the browser clipboard on the web; where there is none (and no
   clipboard module in the app) it isn't offered. A short "Copied" toast
   confirms it. */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';

import { C, FONT, R, T } from '../../design';
import { haptic } from '../../lib/haptics';
import { previewOf } from '../../lib/coachThreads';
import { parseRichText, plainText } from '../../lib/richText';
import { useReduceMotion } from '../motion';
import { Sheet } from '../training/Sheet';
import { CoachIcon, type CoachIconName } from './icons';
import type { Msg } from './Message';

type Clip = { writeText: (t: string) => Promise<void> };

function webClipboard(): Clip | null {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return null;
  const c = (navigator as unknown as { clipboard?: Clip }).clipboard;
  return c && typeof c.writeText === 'function' ? c : null;
}

/** True when this device can copy text. */
export function canCopy(): boolean {
  return !!webClipboard();
}

export async function copyText(text: string): Promise<boolean> {
  const c = webClipboard();
  if (!c) return false;
  try {
    await c.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type MessageAction = 'copy' | 'regenerate' | 'edit';

/** The actions a message offers right now. */
export function actionsFor(m: Msg, p: { isLastCoach: boolean; isLastUser: boolean; busy: boolean; copy: boolean }): MessageAction[] {
  const out: MessageAction[] = [];
  if (p.copy) out.push('copy');
  if (m.ephemeral || p.busy) return out;
  if (m.role === 'coach' && p.isLastCoach) out.push('regenerate');
  if (m.role === 'user' && p.isLastUser) out.push('edit');
  return out;
}

const ROWS: Record<MessageAction, { icon: CoachIconName; label: string; hint: string }> = {
  copy: { icon: 'copy', label: 'Copy', hint: 'Copies the message text' },
  regenerate: { icon: 'redo', label: 'Regenerate', hint: 'Asks your coach again and replaces this reply' },
  edit: { icon: 'edit', label: 'Edit and resend', hint: 'Puts your message back in the box to change it' },
};

export function MessageActionsSheet({ msg, actions, onClose, onAction }: { msg: Msg | null; actions: readonly MessageAction[]; onClose: () => void; onAction: (a: MessageAction, m: Msg) => void }) {
  return (
    <Sheet visible={!!msg} onClose={onClose} title={msg?.role === 'user' ? 'Your message' : 'Coach reply'} subtitle={msg ? previewOf(msg.body, 90) : undefined}>
      <View accessibilityRole="menu" style={{ gap: 6 }}>
        {actions.map((a) => (
          <Pressable
            key={a}
            onPress={() => {
              haptic.select();
              if (msg) onAction(a, msg);
            }}
            accessibilityRole="menuitem"
            accessibilityLabel={ROWS[a].label}
            accessibilityHint={ROWS[a].hint}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 12, borderRadius: R.tile, backgroundColor: pressed ? C.raised : 'transparent' })}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
              <CoachIcon name={ROWS[a].icon} size={20} color={C.text} />
            </View>
            <Text style={T.bodyStrong}>{ROWS[a].label}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

/** The text Copy puts on the clipboard: the reply without markdown marks. */
export function copyableText(m: Msg): string {
  return m.role === 'coach' ? plainText(parseRichText(m.body)) : m.body;
}

/** A short confirmation over the composer ("Copied"): fades in, holds,
    fades out (Reduce Motion: appears and goes). */
export function Toast({ text, onDone }: { text: string | null; onDone: () => void }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!text) return;
    if (reduce) {
      t.setValue(1);
      const id = setTimeout(() => done.current(), 1600);
      return () => clearTimeout(id);
    }
    t.setValue(0);
    const a = Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: 180, easing: Easing.out(Easing.poly(4)), useNativeDriver: Platform.OS !== 'web' }),
      Animated.delay(1300),
      Animated.timing(t, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    ]);
    a.start(({ finished }) => finished && done.current());
    return () => a.stop();
  }, [text, reduce, t]);
  if (!text) return null;
  return (
    <View style={{ pointerEvents: 'none', position: 'absolute', left: 0, right: 0, bottom: '100%', alignItems: 'center', paddingBottom: 10 }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          height: 40,
          borderRadius: R.pill,
          backgroundColor: C.raised,
          opacity: t,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        }}
      >
        <CoachIcon name="copy" size={16} color={C.stone} />
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 14, color: C.text }}>{text}</Text>
      </Animated.View>
    </View>
  );
}
