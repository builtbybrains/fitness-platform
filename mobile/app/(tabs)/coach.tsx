/* Coach tab: AI chat through the Supabase Edge Function (the only place the
   AI key lives). History persists in the coach_messages table, scoped to the
   current conversation ("New chat" starts a fresh thread). When the function
   isn't configured or the AI is briefly unavailable, the tab answers with
   built-in coaching rules so it never feels broken.

   Food photos: shoot or pick a meal, the analyze-meal Edge Function (vision
   model) estimates {label, kcal, protein, confidence}, and after the user
   confirms it lands in food_logs for today — instantly counted in the Today
   tab's calorie ring. The camera button is hidden on web (browsers can't
   open the native camera); the gallery picker works everywhere. */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, card as cardStyle, screen, sectionLabel, subtitle, title } from '../../src/design';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { supabaseConfigured } from '../../supabase.config';
import { analyzeMealImage, Estimate, useFoodLogs } from '../../src/foodLogs';
import { todayId } from '../../src/data';

type Msg = { role: 'user' | 'coach'; body: string };

function rulesReply(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('water') || m.includes('hydrat')) {
    return 'Water check: aim to finish your target an hour before bed. Smallest next step: one glass now.';
  }
  if (m.includes('protein') || m.includes('eat') || m.includes('meal')) {
    return 'Anchor every meal with protein: eggs or Greek yogurt at breakfast, a palm of chicken, fish or lentils later. Budget picks: canned tuna, cottage cheese, frozen veg.';
  }
  if (m.includes('tired') || m.includes('rest') || m.includes('skip')) {
    return 'Real-life mode: a 10-minute walk still counts. Start with one set — momentum does the rest.';
  }
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. Smallest next step wins — what is it for you right now?';
}

type PickerAsset = { uri: string; base64?: string | null };
type PickerResult = { canceled: boolean; assets?: PickerAsset[] };

type ImageModules = {
  launchCameraAsync: (opts: unknown) => Promise<PickerResult>;
  launchImageLibraryAsync: (opts: unknown) => Promise<PickerResult>;
  requestCameraPermissionsAsync: () => Promise<{ status: string }>;
  manipulateAsync: (
    uri: string,
    actions: unknown[],
    save: unknown,
  ) => Promise<{ uri: string | null; base64: string | null }>;
  SaveFormat: { JPEG: 'jpeg' };
  MediaTypeOptions: { Images: string };
};

// Optional native modules: missing gracefully (web rebuilds, etc.).
let ImageMods: ImageModules | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const picker = require('expo-image-picker');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const manip = require('expo-image-manipulator');
  ImageMods = {
    launchCameraAsync: picker.launchCameraAsync,
    launchImageLibraryAsync: picker.launchImageLibraryAsync,
    requestCameraPermissionsAsync: picker.requestCameraPermissionsAsync,
    manipulateAsync: manip.manipulateAsync,
    SaveFormat: manip.SaveFormat,
    MediaTypeOptions: picker.MediaTypeOptions,
  };
} catch {
  ImageMods = null;
}

const MAX_DIM = 768;

/** Downscale to ~768px JPEG and return bare base64. On web the manipulator
    can't read blob/file URIs, so we downscale through a canvas instead; on
    native we use the manipulator and fall back to the picker's own base64. */
async function imageToBase64(useCamera: boolean): Promise<string> {
  if (!ImageMods) throw new Error('Image picking is not available on this device');
  const opts = { mediaTypes: ImageMods.MediaTypeOptions.Images, quality: 0.7 };
  const shot = useCamera
    ? await ImageMods.launchCameraAsync({ ...opts, allowsEditing: true, aspect: [4, 3] })
    : await ImageMods.launchImageLibraryAsync(opts);
  const picked = shot.assets?.[0];
  if (!picked) throw new Error('canceled');

  if (Platform.OS === 'web') {
    const img = document.createElement('img');
    img.src = picked.uri;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('Could not read that image'));
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  const small = await ImageMods.manipulateAsync(
    picked.uri,
    [{ resize: { width: MAX_DIM } }],
    { compress: 0.6, format: ImageMods.SaveFormat.JPEG, base64: true },
  );
  if (small.base64) return small.base64;
  if (picked.base64) return picked.base64;
  throw new Error('Could not process that image.');
}

