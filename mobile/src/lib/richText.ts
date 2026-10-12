/* The coach's replies, as safe structured text. A tiny subset of markdown
   and nothing else: paragraphs, **bold**, and lists that start with "- ",
   "• ", "* " or "1. ". No HTML, no links, no images: everything else is
   plain text. Pure, so the parser and the typewriter's word cutting are
   unit tested.

   The typewriter shows a reply word by word: `truncateBlocks` keeps the
   first N words of the parsed reply with its structure intact, so a list
   grows item by item and bold stays bold mid-reveal. */

export type Span = { text: string; bold: boolean };
export type Block =
  | { type: 'p'; spans: Span[] }
  | { type: 'ul'; items: Span[][] }
  | { type: 'ol'; items: { n: number; spans: Span[] }[] };

const BULLET = /^\s*(?:[-•*])\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;

/** "**Eat** more" → [{ text: 'Eat', bold: true }, { text: ' more', bold: false }].
    An unpaired ** stays as typed. */
export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  const push = (t: string, bold: boolean) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.bold === bold) last.text += t;
    else out.push({ text: t, bold });
  };
  let rest = text;
  for (;;) {
    const open = rest.indexOf('**');
    if (open < 0) break;
    const close = rest.indexOf('**', open + 2);
    if (close < 0) break;
    const inner = rest.slice(open + 2, close);
    if (!inner.trim()) {
      // "****" or "** **": nothing to make bold; keep the characters.
      push(rest.slice(0, close + 2), false);
      rest = rest.slice(close + 2);
      continue;
    }
    push(rest.slice(0, open), false);
    push(inner, true);
    rest = rest.slice(close + 2);
  }
  push(rest, false);
  return out;
}

/** Split a reply into paragraphs and lists. Blank lines separate
    paragraphs; single line breaks inside a paragraph become spaces; a run
    of list lines is one list. Headings ("# ") are shown as bold lines. */
export function parseRichText(input: string): Block[] {
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    const t = para.join(' ').replace(/\s+/g, ' ').trim();
    if (t) blocks.push({ type: 'p', spans: parseInline(t) });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const b = BULLET.exec(line);
    const n = b ? null : NUMBERED.exec(line);
    if (b && b[1].trim()) {
      // A list continues only when nothing came between its lines.
      const last = para.length ? undefined : blocks[blocks.length - 1];
      flush();
      const spans = parseInline(b[1].trim());
      if (last?.type === 'ul') last.items.push(spans);
      else blocks.push({ type: 'ul', items: [spans] });
      continue;
    }
    if (n && n[2].trim()) {
      const last = para.length ? undefined : blocks[blocks.length - 1];
      flush();
      const spans = parseInline(n[2].trim());
      const num = Number(n[1]);
      if (last?.type === 'ol') last.items.push({ n: num, spans });
      else blocks.push({ type: 'ol', items: [{ n: num, spans }] });
      continue;
    }
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      const t = heading[1].replace(/\*\*/g, '').trim();
      if (t) blocks.push({ type: 'p', spans: [{ text: t, bold: true }] });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}

/** The reply as plain text (what a screen reader hears, what Copy copies). */
export function plainText(blocks: readonly Block[]): string {
  const spans = (s: readonly Span[]) => s.map((x) => x.text).join('');
  return blocks
    .map((b) => (b.type === 'p' ? spans(b.spans) : b.type === 'ul' ? b.items.map((i) => `• ${spans(i)}`).join('\n') : b.items.map((i) => `${i.n}. ${spans(i.spans)}`).join('\n')))
    .join('\n\n');
}

function spanWords(spans: readonly Span[]): number {
  return spans.reduce((a, s) => a + (s.text.match(/\S+/g)?.length ?? 0), 0);
}

export function countWords(blocks: readonly Block[]): number {
  return blocks.reduce((a, b) => a + (b.type === 'p' ? spanWords(b.spans) : b.type === 'ul' ? b.items.reduce((x, i) => x + spanWords(i), 0) : b.items.reduce((x, i) => x + spanWords(i.spans), 0)), 0);
}

/** The first `limit` words of these spans, and how many were used. */
function cutSpans(spans: readonly Span[], limit: number): { spans: Span[]; used: number } {
  const out: Span[] = [];
  let used = 0;
  for (const s of spans) {
    if (used >= limit) break;
    const parts = s.text.match(/\s*\S+/g) ?? [];
    const lead = parts.length ? '' : s.text;
    if (!parts.length) {
      out.push({ text: lead, bold: s.bold });
      continue;
    }
    const room = limit - used;
    if (parts.length <= room) {
      out.push({ ...s });
      used += parts.length;
    } else {
      out.push({ text: parts.slice(0, room).join(''), bold: s.bold });
      used += room;
    }
  }
  return { spans: out, used };
}

/** The reply as it looks with only its first `limit` words revealed:
    blocks and list items not reached yet are left out. */
export function truncateBlocks(blocks: readonly Block[], limit: number): Block[] {
  if (limit >= countWords(blocks)) return blocks as Block[];
  const out: Block[] = [];
  let left = Math.max(0, Math.floor(limit));
  for (const b of blocks) {
    if (left <= 0) break;
    if (b.type === 'p') {
      const c = cutSpans(b.spans, left);
      left -= c.used;
      out.push({ type: 'p', spans: c.spans });
    } else if (b.type === 'ul') {
      const items: Span[][] = [];
      for (const i of b.items) {
        if (left <= 0) break;
        const c = cutSpans(i, left);
        left -= c.used;
        items.push(c.spans);
      }
      out.push({ type: 'ul', items });
    } else {
      const items: { n: number; spans: Span[] }[] = [];
      for (const i of b.items) {
        if (left <= 0) break;
        const c = cutSpans(i.spans, left);
        left -= c.used;
        items.push({ n: i.n, spans: c.spans });
      }
      out.push({ type: 'ol', items });
    }
  }
  return out;
}

/** How long a reply takes to type out: 40ms a word, never under 600ms or
    over 1.2s, so a long answer doesn't keep anyone waiting. */
export function typewriterMs(words: number): number {
  return Math.round(Math.min(1200, Math.max(600, words * 40)));
}

/** Words shown `elapsed` ms into a reveal of `total` words over `ms`.
    Eases out a little so the end lands softly. */
export function wordsShown(elapsed: number, total: number, ms: number): number {
  if (!(ms > 0) || elapsed >= ms) return total;
  const p = Math.max(0, elapsed / ms);
  const eased = 1 - Math.pow(1 - p, 1.6);
  return Math.min(total, Math.max(1, Math.ceil(eased * total)));
}
