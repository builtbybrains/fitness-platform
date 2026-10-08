/* Milestones on the Progress tab: a grid of round badges. Earned: a Built
   Green ring and outline icon on Carbon, with the day it happened. Not
   yet: a muted ring, a faint icon, and for counts a thin arc (once it is
   long enough to read as one) and "6/10".
   A milestone earned since the last visit is shown once: the newest one
   gets the celebration overlay and every new one carries a "New" tag on
   its ring for this visit. Seen ids are kept per person on this device.
   A badge tilts toward the finger while it is held (components/Tilt). */

import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { C, card as cardStyle, FONT, R, T } from '../../design';
import { useCelebration } from '../../celebration';
import { loadLocal, saveLocal } from '../../lib/localFallback';
import { newlyEarned, nextMilestone, type Milestone, type MilestoneId } from '../../lib/milestones';
import { Icon, type IconName } from '../Icon';
import { TiltPressable } from '../Tilt';
import { useTween } from '../motion';

const ICON: Record<MilestoneId, IconName> = {
  first_workout: 'dumbbell',
  streak_3: 'flame',
  streak_7: 'flame',
  streak_30: 'flame',
  workouts_10: 'bars',
  workouts_50: 'bars',
  first_checkin: 'scale',
  personal_best: 'medal',
};

const SEEN = 'milestonesSeen';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const RING = 56;
const STROKE = 2;
/** Below this share the arc is a dot that reads as a glitch, so it waits. */
const MIN_ARC = 0.08;

function dayMonth(id: string | null): string {
  if (!id) return '';
  const [, m, d] = id.split('-').map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]}`;
}

function Badge({ m, fresh }: { m: Milestone; fresh: boolean }) {
  const share = m.earned ? 1 : m.progress ? m.progress.value / m.progress.target : 0;
  const arc = useTween(share);
  const r = (RING - STROKE) / 2;
  const around = 2 * Math.PI * r;
  const caption = m.earned ? dayMonth(m.earnedAt) || 'Earned' : m.progress ? `${m.progress.value}/${m.progress.target}` : 'Not yet';
  const spoken = m.earned
    ? `${m.title}. Earned${m.earnedAt ? ` ${dayMonth(m.earnedAt)}` : ''}${fresh ? ', new' : ''}. ${m.description}`
    : `${m.title}. ${m.progress ? `${m.progress.value} of ${m.progress.target}. ` : ''}Not earned yet. ${m.description}`;

  return (
    // Held, not tapped: no action, so it stays out of the keyboard's tab order.
    <TiltPressable accessible focusable={false} accessibilityLabel={spoken} style={{ width: '25%', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 2 }}>
      <View style={{ width: RING, height: RING, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING} height={RING} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={m.earned ? C.green : C.pressed} strokeWidth={STROKE} fill="none" />
          {!m.earned && share >= MIN_ARC ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={C.muted}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${around * arc} ${around}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
        </Svg>
        <Icon name={ICON[m.id]} size={24} color={m.earned ? C.green : C.inputBorder} />
        {fresh ? (
          <View style={{ position: 'absolute', bottom: -7, left: 0, right: 0, alignItems: 'center' }}>
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: R.pill, backgroundColor: C.card, borderWidth: 1, borderColor: C.greenBorder }}>
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 11, lineHeight: 14, color: C.green }}>New</Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={{ alignItems: 'center', gap: 2 }}>
        {/* Two lines reserved, so every caption in a row lines up. */}
        <Text numberOfLines={2} style={[T.small, { fontSize: 12, lineHeight: 16, minHeight: 32, textAlign: 'center', textAlignVertical: 'center', color: m.earned ? C.text : C.muted }]}>
          {m.title}
        </Text>
        <Text style={[T.small, { fontSize: 11, lineHeight: 14, color: C.faint }]}>{caption}</Text>
      </View>
    </TiltPressable>
  );
}

export function Milestones({ items, userId, ready }: { items: Milestone[]; userId: string | null; ready: boolean }) {
  const celebration = useCelebration();
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const checked = useRef<string | null>(null);
  const earnedKey = items
    .filter((m) => m.earned)
    .map((m) => m.id)
    .join(',');

  // Once the data is in: anything earned but not seen yet is new.
  useEffect(() => {
    if (!ready || !userId) return;
    const key = `${userId}:${earnedKey}`;
    if (checked.current === key) return;
    checked.current = key;
    let alive = true;
    void loadLocal<string[]>(userId, SEEN).then((seen) => {
      if (!alive) return;
      const news = newlyEarned(items, seen ?? []);
      if (!news.length) return;
      void saveLocal(userId, SEEN, [...(seen ?? []), ...news.map((m) => m.id)]);
      setFresh((prev) => new Set([...prev, ...news.map((m) => m.id)]));
      celebration.show({ variant: 'milestone', title: news[0].title, detail: news[0].description, icon: ICON[news[0].id] });
    });
    return () => {
      alive = false;
    };
    // `items` changes identity on every history update; earnedKey is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, earnedKey]);

  const earned = items.filter((m) => m.earned).length;
  const next = nextMilestone(items);

  return (
    <View style={[cardStyle, { gap: 12 }]}>
      <View style={{ gap: 2 }}>
        <Text style={T.h3} accessibilityRole="header">
          Milestones
        </Text>
        <Text style={T.small}>
          {earned} of {items.length} earned
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 }}>
        {items.map((m) => (
          <Badge key={m.id} m={m} fresh={fresh.has(m.id)} />
        ))}
      </View>
      <Text style={T.meta}>
        {next ? (
          <>
            <Text style={{ fontFamily: FONT.bodySemi, color: C.text }}>Next up: {next.title}. </Text>
            {next.progress ? `${next.progress.value} of ${next.progress.target} so far.` : next.description}
          </>
        ) : (
          'Every milestone earned. Keep building.'
        )}
      </Text>
    </View>
  );
}
