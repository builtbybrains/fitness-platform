/* "Your coach sees": one line under the Coach header with today's context
   as small chips (today's session, calories left, the streak). Tapping it
   opens a sheet listing what the coach reads when it answers, with a way
   to the memory list. The line scrolls sideways when it is wider than the
   screen (the cut chip at the edge shows there is more), inside NoTabSwipe
   so that drag never changes tab. */

import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, FONT, R, T } from '../../design';
import { haptic } from '../../lib/haptics';
import type { HeaderStat } from '../../lib/headerStats';
import { Icon, type IconName } from '../Icon';
import { LinkButton } from '../Button';
import { NoTabSwipe } from '../ScreenFade';
import { Sheet } from '../training/Sheet';

export function ContextStrip({ chips, onOpen }: { chips: readonly HeaderStat[]; onOpen: () => void }) {
  if (!chips.length) return null;
  const spoken = chips.map((c) => c.label ?? c.text).join(', ');
  return (
    <NoTabSwipe style={{ marginHorizontal: -20 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
        <Pressable
          onPress={() => {
            haptic.select();
            onOpen();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Your coach sees: ${spoken}.`}
          accessibilityHint="Shows what your coach uses to answer"
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, opacity: pressed ? 0.7 : 1 })}
        >
          <Text style={[T.small, { color: C.muted }]} numberOfLines={1}>
            Your coach sees
          </Text>
          {chips.map((s) => (
            <View key={`${s.icon}-${s.text}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: R.pill, backgroundColor: C.card }}>
              <Icon name={s.icon} size={15} color={C.stone} />
              <Text numberOfLines={1} style={[T.small, { color: C.stone }]}>
                {s.text}
              </Text>
            </View>
          ))}
          <Icon name="chevronRight" size={16} color={C.muted} />
        </Pressable>
      </ScrollView>
    </NoTabSwipe>
  );
}

const SOURCES: { icon: IconName; title: string; detail: string }[] = [
  { icon: 'dumbbell', title: 'Your plan', detail: "This week's workouts, what you've done and any days you moved." },
  { icon: 'burger', title: 'Food', detail: 'Plan meals you tick and everything you log today.' },
  { icon: 'drop', title: 'Water', detail: 'Glasses logged today.' },
  { icon: 'steps', title: 'Activities', detail: 'Walks, sports and other activities from the last two weeks.' },
  { icon: 'scale', title: 'Check-ins', detail: 'Your latest weigh-in or monthly check-in.' },
  { icon: 'person', title: 'Your answers', detail: 'Goal, timeline, injuries and diet from your profile.' },
  { icon: 'brain', title: 'Memory', detail: "Facts you've told it, like an old injury or a food you skip." },
];

export function ContextSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="What your coach uses" subtitle="So every answer fits your day. It reads these each time you ask.">
      <View accessibilityRole="list" style={{ gap: 4 }}>
        {SOURCES.map((s) => (
          <View key={s.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={s.icon} size={20} color={C.stone} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={T.bodyStrong}>{s.title}</Text>
              <Text style={T.meta}>{s.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <LinkButton
        align="flex-start"
        onPress={() => {
          onClose();
          router.push('/memory');
        }}
        accessibilityLabel="See what your coach remembers"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>See what it remembers</Text>
          <Icon name="chevronRight" size={16} color={C.muted} />
        </View>
      </LinkButton>
    </Sheet>
  );
}
