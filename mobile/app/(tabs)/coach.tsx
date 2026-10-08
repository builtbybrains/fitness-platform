/* AI Coach: chat through api/coach sendCoachMessage. The coach knows the
   plan, today, the questionnaire and what it remembers, and saves new facts
   itself (shown under its reply, all listed in Profile, What your coach
   remembers). When it suggests a plan change, "Update my plan" asks the
   planner and shows what changed and why. History persists per conversation
   ("New chat" starts a fresh thread). Without an account, or when the coach
   can't be reached, it answers with built-in tips and says why.

   Meal photos live in Food now; the camera button here opens that flow.

   `?about=<text>` (the note on Today) shows that text as the coach's latest
   message, on this screen only (it isn't saved to the history).

   Motion: messages added in this visit spring in from their own side, and
   three dots rise in turn while the coach is replying. */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { C, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { usePlan, type PlanChangeResult } from '../../src/planStore';
import { supabase } from '../../src/lib/supabase';
import { isCloudUser } from '../../src/lib/cloud';
import { sendCoachMessage } from '../../src/api/coach';
import { asApiError } from '../../src/api/errors';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { Notice, ScreenHeader } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { useReduceMotion } from '../../src/components/motion';
import { ChangeSummary, NeedsAccount } from '../../src/components/training/PlanChange';
import { NoTabSwipe } from '../../src/components/ScreenFade';
import type { MemoryFact } from '../../src/types';

type Msg = {
  id: string;
  role: 'user' | 'coach';
  body: string;
  note?: string;
  suggest?: string | null;
  remembered?: MemoryFact[];
  change?: { state: 'busy' } | { state: 'done'; result: PlanChangeResult };
  /** Added in this visit (sent, answered): springs in. History stays still. */
  fresh?: boolean;
};

const SUGGESTIONS = ['What should I eat after training?', "I'm too tired to train today", 'My knee hurts when I squat'];

function rulesReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('water') || m.includes('hydrat')) return 'Aim to finish your water target an hour before bed. Smallest next step: one glass now.';
  if (m.includes('knee') || m.includes('back') || m.includes('shoulder') || m.includes('hurt') || m.includes('pain')) {
    return 'Skip anything that hurts and use Replace on that exercise in your plan: the options avoid the area. If the pain is sharp or lasts, check with a doctor.';
  }
  if (m.includes('protein') || m.includes('eat') || m.includes('meal') || m.includes('food')) {
    return 'Anchor every meal with protein: eggs or labneh at breakfast, a palm of chicken, fish or lentils later. Budget picks: canned tuna, cottage cheese, foul.';
  }
  if (m.includes('tired') || m.includes('rest') || m.includes('skip')) return 'Real-life mode: a 10-minute walk still counts. Start with one set and let momentum do the rest.';
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. What is the smallest next step for you right now?';
}

const NATIVE = Platform.OS !== 'web';

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

function CoachAvatar() {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
      <BuiltMark size={16} />
    </View>
  );
}