const CONF_LABEL: Record<Estimate['confidence'], string> = {
  low: 'rough guess',
  medium: 'decent read',
  high: 'clear photo',
};

export default function CoachTab() {
  const { session } = useAuth();
  const [conversationId, setConversationId] = useState('default');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [adding, setAdding] = useState(false);
  // Confirmed-but-not-yet-logged estimate, with its photo for the preview card.
  const [pending, setPending] = useState<{ est: Estimate; image: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const food = useFoodLogs();

  useEffect(() => {
    if (!supabaseConfigured || !session) return;
    setMessages([]);
    supabase
      .from('coach_messages')
      .select('role, body')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setMessages(data.map((d) => ({ role: d.role === 'user' ? 'user' : 'coach', body: d.body })));
        }
      });
  }, [session, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy, pending, food.logs.length]);

  async function pickImage(useCamera: boolean) {
    if (!ImageMods || analyzing || adding) return;
    if (!session) {
      Alert.alert('Sign in first', 'Create an account or sign in so your photo log syncs.');
      return;
    }
    if (useCamera) {
      let perm: { status: string } = { status: 'granted' };
      try {
        perm = await ImageMods.requestCameraPermissionsAsync();
      } catch {
        /* web/desktop: permissions API may be a no-op */
      }
      if (perm.status !== 'granted') {
        Alert.alert('Camera access', 'Allow camera access to photograph your meals.');
        return;
      }
    }
    setAnalyzing(true);
    try {
      const base64 = await imageToBase64(useCamera);
      const est = await analyzeMealImage(base64);
      setPending({ est, image: `data:image/jpeg;base64,${base64}` });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg !== 'canceled') Alert.alert('Photo check failed', msg);
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
      Alert.alert('Could not log it', String((e as Error)?.message ?? e));
    } finally {
      setAdding(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', body: text }]);
    setBusy(true);

    let reply = '';
    let aiError: string | null = null;
    if (supabaseConfigured && session) {
      try {
        const { data, error } = await supabase.functions.invoke('coach', {
          body: { message: text, conversationId, localDay: todayId() },
        });
        if (error) throw error;
        reply = String(data?.reply ?? '').trim();
      } catch (e) {
        aiError = String((e as Error)?.message ?? e);
      }
    } else if (!supabaseConfigured) {
      aiError = 'Supabase is not configured on this device yet.';
    }
    if (!reply) {
      reply = rulesReply(text);
      setMessages((prev) => [
        ...prev,
        {
          role: 'coach',
          body: aiError ? `⚠️ ${aiError}\n\n${reply}` : reply,
        },
      ]);
    } else {
      setMessages((prev) => [...prev, { role: 'coach', body: reply }]);
    }
    setBusy(false);
  }

  function startNewChat() {
    setPending(null);
    setInput('');
    setConversationId(`chat-${Date.now()}`);
  }

  const showCamera = Platform.OS !== 'web' && !!ImageMods;

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ padding: 20, paddingBottom: 12, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={sectionLabel}>VITAL</Text>
              <Text style={title}>Coach</Text>
            </View>
            <Pressable
              onPress={startNewChat}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.mint,
                backgroundColor: C.mintDim,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: C.mint, fontWeight: '800', fontSize: 13 }}>＋ New chat</Text>
            </Pressable>
          </View>
          <Text style={subtitle}>
            {supabaseConfigured
              ? 'Your AI coach, grounded in today’s stats'
              : 'Local coach mode — deploy the coach function for AI answers'}
          </Text>
        </View>

        {/* Photo-estimate confirmation card: sits above the chat while the
            user decides, so it never gets scrolled away mid-decision. */}
        {pending ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <View style={[cardStyle, { gap: 10 }]}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <Image
                  source={{ uri: pending.image }}
                  style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: C.card }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>
                    {pending.est.label}
                  </Text>
                  <Text style={{ color: C.mint, fontSize: 14, fontWeight: '800' }}>
                    ≈ {pending.est.kcal} kcal · {pending.est.protein} g protein
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 12 }}>
                    AI estimate · {CONF_LABEL[pending.est.confidence]}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={() => setPending(null)}
                  disabled={adding}
                  style={{
                    flex: 1,
                    paddingVertical: 11,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: C.line,
                    alignItems: 'center',
                    opacity: adding ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: C.text, fontWeight: '700' }}>Retake</Text>
                </Pressable>
                <Pressable
                  onPress={confirmPending}
                  disabled={adding}
                  style={{
                    flex: 2,
                    paddingVertical: 11,
                    borderRadius: 12,
                    backgroundColor: C.mint,
                    alignItems: 'center',
                    opacity: adding ? 0.6 : 1,
                  }}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color="#04120C" />
                  ) : (
                    <Text style={{ color: '#04120C', fontWeight: '800' }}>
                      Looks right · +{pending.est.kcal} kcal
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 20 }}
        >
          <View style={[cardStyle, { gap: 10 }]}>
            <Text style={sectionLabel}>Snap a meal</Text>
            <Text style={{ color: C.muted, fontSize: 14, lineHeight: 20 }}>
              Photograph your plate and the AI coach estimates the calories, then
              adds them to today&apos;s ring.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {showCamera ? (
                <Pressable
                  onPress={() => pickImage(true)}
                  disabled={analyzing}
                  style={({ pressed }) => ({
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: C.mintDim,
                    borderWidth: 1,
                    borderColor: C.mint,
                    opacity: pressed || analyzing ? 0.7 : 1,
                  })}
                >
                  <Text style={{ color: C.mint, fontWeight: '800' }}>📷 Camera</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => pickImage(false)}
                disabled={!ImageMods || analyzing}
                style={({ pressed }) => ({
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.line,
                  opacity: pressed || analyzing ? 0.7 : 1,
                })}
              >
                <Text style={{ color: C.text, fontWeight: '800' }}>
                  {showCamera ? '🖼 Gallery' : '🖼 Pick a photo'}
                </Text>
              </Pressable>
            </View>
            {analyzing ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={C.mint} />
                <Text style={{ color: C.muted, fontSize: 13 }}>Reading your plate…</Text>
              </View>
            ) : null}
          </View>

          {food.logs.length > 0 ? (
            <View style={[cardStyle, { gap: 6 }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={sectionLabel}>Today&apos;s photo log</Text>
                <Text style={{ color: C.mint, fontWeight: '800', fontSize: 13 }}>
                  +{food.kcal} kcal
                </Text>
              </View>
              {food.logs.map((log) => (
                <View
                  key={log.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: C.line,
                  }}
                >
                  <Text style={{ flex: 1, color: C.text, fontSize: 14 }} numberOfLines={1}>
                    {log.label}
                  </Text>
                  <Text style={{ color: C.muted, fontSize: 13 }}>{log.kcal} kcal</Text>
                  <Pressable onPress={() => food.remove(log.id)} hitSlop={8}>
                    <Text style={{ color: C.muted, fontSize: 15, paddingHorizontal: 4 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {messages.length === 0 ? (
            <View style={[cardStyle, { gap: 8 }]}>
              <Text style={sectionLabel}>Start here</Text>
              <Text style={{ color: C.muted, fontSize: 14, lineHeight: 21 }}>
                Ask about your day: “What should I eat after training?”, “I’m too
                tired today”, “How’s my water?”
              </Text>
            </View>
          ) : null}
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                m.role === 'user'
                  ? {
                      alignSelf: 'flex-end',
                      backgroundColor: C.mintDim,
                      borderWidth: 1,
                      borderColor: C.mint,
                      padding: 14,
                    }
                  : { padding: 14 },
                { maxWidth: '88%', borderRadius: 18 },
                m.role === 'coach' ? cardStyle : null,
              ]}
            >
              <Text style={{ color: C.text, fontSize: 14.5, lineHeight: 21 }}>{m.body}</Text>
            </View>
          ))}
          {busy ? (
            <View style={[cardStyle, { alignSelf: 'flex-start', paddingVertical: 10 }]}>
              <Text style={{ color: C.muted, fontSize: 13 }}>Coach is thinking…</Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={{
            flexDirection: 'row',
            gap: 10,
            padding: 16,
            borderTopWidth: 1,
            borderTopColor: C.line,
            backgroundColor: 'rgba(5,7,10,0.95)',
          }}
        >
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: C.line,
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask your coach…"
              placeholderTextColor={C.muted}
              multiline
              style={{ color: C.text, fontSize: 15, maxHeight: 90 }}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={busy || !input.trim()}
            style={{
              backgroundColor: C.mint,
              borderRadius: 14,
              paddingHorizontal: 18,
              justifyContent: 'center',
              opacity: busy || !input.trim() ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#04120C', fontWeight: '800' }}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
