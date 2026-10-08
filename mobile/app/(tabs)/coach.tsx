/* AI Coach: chat through api/coach sendCoachMessage. The coach knows the
   plan, today, the questionnaire and what it remembers, and saves new facts
   itself (shown under its reply, all listed in Profile, What your coach
   remembers). When it suggests a plan change, "Update my plan" asks the
   planner and shows what changed and why. Without an account, or when the
   coach can't be reached, it answers with built-in tips and says why.

   History: every conversation is kept (coach_threads with an account, this
   device without one). The header's chats button opens them all (Chats
   sheet: grouped, searchable, rename, pin, archive); "New chat" starts a
   fresh one, listed once its first message is sent. The last open chat
   reopens next time. A chat opens on its latest 50 messages; scrolling to
   the top (or "Load earlier") brings the 50 before, without moving what is
   on screen.

   Under the header, "Your coach sees" shows today's context; on an empty
   chat the starter questions come from it too. A new reply types itself
   out (tap to finish), and its follow-up questions sit under it as chips.
   Long press a message to copy it, regenerate the latest reply, or edit
   and resend your latest message.

   Meal photos live in Food; the camera button here opens that flow.

   `?about=<text>` (the note on Today) shows that text as the coach's latest
   message, on this screen only (it isn't saved to the history). */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { C, FONT, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { usePlan } from '../../src/planStore';
import { isCloudUser } from '../../src/lib/cloud';
import { haptic } from '../../src/lib/haptics';
import { sendCoachMessage } from '../../src/api/coach';
import { asApiError } from '../../src/api/errors';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { ScreenHeader } from '../../src/components/Bits';
import { coachContextChips, pickStarters } from '../../src/lib/coachStarters';
import { newThreadId, previewOf, titleFromMessage, upsertThread, mergeThreads, type CoachThread } from '../../src/lib/coachThreads';
import {
  appendLocalMessages,
  fetchPage,
  fetchThreads,
  getLastThread,
  getRemaining,
  loadLocalPage,
  loadLocalThreads,
  patchThread,
  saveLocalThreads,
  setLastThread,
  setRemaining as storeRemaining,
  trimLocalMessages,
  type Page,
  type StoredMsg,
} from '../../src/lib/coachHistory';
import { AskChips } from '../../src/components/coach/Chips';
import { ChatsSheet } from '../../src/components/coach/ChatsSheet';
import { Composer } from '../../src/components/coach/Composer';
import { ContextSheet, ContextStrip } from '../../src/components/coach/ContextStrip';
import { CoachIconButton } from '../../src/components/coach/icons';
import { BubbleIn, CoachBubble, CoachMessage, TypingDots, UserMessage, type Msg } from '../../src/components/coach/Message';
import { actionsFor, canCopy, copyableText, copyText, MessageActionsSheet, Toast, type MessageAction } from '../../src/components/coach/MessageActions';
import { useCoachDay } from '../../src/components/coach/useCoachDay';

const FALLBACK_STARTERS = ['What should I eat after training?', "I'm too tired to train today", "How's my week going?"];

function rulesReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('water') || m.includes('hydrat')) return 'Aim to finish your water target an hour before bed. Smallest next step: one glass now.';
  if (m.includes('knee') || m.includes('back') || m.includes('shoulder') || m.includes('hurt') || m.includes('pain')) {
    return 'Skip anything that hurts and use Replace on that exercise in your plan: the options avoid the area. If the pain is sharp or lasts, check with a doctor.';
  }
  if (m.includes('protein') || m.includes('eat') || m.includes('meal') || m.includes('food') || m.includes('snack')) {
    return 'Anchor every meal with protein: eggs or labneh at breakfast, a palm of chicken, fish or lentils later. Budget picks: canned tuna, cottage cheese, foul.';
  }
  if (m.includes('warm')) return 'Five minutes of easy cardio, then two light sets of your first exercise. You are ready when you feel warm, not tired.';
  if (m.includes('tired') || m.includes('rest') || m.includes('skip')) return 'Real-life mode: a 10-minute walk still counts. Start with one set and let momentum do the rest.';
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. What is the smallest next step for you right now?';
}

const WEB = Platform.OS === 'web';
/** How long a chat or a page may take before the device's copy is used. */
const LOAD_TIMEOUT_MS = 6000;

let seq = 0;
const nextId = () => `m${Date.now()}-${seq++}`;

function withTimeout<T>(p: Promise<T>, ms = LOAD_TIMEOUT_MS): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

function rowToMsg(r: StoredMsg): Msg {
  return { id: r.id ?? nextId(), rowId: r.id, role: r.role, body: r.body, createdAt: r.created_at, note: r.note };
}

