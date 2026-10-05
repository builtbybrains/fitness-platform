import { describe, expect, it, vi } from 'vitest';

// The generated files hold require()s and the GitHub Actions output; tests
// use a fixed sample instead.
vi.mock('../data/mealImages.generated', () => ({ MEAL_IMAGES: { 'whey-shake-banana': 42 } }));
vi.mock('../data/exerciseVideos.generated.json', () => ({
  default: { push_up: { videoId: 'IODxDxX7oi4', title: 'The perfect push up', channel: 'Calisthenicmovement', seconds: 214 } },
}));

import { aiMealPhotoUrl, hasBundledMealImage, mealImageSource, mealPrompt, mealSeed, ON_DEMAND_MEAL_PHOTOS } from '../lib/mealImage';
import { embedUrl, searchUrlFor, videoFor, watchUrl } from '../data/exerciseVideos';

describe('mealImageSource', () => {
  it('returns the bundled photo for a library meal', () => {
    expect(mealImageSource('Whey shake + banana')).toBe(42);
    expect(hasBundledMealImage('Whey shake + banana')).toBe(true);
  });

  it('returns no photo for other meals while on-demand photos are off', () => {
    expect(ON_DEMAND_MEAL_PHOTOS).toBe(false);
    expect(mealImageSource('Shakshuka with labneh and pita')).toBeNull();
    expect(hasBundledMealImage('Shakshuka with labneh and pita')).toBe(false);
  });

  it('builds a stable on-demand photo URL for when a provider is switched on', () => {
    const seed = mealSeed('shakshuka-with-labneh-and-pita');
    expect(seed).toBe(mealSeed('shakshuka-with-labneh-and-pita'));
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(1_000_000);
    const url = new URL(aiMealPhotoUrl(mealPrompt('Shakshuka with labneh and pita'), seed));
    expect(decodeURIComponent(url.pathname)).toBe(`/prompt/${mealPrompt('Shakshuka with labneh and pita')}`);
    expect(url.searchParams.get('seed')).toBe(String(seed));
  });

  it('uses the generator prompt wording', () => {
    expect(mealPrompt('Fattoush')).toBe(
      'Professional food photograph of Fattoush, home-style Lebanese and Mediterranean cooking, generous realistic portion, served on a matte ceramic plate on a dark stone table, soft natural window light, 45 degree angle, shallow depth of field, photorealistic, appetizing, sharp focus, true-to-life colors, no text, no logo, no watermark, no people, no hands',
    );
  });
});

describe('videoFor', () => {
  it('matches by id, name or alias', () => {
    expect(videoFor('push_up')?.videoId).toBe('IODxDxX7oi4');
    expect(videoFor('Push-up')?.videoId).toBe('IODxDxX7oi4');
    expect(videoFor('push up')?.videoId).toBe('IODxDxX7oi4');
  });

  it('returns null when nothing is curated', () => {
    expect(videoFor('plank')).toBeNull();
    expect(videoFor('Something made up')).toBeNull();
    expect(videoFor(null)).toBeNull();
  });

  it('builds the embed, watch and search links', () => {
    expect(embedUrl('IODxDxX7oi4')).toBe('https://www.youtube-nocookie.com/embed/IODxDxX7oi4?playsinline=1&rel=0&modestbranding=1');
    expect(watchUrl('IODxDxX7oi4')).toBe('https://www.youtube.com/watch?v=IODxDxX7oi4');
    expect(searchUrlFor('Goblet squat')).toBe('https://www.youtube.com/results?search_query=Goblet%20squat%20proper%20form%20tutorial');
  });
});
