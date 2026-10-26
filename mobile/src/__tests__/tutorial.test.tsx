import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// React Native has no DOM here: stand in plain HTML tags so the tile renders
// to a string, and record every Pressable so a test can press it.
const pressed = vi.hoisted(() => ({ list: [] as { onPress?: () => void; accessibilityLabel?: string }[] }));

vi.mock('react-native', async () => {
  const R = await import('react');
  const kids = (c: unknown) => (typeof c === 'function' ? (c as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false }) : (c as React.ReactNode));
  const View = ({ children }: { children?: React.ReactNode }) => R.createElement('div', null, children);
  const Text = ({ children }: { children?: React.ReactNode }) => R.createElement('span', null, children);
  const Image = ({ source }: { source: { uri: string } }) => R.createElement('img', { src: source.uri });
  const Pressable = (p: { children?: unknown; style?: unknown; onPress?: () => void; accessibilityLabel?: string }) => {
    pressed.list.push(p);
    if (typeof p.style === 'function') p.style({ pressed: false });
    return R.createElement('div', { role: 'button', 'aria-label': p.accessibilityLabel }, kids(p.children));
  };
  return { View, Text, Image, Pressable, Platform: { OS: 'web' }, AccessibilityInfo: {} };
});
vi.mock('react-native-svg', async () => {
  const R = await import('react');
  const Svg = ({ children }: { children?: React.ReactNode }) => R.createElement('svg', null, children);
  const Shape = () => R.createElement('path');
  return { default: Svg, Path: Shape, Circle: Shape, Rect: Shape };
});
vi.mock('../data/exerciseVideos.generated.json', () => ({
  default: { push_up: { videoId: 'IODxDxX7oi4', title: 'The perfect push up', channel: 'Calisthenicmovement', seconds: 214, source: 'manual' } },
}));

import { ExerciseTutorial, tutorialLabel } from '../components/training/ExerciseTutorial';
import { thumbnailUrl, videoFor, videoLength, watchAction } from '../data/exerciseVideos';
import { apiOrder, exerciseList, isoSeconds, pickApiVideo } from '../../../scripts/gen-media.mjs';

type Render = (el: React.ReactElement) => string;
async function render(el: React.ReactElement): Promise<string> {
  const server = (await import('react-dom/server' as string)) as { renderToStaticMarkup: Render };
  return server.renderToStaticMarkup(el);
}

const pushUp = { id: 'push_up', name: 'Push-up' };
const plank = { id: 'plank', name: 'Plank' };

beforeEach(() => {
  pressed.list = [];
});

