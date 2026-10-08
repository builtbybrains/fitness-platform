/* Ask chips: the starters on an empty chat and the follow-ups under the
   latest reply. Outline pills on the ground; the border turns green only
   while pressed. Tapping one sends it. They sit in a NoTabSwipe area so a
   sideways drag across them never changes tab. */

import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { C, FONT, R } from '../../design';
import { haptic } from '../../lib/haptics';
import { useReduceMotion } from '../motion';
import { NoTabSwipe } from '../ScreenFade';

export function AskChip({ text, onPress, disabled }: { text: string; onPress: (text: string) => void; disabled?: boolean }) {
  const reduce = useReduceMotion();
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress(text);
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Ask: ${text}`}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        alignSelf: 'flex-start',
        maxWidth: '100%',
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: R.pill,
        borderWidth: 1,
        borderColor: pressed ? C.green : C.lineStrong,
        backgroundColor: pressed ? C.card : 'transparent',
        opacity: disabled ? 0.45 : 1,
        transform: [{ scale: pressed && !reduce ? 0.97 : 1 }],
      })}
    >
      <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, lineHeight: 20, color: C.text }}>{text}</Text>
    </Pressable>
  );
}

/** A column of chips, indented to line up with the coach's bubbles. */
export function AskChips({ items, onPick, label, disabled }: { items: readonly string[]; onPick: (text: string) => void; label: string; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <NoTabSwipe>
      <View accessibilityRole="list" accessibilityLabel={label} style={{ gap: 8, paddingLeft: 46 }}>
        {items.map((s) => (
          <AskChip key={s} text={s} onPress={onPick} disabled={disabled} />
        ))}
      </View>
    </NoTabSwipe>
  );
}
