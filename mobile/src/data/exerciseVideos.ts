/* One form tutorial per exercise, keyed by library id in
   exerciseVideos.generated.json (the single source; see README-videos.md for
   how it gets filled). Match by library id, or by name through findExercise()
   so plans written by name or alias still find their video. Exercises with no
   pick show a "coming soon" tile and fall back to a YouTube search
   (searchUrlFor). */

import RAW from './exerciseVideos.generated.json';
import { findExercise } from './exercises';

/** Where a pick came from: set by hand, from the owner's channel or playlist,
    or by the YouTube Data API search in scripts/gen-media.mjs. */
export type VideoSource = 'manual' | 'playlist' | 'api';

export type ExerciseVideo = { videoId: string; title: string; channel: string; seconds: number | null; source?: VideoSource };

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

export type VideoTarget = { id?: string | null; name: string };

/** The video for a plan or library exercise: by id first, then by name. */
export function exerciseVideo(ex: VideoTarget): ExerciseVideo | null {
  return videoFor(ex.id) ?? videoFor(ex.name);
}

/** What a tap on a tutorial does: open the in-app player sheet when a video
    is curated, otherwise open a YouTube search for a form tutorial. */
export type WatchAction = { kind: 'sheet'; video: ExerciseVideo } | { kind: 'search'; url: string };

export function watchAction(ex: VideoTarget): WatchAction {
  const video = exerciseVideo(ex);
  return video ? { kind: 'sheet', video } : { kind: 'search', url: searchUrlFor(ex.name) };
}

/** Privacy-enhanced embed: no cookies until the person presses play. */
export function embedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?playsinline=1&rel=0&modestbranding=1`;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** YouTube's own 480x360 still for a video (letterboxed to 16:9 by cover). */
export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

/** 214 -> "3:34"; null when the length is unknown. */
export function videoLength(sec: number | null | undefined): string | null {
  if (!sec || sec < 0) return null;
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A YouTube search for a good form video, when none is curated. */
export function searchUrlFor(name: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form tutorial`)}`;
}