describe('ExerciseTutorial, no video yet', () => {
  it('shows the coming-soon placeholder and a Search YouTube button', async () => {
    expect(videoFor('plank')).toBeNull();
    const html = await render(<ExerciseTutorial exercise={plank} onWatch={() => {}} />);
    expect(html).toContain('Tutorial video coming soon');
    expect(html).toContain('Search YouTube');
    expect(html).not.toContain('<img');
    expect(html).toContain(`aria-label="${tutorialLabel('Plank', false)}"`);
    expect(tutorialLabel('Plank', false)).toBe('Tutorial coming soon for Plank. Search YouTube');
  });

  it('Search YouTube hands the exercise to watch(), which opens the search', async () => {
    const onWatch = vi.fn();
    await render(<ExerciseTutorial exercise={plank} onWatch={onWatch} />);
    expect(pressed.list).toHaveLength(1);
    pressed.list[0].onPress?.();
    expect(onWatch).toHaveBeenCalledWith(plank);
    expect(watchAction(plank)).toEqual({ kind: 'search', url: 'https://www.youtube.com/results?search_query=Plank%20proper%20form%20tutorial' });
  });

  it('the compact chip is a single labelled button with no thumbnail', async () => {
    const onWatch = vi.fn();
    const html = await render(<ExerciseTutorial variant="compact" exercise={plank} onWatch={onWatch} />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('coming soon</span>');
    expect(pressed.list).toHaveLength(1);
    expect(pressed.list[0].accessibilityLabel).toBe('Tutorial coming soon for Plank. Search YouTube');
    pressed.list[0].onPress?.();
    expect(onWatch).toHaveBeenCalledWith(plank);
  });
});

describe('ExerciseTutorial, with a video', () => {
  it('shows the YouTube thumbnail and the length, not the placeholder', async () => {
    const html = await render(<ExerciseTutorial exercise={pushUp} onWatch={() => {}} />);
    expect(html).toContain(`src="https://i.ytimg.com/vi/IODxDxX7oi4/hqdefault.jpg"`);
    expect(html).toContain('3:34');
    expect(html).not.toContain('coming soon');
    expect(html).toContain('aria-label="Watch how to do Push-up"');
  });

  it('a tap opens the in-app player sheet with that video', async () => {
    const onWatch = vi.fn();
    await render(<ExerciseTutorial exercise={pushUp} onWatch={onWatch} />);
    pressed.list[0].onPress?.();
    expect(onWatch).toHaveBeenCalledWith(pushUp);
    const action = watchAction(pushUp);
    expect(action.kind).toBe('sheet');
    expect(action.kind === 'sheet' && action.video.videoId).toBe('IODxDxX7oi4');
  });

  it('finds the video by name when the plan has no id, and the chip shows the thumbnail', async () => {
    const html = await render(<ExerciseTutorial variant="compact" exercise={{ name: 'Push ups' }} onWatch={() => {}} />);
    expect(html).toContain('hqdefault.jpg');
    expect(pressed.list[0].accessibilityLabel).toBe('Watch how to do Push ups');
  });

  it('keeps the optional source field', () => {
    expect(videoFor('push_up')?.source).toBe('manual');
  });
});

describe('video helpers', () => {
  it('builds the thumbnail URL and the length label', () => {
    expect(thumbnailUrl('IODxDxX7oi4')).toBe('https://i.ytimg.com/vi/IODxDxX7oi4/hqdefault.jpg');
    expect(videoLength(214)).toBe('3:34');
    expect(videoLength(65)).toBe('1:05');
    expect(videoLength(null)).toBeNull();
    expect(videoLength(0)).toBeNull();
  });
});

describe('gen-media video script', () => {
  it('reads library entries in either quote style', () => {
    const src = `
      x('push_up', 'Push-up', 'chest'),
      x("farmers_carry", "Farmer's carry", 'core'),
      x( 'dead_bug' , 'Dead bug', 'core'),
      x('it_s', 'It\\'s escaped', 'core'),
    `;
    expect(exerciseList(src)).toEqual([
      { id: 'push_up', name: 'Push-up' },
      { id: 'farmers_carry', name: "Farmer's carry" },
      { id: 'dead_bug', name: 'Dead bug' },
      { id: 'it_s', name: "It's escaped" },
    ]);
  });

  it('keeps the sheet row when the library row has one', () => {
    const src = `x('a', 'A', 'core', { sheetId: 12 }),\n  x("b", "B", 'core', {}),\n  x('c', 'C', 'core', { reps: 8, sheetId: 50 }),\n  x(7, 'd', 'D', 'core', {}),\n  x( 61 , "farmers_carry", "Farmer's Carry", 'core'),`;
    expect(exerciseList(src)).toEqual([
      { id: 'a', name: 'A', sheetId: 12 },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C', sheetId: 50 },
      { id: 'd', name: 'D', sheetId: 7 },
      { id: 'farmers_carry', name: "Farmer's Carry", sheetId: 61 },
    ]);
  });

  it('searches sheet rows 1 to 48 first, then the rest by row, then rows with no sheet id', () => {
    const list = [
      { id: 'late', name: 'Late', sheetId: 60 },
      { id: 'none1', name: 'None 1' },
      { id: 'core3', name: 'Core 3', sheetId: 3 },
      { id: 'core48', name: 'Core 48', sheetId: 48 },
      { id: 'none2', name: 'None 2' },
      { id: 'next49', name: 'Next 49', sheetId: 49 },
      { id: 'core1', name: 'Core 1', sheetId: 1 },
    ];
    expect(apiOrder(list).map((e: { id: string }) => e.id)).toEqual(['core1', 'core3', 'core48', 'next49', 'late', 'none1', 'none2']);
    // No sheet ids at all: library order.
    expect(apiOrder([{ id: 'b' }, { id: 'a' }]).map((e: { id: string }) => e.id)).toEqual(['b', 'a']);
  });

  it('picks a trusted channel, else the top result, 1 to 10 minutes, English first', () => {
    const v = (videoId: string, channel: string, seconds: number | null, lang: string | null = 'en', title = videoId) => ({ videoId, title, channel, seconds, lang });
    expect(pickApiVideo([v('top', 'Someone', 200), v('jn', 'Jeff Nippard', 300)])?.videoId).toBe('jn');
    expect(pickApiVideo([v('top', 'Someone', 200), v('two', 'Other', 100)])?.videoId).toBe('top');
    expect(pickApiVideo([v('long', 'Jeff Nippard', 1200), v('short', 'Other', 90)])?.videoId).toBe('short');
    expect(pickApiVideo([v('fr', 'Someone', 200, 'fr'), v('en', 'Other', 200, 'en-US')])?.videoId).toBe('en');
    expect(pickApiVideo([])).toBeNull();
  });

  it('skips Shorts, unknown lengths, clickbait and the wrong kit', () => {
    const v = (videoId: string, seconds: number | null, title: string, channel = 'Someone') => ({ videoId, title, channel, seconds, lang: 'en' });
    // Under a minute (a Short) or unknown length: never picked.
    expect(pickApiVideo([v('short', 40, 'How to squat'), v('unknown', null, 'How to squat')])).toBeNull();
    // A tutorial title beats clickbait listed above it.
    expect(pickApiVideo([v('bait', 120, 'STOP Doing Pushups Like This!'), v('tut', 150, 'How to do a push-up with good form')])?.videoId).toBe('tut');
    expect(pickApiVideo([v('vs', 90, 'Tricep dips vs chest dips 🔥'), v('ok', 200, 'Chest dip tutorial')])?.videoId).toBe('ok');
    // A barbell exercise never gets a dumbbell video.
    expect(pickApiVideo([v('db', 120, 'Dumbbell Overhead Press - How To', 'Jeff Nippard'), v('bb', 300, 'Overhead press form guide')], 'Barbell Overhead Press')?.videoId).toBe('bb');
    expect(pickApiVideo([v('db', 120, 'Dumbbell Overhead Press - How To')], 'Barbell Overhead Press')).toBeNull();
  });

  it('with --shorts, takes a short demo clip but still refuses clickbait and the wrong kit', () => {
    const v = (videoId: string, seconds: number | null, title: string, channel = 'Someone') => ({ videoId, title, channel, seconds, lang: 'en' });
    const clip = v('clip', 30, 'How to HIP THRUST properly #hipthrust #gym');
    // Off by default: a 30 second clip with hashtags is never picked.
    expect(pickApiVideo([clip], 'Hip Thrust')).toBeNull();
    expect(pickApiVideo([clip], 'Hip Thrust', { shorts: true })?.videoId).toBe('clip');
    // A title that names the exercise beats one that doesn't.
    expect(pickApiVideo([v('other', 20, 'Glute day #shorts'), clip], 'Hip Thrust', { shorts: true })?.videoId).toBe('clip');
    // Still refused: clickbait words, the wrong kit, under 10 seconds.
    expect(pickApiVideo([v('bait', 30, 'STOP doing hip thrusts like this #shorts')], 'Hip Thrust', { shorts: true })).toBeNull();
    expect(pickApiVideo([v('db', 30, 'Dumbbell press #shorts')], 'Barbell Bench Press', { shorts: true })).toBeNull();
    expect(pickApiVideo([v('tiny', 6, 'Hip thrust #shorts')], 'Hip Thrust', { shorts: true })).toBeNull();
  });

  it('reads YouTube API durations', () => {
    expect(isoSeconds('PT4M13S')).toBe(253);
    expect(isoSeconds('PT45S')).toBe(45);
    expect(isoSeconds('PT1H0M2S')).toBe(3602);
    expect(isoSeconds('')).toBeNull();
  });
});