function CoachBubble({ children }: { children: React.ReactNode }) {
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
function BubbleIn({ side, play, children }: { side: 'left' | 'right'; play: boolean; children: React.ReactNode }) {
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
function TypingDots() {
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

export default function CoachTab() {
  const { session, userId } = useAuth();
  const { regenerate, generating } = usePlan();
  const [conversationId, setConversationId] = useState('default');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const online = isCloudUser(userId) && !!session;
  const about = String(useLocalSearchParams<{ about?: string }>().about ?? '').trim().slice(0, 400);

  useEffect(() => {
    setMessages([]);
    if (!online) return;
    let alive = true;
    setHistoryLoading(true);
    // Never leave the spinner up for a slow or unreachable server.
    const giveUp = setTimeout(() => alive && setHistoryLoading(false), 6000);
    supabase
      .from('coach_messages')
      .select('role, body')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(
        ({ data }) => {
          if (!alive) return;
          if (Array.isArray(data) && data.length) {
            const loaded: Msg[] = data.map((d) => ({ id: nextId(), role: d.role === 'user' ? 'user' : 'coach', body: String(d.body ?? '') }));
            setMessages((prev) => (prev.length ? [...loaded, ...prev] : loaded));
          }
          setHistoryLoading(false);
        },
        () => alive && setHistoryLoading(false),
      );
    return () => {
      alive = false;
      clearTimeout(giveUp);
    };
  }, [online, conversationId]);

  // Opened from the note on Today: the note leads the conversation.
  useEffect(() => {
    if (!about) return;
    setMessages((prev) => (prev.some((m) => m.role === 'coach' && m.body === about) ? prev : [...prev, { id: nextId(), role: 'coach', body: about, fresh: true }]));
  }, [about]);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages, busy]);

  async function send(text = input.trim()) {
    if (!text || busy || !userId) return;
    setInput('');
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', body: text, fresh: true }]);
    setBusy(true);
    let msg: Msg;
    try {
      const r = await sendCoachMessage(userId, text, conversationId);
      msg = r.reply.trim()
        ? { id: nextId(), role: 'coach', body: r.reply.trim(), suggest: r.suggestPlanChange, remembered: r.remembered }
        : { id: nextId(), role: 'coach', body: rulesReply(text), note: "Your coach didn't answer that one. Here's a quick tip for now." };
    } catch (e) {
      const err = asApiError(e);
      msg = {
        id: nextId(),
        role: 'coach',
        body: rulesReply(text),
        note: err.code === 'needs_account' ? 'A quick tip from this device. Your AI coach comes with a free account.' : `${err.message} Here's a quick tip for now.`,
      };
    }
    setMessages((prev) => [...prev, { ...msg, fresh: true }]);
    setBusy(false);
  }

  async function updatePlan(id: string, instruction: string) {
    if (generating) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, change: { state: 'busy' } } : m)));
    const result = await regenerate(instruction);
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, change: { state: 'done', result } } : m)));
  }

  function startNewChat() {
    setInput('');
    setConversationId(`chat-${Date.now()}`);
  }

  const canSend = !!input.trim() && !busy;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 6, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          <ScreenHeader title="AI Coach" right={<Button compact variant="secondary" icon="plus" label="New chat" onPress={startNewChat} accessibilityLabel="Start a new chat" />} />
          {online ? (
            <Pressable
              onPress={() => router.push('/memory')}
              accessibilityRole="link"
              accessibilityLabel="Your coach remembers what you tell it. See what it remembers in Profile."
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={[T.meta, { flexShrink: 1 }]}>
                Remembers what you tell it.{' '}
                <Text style={{ fontFamily: FONT.bodySemi, color: C.text }}>See what it remembers</Text>
              </Text>
              <Icon name="chevronRight" size={16} color={C.muted} />
            </Pressable>
          ) : (
            <Text style={[T.meta, { minHeight: 44, textAlignVertical: 'center', paddingTop: 12 }]}>Quick tips on this device. Sign up free for your AI coach.</Text>
          )}
        </View>

        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          {historyLoading && messages.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={C.green} />
              <Text style={T.meta}>Loading your conversation</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={{ gap: 12 }}>
              <CoachBubble>
                <Text style={[T.body, { color: C.stone }]}>I&apos;m your BUILT coach. Ask about training, food or recovery and I&apos;ll give you the next step. Tell me about injuries or your schedule and I&apos;ll remember.</Text>
              </CoachBubble>
              <View style={{ gap: 8, paddingLeft: 46 }}>
                {SUGGESTIONS.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => void send(s)}
                    accessibilityRole="button"
                    accessibilityLabel={`Ask: ${s}`}
                    style={({ pressed }) => ({
                      alignSelf: 'flex-start',
                      minHeight: 44,
                      justifyContent: 'center',
                      paddingHorizontal: 16,
                      borderRadius: R.pill,
                      borderWidth: 1,
                      borderColor: C.lineStrong,
                      backgroundColor: pressed ? C.raised : 'transparent',
                    })}
                  >
                    <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, color: C.text }}>{s}</Text>
                  </Pressable>
                ))}
                <LinkButton align="flex-start" onPress={() => router.push('/food/log?mode=photo')} accessibilityLabel="Log a meal from a photo in Food">
                  <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>Logging a meal? Snap it in Food</Text>
                </LinkButton>
              </View>
            </View>
          ) : null}

          {messages.map((m) =>
            m.role === 'user' ? (
              <BubbleIn key={m.id} side="right" play={!!m.fresh}>
                <View style={{ backgroundColor: C.raised, borderRadius: R.card, borderTopRightRadius: 6, paddingVertical: 12, paddingHorizontal: 16 }}>
                  <Text style={T.body}>{m.body}</Text>
                </View>
              </BubbleIn>
            ) : (
              <BubbleIn key={m.id} side="left" play={!!m.fresh}>
              <CoachBubble>
                {m.note ? <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, lineHeight: 20, color: C.warn }}>{m.note}</Text> : null}
                <Text style={[T.body, { color: C.stone }]}>{m.body}</Text>
                {m.remembered?.length ? (
                  <Pressable onPress={() => router.push('/memory')} accessibilityRole="link" accessibilityLabel={`Saved to memory: ${m.remembered.map((f) => f.fact).join('; ')}. See what your coach remembers.`} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Text style={T.small}>
                      Remembered: {m.remembered.map((f) => f.fact).join('; ')}
                    </Text>
                  </Pressable>
                ) : null}
                {m.suggest ? (
                  m.change?.state === 'done' ? (
                    m.change.result.ok ? (
                      <ChangeSummary bare changes={m.change.result.changes} summary={m.change.result.summary} onSeePlan={() => router.push('/(tabs)/plan')} />
                    ) : m.change.result.code === 'needs_account' ? (
                      <NeedsAccount message={m.change.result.error ?? ''} />
                    ) : (
                      <View style={{ gap: 8 }}>
                        <Notice tone="error">{m.change.result.error ?? "Your plan couldn't be changed right now."}</Notice>
                        <Button compact variant="secondary" icon="refresh" label="Try again" onPress={() => void updatePlan(m.id, m.suggest!)} />
                      </View>
                    )
                  ) : (
                    <View style={{ gap: 8, paddingTop: 2 }}>
                      <Text style={T.small}>Suggested change: {m.suggest}</Text>
                      <Button
                        compact
                        variant="secondary"
                        icon={m.change?.state === 'busy' ? undefined : 'refresh'}
                        label={m.change?.state === 'busy' ? 'Updating your plan' : 'Update my plan'}
                        busy={m.change?.state === 'busy'}
                        disabled={generating && m.change?.state !== 'busy'}
                        onPress={() => void updatePlan(m.id, m.suggest!)}
                        accessibilityLabel={`Update my plan: ${m.suggest}`}
                      />
                    </View>
                  )
                ) : null}
              </CoachBubble>
              </BubbleIn>
            ),
          )}

          {busy ? (
            <BubbleIn side="left" play>
              <CoachBubble>
                <TypingDots />
              </CoachBubble>
            </BubbleIn>
          ) : null}
        </ScrollView>

        {/* The composer's sideways drags (caret, selection) never change tab. */}
        <NoTabSwipe style={{ paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
            <IconButton icon="camera" variant="bare" onPress={() => router.push('/food/log?mode=photo')} accessibilityLabel="Log a meal from a photo" />
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingLeft: 18,
                paddingRight: 4,
                minHeight: 52,
                borderRadius: 26,
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: inputFocused ? C.green : C.inputBorder,
              }}
            >
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask your coach anything"
                placeholderTextColor={C.faint}
                accessibilityLabel="Message your coach"
                multiline
                numberOfLines={1}
                maxLength={800}
                onSubmitEditing={() => void send()}
                onKeyPress={(e) => {
                  // Web: Enter sends, Shift+Enter adds a line.
                  const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
                  if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
                    (e as unknown as { preventDefault: () => void }).preventDefault();
                    void send();
                  }
                }}
                submitBehavior="submit"
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                style={[
                  { flex: 1, color: C.text, fontSize: 16, fontFamily: FONT.body, maxHeight: 110, paddingVertical: 12 },
                  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
                ]}
              />
              <IconButton icon="arrowRight" variant="green" size={44} onPress={() => void send()} disabled={!canSend} busy={busy} accessibilityLabel="Send message" />
            </View>
          </View>
        </NoTabSwipe>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
