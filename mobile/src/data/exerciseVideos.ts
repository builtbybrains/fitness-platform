/* One form tutorial per exercise, picked by scripts/gen-media.mjs from
   embeddable YouTube videos (well-known coaching channels first, under ten
   minutes). Match by library id, or by name through findExercise() so plans
   written by name or alias still find their video. Exercises with no pick
   fall back to a YouTube search (searchUrlFor). */

import RAW from './exerciseVideos.generated.json';
import { findExercise } from './exercises';

export type ExerciseVideo = { videoId: string; title: string; channel: string; seconds: number | null };

const VIDEOS = RAW as Record<string, ExerciseVideo | undefined>;

/** The curated video for an exercise id or name, or null. */
export function videoFor(idOrName: string | null | undefined): ExerciseVideo | null {
  if (!idOrName) return null;
  const direct = VIDEOS[idOrName];
  if (direct?.videoId) return direct;
  const ex = findExercise(idOrName);
  const byLib = ex ? VIDEOS[ex.id] : undefined;
  return byLib?.videoId ? byLib : null;
}

/** Privacy-enhanced embed: no cookies until the person presses play. */
export function embedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0&modestbranding=1`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** A YouTube search for a good form video, when none is curated. */
export function searchUrlFor(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form tutorial`)}`;
}
