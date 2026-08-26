import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Icon, Logo, Txt } from '@/components';
import { useTabBarHeight } from '@/lib/tabBar';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { aiConfigured } from '@/services/ai';
import { analyseMealPhoto, askCoach, MealAnalysis, SUGGESTIONS } from '@/services/coach';
import { useDerived, useStore } from '@/state/store';
import { colors, fs, MAX_FONT_SCALE_TIGHT, radius, s, spacing, type } from '@/theme';

interface Message {
  id: string;
  role: 'user' | 'coach';
  text: string;
  analysis?: MealAnalysis;
}

export default function AI() {
  const profile = useStore((st) => st.profile);
  const medical = useStore((st) => st.medical);
  const d = useDerived();
  const insets = useSafeAreaInsets();
  const { height: tabBarHeight } = useTabBarHeight();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || thinking) return;

      setDraft('');
      setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: question }]);
      setThinking(true);

      const history = messages
        .filter((m) => !m.analysis && m.text)
        .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text }));

      const reply = await askCoach(
        question,
        {
          profile,
          medical,
          calorieTarget: d.calorieTarget,
          caloriesEaten: d.caloriesEaten,
          waterGlasses: d.waterGlasses,
          waterTarget: d.waterTarget,
          lost: d.lost,
          toLose: d.toLose,
          daysSinceWorkout: d.daysSinceWorkout,
        },
        history,
      );

      // A short beat so the typing indicator reads as thought, not lag.
      await new Promise((r) => setTimeout(r, 420));
      setMessages((m) => [...m, { id: `c${Date.now()}`, role: 'coach', text: reply }]);
      setThinking(false);
    },
    [d, profile, medical, messages, thinking],
  );

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, thinking]);

  const analysePhoto = useCallback(
    async (fromCamera: boolean) => {
      const picker = await import('expo-image-picker');

      const perm = fromCamera
        ? await picker.requestCameraPermissionsAsync()
        : await picker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setMessages((m) => [
          ...m,
          { id: `c${Date.now()}`, role: 'coach', text: 'I need permission to use your camera before I can read a meal.' },
        ]);
        return;
      }

      const result = fromCamera
        ? await picker.launchCameraAsync({ quality: 0.5, base64: true })
        : await picker.launchImageLibraryAsync({ quality: 0.5, base64: true, mediaTypes: ['images'] });
      if (result.canceled || !result.assets?.[0]) return;

      setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: '📷 Sent a photo of my meal' }]);
      setThinking(true);
      const a = await analyseMealPhoto(result.assets[0].uri, result.assets[0].base64 ?? undefined);
      setThinking(false);
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: 'coach', text: '', analysis: a }]);
    },
    [],
  );

  const empty = messages.length === 0;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.xs }]}>
          <Logo size={s(30)} />
          <View style={styles.flex}>
            <Txt variant="h3">Your AI coach</Txt>
            <Txt variant="caption" color={colors.muted}>
              {aiConfigured ? 'Live AI · knows your plan' : 'Nutrition, training and your goal'}
            </Txt>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[styles.thread, { paddingBottom: spacing.md }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {empty ? (
            <View style={styles.empty}>
              <Txt variant="h2" center>
                What can I help with?
              </Txt>
              <Txt variant="small" color={colors.muted} center>
                Ask anything about your meals, training or progress.
              </Txt>
            </View>
          ) : null}

          {messages.map((m) =>
            m.analysis ? (
              <MealCard key={m.id} analysis={m.analysis} />
            ) : (
              <Bubble key={m.id} message={m} />
            ),
          )}

          {thinking ? <Typing /> : null}
        </ScrollView>

        <View style={styles.footer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestions}
            keyboardShouldPersistTaps="handled"
          >
            {SUGGESTIONS.map((sug) => (
              <Pressable
                key={sug}
                onPress={() => send(sug)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Txt variant="small" color={colors.textSoft} numberOfLines={1}>
                  {sug}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>

          <View style={[styles.composer, { marginBottom: tabBarHeight + spacing.sm }]}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask your coach…"
              placeholderTextColor={colors.faint}
              selectionColor={colors.primary}
              multiline
              maxLength={500}
              maxFontSizeMultiplier={MAX_FONT_SCALE_TIGHT}
              accessibilityLabel="Message your coach"
              onSubmitEditing={() => send(draft)}
            />
            <Pressable
              onPress={() => analysePhoto(true)}
              disabled={thinking}
              accessibilityRole="button"
              accessibilityLabel="Photograph a meal"
              style={({ pressed }) => [styles.cameraBtn, pressed && styles.pressed]}
            >
              <Icon name="meal" size={19} color={colors.primaryLight} />
            </Pressable>
            <Pressable
              onPress={() => send(draft)}
              disabled={!draft.trim() || thinking}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={({ pressed }) => [
                styles.sendBtn,
                (!draft.trim() || thinking) && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Icon name="send" size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ message }: { message: Message }) {
  const mine = message.role === 'user';
  const opacity = useSharedValue(0);
  const translate = useSharedValue(10);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      translate.value = 0;
      return;
    }
    opacity.value = withTiming(1, { duration: 260 });
    translate.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [opacity, translate, reduced]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translate.value }],
  }));

  return (
    <Animated.View style={[styles.bubbleWrap, mine ? styles.mineWrap : styles.theirsWrap, style]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Txt variant="body" color={mine ? colors.onPrimary : colors.text}>
          {message.text}
        </Txt>
      </View>
    </Animated.View>
  );
}

