/* Today's coach note, under the greeting: the B mark, "Coach", and one or
   two sentences written for this person today (api/coach dailyNote). The
   note is asked for once a day, once the plan and history are known, and
   kept on this device per person and day. Until it arrives, and whenever
   it can't (no account, offline, no AI), the day's built-in tip shows
   instead; this card never shows an error. Tapping opens Coach with the
   note as its first message. */

import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, card as cardStyle, T } from '../../design';
import { useAuth } from '../../auth';
import { dailyNote, type DailyNoteSummary } from '../../api/coach';
import { isCloudUser } from '../../lib/cloud';
import { loadLocal, saveLocal } from '../../lib/localFallback';
import { tipFor } from '../../lib/coachTips';
import { BuiltMark } from '../BuiltLogo';
import { FadeIn } from '../FadeIn';
import { Icon } from '../Icon';

type Cached = { day: string; note: string };

// Person and day already asked this session, so a failed call isn't
// repeated every time Today re-renders.
const asked = new Set<string>();

function useDailyNote(today: string, summary: DailyNoteSummary, ready: boolean): { note: string | null; fresh: boolean } {
  const { userId } = useAuth();
  const [state, setState] = useState<{ note: string | null; fresh: boolean }>({ note: null, fresh: false });
  const summaryRef = useRef(summary);
  summaryRef.current = summary;

  useEffect(() => {
    setState({ note: null, fresh: false });
    if (!userId) return;
    let alive = true;
    void (async () => {
      const cached = await loadLocal<Cached>(userId, 'coachNote');
      if (!alive) return;
      if (cached?.day === today && cached.note) {
        setState({ note: cached.note, fresh: false });
        return;
      }
      const key = `${userId}:${today}`;
      if (!ready || !isCloudUser(userId) || asked.has(key)) return;
      asked.add(key);
      try {
        const note = await dailyNote(userId, summaryRef.current);
        if (!note) return;
        await saveLocal(userId, 'coachNote', { day: today, note } satisfies Cached);
        if (alive) setState({ note, fresh: true });
      } catch {
        /* the tip stays */
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, today, ready]);

  return state;
}

export function CoachNote({ today, summary, ready }: { today: string; summary: DailyNoteSummary; ready: boolean }) {
  const { note, fresh } = useDailyNote(today, summary, ready);
  const text = note ?? tipFor(today);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(tabs)/coach', params: { about: text } })}
      accessibilityRole="button"
      accessibilityLabel={`Coach: ${text}`}
      accessibilityHint="Opens Coach to talk about it"
      style={({ pressed }) => [cardStyle, { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, backgroundColor: pressed ? C.raised : C.card }]}
    >
      {/* The Coach tab's avatar, on raised Carbon so it reads on the card. */}
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
        <BuiltMark size={16} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.small}>Coach</Text>
        <FadeIn key={text} play={fresh}>
          <Text style={[T.body, { color: C.stone }]}>{text}</Text>
        </FadeIn>
      </View>
      <View style={{ alignSelf: 'center' }}>
        <Icon name="chevronRight" size={20} color={C.muted} />
      </View>
    </Pressable>
  );
}
