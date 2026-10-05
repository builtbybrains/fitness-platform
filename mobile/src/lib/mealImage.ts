/* Where a meal's photo comes from. Every meal photo in BUILT is
   AI-generated (Flux) food photography on dark stone, never a real
   customer's plate (DESIGN.md, Imagery).

   - Library meals (planData.ts and the planner's library): a photo bundled
     with the app, made ahead by scripts/gen-media.mjs, keyed by slug(label).
   - Any other meal (the coach writes new ones with any name): the same kind
     of photo, made on demand by the provider below. The seed comes from the
     slug, so one meal always gets the same picture. */

import type { ImageSourcePropType } from 'react-native';

import { MEAL_IMAGES } from '../data/mealImages.generated';
import { slug } from './slug';

/** Same wording as mealPrompt() in scripts/gen-media.mjs, so on-demand
    photos look like the bundled ones. */
export function mealPrompt(label: string): string {
  return [
    `Professional food photograph of ${label}`,
    'home-style Lebanese and Mediterranean cooking, generous realistic portion',
    'served on a matte ceramic plate on a dark stone table',
    'soft natural window light, 45 degree angle, shallow depth of field',
    'photorealistic, appetizing, sharp focus, true-to-life colors',
    'no text, no logo, no watermark, no people, no hands',
  ].join(', ');
}

/** A stable seed in 0..999999 from the slug (FNV-1a), so the same meal
    always asks for the same picture. */
export function mealSeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1_000_000;
}

// ─── On-demand photo provider ───────────────────────────────────────────
// Off until a provider that meets the bar is approved: the free Pollinations
// tier stamps a "pollinations.ai" watermark on every image and refuses most
// requests (HTTP 402), so meals show the icon tile instead. Turn this on
// once aiMealPhotoUrl() points at a paid, watermark-free source.
export const ON_DEMAND_MEAL_PHOTOS = false;

// The one place that knows who draws on-demand meal photos. Today it is
// Pollinations (free Flux, no key, private=true keeps them out of the public
// feed). To serve them from our own Supabase function later, change only
// this function to return that function's URL for the same prompt and seed.
export function aiMealPhotoUrl(prompt: string, seed: number): string {
  return (
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=512&height=512&seed=${seed}&model=flux&nologo=true&private=true`
  );
}

/** True when the app ships a photo for this meal. */
export function hasBundledMealImage(label: string): boolean {
  return MEAL_IMAGES[slug(label)] != null;
}

/** The photo for a meal: the bundled one for library meals, an on-demand
    one for anything else (null when there is none, so the caller shows the
    icon tile). `items` (what goes in it) sharpen the on-demand
    picture for meals the coach invented. */
export function mealImageSource(label: string, items?: string[]): ImageSourcePropType | null {
  const key = slug(label);
  const bundled = MEAL_IMAGES[key];
  if (bundled != null) return bundled;
  if (!ON_DEMAND_MEAL_PHOTOS) return null;
  const parts = (items ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const subject = parts.length ? `${label.trim()}, made with ${parts.join(', ')}` : label.trim();
  return { uri: aiMealPhotoUrl(mealPrompt(subject), mealSeed(key)) };
}
