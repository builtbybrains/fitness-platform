/* AI Coach: chat through the coach Edge Function (the only place the AI
   key lives). History persists per conversation ("New chat" starts a fresh
   thread). Without an account, or when the coach can't be reached, the tab
   answers with built-in coaching tips and says why, in plain words.

   Meal photos: take or pick a photo, it is resized and compressed on the
   device, the analyze-meal function estimates {label, kcal, protein,
   confidence}, and only after the person confirms does it land in today's
   photo log (and the Today ring). The camera button is native only;
   picking a photo works everywhere. */

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { C, card as cardStyle, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { callFunction } from '../../src/lib/functions';
import { showAlert } from '../../src/lib/dialog';
import { supabaseConfigured } from '../../supabase.config';
import { analyzeMealImage, Estimate, useFoodLogs } from '../../src/foodLogs';
import { todayId } from '../../src/data';
import { BuiltMark } from '../../src/components/BuiltLogo';
import { Button, IconButton } from '../../src/components/Button';
import { ScreenHeader } from '../../src/components/Bits';

type Msg = { role: 'user' | 'coach'; body: string; note?: string };

const SUGGESTIONS = ['What should I eat after training?', "I'm too tired to train today", 'How do I hit my protein?'];

function rulesReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('water') || m.includes('hydrat')) {
    return 'Aim to finish your water target an hour before bed. Smallest next step: one glass now.';
  }
  if (m.includes('protein') || m.includes('eat') || m.includes('meal') || m.includes('food')) {
    return 'Anchor every meal with protein: eggs or Greek yogurt at breakfast, a palm of chicken, fish or lentils later. Budget picks: canned tuna, cottage cheese, frozen veg.';
  }
  if (m.includes('tired') || m.includes('rest') || m.includes('skip')) {
    return 'Real-life mode: a 10-minute walk still counts. Start with one set and let momentum do the rest.';
  }
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. What is the smallest next step for you right now?';
}

const MAX_DIM = 768;

class PermissionDenied extends Error {}

/** Take or pick a photo, then resize to 768px and compress to JPEG on the
    device. Resolves bare base64, or null when the person cancels. */
async function takeMealPhoto(useCamera: boolean): Promise<string | null> {
  const perm = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PermissionDenied(useCamera ? 'camera' : 'photos');

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const shot = useCamera
    ? await ImagePicker.launchCameraAsync({ ...opts, allowsEditing: true, aspect: [4, 3] })
    : await ImagePicker.launchImageLibraryAsync(opts);
  if (shot.canceled || !shot.assets?.length) return null;
  const asset = shot.assets[0];

  const ctx = ImageManipulator.manipulate(asset.uri);
  const w = asset.width || 0;
  const h = asset.height || 0;
  if (w && h && Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    ctx.resize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  } else if (!w || !h) {
    ctx.resize({ width: MAX_DIM });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error("Couldn't process that photo. Try another one.");
  return out.base64;
}

const CONF_LABEL: Record<Estimate['confidence'], string> = {
  low: 'rough estimate',
  medium: 'good estimate',
  high: 'clear photo',
};

function CoachAvatar() {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
      <BuiltMark size={16} />
    </View>
  );
}

function CoachBubble({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', maxWidth: '92%' }}>
      <CoachAvatar />
      <View style={{ flexShrink: 1, backgroundColor: C.card, borderRadius: R.card, borderTopLeftRadius: 6, paddingVertical: 12, paddingHorizontal: 16, gap: 8 }}>
        {children}
      </View>
    </View>
  );
}

