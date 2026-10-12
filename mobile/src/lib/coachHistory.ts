/* Where the coach chat history lives.

   Signed in: messages are in coach_messages (the coach function saves both
   sides) and the list of chats is coach_threads, which the server keeps
   (title, preview, counters); the app only renames, pins and archives.
   Every call fails quietly: on a backend without coach_threads, offline,
   or on any error the caller falls back to this device's copy.

   On the device (every mode): the chats list under `coachThreads` and each
   chat's messages under `coachMsgs:<id>` in the local mirror, so history
   works without an account (built-in tips) and opens offline. The last
   open chat is remembered per person, and so is today's message allowance. */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { loadLocal, saveLocal, updateLocal } from './localFallback';
import { todayId } from './dates';
import { normalizeThread, sortThreads, type CoachThread } from './coachThreads';

export const PAGE_SIZE = 50;
/** Messages kept on the device per chat. */
const LOCAL_CAP = 400;
/** Chats kept on the device. */
const THREADS_CAP = 200;

export type StoredMsg = {
  /** The coach_messages row id (server rows only). */
  id?: string;
  role: 'user' | 'coach';
  body: string;
  created_at: string;
  /** The built-in tip's reason ("A quick tip from this device…"). */
  note?: string;
};

export type Page = { rows: StoredMsg[]; more: boolean };

const THREADS_KIND = 'coachThreads';
const msgsKind = (id: string) => `coachMsgs:${id}`;
const lastKey = (userId: string) => `coach:lastThread:${userId}`;
const remainingKey = (userId: string) => `coach:remaining:${userId}`;

// ─────────────────────────────── last open chat ───────────────────────────────

export async function getLastThread(userId: string): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(lastKey(userId));
    return v && v.length < 120 ? v : null;
  } catch {
    return null;
  }
}

export async function setLastThread(userId: string, id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(lastKey(userId), id);
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────── messages left today ───────────────────────────────

export async function getRemaining(userId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(remainingKey(userId));
    const v = raw ? (JSON.parse(raw) as { day?: string; n?: number }) : null;
    return v && v.day === todayId() && typeof v.n === 'number' ? v.n : null;
  } catch {
    return null;
  }
}

export async function setRemaining(userId: string, n: number): Promise<void> {
  try {
    await AsyncStorage.setItem(remainingKey(userId), JSON.stringify({ day: todayId(), n }));
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────── chats on the device ───────────────────────────────

export async function loadLocalThreads(userId: string): Promise<CoachThread[]> {
  const raw = await loadLocal<unknown[]>(userId, THREADS_KIND);
  if (!Array.isArray(raw)) return [];
  return sortThreads(raw.map(normalizeThread).filter((t): t is CoachThread => !!t));
}

export async function saveLocalThreads(userId: string, list: readonly CoachThread[]): Promise<void> {
  await saveLocal(userId, THREADS_KIND, sortThreads(list).slice(0, THREADS_CAP));
}

/** Change one chat on the device (no-op when it isn't there). */
export async function patchLocalThread(userId: string, id: string, patch: Partial<CoachThread>): Promise<void> {
  await updateLocal<unknown[]>(userId, THREADS_KIND, (prev) => {
    const list = Array.isArray(prev) ? prev.map(normalizeThread).filter((t): t is CoachThread => !!t) : [];
    return list.map((t) => (t.id === id ? { ...t, ...patch, id } : t));
  });
}

function cleanRows(raw: unknown): StoredMsg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => r as Partial<StoredMsg>)
    .filter((r) => (r.role === 'user' || r.role === 'coach') && typeof r.body === 'string')
    .map((r) => ({
      ...(typeof r.id === 'string' && r.id ? { id: r.id } : {}),
      role: r.role as StoredMsg['role'],
      body: String(r.body),
      created_at: String(r.created_at ?? ''),
      ...(r.note ? { note: String(r.note) } : {}),
    }));
}

/** A page of this device's copy, oldest first: the latest PAGE_SIZE, or
    the PAGE_SIZE before the `shown` newest ones already on screen. Paged by
    position, not time, so messages stored in the same millisecond never
    split or repeat. */
export async function loadLocalPage(userId: string, id: string, shown = 0): Promise<Page> {
  const all = cleanRows(await loadLocal<unknown[]>(userId, msgsKind(id)));
  const end = Math.max(0, all.length - shown);
  const start = Math.max(0, end - PAGE_SIZE);
  return { rows: all.slice(start, end), more: start > 0 };
}

export async function appendLocalMessages(userId: string, id: string, rows: readonly StoredMsg[]): Promise<void> {
  if (!rows.length) return;
  await updateLocal<unknown[]>(userId, msgsKind(id), (prev) => [...cleanRows(prev), ...rows].slice(-LOCAL_CAP));
}

/** Drop the device's copy of the messages at and after `from` (Regenerate,
    Edit and resend). */
export async function trimLocalMessages(userId: string, id: string, from: string): Promise<void> {
  await updateLocal<unknown[]>(userId, msgsKind(id), (prev) => cleanRows(prev).filter((r) => r.created_at < from));
}

// ─────────────────────────────── on the server ───────────────────────────────

/** Every chat, newest first, or null when the list can't be read (no
    coach_threads table yet, offline, any error). */
export async function fetchThreads(): Promise<CoachThread[] | null> {
  try {
    const { data, error } = await supabase
      .from('coach_threads')
      .select('id, title, pinned, archived_at, message_count, last_preview, last_role, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(THREADS_CAP);
    if (error || !Array.isArray(data)) return null;
    return data.map(normalizeThread).filter((t): t is CoachThread => !!t);
  } catch {
    return null;
  }
}

/** Rename, pin or archive. Resolves false when it didn't reach the server. */
export async function patchThread(id: string, patch: { title?: string; pinned?: boolean; archived_at?: string | null }): Promise<boolean> {
  try {
    const { error } = await supabase.from('coach_threads').update(patch).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/** A page of a chat from coach_messages, oldest first, or null on error.
    Older rows saved a user message and its reply with the same created_at,
    so a page is read newest first with role as the tie-break (the reply
    sorts before its question, and reversed they read in order), and older
    pages ask for everything at or before the oldest time on screen
    (`lte`), skipping the rows already shown, so a pair is never split
    across a page boundary. */
export async function fetchPage(id: string, older?: { before: string; skip: ReadonlySet<string> }): Promise<Page | null> {
  try {
    // Only rows at exactly `before` can already be on screen; ask for that many extra.
    const extra = older ? Math.min(older.skip.size, PAGE_SIZE) : 0;
    let q = supabase.from('coach_messages').select('id, role, body, created_at').eq('conversation_id', id);
    if (older) q = q.lte('created_at', older.before);
    const { data, error } = await q.order('created_at', { ascending: false }).order('role', { ascending: true }).limit(PAGE_SIZE + extra);
    if (error || !Array.isArray(data)) return null;
    const fresh = data.filter((d) => !(older && typeof d.id === 'string' && older.skip.has(d.id)));
    const rows = cleanRows(fresh.slice(0, PAGE_SIZE).map((d) => ({ ...d, role: d.role === 'user' ? 'user' : 'coach' }))).reverse();
    return { rows, more: rows.length > 0 && data.length >= PAGE_SIZE + extra };
  } catch {
    return null;
  }
}
