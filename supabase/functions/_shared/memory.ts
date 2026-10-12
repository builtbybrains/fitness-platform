// Coach memory: durable facts about a person (injuries, likes, schedule …)
// that every AI function can read, and the coach, check-in and planner add
// to. Rows live in public.coach_memory; the database rejects exact
// duplicates (fact_key), and near-duplicates are skipped here.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { str } from './ai.ts';

export type MemoryCategory = 'injury' | 'health' | 'preference' | 'like' | 'dislike' | 'schedule' | 'goal' | 'equipment' | 'food' | 'training' | 'other';
export type MemorySource = 'chat' | 'behaviour' | 'checkin' | 'profile';
export type MemoryFact = { id: string; fact: string; category: MemoryCategory; source: MemorySource; created_at: string };

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = ['injury', 'health', 'preference', 'like', 'dislike', 'schedule', 'goal', 'equipment', 'food', 'training', 'other'];

export async function loadMemory(supabase: SupabaseClient, userId: string, limit = 40): Promise<MemoryFact[]> {
  const { data, error } = await supabase
    .from('coach_memory')
    .select('id, fact, category, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[memory] read failed:', error.message);
    return [];
  }
  return (data ?? []) as MemoryFact[];
}

export function memoryForPrompt(facts: MemoryFact[]): string {
  if (!facts.length) return '';
  return `Things the user told you before (treat as true unless they say otherwise): ${facts.map((f) => `[${f.category}] ${f.fact}`).join('; ')}.`;
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
}

/** True when two facts say nearly the same thing (word overlap ≥ 0.7). */
export function similar(a: string, b: string): boolean {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return false;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both) >= 0.7;
}

/** Clean facts from a model reply: max 3, short, known categories. */
export function cleanFacts(raw: unknown): { fact: string; category: MemoryCategory }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      fact: str(f.fact, 200),
      category: (MEMORY_CATEGORIES as readonly string[]).includes(String(f.category)) ? (f.category as MemoryCategory) : 'other',
    }))
    .filter((f) => f.fact.length >= 6)
    .slice(0, 3);
}

/** Save new facts, skipping ones the person already has (exact or near).
    Returns the rows actually added. Never throws. */
export async function saveFacts(
  supabase: SupabaseClient,
  userId: string,
  facts: { fact: string; category: MemoryCategory }[],
  source: MemorySource,
  existing?: MemoryFact[],
): Promise<MemoryFact[]> {
  if (!facts.length) return [];
  const known = existing ?? (await loadMemory(supabase, userId, 200));
  const fresh: { fact: string; category: MemoryCategory }[] = [];
  for (const f of facts) {
    if ([...known.map((k) => k.fact), ...fresh.map((x) => x.fact)].some((k) => similar(k, f.fact))) continue;
    fresh.push(f);
  }
  if (!fresh.length) return [];
  const { data, error } = await supabase
    .from('coach_memory')
    .upsert(fresh.map((f) => ({ user_id: userId, fact: f.fact, category: f.category, source })), {
      onConflict: 'user_id,fact_key',
      ignoreDuplicates: true,
    })
    .select('id, fact, category, source, created_at');
  if (error) {
    console.warn('[memory] save failed:', error.message);
    return [];
  }
  return (data ?? []) as MemoryFact[];
}
