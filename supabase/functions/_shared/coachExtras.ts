// Coach chat extras: thread titles, follow-up suggestions, the thread list
// preview and light reply clean-up. Pure functions (no I/O), shared by the
// coach function and its tests.

export const TITLE_MAX = 48;
export const SUGGESTION_MAX = 48;
export const SUGGESTIONS_MAX = 3;
export const PREVIEW_MAX = 160;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
const PLACEHOLDER_TITLES = new Set(['', 'new chat', 'first chat']);

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Cut to `max` characters, ending in "…" when anything was cut. */
function cut(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** The title a chat gets from its first message: the message itself, cut
    to 48 characters ("…" when cut). Same rule as the SQL backfill. */
export function cutTitle(message: string): string {
  const s = collapse(String(message ?? ''));
  return s ? cut(s, TITLE_MAX) : 'First chat';
}

/** True when a thread's title was never chosen: empty, a default, or just
    the start of the first message. */
export function isAutoTitle(title: string | null | undefined, firstMessage: string): boolean {
  const t = collapse(String(title ?? '')).toLowerCase();
  if (PLACEHOLDER_TITLES.has(t)) return true;
  const stem = t.replace(/(…|\.\.\.)$/, '').trim();
  return stem.length > 0 && collapse(firstMessage).toLowerCase().startsWith(stem);
}

/** Whether this exchange should name the thread: its first exchange, and
    the title is not one the person chose. */
export function needsTitle(thread: { title?: string | null; message_count?: number | null } | null, historyCount: number, message: string): boolean {
  const before = thread ? Number(thread.message_count) || 0 : historyCount;
  return before === 0 && isAutoTitle(thread?.title, message);
}

/** Strip what never belongs in a short label: emoji, markdown, quotes,
    em and en dashes, list markers. */
function plainLabel(raw: string): string {
  return collapse(
    raw
      .replace(EMOJI_RE, '')
      .replace(/[*_#`>~|"“”«»]/g, '')
      .replace(/^\s*(?:[-•]|\d+[.)])\s+/, '')
      .replace(/\s*[\u2014\u2013]\s*/g, ', '),
  )
    .replace(/^['‘’]+|['‘’]+$/g, '')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/^,\s*|,\s*$/g, '')
    .trim();
}

const TRAILING_FILLER = new Set(['and', 'or', 'the', 'a', 'an', 'to', 'for', 'of', 'with', 'my', 'in', 'on', 'at', 'your']);

/** A model's chat title made safe: 2 to 5 words (longer ones are cut to
    5), no quotes, emoji or markdown, no trailing punctuation, at most 48
    characters, first letter capitalised. null when unusable. */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let t = plainLabel(raw.replace(/^\s*title\s*:\s*/i, ''));
  if (!t || t.length > 120 || /[{}\[\]<>\n]/.test(t)) return null;
  let words = t.split(' ');
  if (words.length > 5) words = words.slice(0, 5);
  while (words.length > 1 && TRAILING_FILLER.has(words[words.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) words.pop();
  t = words.join(' ').replace(/[\s.,;:!?…-]+$/, '').trim();
  if (t.length < 3 || !/\p{L}/u.test(t)) return null;
  if (t.length > TITLE_MAX) {
    const short = t.slice(0, TITLE_MAX);
    const space = short.lastIndexOf(' ');
    t = (space >= 12 ? short.slice(0, space) : short).replace(/[\s.,;:!?-]+$/, '');
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A model's follow-up suggestions made safe: strings only, trimmed, no
    emoji or markdown, 3 to 48 characters (longer ones are dropped, not
    cut), no duplicates (ignoring case and end punctuation), never the
    message the person just sent, at most 3. */
export function cleanSuggestions(raw: unknown, userMessage = ''): string[] {
  if (!Array.isArray(raw)) return [];
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const seen = new Set<string>([key(userMessage)]);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const s = plainLabel(item);
    if (s.length < 3 || s.length > SUGGESTION_MAX || !/\p{L}/u.test(s)) continue;
    const k = key(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s.charAt(0).toUpperCase() + s.slice(1));
    if (out.length === SUGGESTIONS_MAX) break;
  }
  return out;
}

export type SuggestionContext = {
  hasPlan: boolean;
  restDay: boolean;
  workoutDone: boolean;
  waterCount: number;
  waterTarget: number;
  kcalSoFar: number;
  kcalTarget: number;
  message: string;
};

/** Follow-ups without AI, picked from the person's day. */
export function rulesSuggestions(c: SuggestionContext): string[] {
  const pool: string[] = [];
  if (!c.hasPlan) pool.push('What should I train today?');
  else if (c.restDay) pool.push('Give me a 10 minute stretch', 'What should I eat on a rest day?');
  else if (c.workoutDone) pool.push('What should I eat after training?');
  else pool.push('Make it 30 minutes', 'Swap one exercise for me');
  if (c.waterTarget > 0 && c.waterCount < c.waterTarget / 2) pool.push('How do I drink more water today?');
  if (c.kcalTarget > 0 && c.kcalSoFar > c.kcalTarget) pool.push('I ate over my target, what now?');
  else if (c.kcalTarget > 0 && c.kcalSoFar < c.kcalTarget * 0.5) pool.push("Swap today's dinner");
  pool.push('What is my smallest next step?', 'Plan tomorrow for me');
  return cleanSuggestions(pool, c.message);
}

/** The thread list's one-line preview of a reply: no markdown, one line,
    at most 160 characters ("…" when cut). */
export function previewText(text: string): string {
  const s = collapse(
    String(text ?? '')
      .split('\n')
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/, ''))
      .join(' ')
      .replace(/\*\*|__|`/g, ''),
  );
  return cut(s, PREVIEW_MAX);
}

/** Light clean-up of a chat reply: headings become plain lines, "*" and
    "•" bullets become "- ", em and en dashes go ("5\u201310" reads "5 to 10"),
    no runs of blank lines. Bold (**…**) is kept. */
export function cleanReply(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[*•][ \t]+/gm, '- ')
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
    .replace(/[ \t]*[\u2014\u2013][ \t]*/g, ', ')
    .replace(/^, /gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
