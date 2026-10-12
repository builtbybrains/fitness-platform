/* One chat message, and the motion around messages.

   - Coach replies: the B mark as avatar, the reply as safe rich text
     (RichText), the built-in tip's reason above it, what it remembered and
     the "Update my plan" flow under it.
   - A NEW coach reply types itself out word by word over 0.6 to 1.2s
     (scaled by length). Tapping the bubble finishes it at once; Reduce
     Motion shows it whole. A screen reader gets the full text straight
     away (the bubble's label).
   - Long press (or the screen reader's long-press action) opens the
     message actions.
   - BubbleIn: a new message springs up from its own side. TypingDots: three
     dots rise in turn while the coach is replying. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, FONT, R, T } from '../../design';
import { BuiltMark } from '../BuiltLogo';
import { Button } from '../Button';
import { Notice } from '../Bits';
import { useReduceMotion } from '../motion';
import { haptic } from '../../lib/haptics';
import { ChangeSummary, NeedsAccount } from '../training/PlanChange';
import { countWords, parseRichText, plainText, typewriterMs, wordsShown } from '../../lib/richText';
import type { PlanChangeResult } from '../../planStore';
import type { MemoryFact } from '../../types';
import { RichText } from './RichText';

export type Msg = {
  id: string;
  /** The coach_messages row id, for messages read from the server. */
  rowId?: string;
  role: 'user' | 'coach';
  body: string;
  /** When it was sent or stored (paging cursor, local trims). */
  createdAt: string;
  note?: string;
  suggest?: string | null;
  remembered?: MemoryFact[];
  suggestions?: string[];
  change?: { state: 'busy' } | { state: 'done'; result: PlanChangeResult };
  /** Added in this visit (sent, answered): springs in. History stays still. */
  fresh?: boolean;
  /** A new coach reply still typing itself out. */
  reveal?: boolean;
  /** Shown on this screen only, never saved (the note from Today). */
  ephemeral?: boolean;
};

const NATIVE = Platform.OS !== 'web';

export function CoachAvatar() {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
      <BuiltMark size={16} />
    </View>
  );
}

export function CoachBubble({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', maxWidth: '94%' }}>
      <CoachAvatar />
      <View style={{ flexShrink: 1, backgroundColor: C.card, borderRadius: R.card, borderTopLeftRadius: 6, paddingVertical: 12, paddingHorizontal: 16, gap: 10 }}>{children}</View>
    </View>
  );
}

/** A new message arrives: it springs up from 8px and from 0.96 scale,
    growing out of its own side (the coach's from the left, yours from the
    right). About 300ms, the faintest overshoot. History and Reduce Motion
    show it in place. */
export function BubbleIn({ side, play, children }: { side: 'left' | 'right'; play: boolean; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  const still = reduce || !play;
  const t = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return;
    const a = Animated.spring(t, { toValue: 1, stiffness: 340, damping: 26, mass: 1, useNativeDriver: NATIVE });
    a.start();
    return () => a.stop();
  }, [still, t]);
  return (
    <Animated.View
      style={{
        // The coach's row spans the column (its bubble caps itself at 94%).
        alignSelf: side === 'right' ? 'flex-end' : 'stretch',
        maxWidth: side === 'right' ? '84%' : '100%',
        opacity: t.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
        transformOrigin: side === 'right' ? 'right bottom' : 'left top',
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }, { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** The coach is replying: three dots that rise 4px in turn (150ms apart,
    a 1.2s loop). Reduce Motion: three still dots. */
export function TypingDots() {
  const reduce = useReduceMotion();
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    if (reduce) return;
    const rise = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE }),
          Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: NATIVE }),
          Animated.delay(680 - delay),
        ]),
      );
    const a = Animated.parallel(dots.map((v, i) => rise(v, i * 150)));
    a.start();
    return () => {
      a.stop();
      dots.forEach((v) => v.setValue(0));
    };
  }, [reduce, dots]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 2 }} accessible accessibilityRole="text" accessibilityLabel="Your coach is replying" accessibilityLiveRegion="polite">
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: C.muted,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}

/** Words of `text` revealed so far: all of them unless `play`. Calls
    `onDone` once when the reveal ends (or is skipped). */
