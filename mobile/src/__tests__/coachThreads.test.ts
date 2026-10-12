import { describe, expect, it } from 'vitest';

import {
  archivedCount,
  dayBucket,
  displayTitle,
  filterThreads,
  groupThreads,
  mergeThreads,
  normalizeThread,
  previewOf,
  relativeTime,
  relativeTimeLabel,
  titleFromMessage,
  upsertThread,
  type CoachThread,
} from '../lib/coachThreads';

// Thursday 8 Oct 2026, 15:00 local.
const NOW = new Date(2026, 9, 8, 15, 0, 0);
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).toISOString();

function t(id: string, updated: string, extra: Partial<CoachThread> = {}): CoachThread {
  return { id, title: id, pinned: false, archived_at: null, message_count: 2, last_preview: '', last_role: 'coach', created_at: updated, updated_at: updated, ...extra };
}

describe('groupThreads', () => {
  const list = [
    t('older', at(2026, 8, 20)),
    t('today', at(2026, 9, 8, 9)),
    t('yesterday', at(2026, 9, 7, 22)),
    t('week', at(2026, 9, 3)),
    t('pinned-old', at(2026, 7, 1), { pinned: true }),
    t('gone', at(2026, 9, 8, 10), { archived_at: at(2026, 9, 8, 11) }),
    t('today-later', at(2026, 9, 8, 14)),
  ];

  it('groups Pinned, Today, Yesterday, This week, Older, newest first', () => {
    const g = groupThreads(list, NOW);
    expect(g.map((x) => x.title)).toEqual(['Pinned', 'Today', 'Yesterday', 'This week', 'Older']);
    expect(g[1].threads.map((x) => x.id)).toEqual(['today-later', 'today']);
    expect(g[0].threads.map((x) => x.id)).toEqual(['pinned-old']);
  });

  it('leaves archived threads out, and shows only them in the archived view', () => {
    expect(groupThreads(list, NOW).flatMap((x) => x.threads).some((x) => x.id === 'gone')).toBe(false);
    const a = groupThreads(list, NOW, { archived: true });
    expect(a).toEqual([{ key: 'archived', title: 'Archived', threads: [list[5]] }]);
    expect(archivedCount(list)).toBe(1);
  });

  it('drops empty groups', () => {
    expect(groupThreads([t('a', at(2026, 9, 8, 8))], NOW).map((x) => x.key)).toEqual(['today']);
    expect(groupThreads([], NOW)).toEqual([]);
    expect(groupThreads([], NOW, { archived: true })).toEqual([]);
  });

  it('searches before grouping', () => {
    const g = groupThreads(list, NOW, { query: 'YESTER' });
    expect(g.map((x) => x.key)).toEqual(['yesterday']);
  });
});

describe('filterThreads', () => {
  const list = [t('a', at(2026, 9, 8), { title: 'Knee pain', last_preview: 'Swap lunges for glute bridges' }), t('b', at(2026, 9, 8), { title: '', last_preview: 'Protein ideas' })];
  it('matches title and preview, every word, any case', () => {
    expect(filterThreads(list, 'glute knee').map((x) => x.id)).toEqual(['a']);
    expect(filterThreads(list, 'protein').map((x) => x.id)).toEqual(['b']);
    expect(filterThreads(list, 'new chat').map((x) => x.id)).toEqual(['b']);
    expect(filterThreads(list, '   ').length).toBe(2);
    expect(filterThreads(list, 'squat')).toEqual([]);
  });
});

describe('titles and previews', () => {
  it('keeps a short first message as it is', () => {
    expect(titleFromMessage('  My knee hurts  ')).toBe('My knee hurts');
  });
  it('cuts a long first message to 48 characters on a word', () => {
    const s = titleFromMessage('My knee hurts when I squat, what should I do instead of lunges this week?');
    expect(s.length).toBeLessThanOrEqual(48);
    expect(s).toBe('My knee hurts when I squat, what should I do…');
  });
  it('cuts a long word when there is no space', () => {
    expect(titleFromMessage('a'.repeat(60)).length).toBe(48);
  });
  it('falls back to New chat', () => {
    expect(displayTitle({ title: '  ' })).toBe('New chat');
  });
  it('previews one line without markdown marks', () => {
    expect(previewOf('**Do this:**\n- eggs\n- labneh')).toBe('Do this: eggs labneh');
    expect(previewOf('x'.repeat(200), 20)).toHaveLength(20);
  });
});

