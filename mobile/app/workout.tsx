import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Button,
  Card,
  ExercisePhoto,
  FadeIn,
  Header,
  Icon,
  Screen,
  Txt,
} from '@/components';
import { exercises } from '@/data/plan';
import { useStore } from '@/state/store';
import { colors, isIOS, radius, s, shadow, spacing } from '@/theme';

/** Rough steady-state strength-training burn used for the live estimate. */
const KCAL_PER_MIN = 7.5;

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (secs: number) => `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;

/**
 * Workout player, modelled on the reference's exercise screen: a large
 * illustration with a floating stopwatch card, then the exercise queue.
 *
 * Each exercise gets a countdown that starts on its own; when it reaches zero
 * the player advances with a haptic tap, so a session can run hands-free.
 */
export default function Workout() {
  const logWorkout = useStore((st) => st.logWorkout);

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<string[]>([]);
  const [running, setRunning] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(exercises[0].minutes * 60);
  const [elapsed, setElapsed] = useState(0);
  const finishedRef = useRef(false);

  const current = exercises[index];
  const finished = done.length >= exercises.length;
  const kcal = Math.round((elapsed / 60) * KCAL_PER_MIN);

  const advance = useCallback(
    (markDone: boolean) => {
      if (isIOS) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone((d) => {
        const id = exercises[Math.min(index, exercises.length - 1)].id;
        return markDone && !d.includes(id) ? [...d, id] : d;
      });
      setIndex((i) => {
        const next = i + 1;
        if (next < exercises.length) {
          setSecondsLeft(exercises[next].minutes * 60);
          setRunning(true);
          return next;
        }
        setRunning(false);
        return i;
      });
    },
    [index],
  );

  // The countdown. One interval drives both the per-exercise clock and the
  // session total, so they can never drift apart.
  useEffect(() => {
    if (!running || finished) return;
    const t = setInterval(() => {
      setElapsed((e) => e + 1);
      setSecondsLeft((sLeft) => {
        if (sLeft <= 1) {
          // Advance outside the setState pass.
          setTimeout(() => advance(true), 0);
          return 0;
        }
        return sLeft - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, finished, advance]);

  // Completing the last exercise ends the session exactly once.
  useEffect(() => {
    if (finished && !finishedRef.current) {
      finishedRef.current = true;
      logWorkout();
    }
  }, [finished, logWorkout]);

  const progress = useMemo(() => done.length / exercises.length, [done]);

  if (finished) {
    return (
      <Screen contentStyle={styles.content} header={<Header title="Workout complete" back />}>
        <FadeIn>
          <Card accent style={styles.doneCard}>
            <Txt variant="display">🎉</Txt>
            <Txt variant="h1" center>
              Session finished
            </Txt>
            <Txt variant="body" color={colors.textSoft} center>
              {exercises.length} exercises · {fmt(elapsed)} · about {kcal} kcal
            </Txt>
          </Card>
        </FadeIn>
        <FadeIn delay={120}>
          <Button label="Back to home" onPress={() => router.replace('/(tabs)')} />
        </FadeIn>
      </Screen>
    );
  }

  return (
    <Screen
      contentStyle={styles.content}
      header={
        <Header
          title="Upper body"
          subtitle={`Exercise ${index + 1} of ${exercises.length} · ${current.name}`}
          back
        />
      }
    >
      {/* Hero illustration with the floating stopwatch card. */}
      <FadeIn>
        <View style={styles.heroWrap}>
          <ExercisePhoto name={current.art} width={s(340)} height={s(300)} radius={24} />

          <View style={styles.stopwatch}>
            <View style={styles.timerPill}>
              <Txt variant="metricSm" color={colors.onAccent} maxFontSizeMultiplier={1}>
                {fmt(secondsLeft)}
              </Txt>
            </View>
            <Pressable
              onPress={() => setRunning((r) => !r)}
              accessibilityRole="button"
              accessibilityLabel={running ? 'Pause timer' : 'Resume timer'}
              style={({ pressed }) => [styles.pauseBtn, pressed && styles.pressed]}
            >
              <Icon name={running ? 'pause' : 'play'} size={18} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>
      </FadeIn>

      {/* Live numbers, reference style. */}
      <FadeIn delay={80}>
        <View style={styles.statRow}>
          <Card style={styles.statCard}>
            <View style={styles.statHead}>
              <Icon name="flame" size={15} color={colors.onBadgeYellow} />
              <Txt variant="caption" color={colors.muted}>
                CALORIES
              </Txt>
            </View>
            <Txt variant="metricSm">
              {kcal}
              <Txt variant="small" color={colors.muted}>
                {' '}
                kcal
              </Txt>
            </Txt>
          </Card>
          <Card style={styles.statCard}>
            <View style={styles.statHead}>
              <Icon name="clock" size={15} color={colors.onChart} />
              <Txt variant="caption" color={colors.muted}>
                ELAPSED
              </Txt>
            </View>
            <Txt variant="metricSm">{fmt(elapsed)}</Txt>
          </Card>
        </View>
      </FadeIn>

      <FadeIn delay={140}>
        <View style={styles.actionRow}>
          <View style={styles.flex}>
            <Button
              label="Done, next"
              onPress={() => advance(true)}
              iconRight={<Icon name="chevron" size={13} color={colors.onPrimary} strokeWidth={2.2} />}
            />
          </View>
          <Pressable
            onPress={() => advance(false)}
            accessibilityRole="button"
            accessibilityLabel="Skip this exercise"
            style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
          >
            <Txt variant="smallMed" color={colors.textSoft}>
              Skip
            </Txt>
          </Pressable>
        </View>
      </FadeIn>

      {/* Queue */}
      <FadeIn delay={200}>
        <View style={styles.queueHead}>
          <Txt variant="h2">Session</Txt>
          <Txt variant="small" color={colors.muted}>
            {done.length} of {exercises.length} done · {Math.round(progress * 100)}%
          </Txt>
        </View>

        <View style={styles.queue}>
          {exercises.map((ex, i) => {
            const isDone = done.includes(ex.id);
            const isCurrent = i === index && !isDone;
            return (
              <View key={ex.id} style={[styles.exRow, isCurrent && styles.exRowCurrent]}>
                <ExercisePhoto name={ex.art} size={s(48)} radius={14} />
                <View style={styles.flex}>
                  <Txt variant="h3" numberOfLines={1}>
                    {ex.name}
                  </Txt>
                  <Txt variant="small" color={colors.muted}>
                    {ex.detail} · {ex.minutes} min
                  </Txt>
                </View>
                {isDone ? (
                  <View style={styles.doneBadge}>
                    <Icon name="check" size={14} color={colors.onAccent} strokeWidth={2.4} />
                  </View>
                ) : isCurrent ? (
                  <View style={styles.nowBadge}>
                    <Txt variant="caption" color={colors.onAccent} maxFontSizeMultiplier={1}>
                      Now
                    </Txt>
                  </View>
                ) : (
                  <Txt variant="caption" color={colors.faint}>
                    {i + 1}
                  </Txt>
                )}
              </View>
            );
          })}
        </View>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  flex: { flex: 1 },
  pressed: { opacity: 0.72 },

  heroWrap: { alignItems: 'center' },
  stopwatch: {
    position: 'absolute',
    bottom: -s(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    paddingLeft: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  timerPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    minWidth: s(110),
    alignItems: 'center',
  },
  pauseBtn: {
    width: s(44),
    height: s(44),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },

  statRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  statCard: { flex: 1, gap: spacing.xs },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skipBtn: {
    minHeight: s(54),
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    ...shadow.card,
  },

  queueHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  queue: { gap: spacing.sm },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  exRowCurrent: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  doneBadge: {
    width: s(28),
    height: s(28),
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  nowBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  doneCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
});
