/* Which photos of a set are uploaded, shared between the capture route
   (app/photos/take) and whoever opened it (the questionnaire's photo step,
   the monthly check-in). In memory: the server's body_photos rows are the
   record, and seedPhotoSet() rebuilds this after an app restart. */

import { useSyncExternalStore } from 'react';

import type { BodyPhotoKind } from '../../types';

/** `uri`: the baked (face-blurred) image as uploaded, or '' when only the
    server copy is known; `path`: its storage path. */
export type TakenPhoto = { uri: string; path: string; at: number };
export type PhotoSetState = Partial<Record<BodyPhotoKind, TakenPhoto>>;

const sets = new Map<string, PhotoSetState>();
const listeners = new Set<() => void>();
const EMPTY: PhotoSetState = {};

function emit() {
  listeners.forEach((l) => l());
}

export function markUploaded(setId: string, kind: BodyPhotoKind, uri: string, path: string): void {
  sets.set(setId, { ...(sets.get(setId) ?? {}), [kind]: { uri, path, at: Date.now() } });
  emit();
}

/** Fill in photos already on the server (after a restart). Never
    overwrites a photo taken in this session. */
export function seedPhotoSet(setId: string, rows: { kind: BodyPhotoKind; storage_path: string }[]): void {
  const cur = { ...(sets.get(setId) ?? {}) };
  let changed = false;
  for (const r of rows) {
    if (!cur[r.kind]) {
      cur[r.kind] = { uri: '', path: r.storage_path, at: 0 };
      changed = true;
    }
  }
  if (changed) {
    sets.set(setId, cur);
    emit();
  }
}

export function getPhotoSet(setId: string): PhotoSetState {
  return sets.get(setId) ?? EMPTY;
}

export function usePhotoSet(setId: string | null): PhotoSetState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (setId ? sets.get(setId) ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}