export default function CoachTab() {
  const { session } = useAuth();
  const [conversationId, setConversationId] = useState('default');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [input, setInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [adding, setAdding] = useState(false);
  // An estimate waiting for the person to confirm, with its photo.
  const [pending, setPending] = useState<{ est: Estimate; image: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const food = useFoodLogs();
  const online = supabaseConfigured && !!session;

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
            const loaded: Msg[] = data.map((d) => ({ role: d.role === 'user' ? 'user' : 'coach', body: String(d.body ?? '') }));
            // Don't overwrite anything typed while the history was loading.
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

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages, busy]);

  async function pickImage(useCamera: boolean) {
    if (analyzing || adding) return;
    if (!online) {
      await showAlert('Sign in to log meals by photo', 'Photo estimates run on your account. Everything else keeps working on this device.');
      return;
    }
    setAnalyzing(true);
    try {
      const base64 = await takeMealPhoto(useCamera);
      if (!base64) return;
      const est = await analyzeMealImage(base64);
      setPending({ est, image: `data:image/jpeg;base64,${base64}` });
    } catch (e) {
      if (e instanceof PermissionDenied) {
        await showAlert(
          e.message === 'camera' ? 'Camera access is off' : 'Photo access is off',
          e.message === 'camera'
            ? 'To photograph a meal, allow camera access for BUILT in your Settings.'
            : 'To log a meal from a photo, allow photo access for BUILT in your Settings.',
        );
      } else {
        await showAlert("Couldn't read that photo", String((e as Error)?.message ?? e));
      }
    } finally {
      setAnalyzing(false);
    }
  }

  async function confirmPending() {
    if (!pending || adding) return;
    setAdding(true);
    try {
      await food.add(pending.est);
      setPending(null);
    } catch (e) {
      await showAlert("Couldn't log it", String((e as Error)?.message ?? e));
    } finally {
      setAdding(false);
    }
  }

  async function send(text = input.trim()) {
    if (!text || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', body: text }]);
    setBusy(true);

    let reply = '';
    let note: string | undefined;
    if (online) {
      try {
        const data = await callFunction<{ reply?: string }>('coach', { message: text, conversationId, localDay: todayId() });
        reply = String(data?.reply ?? '').trim();
        if (!reply) note = "Your coach didn't answer that one. Here's a quick tip for now.";
      } catch (e) {
        note = `${String((e as Error)?.message ?? e)} Here's a quick tip for now.`;
      }
    }
    if (!reply) reply = rulesReply(text);
    setMessages((prev) => [...prev, { role: 'coach', body: reply, note }]);
    setBusy(false);
  }

  function startNewChat() {
    setPending(null);
    setInput('');
    setConversationId(`chat-${Date.now()}`);
  }

  const showCamera = Platform.OS !== 'web';
  const canSend = !!input.trim() && !busy;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          <ScreenHeader
            title="AI Coach"
            right={<Button compact variant="secondary" icon="plus" label="New chat" onPress={startNewChat} accessibilityLabel="Start a new chat" />}
          />
          <Text style={[T.meta, { marginTop: 4 }]}>
            {online ? 'Knows your plan and your day.' : 'Quick tips on this device. Sign in for your AI coach.'}
          </Text>
        </View>

        {pending ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
            <View style={[cardStyle, { gap: 16, borderWidth: 1, borderColor: C.greenBorder }]}>
              <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                <Image source={{ uri: pending.image }} style={{ width: 72, height: 72, borderRadius: R.tile, backgroundColor: C.raised }} accessibilityIgnoresInvertColors />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={T.h3} numberOfLines={2}>
                    {pending.est.label}
                  </Text>
                  <Text style={{ fontFamily: FONT.displaySemi, fontSize: 16, color: C.green }}>
                    About {pending.est.kcal} kcal · {pending.est.protein} g protein
                  </Text>
                  <Text style={T.small}>Estimate from your photo, {CONF_LABEL[pending.est.confidence]}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Button variant="secondary" label="Discard" onPress={() => setPending(null)} disabled={adding} style={{ flex: 1 }} accessibilityLabel="Discard this estimate" />
                <Button label="Log it" onPress={confirmPending} busy={adding} style={{ flex: 1 }} accessibilityLabel={`Log ${pending.est.kcal} kcal`} />
              </View>
            </View>
          </View>
        ) : null}

        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
          <View style={[cardStyle, { gap: 14 }]}>
            <View style={{ gap: 4 }}>
              <Text style={T.h3} accessibilityRole="header">
                Snap a meal
              </Text>
              <Text style={T.meta}>Photograph your plate. Your coach estimates the calories, and you confirm before it counts.</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {showCamera ? (
                <Button variant="secondary" icon="camera" label="Camera" onPress={() => pickImage(true)} disabled={analyzing} style={{ flex: 1 }} accessibilityLabel="Take a photo of your meal" />
              ) : null}
              <Button
                variant="secondary"
                icon="image"
                label={showCamera ? 'Photos' : 'Pick a photo'}
                onPress={() => pickImage(false)}
                disabled={analyzing}
                style={{ flex: 1 }}
                accessibilityLabel="Pick a photo of your meal"
              />
            </View>
            {analyzing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={C.green} />
                <Text style={T.meta}>Reading your plate</Text>
              </View>
            ) : null}
            {food.logs.length > 0 ? (
              <View style={{ gap: 0, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
                  <Text style={T.small}>Today&apos;s photo log</Text>
                  <Text style={[T.small, { color: C.green }]}>+{food.kcal} kcal</Text>
                </View>
                {food.logs.map((log) => (
                  <View key={log.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }}>
                    <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>
                      {log.label}
                    </Text>
                    <Text style={T.small}>{log.kcal} kcal</Text>
                    <IconButton icon="close" variant="bare" onPress={() => void food.remove(log.id)} accessibilityLabel={`Delete ${log.label}`} />
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {historyLoading && messages.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
              <ActivityIndicator size="small" color={C.green} />
              <Text style={T.meta}>Loading your conversation</Text>
            </View>
          ) : messages.length === 0 ? (
            <View style={{ gap: 12 }}>
              <CoachBubble>
                <Text style={[T.body, { color: C.stone }]}>
                  I&apos;m your BUILT coach. Ask about training, food or recovery and I&apos;ll give you the next step.
                </Text>
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
                      borderColor: C.greenBorder,
                      backgroundColor: pressed ? C.greenTint : 'transparent',
                    })}
                  >
                    <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, color: C.text }}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <View
                key={i}
                style={{ alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: C.raised, borderRadius: R.card, borderTopRightRadius: 6, paddingVertical: 12, paddingHorizontal: 16 }}
              >
                <Text style={T.body}>{m.body}</Text>
              </View>
            ) : (
              <CoachBubble key={i}>
                {m.note ? <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 14, lineHeight: 20, color: C.warn }}>{m.note}</Text> : null}
                <Text style={[T.body, { color: C.stone }]}>{m.body}</Text>
              </CoachBubble>
            ),
          )}

          {busy ? (
            <CoachBubble>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={C.green} />
                <Text style={T.meta}>Thinking</Text>
              </View>
            </CoachBubble>
          ) : null}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>
          <View
            style={{
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
              maxWidth: 680,
              width: '100%',
              alignSelf: 'center',
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
                // The pill's border shows focus; drop the browser's inner outline.
                Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
              ]}
            />
            <IconButton icon="arrowRight" variant="green" size={44} onPress={() => void send()} disabled={!canSend} busy={busy} accessibilityLabel="Send message" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