/** A time for a new message, never earlier than the one before it on screen. */
function stamp(after?: string): string {
  const now = Date.now();
  const prev = after ? Date.parse(after) : NaN;
  return new Date(Number.isFinite(prev) && prev >= now ? prev + 1 : now).toISOString();
}

type ScrollNode = { scrollHeight: number; scrollTop: number };

export default function CoachTab() {
  const { session, userId } = useAuth();
  const { regenerate, generating } = usePlan();
  const online = isCloudUser(userId) && !!session;
  const about = String(useLocalSearchParams<{ about?: string }>().about ?? '').trim().slice(0, 400);
  const coachDay = useCoachDay();
  // Under 400px the title keeps its line: New chat becomes a round plus.
  const narrow = useWindowDimensions().width < 400;

  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  /** The list says this chat has messages, but none could be read. */
  const [missing, setMissing] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState('');
  /** The chat a reply is on its way for (one at a time). */
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [remaining, setRemainingState] = useState<number | null>(null);
  const [chatsOpen, setChatsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [actionMsg, setActionMsg] = useState<Msg | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const threadsRef = useRef<CoachThread[]>([]);
  const threadRef = useRef<string | null>(null);
  threadRef.current = threadId;
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;
  const scrollRef = useRef<ScrollView>(null);
  /** Following the latest message (near the bottom). */
  const pinned = useRef(true);
  /** Older messages are being put on top: where the list stood before. */
  const prepend = useRef<ScrollNode | null>(null);
  /** Paging by scroll starts once the chat has opened at its bottom. */
  const pageReady = useRef(false);
  const busy = busyFor !== null;

  const commitThreads = useCallback(
    (next: CoachThread[]) => {
      threadsRef.current = next;
      setThreads(next);
      if (userId) void saveLocalThreads(userId, next);
    },
    [userId],
  );

  // Who is chatting: their last open chat and today's allowance.
  useEffect(() => {
    setThreadId(null);
    setMessages([]);
    setRemainingState(null);
    threadsRef.current = [];
    setThreads([]);
    if (!userId) return;
    let alive = true;
    void getLastThread(userId).then((id) => alive && setThreadId(id ?? 'default'));
    void getRemaining(userId).then((n) => alive && n != null && setRemainingState(n));
    return () => {
      alive = false;
    };
  }, [userId]);

  const loadThreads = useCallback(async () => {
    if (!userId) return;
    const local = await loadLocalThreads(userId);
    // Keep anything added while the device copy was read.
    commitThreads(mergeThreads(threadsRef.current, local));
    if (!online) return;
    setThreadsLoading(true);
    const server = await withTimeout(fetchThreads());
    setThreadsLoading(false);
    if (server) commitThreads(mergeThreads(server, threadsRef.current));
  }, [userId, online, commitThreads]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (userId && threadId) void setLastThread(userId, threadId);
  }, [userId, threadId]);

  // Open a chat: its latest page, from the server or this device.
  useEffect(() => {
    if (!userId || !threadId) return;
    let alive = true;
    pageReady.current = false;
    pinned.current = true;
    setHistoryLoading(true);
    setHasOlder(false);
    (async () => {
      const page: Page = (online ? await withTimeout(fetchPage(threadId)) : null) ?? (await loadLocalPage(userId, threadId));
      if (!alive) return;
      const loaded = page.rows.map(rowToMsg);
      setMessages((prev) => [...loaded, ...prev]);
      setMissing(!loaded.length && (threadsRef.current.find((t) => t.id === threadId)?.message_count ?? 0) > 0);
      setHasOlder(page.more);
      setHistoryLoading(false);
      // An older chat (from before chats were listed) joins the list.
      if (loaded.length && !threadsRef.current.some((t) => t.id === threadId)) {
        const firstUser = loaded.find((m) => m.role === 'user');
        const last = loaded[loaded.length - 1];
        commitThreads(
          upsertThread(threadsRef.current, threadId, {
            title: firstUser ? titleFromMessage(firstUser.body) : '',
            last_preview: previewOf(last.body),
            last_role: last.role,
            message_count: loaded.length,
            created_at: loaded[0].createdAt || new Date().toISOString(),
            updated_at: last.createdAt || new Date().toISOString(),
          }),
        );
      }
      setTimeout(() => {
        if (alive) pageReady.current = true;
      }, 500);
    })();
    return () => {
      alive = false;
    };
  }, [userId, threadId, online, commitThreads]);

  // Opened from the note on Today: the note leads the conversation.
  useEffect(() => {
    if (!about) return;
    setMessages((prev) => (prev.some((m) => m.role === 'coach' && m.body === about) ? prev : [...prev, { id: nextId(), role: 'coach', body: about, createdAt: '', fresh: true, ephemeral: true }]));
  }, [about]);

  // Older messages went on top: keep what was on screen where it was (web;
  // phones do it with maintainVisibleContentPosition).
  useLayoutEffect(() => {
    const before = prepend.current;
    if (!before || !WEB) return;
    prepend.current = null;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => ScrollNode } | null)?.getScrollableNode?.();
    if (node) node.scrollTop = node.scrollHeight - before.scrollHeight + before.scrollTop;
  }, [messages]);

  const loadOlder = useCallback(async () => {
    const tid = threadRef.current;
    if (!userId || !tid || loadingOlder || !hasOlder) return;
    const shown = messagesRef.current.filter((m) => !m.ephemeral);
    const oldest = shown[0];
    if (!oldest) return;
    setLoadingOlder(true);
    const skip = new Set(shown.filter((m) => m.rowId && m.createdAt === oldest.createdAt).map((m) => m.rowId!));
    const page: Page =
      (online && oldest.rowId ? await withTimeout(fetchPage(tid, { before: oldest.createdAt, skip })) : null) ?? (await loadLocalPage(userId, tid, shown.length));
    if (threadRef.current !== tid) return;
    const node = (scrollRef.current as unknown as { getScrollableNode?: () => ScrollNode } | null)?.getScrollableNode?.();
    if (node) prepend.current = { scrollHeight: node.scrollHeight, scrollTop: node.scrollTop };
    else prepend.current = { scrollHeight: 0, scrollTop: 0 };
    setMessages((prev) => [...page.rows.map(rowToMsg), ...prev]);
    setHasOlder(page.more);
    setLoadingOlder(false);
  }, [userId, online, loadingOlder, hasOlder]);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    pinned.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 80;
    if (contentOffset.y < 60 && pageReady.current && hasOlder && !loadingOlder) void loadOlder();
  }

  function onContentSizeChange() {
    if (prepend.current && !WEB) {
      prepend.current = null;
      return;
    }
    if (pinned.current) scrollRef.current?.scrollToEnd({ animated: false });
  }

  function setRemaining(n: number) {
    setRemainingState(n);
    if (userId) void storeRemaining(userId, n);
  }

  function touchThread(id: string, patch: (t: CoachThread | undefined) => Partial<CoachThread>) {
    const found = threadsRef.current.find((t) => t.id === id);
    commitThreads(upsertThread(threadsRef.current, id, { ...patch(found), updated_at: new Date().toISOString() }));
  }

  async function send(textArg?: string, opts: { again?: boolean } = {}) {
    const text = (textArg ?? input).trim();
    const tid = threadRef.current;
    if (!text || busy || !userId || !tid || remaining === 0) return;
    pinned.current = true;
    setMissing(false);
    const last = messagesRef.current.filter((m) => !m.ephemeral).pop();
    if (!opts.again) {
      setInput('');
      const at = stamp(last?.createdAt);
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', body: text, createdAt: at, fresh: true }]);
      void appendLocalMessages(userId, tid, [{ role: 'user', body: text, created_at: at }]);
      touchThread(tid, (t) => ({ title: t?.title || titleFromMessage(text), last_preview: previewOf(text), last_role: 'user', message_count: (t?.message_count ?? 0) + 1 }));
    }
    setBusyFor(tid);
    let msg: Msg;
    let title = '';
    try {
      const r = await sendCoachMessage(userId, text, tid);
      if (r.remainingToday != null) setRemaining(r.remainingToday);
      if (r.thread?.id === tid && r.thread.title) title = r.thread.title;
      msg = r.reply.trim()
        ? { id: nextId(), role: 'coach', body: r.reply.trim(), createdAt: '', suggest: r.suggestPlanChange, remembered: r.remembered, suggestions: r.suggestions, reveal: true }
        : { id: nextId(), role: 'coach', body: rulesReply(text), createdAt: '', note: "Your coach didn't answer that one. Here's a quick tip for now." };
    } catch (e) {
      const err = asApiError(e);
      if (err.code === 'limit_reached') setRemaining(0);
      msg = {
        id: nextId(),
        role: 'coach',
        body: rulesReply(text),
        createdAt: '',
        note: err.code === 'needs_account' ? 'A quick tip from this device. Your AI coach comes with a free account.' : `${err.message} Here's a quick tip for now.`,
      };
    }
    msg.createdAt = stamp(messagesRef.current.filter((m) => !m.ephemeral).pop()?.createdAt);
    void appendLocalMessages(userId, tid, [{ role: 'coach', body: msg.body, created_at: msg.createdAt, ...(msg.note ? { note: msg.note } : {}) }]);
    touchThread(tid, (t) => ({ title: title || t?.title || '', last_preview: previewOf(msg.body), last_role: 'coach', message_count: (t?.message_count ?? 0) + 1 }));
    setBusyFor(null);
    // Still on that chat: show it (otherwise it is waiting there).
    if (threadRef.current === tid) setMessages((prev) => [...prev, { ...msg, fresh: true }]);
  }

  async function updatePlan(id: string, instruction: string) {
    if (generating) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, change: { state: 'busy' } } : m)));
    const result = await regenerate(instruction);
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, change: { state: 'done', result } } : m)));
  }

  function openThread(id: string) {
    setChatsOpen(false);
    if (id === threadId) return;
    setMessages([]);
    setInput('');
    setThreadId(id);
  }

  function startNewChat() {
    haptic.select();
    setInput('');
    setMessages([]);
    setThreadId(newThreadId());
  }

  function renameThread(id: string, title: string) {
    touchThreadQuiet(id, { title });
    if (online) void patchThread(id, { title });
  }
  function pinThread(id: string, on: boolean) {
    touchThreadQuiet(id, { pinned: on });
    if (online) void patchThread(id, { pinned: on });
  }
  function archiveThread(id: string, on: boolean) {
    const archived_at = on ? new Date().toISOString() : null;
    touchThreadQuiet(id, { archived_at });
    if (online) void patchThread(id, { archived_at });
  }
  /** Rename, pin, archive: the chat keeps its place in time. */
  function touchThreadQuiet(id: string, patch: Partial<CoachThread>) {
    const found = threadsRef.current.find((t) => t.id === id);
    if (!found) return;
    commitThreads(upsertThread(threadsRef.current, id, { ...patch, updated_at: found.updated_at }));
  }

  // Message actions.
  const real = messages.filter((m) => !m.ephemeral);
  const lastReal = real[real.length - 1];
  const lastUser = [...real].reverse().find((m) => m.role === 'user');
  const copyOk = canCopy();
  const actionList = (m: Msg) =>
    actionsFor(m, {
      isLastCoach: m.role === 'coach' && lastReal?.id === m.id && !!lastUser,
      isLastUser: m.role === 'user' && lastUser?.id === m.id,
      busy,
      copy: copyOk,
    });

  async function onAction(a: MessageAction, m: Msg) {
    setActionMsg(null);
    const tid = threadRef.current;
    if (a === 'copy') {
      const ok = await copyText(copyableText(m));
      setToast(ok ? 'Copied' : "Couldn't copy that");
      return;
    }
    if (!userId || !tid) return;
    // With an account the server keeps every turn, so the old one stays on
    // screen too: regenerate asks again below it, edit fills the box.
    if (online) {
      if (a === 'regenerate') {
        const question = [...messagesRef.current].slice(0, messagesRef.current.findIndex((x) => x.id === m.id)).reverse().find((x) => x.role === 'user');
        if (question) void send(question.body);
      } else {
        setInput(m.body);
      }
      return;
    }
    const idx = messagesRef.current.findIndex((x) => x.id === m.id);
    if (idx < 0) return;
    const kept = messagesRef.current.slice(0, idx);
    if (a === 'regenerate') {
      const question = [...kept].reverse().find((x) => x.role === 'user');
      if (!question) return;
      setMessages(kept);
      if (m.createdAt) await trimLocalMessages(userId, tid, m.createdAt);
      const count = threadsRef.current.find((t) => t.id === tid)?.message_count ?? 0;
      touchThreadQuiet(tid, { message_count: Math.max(0, count - 1) });
      void send(question.body, { again: true });
      return;
    }
    // Edit and resend: the turn leaves the screen, the text goes back in the box.
    setMessages(kept);
    if (m.createdAt) await trimLocalMessages(userId, tid, m.createdAt);
    const prev = kept.filter((x) => !x.ephemeral).pop();
    const removed = messagesRef.current.length - kept.length;
    const count = threadsRef.current.find((t) => t.id === tid)?.message_count ?? 0;
    touchThreadQuiet(tid, { last_preview: prev ? previewOf(prev.body) : '', last_role: prev?.role ?? '', message_count: Math.max(0, count - removed) });
    setInput(m.body);
  }

  const chips = useMemo(() => (coachDay ? coachContextChips(coachDay) : []), [coachDay]);
  const starters = useMemo(() => (coachDay ? pickStarters(coachDay) : FALLBACK_STARTERS), [coachDay]);
  const showDots = busyFor !== null && busyFor === threadId;
  const followUps = lastReal?.role === 'coach' && !lastReal.reveal && !busy && !input.trim() ? (lastReal.suggestions ?? []) : [];

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, gap: 4, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          <ScreenHeader
            title="AI Coach"
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CoachIconButton
                  icon="chats"
                  onPress={() => {
                    haptic.select();
                    setChatsOpen(true);
                    void loadThreads();
                  }}
                  accessibilityLabel="Your chats"
                  accessibilityHint="Opens every conversation with your coach"
                />
                {narrow ? (
                  <IconButton icon="plus" onPress={startNewChat} accessibilityLabel="Start a new chat" />
                ) : (
                  <Button compact variant="secondary" icon="plus" label="New chat" onPress={startNewChat} accessibilityLabel="Start a new chat" />
                )}
              </View>
            }
          />
          {online ? (
            <ContextStrip chips={chips} onOpen={() => setContextOpen(true)} />
          ) : (
            <Text style={[T.meta, { minHeight: 44, textAlignVertical: 'center', paddingTop: 12 }]}>Quick tips on this device. Sign up free for your AI coach.</Text>
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={onContentSizeChange}
          maintainVisibleContentPosition={WEB ? undefined : { minIndexForVisible: 0 }}
          contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}
        >
          {hasOlder ? (
            <View style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
              {loadingOlder ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
                  <ActivityIndicator size="small" color={C.muted} />
                  <Text style={T.meta}>Loading earlier messages</Text>
                </View>
              ) : (
                <LinkButton onPress={() => void loadOlder()} accessibilityLabel="Load earlier messages">
                  Load earlier
                </LinkButton>
              )}
            </View>
          ) : null}

          {historyLoading && messages.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={C.green} />
              <Text style={T.meta}>Loading your conversation</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={{ gap: 12 }}>
              <CoachBubble>
                <Text style={[T.body, { color: C.stone }]}>
                  {missing
                    ? "This chat's messages aren't on this device. Ask anything and we'll pick it up from here."
                    : "I'm your BUILT coach. Ask about training, food or recovery and I'll give you the next step. Tell me about injuries or your schedule and I'll remember."}
                </Text>
              </CoachBubble>
              <AskChips items={starters} onPick={(s) => void send(s)} label="Questions to start with" disabled={busy || remaining === 0} />
              <View style={{ paddingLeft: 46 }}>
                <LinkButton align="flex-start" onPress={() => router.push('/food/log?mode=photo')} accessibilityLabel="Log a meal from a photo in Food">
                  <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>Logging a meal? Snap it in Food</Text>
                </LinkButton>
              </View>
            </View>
          ) : null}

          {messages.map((m) => {
            const acts = actionList(m);
            const onActions = acts.length ? setActionMsg : undefined;
            return m.role === 'user' ? (
              <UserMessage key={m.id} msg={m} onActions={onActions} />
            ) : (
              <CoachMessage
                key={m.id}
                msg={m}
                onActions={onActions}
                onRevealDone={(id) => setMessages((prev) => prev.map((x) => (x.id === id && x.reveal ? { ...x, reveal: false } : x)))}
                onUpdatePlan={(id, ins) => void updatePlan(id, ins)}
                generating={generating}
              />
            );
          })}

          {followUps.length ? <AskChips items={followUps} onPick={(s) => void send(s)} label="Follow-up questions" disabled={remaining === 0} /> : null}

          {showDots ? (
            <BubbleIn side="left" play>
              <CoachBubble>
                <TypingDots />
              </CoachBubble>
            </BubbleIn>
          ) : null}
        </ScrollView>

        <View style={{ position: 'relative' }}>
          <Toast text={toast} onDone={() => setToast(null)} />
          <Composer value={input} onChange={setInput} onSend={() => void send()} onPhoto={() => router.push('/food/log?mode=photo')} busy={busy} remaining={remaining} />
        </View>
      </KeyboardAvoidingView>

      <ChatsSheet
        visible={chatsOpen}
        onClose={() => setChatsOpen(false)}
        threads={threads}
        currentId={threadId}
        loading={threadsLoading}
        onOpen={openThread}
        onRename={renameThread}
        onPin={pinThread}
        onArchive={archiveThread}
      />
      <ContextSheet visible={contextOpen} onClose={() => setContextOpen(false)} />
      <MessageActionsSheet msg={actionMsg} actions={actionMsg ? actionList(actionMsg) : []} onClose={() => setActionMsg(null)} onAction={(a, m) => void onAction(a, m)} />
    </SafeAreaView>
  );
}
