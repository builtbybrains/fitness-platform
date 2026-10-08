/* Coach chat history: the list of conversations ("threads") and the rules
   for showing it. Pure: no React, no native modules, so the grouping, the
   search and the wording are unit tested.

   A thread row mirrors public.coach_threads (one row per conversation_id).
   The server keeps the counters and the preview; the app renames, pins and
   archives. Without an account (or on a backend without the table) the same
   rows live on the device. */

export type CoachThread = {
  /** The conversation_id the messages are stored under. */
  id: string;
  title: string;
  pinned: boolean;
  archived_at: string | null;
  message_count: number;
  last_preview: string;
  last_role: 'user' | 'coach' | '';
  created_at: string;
  updated_at: string;
};

export type ThreadGroupKey = 'pinned' | 'today' | 'yesterday' | 'week' | 'older' | 'archived';
export type ThreadGroup = { key: ThreadGroupKey; title: string; threads: CoachThread[] };

const GROUP_TITLE: Record<ThreadGroupKey, string> = {
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This week',
  older: 'Older',
  archived: 'Archived',
};

/** Shown when a thread has no title yet. */
export const UNTITLED = 'New chat';
/** A first message becomes the title, cut to this many characters. */
export const TITLE_MAX = 48;

/** "My knee hurts when I squat, what should I do instead of lunges" →
    "My knee hurts when I squat, what should I do…": the first message as a
    title until the server names the thread. Cut on a word when it can be. */
export function titleFromMessage(text: string, max = TITLE_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** One line of preview text: whitespace folded, markdown marks dropped. */
export function previewOf(text: string, max = 140): string {
  const t = text
    .replace(/\*\*/g, '')
    .replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function displayTitle(t: Pick<CoachThread, 'title'>): string {
  return t.title.trim() || UNTITLED;
}

/** Read a coach_threads row (or a stored copy) defensively. */
export function normalizeThread(row: unknown): CoachThread | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id : typeof r.conversation_id === 'string' ? r.conversation_id : '';
  if (!id) return null;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const created = str(r.created_at) || str(r.updated_at) || new Date(0).toISOString();
  return {
    id,
    title: str(r.title).trim(),
    pinned: r.pinned === true,
    archived_at: typeof r.archived_at === 'string' && r.archived_at ? r.archived_at : null,
    message_count: Math.max(0, Math.round(Number(r.message_count) || 0)),
    last_preview: str(r.last_preview),
    last_role: r.last_role === 'user' || r.last_role === 'coach' ? r.last_role : '',
    created_at: created,
    updated_at: str(r.updated_at) || created,
  };
}

const time = (iso: string) => {
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
};

/** Newest activity first. */
export function sortThreads(list: readonly CoachThread[]): CoachThread[] {
  return [...list].sort((a, b) => time(b.updated_at) - time(a.updated_at));
}

/** Server rows win; threads only this device knows (a chat whose first
    reply hasn't reached the server yet) are kept. */
export function mergeThreads(server: readonly CoachThread[], local: readonly CoachThread[]): CoachThread[] {
  const ids = new Set(server.map((t) => t.id));
  return sortThreads([...server, ...local.filter((t) => !ids.has(t.id))]);
}

/** Insert or update one thread, keeping the list newest first. */
export function upsertThread(list: readonly CoachThread[], id: string, patch: Partial<CoachThread>, now = new Date()): CoachThread[] {
  const iso = now.toISOString();
  const found = list.find((t) => t.id === id);
  const base: CoachThread = found ?? {
    id,
    title: '',
    pinned: false,
    archived_at: null,
    message_count: 0,
    last_preview: '',
    last_role: '',
    created_at: iso,
    updated_at: iso,
  };
  const next = { ...base, ...patch, id };
  return sortThreads([next, ...list.filter((t) => t.id !== id)]);
}

/** Case-insensitive match on the title and the last message. */
export function filterThreads(list: readonly CoachThread[], query: string): CoachThread[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...list];
  return list.filter((t) => {
    const hay = `${displayTitle(t)} ${t.last_preview}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Which day bucket a time falls in, in the person's local time. */
export function dayBucket(iso: string, now: Date): 'today' | 'yesterday' | 'week' | 'older' {
  const t = time(iso);
  const today = startOfDay(now);
  if (t >= today) return 'today';
  const yesterday = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (t >= yesterday) return 'yesterday';
  const weekAgo = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  return t >= weekAgo ? 'week' : 'older';
}

/** The chats list: Pinned, then Today, Yesterday, This week, Older, each
    newest first; empty groups left out. With `archived`, only the archived
    threads, in one group. A search filters before grouping. */
export function groupThreads(list: readonly CoachThread[], now: Date, opts: { archived?: boolean; query?: string } = {}): ThreadGroup[] {
  const shown = filterThreads(sortThreads(list), opts.query ?? '').filter((t) => (opts.archived ? !!t.archived_at : !t.archived_at));
  if (opts.archived) return shown.length ? [{ key: 'archived', title: GROUP_TITLE.archived, threads: shown }] : [];
  const buckets: Record<Exclude<ThreadGroupKey, 'archived'>, CoachThread[]> = { pinned: [], today: [], yesterday: [], week: [], older: [] };
  for (const t of shown) buckets[t.pinned ? 'pinned' : dayBucket(t.updated_at, now)].push(t);
  return (['pinned', 'today', 'yesterday', 'week', 'older'] as const)
    .filter((k) => buckets[k].length)
    .map((k) => ({ key: k, title: GROUP_TITLE[k], threads: buckets[k] }));
}

export function archivedCount(list: readonly CoachThread[]): number {
  return list.filter((t) => !!t.archived_at).length;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short relative time for a row: "Now", "5 min", "3 h", "Yesterday",
    "Mon", "3 Sep", "3 Sep 2025". */
export function relativeTime(iso: string, now: Date): string {
  const t = time(iso);
  const mins = Math.floor((now.getTime() - t) / 60_000);
  const bucket = dayBucket(iso, now);
  if (bucket === 'today') {
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)} h`;
  }
  if (bucket === 'yesterday') return 'Yesterday';
  const d = new Date(t);
  if (bucket === 'week') return DAYS[d.getDay()];
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Spoken form of relativeTime. */
export function relativeTimeLabel(iso: string, now: Date): string {
  const s = relativeTime(iso, now);
  if (s === 'Now') return 'just now';
  const m = /^(\d+) (min|h)$/.exec(s);
  if (m) return `${m[1]} ${m[2] === 'min' ? (m[1] === '1' ? 'minute' : 'minutes') : m[1] === '1' ? 'hour' : 'hours'} ago`;
  return s === 'Yesterday' ? 'yesterday' : s;
}

/** A fresh conversation id for "New chat". */
export function newThreadId(now = Date.now()): string {
  return `chat-${now}`;
}