describe('normalizeThread', () => {
  it('reads a server row', () => {
    const r = normalizeThread({ id: 'chat-1', title: 'Knee', pinned: true, archived_at: null, message_count: '4', last_preview: 'ok', last_role: 'coach', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z', user_id: 'u' });
    expect(r).toEqual({ id: 'chat-1', title: 'Knee', pinned: true, archived_at: null, message_count: 4, last_preview: 'ok', last_role: 'coach', created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-02T10:00:00Z' });
  });
  it('fills gaps and rejects rows without an id', () => {
    expect(normalizeThread({ conversation_id: 'default', created_at: '2026-10-01T10:00:00Z' })).toMatchObject({ id: 'default', title: '', pinned: false, updated_at: '2026-10-01T10:00:00Z', last_role: '' });
    expect(normalizeThread({ title: 'x' })).toBeNull();
    expect(normalizeThread(null)).toBeNull();
  });
});

describe('mergeThreads and upsertThread', () => {
  it('prefers server rows and keeps device-only ones', () => {
    const server = [t('a', at(2026, 9, 8, 9), { title: 'Server title' })];
    const local = [t('a', at(2026, 9, 8, 10), { title: 'Local title' }), t('b', at(2026, 9, 8, 11))];
    const m = mergeThreads(server, local);
    expect(m.map((x) => [x.id, x.title])).toEqual([
      ['b', 'b'],
      ['a', 'Server title'],
    ]);
  });
  it('adds a new thread on top and updates an existing one', () => {
    const list = [t('a', at(2026, 9, 8, 9))];
    const added = upsertThread(list, 'chat-2', { title: 'Hi', last_preview: 'Hi', last_role: 'user', message_count: 1 }, NOW);
    expect(added.map((x) => x.id)).toEqual(['chat-2', 'a']);
    expect(added[0]).toMatchObject({ pinned: false, archived_at: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString() });
    const renamed = upsertThread(added, 'a', { title: 'Renamed' }, NOW);
    expect(renamed.find((x) => x.id === 'a')?.title).toBe('Renamed');
    expect(renamed).toHaveLength(2);
  });
});

describe('relative time', () => {
  it('reads like a chat list', () => {
    expect(relativeTime(new Date(2026, 9, 8, 14, 59, 40).toISOString(), NOW)).toBe('Now');
    expect(relativeTime(at(2026, 9, 8, 14, 55), NOW)).toBe('5 min');
    expect(relativeTime(at(2026, 9, 8, 12, 0), NOW)).toBe('3 h');
    expect(relativeTime(at(2026, 9, 7, 23, 0), NOW)).toBe('Yesterday');
    expect(relativeTime(at(2026, 9, 5), NOW)).toBe('Mon');
    expect(relativeTime(at(2026, 8, 3), NOW)).toBe('3 Sep');
    expect(relativeTime(at(2025, 11, 30), NOW)).toBe('30 Dec 2025');
  });
  it('has a spoken form', () => {
    expect(relativeTimeLabel(at(2026, 9, 8, 14, 59), NOW)).toBe('1 minute ago');
    expect(relativeTimeLabel(at(2026, 9, 8, 12, 0), NOW)).toBe('3 hours ago');
    expect(relativeTimeLabel(at(2026, 9, 7), NOW)).toBe('yesterday');
  });
  it('buckets by local day', () => {
    expect(dayBucket(at(2026, 9, 8, 0, 1), NOW)).toBe('today');
    expect(dayBucket(at(2026, 9, 7, 0, 1), NOW)).toBe('yesterday');
    expect(dayBucket(at(2026, 9, 2, 0, 1), NOW)).toBe('week');
    expect(dayBucket(at(2026, 9, 1, 23, 0), NOW)).toBe('older');
  });
});