function useTypewriter(text: string, play: boolean, onDone: () => void) {
  const reduce = useReduceMotion();
  const total = useMemo(() => countWords(parseRichText(text)), [text]);
  const run = play && !reduce;
  // Starts at one word, so the full reply never flashes before the reveal.
  const [shown, setShown] = useState<number | null>(run ? 1 : null);
  const raf = useRef(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!play) return;
    if (reduce) {
      doneRef.current();
      return;
    }
    const ms = typewriterMs(total);
    const t0 = Date.now();
    const step = () => {
      const n = wordsShown(Date.now() - t0, total, ms);
      setShown(n);
      if (n < total) raf.current = requestAnimationFrame(step);
      else doneRef.current();
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // Plays once per reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, reduce]);

  const finish = () => {
    cancelAnimationFrame(raf.current);
    setShown(null);
    doneRef.current();
  };
  const typing = run && shown != null && shown < total;
  return { limit: typing ? shown! : undefined, typing, finish };
}

/** Long press opens the actions, but only once the finger lifts: the tap
    the browser sends on release would otherwise land on the sheet's
    backdrop and close it. The buzz marks the moment the press counts. */
function useLongPress(msg: Msg, onActions?: (m: Msg) => void) {
  const held = useRef(false);
  if (!onActions) return { onLongPress: undefined, onPressOut: undefined };
  return {
    onLongPress: () => {
      held.current = true;
      haptic.select();
    },
    onPressOut: () => {
      if (!held.current) return;
      held.current = false;
      setTimeout(() => onActions(msg), 120);
    },
  };
}

type Props = {
  msg: Msg;
  /** Open the message actions (Copy, Regenerate, Edit and resend). */
  onActions?: (m: Msg) => void;
  onRevealDone: (id: string) => void;
  onUpdatePlan: (id: string, instruction: string) => void;
  generating: boolean;
};

export function UserMessage({ msg, onActions }: Pick<Props, 'msg' | 'onActions'>) {
  const press = useLongPress(msg, onActions);
  return (
    <BubbleIn side="right" play={!!msg.fresh}>
      <Pressable
        onLongPress={press.onLongPress}
        onPressOut={press.onPressOut}
        delayLongPress={400}
        accessibilityRole="text"
        accessibilityLabel={`You said: ${msg.body}`}
        accessibilityHint={onActions ? 'Long press for message actions' : undefined}
        accessibilityActions={onActions ? [{ name: 'longpress', label: 'Message actions' }] : undefined}
        onAccessibilityAction={() => onActions?.(msg)}
        style={({ pressed }) => ({ backgroundColor: pressed && onActions ? C.pressed : C.raised, borderRadius: R.card, borderTopRightRadius: 6, paddingVertical: 12, paddingHorizontal: 16 })}
      >
        <Text style={T.body} selectable={false}>
          {msg.body}
        </Text>
      </Pressable>
    </BubbleIn>
  );
}

export function CoachMessage({ msg, onActions, onRevealDone, onUpdatePlan, generating }: Props) {
  const { limit, typing, finish } = useTypewriter(msg.body, !!msg.reveal, () => onRevealDone(msg.id));
  const press = useLongPress(msg, onActions);
  const spoken = `${msg.note ? `${msg.note} ` : ''}Coach: ${plainText(parseRichText(msg.body))}`;
  return (
    <BubbleIn side="left" play={!!msg.fresh}>
      <CoachBubble>
        <Pressable
          onPress={typing ? finish : undefined}
          onLongPress={press.onLongPress}
          onPressOut={press.onPressOut}
          delayLongPress={400}
          accessible
          accessibilityRole="text"
          accessibilityLabel={spoken}
          accessibilityHint={typing ? 'Tap to show the whole reply' : onActions ? 'Long press for message actions' : undefined}
          accessibilityActions={onActions ? [{ name: 'longpress', label: 'Message actions' }] : undefined}
          onAccessibilityAction={() => onActions?.(msg)}
          style={{ gap: 10 }}
        >
          {msg.note ? <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, lineHeight: 20, color: C.warn }}>{msg.note}</Text> : null}
          <RichText text={msg.body} limit={limit} />
        </Pressable>
        {!typing && msg.remembered?.length ? (
          <Pressable
            onPress={() => router.push('/memory')}
            accessibilityRole="link"
            accessibilityLabel={`Saved to memory: ${msg.remembered.map((f) => f.fact).join('; ')}. See what your coach remembers.`}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={T.small}>Remembered: {msg.remembered.map((f) => f.fact).join('; ')}</Text>
          </Pressable>
        ) : null}
        {!typing && msg.suggest ? (
          msg.change?.state === 'done' ? (
            msg.change.result.ok ? (
              <ChangeSummary bare changes={msg.change.result.changes} summary={msg.change.result.summary} onSeePlan={() => router.push('/(tabs)/plan')} />
            ) : msg.change.result.code === 'needs_account' ? (
              <NeedsAccount message={msg.change.result.error ?? ''} />
            ) : (
              <View style={{ gap: 8 }}>
                <Notice tone="error">{msg.change.result.error ?? "Your plan couldn't be changed right now."}</Notice>
                <Button compact variant="secondary" icon="refresh" label="Try again" onPress={() => onUpdatePlan(msg.id, msg.suggest!)} />
              </View>
            )
          ) : (
            <View style={{ gap: 8, paddingTop: 2 }}>
              <Text style={T.small}>Suggested change: {msg.suggest}</Text>
              <Button
                compact
                variant="secondary"
                icon={msg.change?.state === 'busy' ? undefined : 'refresh'}
                label={msg.change?.state === 'busy' ? 'Updating your plan' : 'Update my plan'}
                busy={msg.change?.state === 'busy'}
                disabled={generating && msg.change?.state !== 'busy'}
                onPress={() => onUpdatePlan(msg.id, msg.suggest!)}
                accessibilityLabel={`Update my plan: ${msg.suggest}`}
              />
            </View>
          )
        ) : null}
      </CoachBubble>
    </BubbleIn>
  );
}
