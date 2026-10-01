/* Shared, platform-free parts of the face blur (unit tested). */

import type { BlurRegion } from '../../types';

/** Longest side of an uploaded body photo, px. */
export const MAX_PHOTO_SIDE = 1280;
export const JPEG_QUALITY = 0.85;

export type BakeOptions = {
  /** Set true only when the person confirmed no face is visible (a back
      photo, for example). Otherwise at least one region is required. */
  confirmNoFace?: boolean;
  maxSide?: number;
};

export type BlurSource = { uri: string; width?: number; height?: number };

/** Clamp regions into the image and drop empty ones. */
export function cleanRegions(regions: readonly BlurRegion[]): BlurRegion[] {
  return regions
    .map((r) => {
      const x = Math.min(1, Math.max(0, r.x));
      const y = Math.min(1, Math.max(0, r.y));
      return {
        x,
        y,
        width: Math.min(1 - x, Math.max(0, r.width)),
        height: Math.min(1 - y, Math.max(0, r.height)),
        shape: r.shape === 'rect' ? 'rect' : 'ellipse',
      } as BlurRegion;
    })
    .filter((r) => r.width > 0.01 && r.height > 0.01);
}

/** Size after fitting the longest side into `maxSide`. */
export function fitSize(width: number, height: number, maxSide = MAX_PHOTO_SIDE): { width: number; height: number } {
  const s = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) };
}

/** Grow a face box so hair, ears and jaw are covered too. */
export function padRegion(r: BlurRegion, pad = 0.35): BlurRegion {
  const dx = r.width * pad;
  const dy = r.height * pad;
  return cleanRegions([{ x: r.x - dx, y: r.y - dy * 1.2, width: r.width + 2 * dx, height: r.height + 2 * dy * 1.1, shape: r.shape }])[0] ?? r;
}

/** Where to put the blur box when no face was found: top centre, for the
    person to drag over their face. */
export const SUGGESTED_FACE_REGION: BlurRegion = { x: 0.34, y: 0.03, width: 0.32, height: 0.22, shape: 'ellipse' };

export function requireRegions(regions: readonly BlurRegion[], opts: BakeOptions): BlurRegion[] {
  const clean = cleanRegions(regions);
  if (!clean.length && !opts.confirmNoFace) {
    throw new Error('Place the blur over your face first.');
  }
  return clean;
}
