/* Coach memory: what the coach remembers about the person. Profile shows
   the list; the person can delete any item, never edit one. The coach
   adds facts from chat, the app adds behaviour (swaps, moved days) with
   rememberFact, check-ins add theirs. Duplicates are ignored. */

import { supabase } from '../lib/supabase';
import { isCloudUser } from '../lib/cloud';
import { loadLocal, updateLocal } from '../lib/localFallback';
import { newId } from '../lib/cloud';
import { fromDbError } from './errors';
import type { MemoryCategory, MemoryFact, MemorySource } from '../types';

const LOCAL = 'memory';

function key(fact: string): string {
  return fact.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
}

/** Everything remembered, newest first. */
export async function listMemory(userId: string): Promise<MemoryFact[]> {
  if (!isCloudUser(userId)) return (await loadLocal<MemoryFact[]>(userId, LOCAL)) ?? [];
  const { data, error } = await supabase
    .from('coach_memory')
    .select('id, fact, category, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) {
    const cached = await loadLocal<MemoryFact[]>(userId, LOCAL);
    if (cached) return cached;
    throw fromDbError(error, "Couldn't load what your coach remembers.");
  }
  await updateLocal<MemoryFact[]>(userId, LOCAL, () => (data ?? []) as MemoryFact[]);
  return (data ?? []) as MemoryFact[];
}

/** Forget one item. */
export async function deleteMemory(userId: string, id: string): Promise<void> {
  await updateLocal<MemoryFact[]>(userId, LOCAL, (prev) => (prev ?? []).filter((m) => m.id !== id));
  if (!isCloudUser(userId)) return;
  const { error } = await supabase.from('coach_memory').delete().eq('id', id).eq('user_id', userId);
  if (error) throw fromDbError(error, "Couldn't delete that. Try again.");
}

/** Add a fact (behaviour the app noticed, or a preference set in Profile).
    Resolves null when it was already known. */
export async function rememberFact(userId: string, fact: string, category: MemoryCategory, source: MemorySource = 'behaviour'): Promise<MemoryFact | null> {
  const text = fact.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (text.length < 3) return null;
  const known = (await loadLocal<MemoryFact[]>(userId, LOCAL)) ?? [];
  if (known.some((m) => key(m.fact) === key(text))) return null;
  if (!isCloudUser(userId)) {
    const row: MemoryFact = { id: newId(), fact: text, category, source, created_at: new Date().toISOString() };
    await updateLocal<MemoryFact[]>(userId, LOCAL, (prev) => [row, ...(prev ?? [])].slice(0, 300));
    return row;
  }
  const { data, error } = await supabase
    .from('coach_memory')
    .upsert({ user_id: userId, fact: text, category, source }, { onConflict: 'user_id,fact_key', ignoreDuplicates: true })
    .select('id, fact, category, source, created_at');
  if (error) throw fromDbError(error, "Couldn't save that.");
  const row = (data ?? [])[0] as MemoryFact | undefined;
  if (row) await updateLocal<MemoryFact[]>(userId, LOCAL, (prev) => [row, ...(prev ?? [])].slice(0, 300));
  return row ?? null;
}