const CONF_COLOR = { high: colors.success, medium: colors.warning, low: colors.danger };

/**
 * Shows a range and per-item confidence rather than one exact number. Portion
 * size, oil and sauce are the hard part of reading a plate, so the honest answer is a
 * band the user can correct in a tap.
 */
function MealCard({ analysis }: { analysis: MealAnalysis }) {
  return (
    <View style={[styles.bubbleWrap, styles.theirsWrap]}>
      <View style={styles.mealCard}>
        <Txt variant="caption" color={colors.muted}>
          ESTIMATED FROM YOUR PHOTO
        </Txt>
        <Txt variant="h2">
          {analysis.kcalLow}&ndash;{analysis.kcalHigh} kcal
        </Txt>

        {analysis.items.map((it) => (
          <View key={it.name} style={styles.mealRow}>
            <View style={[styles.mealDot, { backgroundColor: CONF_COLOR[it.confidence] }]} />
            <Txt variant="small" style={{ flex: 1 }}>
              {it.name}
            </Txt>
            <Txt variant="small" color={colors.muted}>
              {it.grams}g &middot; {it.kcal} kcal
            </Txt>
          </View>
        ))}

        <View style={styles.mealTotals}>
          <Txt variant="smallMed">P {analysis.protein}g</Txt>
          <Txt variant="smallMed" color={colors.textSoft}>C {analysis.carbs}g</Txt>
          <Txt variant="smallMed" color={colors.textSoft}>F {analysis.fat}g</Txt>
          <Txt variant="smallMed" color={colors.muted} style={{ marginLeft: 'auto' }}>
            {Math.round(analysis.confidence * 100)}% sure
          </Txt>
        </View>

        {analysis.question ? (
          <Txt variant="small" color={colors.primaryLight}>
            {analysis.question}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

function Typing() {
  return (
    <View style={[styles.bubbleWrap, styles.theirsWrap]}>
      <View style={[styles.bubble, styles.theirs, styles.typing]}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} index={i} />
        ))}
      </View>
    </View>
  );
}

function Dot({ index }: { index: number }) {
  const v = useSharedValue(0.35);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    v.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 200 + index * 90 }),
        withTiming(1, { duration: 320 }),
        withTiming(0.35, { duration: 320 }),
      ),
      -1,
      false,
    );
  }, [index, v, reduced]);

  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.8 + v.value * 0.3 }] }));

  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thread: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl },
  bubbleWrap: { flexDirection: 'row', maxWidth: '100%' },
  mineWrap: { justifyContent: 'flex-end' },
  theirsWrap: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '88%', padding: spacing.md, borderRadius: radius.lg },
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  theirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  typing: { flexDirection: 'row', gap: 6, paddingVertical: spacing.md },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primaryLight },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  suggestions: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  suggestion: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: s(38),
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    maxWidth: s(260),
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  input: {
    flex: 1,
    minHeight: s(48),
    maxHeight: s(120),
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontFamily: type.body.fontFamily,
    fontSize: fs(15),
  },
  sendBtn: {
    width: s(48),
    height: s(48),
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendDisabled: { opacity: 0.4 },
  cameraBtn: {
    width: s(48),
    height: s(48),
    minWidth: 44,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  mealCard: {
    maxWidth: '92%',
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    gap: spacing.xs,
  },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  mealDot: { width: 7, height: 7, borderRadius: 4 },
  mealTotals: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  pressed: { opacity: 0.7 },
});
