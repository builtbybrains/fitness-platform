/* "What your coach remembers": every fact the coach saved, newest first.
   People can delete any item (never edit one). A deleted item disappears
   at once with Undo for 5 seconds; only then is it deleted on the server
   (straight away when another item is deleted or the screen is left). */

import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [flash, setFlash] = useState<{ tone: 'error' | 'success'; text: string; undo?: boolean } | null>(null);
  // The item waiting out its undo window, and the timer that deletes it.
  const pending = useRef<{ item: MemoryFact; index: number; timer: ReturnType<typeof setTimeout> } | null>(null);

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

  /** Delete the pending item on the server now. On failure it comes back. */
  const commit = useCallback(
    async (quiet = false) => {
      const p = pending.current;
      if (!p || !userId) return;
      clearTimeout(p.timer);
      pending.current = null;
      try {
        await deleteMemory(userId, p.item.id);
        // The undo window closed; leave the flash if a newer delete owns it.
        if (!quiet && !pending.current) setFlash((f) => (f?.undo ? null : f));
      } catch (e) {
        if (quiet) return;
        setItems((list) => {
          if (!list || list.some((m) => m.id === p.item.id)) return list;
          const next = [...list];
          next.splice(Math.min(p.index, next.length), 0, p.item);
          return next;
        });
        setFlash({ tone: 'error', text: `${asApiError(e).message} It's back in the list.` });
      }
    },
    [userId],
  );

  // Leaving the screen ends the undo window.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => () => void commitRef.current(true), []);

  function remove(item: MemoryFact) {
    if (!userId || !items) return;
    void commit();
    const index = items.findIndex((m) => m.id === item.id);
    setItems(items.filter((m) => m.id !== item.id));
    pending.current = { item, index, timer: setTimeout(() => void commit(), 5000) };
    setFlash({ tone: 'success', text: 'Deleted. Your coach no longer remembers that.', undo: true });
  }

  function undo() {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setItems((list) => {
      const next = [...(list ?? [])];
      next.splice(Math.min(p.index, next.length), 0, p.item);
      return next;
    });
    setFlash({ tone: 'success', text: 'Restored. Your coach still remembers it.' });
  }

  useEffect(() => {
    if (!flash || flash.undo) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <SubScreen
      title="What your coach remembers"
      subtitle="Things you told your coach, and what it learned from how you use your plan. Delete anything you don't want it to use."
      footer={
        flash ? (
          <Notice
            tone={flash.tone}
            action={flash.undo ? <Button compact variant="secondary" icon="refresh" label="Undo" onPress={undo} accessibilityLabel="Undo delete" style={{ alignSelf: 'flex-start' }} /> : undefined}
          >
            {flash.text}
          </Notice>
        ) : undefined
      }
    >
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
                onPress={() => remove(m)}
                accessibilityRole="button"
                accessibilityLabel={`Delete: ${m.fact}`}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: pressed ? C.pressed : 'transparent',
                })}
              >
                <ExtraIcon name="trash" size={20} color={C.muted} />
              </Pressable>
            </View>
          ))}
          <Text style={[T.small, { fontFamily: FONT.body, marginTop: 4 }]}>Your coach keeps learning as you chat. You have 5 seconds to undo a delete, then it's gone for good.</Text>
        </View>
      )}
    </SubScreen>
  );
}
