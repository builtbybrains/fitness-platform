/* Coach tab: AI chat through the Supabase Edge Function (the only place the
   AI key lives). History persists in the coach_messages table; when the
   function isn't configured the tab answers with built-in coaching rules so
   it never feels broken. */

import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C, card as cardStyle, screen, sectionLabel, subtitle, title } from '../../src/design';
import { useAuth } from '../../src/auth';
import { supabase } from '../../src/lib/supabase';
import { supabaseConfigured } from '../../supabase.config';

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

export default function CoachTab() {
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!supabaseConfigured || !session) return;
    supabase
      .from('coach_messages')
      .select('role, body')
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        if (Array.isArray(data) && data.length) {
          setMessages(data.map((d) => ({ role: d.role === 'user' ? 'user' : 'coach', body: d.body })));
        }
      });
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', body: text }]);
    setBusy(true);

    let reply = '';
    if (supabaseConfigured && session) {
      try {
        const { data, error } = await supabase.functions.invoke('coach', { body: { message: text } });
        if (error) throw error;
        reply = String(data?.reply ?? '').trim();
      } catch {
        reply = '';
      }
    }
    if (!reply) reply = rulesReply(text);
    setMessages((prev) => [...prev, { role: 'coach', body: reply }]);
    setBusy(false);
  }

  return (
    <SafeAreaView style={screen} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ padding: 20, gap: 2 }}>
          <Text style={sectionLabel}>VITAL</Text>
          <Text style={title}>Coach</Text>
          <Text style={subtitle}>
            {supabaseConfigured
              ? 'Your AI coach, grounded in today’s stats'
              : 'Local coach mode — deploy the coach function for AI answers'}
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 20 }}
        >
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
