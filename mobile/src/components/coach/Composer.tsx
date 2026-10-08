/* The message composer: the meal photo shortcut, the text field, the
   dictation mic (web, where the browser can turn speech into text) and the
   green send button. Under it, when the day's allowance runs low, how many
   messages are left; at none, send is off and the line says why.

   Dictation: tap the mic and speak; the words land in the field as you go
   (interim results), a light tap marks start and stop, and a green ring
   pulses round the mic while it listens (Reduce Motion: a still ring).
   Tap again to stop. The whole composer sits in a NoTabSwipe area, so
   caret and selection drags never change tab. */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { C, FONT } from '../../design';
import { haptic } from '../../lib/haptics';
import { IconButton } from '../Button';
import { useReduceMotion } from '../motion';
import { NoTabSwipe } from '../ScreenFade';
import { CoachIconButton } from './icons';

type SpeechResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: SpeechResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

/** The browser's speech recogniser, when it has one (Chrome, Edge, Safari). */
function speechCtor(): (new () => Recognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** A green ring round the mic while it listens: it grows and fades out on
    a 1.2s loop. Reduce Motion: it stays put. */
function ListeningRing({ size }: { size: number }) {
  const reduce = useReduceMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const a = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    a.start();
    return () => {
      a.stop();
      t.setValue(0);
    };
  }, [reduce, t]);
  return (
    <Animated.View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: C.green,
        opacity: reduce ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
        transform: [{ scale: reduce ? 1 : t.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] }) }],
      }}
    />
  );
}

type Props = {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onPhoto: () => void;
  busy: boolean;
  /** Messages left today (null: unknown, no limit shown). */
  remaining: number | null;
};

export function Composer({ value, onChange, onSend, onPhoto, busy, remaining }: Props) {
  const { width } = useWindowDimensions();
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [Speech] = useState(speechCtor);
  const rec = useRef<Recognition | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const out = remaining === 0;
  const canSend = !!value.trim() && !busy && !out;

  useEffect(() => () => rec.current?.abort(), []);

  function startDictation() {
    if (!Speech) return;
    setMicError(null);
    let r: Recognition;
    try {
      r = new Speech();
    } catch {
      setMicError("Dictation isn't available in this browser.");
      return;
    }
    const base = valueRef.current.trimEnd();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let said = '';
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0]?.transcript ?? '';
      said = said.replace(/\s+/g, ' ').trim();
      onChange(`${base}${base && said ? ' ' : ''}${said}`.slice(0, 800));
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') setMicError('The microphone is blocked. Allow it for this site in your browser settings to dictate.');
      else if (e.error && e.error !== 'aborted' && e.error !== 'no-speech') setMicError("Couldn't hear that. Try again, or type it.");
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      haptic.tap();
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      haptic.tap();
    } catch {
      rec.current = null;
      setMicError("Couldn't start dictation. Try again.");
    }
  }

  function stopDictation() {
    rec.current?.stop();
  }

  function send() {
    if (listening) rec.current?.stop();
    onSend();
  }

  const placeholder = Speech && width < 400 ? 'Ask your coach' : 'Ask your coach anything';

  return (
    <NoTabSwipe style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
        <IconButton icon="camera" variant="bare" onPress={onPhoto} accessibilityLabel="Log a meal from a photo" />
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            paddingLeft: 18,
            paddingRight: 4,
            minHeight: 52,
            borderRadius: 26,
            backgroundColor: C.card,
            borderWidth: 1,
            borderColor: focused || listening ? C.green : C.inputBorder,
          }}
        >
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder={listening ? 'Listening' : placeholder}
            placeholderTextColor={C.faint}
            accessibilityLabel="Message your coach"
            multiline
            numberOfLines={1}
            maxLength={800}
            onSubmitEditing={send}
            onKeyPress={(e) => {
              // Web: Enter sends, Shift+Enter adds a line.
              const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                if (canSend) send();
              }
            }}
            submitBehavior="submit"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
              { flex: 1, minWidth: 0, color: C.text, fontSize: 16, fontFamily: FONT.body, maxHeight: 110, paddingVertical: 12 },
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
            ]}
          />
          {Speech ? (
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              {listening ? <ListeningRing size={40} /> : null}
              <CoachIconButton
                icon="mic"
                variant="bare"
                size={40}
                color={listening ? C.green : C.text}
                selected={listening}
                onPress={listening ? stopDictation : startDictation}
                accessibilityLabel={listening ? 'Stop dictation' : 'Dictate a message'}
                accessibilityHint={listening ? undefined : 'Speak and your words appear in the message field'}
              />
            </View>
          ) : null}
          <IconButton icon="arrowRight" variant="green" size={44} onPress={send} disabled={!canSend} busy={busy} accessibilityLabel="Send message" />
        </View>
      </View>
      {micError ? (
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: FONT.bodyMedium, fontSize: 13, lineHeight: 18, color: C.warn, textAlign: 'center', maxWidth: 680, alignSelf: 'center' }}>
          {micError}
        </Text>
      ) : null}
      {remaining != null && remaining <= 10 ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ fontFamily: FONT.bodyMedium, fontSize: 13, lineHeight: 18, color: out ? C.warn : C.muted, textAlign: 'center', maxWidth: 680, alignSelf: 'center' }}
        >
          {out ? "You've used today's messages. Your coach is back tomorrow." : `${remaining} ${remaining === 1 ? 'message' : 'messages'} left today`}
        </Text>
      ) : null}
    </NoTabSwipe>
  );
}
