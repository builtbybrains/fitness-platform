/* "What your coach remembers": every fact the coach saved, newest first.
   People can delete any item (never edit one). */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, FONT, R, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { deleteMemory, listMemory } from '../../src/api/memory';
import { Notice } from '../../src/components/Bits';
import { Button } from '../../src/components/Button';
import { EmptyState, ErrorState, Loading, SubScreen } from '../../src/components/profile/SubScreen';
import { ExtraIcon } from '../../src/components/profile/icons';
import type { MemoryCategory, MemoryFact, MemorySource } from '../../src/types';

const CATEGORY: Record<MemoryCategory, string> = {
  injury: 'Injury',
  health: 'Health',
  preference: 'Preference',
  like: 'Likes',
  dislike: 'Dislikes',
  schedule: 'Schedule',
  goal: 'Goal',
  equipment: 'Equipment',
  food: 'Food',
  training: 'Training',
  other: 'Other',
};

const SOURCE: Record<MemorySource, string> = {
  chat: 'From your chats',
  behaviour: 'From how you use your plan',
  checkin: 'From a check-in',
  profile: 'From your profile',
};

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function MemoryScreen() {
  const { userId } = useAuth();
  const [items, setItems] = useState<MemoryFact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listMemory(userId));
    } catch (e) {
      setError(asApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(item: MemoryFact) {
    if (!userId || !items) return;
    setRemoving(item.id);
    setFlash(null);
    const before = items;
    setItems(items.filter((m) => m.id !== item.id));
    try {
      await deleteMemory(userId, item.id);
      setFlash({ tone: 'success', text: 'Deleted. Your coach no longer remembers that.' });
    } catch (e) {
      setItems(before);
      setFlash({ tone: 'error', text: asApiError(e).message });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <SubScreen
      title="What your coach remembers"
      subtitle="Things you told your coach, and what it learned from how you use your plan. Delete anything you don't want it to use."
    >
      {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}
      {loading && !items ? (
        <Loading label="Loading what your coach remembers" />
      ) : error && !items ? (
        <ErrorState message={error} onRetry={load} retrying={loading} />
      ) : !items?.length ? (
        <EmptyState
          icon="brain"
          title="Nothing yet"
          body="When you tell your coach about an injury, a food you don't eat or your schedule, it saves it here so you never repeat yourself."
          action={<Button compact variant="secondary" label="Talk to your coach" onPress={() => router.push('/(tabs)/coach')} />}
        />
      ) : (
        <View style={{ gap: 10 }} accessibilityLabel={`${items.length} things remembered`}>
          {items.map((m) => (
            <View key={m.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: C.card, borderRadius: R.tile, padding: 16, paddingRight: 8 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[T.body, { color: C.text }]}>{m.fact}</Text>
                <Text style={T.small}>
                  {CATEGORY[m.category] ?? 'Other'} · {SOURCE[m.source] ?? 'Saved'}
                  {when(m.created_at) ? ` · ${when(m.created_at)}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() => void remove(m)}
                disabled={removing === m.id}
                accessibilityRole="button"
                accessibilityLabel={`Delete: ${m.fact}`}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? C.pressed : 'transparent',
                  opacity: removing === m.id ? 0.4 : 1,
                })}
              >
                <ExtraIcon name="trash" size={20} color={C.muted} />
              </Pressable>
            </View>
          ))}
          <Text style={[T.small, { fontFamily: FONT.body, marginTop: 4 }]}>Your coach keeps learning as you chat. Deleted items are gone for good.</Text>
        </View>
      )}
    </SubScreen>
  );
}
