import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' }, Linking: {} }));

import { replyExtras } from '../api/coach';

describe('replyExtras', () => {
  it('reads the new reply fields', () => {
    expect(replyExtras({ suggestions: ['Swap squats?', '  More   protein? '], thread: { id: 'chat-1', title: 'Knee pain' }, remaining_today: 7 })).toEqual({
      suggestions: ['Swap squats?', 'More protein?'],
      thread: { id: 'chat-1', title: 'Knee pain' },
      remainingToday: 7,
    });
  });
  it('goes without them on an older backend', () => {
    expect(replyExtras({ reply: 'hi' })).toEqual({ suggestions: [], thread: null, remainingToday: null });
    expect(replyExtras(null)).toEqual({ suggestions: [], thread: null, remainingToday: null });
  });
  it('keeps at most three usable suggestions and a sane count', () => {
    const r = replyExtras({ suggestions: ['a', 2, '', 'b', 'c', 'd'], remaining_today: -3, thread: { title: 'no id' } });
    expect(r.suggestions).toEqual(['a', 'b', 'c']);
    expect(r.remainingToday).toBe(0);
    expect(r.thread).toBeNull();
  });
});
