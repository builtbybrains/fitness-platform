/* Face blur baked into the pixels, WEB version (Canvas 2D). Metro picks
   blur.native.ts on iOS and Android.

   Import as `import { bakeBlur } from '../src/api/device/blur'` on every
   platform. Each region is pixelated (8 blocks across) and then blurred,
   so the face can't be recovered; the result is a new JPEG, resized so the
   longest side is at most 1280 px. Canvas is used instead of Skia on the
   web so the 7 MB CanvasKit download isn't needed. */

import { ApiError } from '../errors';
import type { BlurRegion, BlurredPhoto } from '../../types';
import { type BakeOptions, type BlurSource, fitSize, JPEG_QUALITY, MAX_PHOTO_SIDE, requireRegions } from './blurShared';

export type { BakeOptions, BlurSource } from './blurShared';

type Img = { naturalWidth: number; naturalHeight: number; crossOrigin: string | null; onload: (() => void) | null; onerror: (() => void) | null; src: string };
type Ctx2D = {
  drawImage: (...args: unknown[]) => void;
  save: () => void;
  restore: () => void;
  beginPath: () => void;
  ellipse: (x: number, y: number, rx: number, ry: number, rot: number, s: number, e: number) => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  clip: () => void;
  imageSmoothingEnabled: boolean;
  filter: string;
};
type Canvas = { width: number; height: number; getContext: (k: '2d') => Ctx2D | null; toDataURL: (type: string, q: number) => string };
type Doc = { createElement: (tag: string) => unknown };

function doc(): Doc {
  const d = (globalThis as { document?: Doc }).document;
  if (!d) throw new ApiError('unsupported', "Photos can't be prepared here.", 0);
  return d;
}

function loadImage(uri: string): Promise<Img> {
  return new Promise((resolve, reject) => {
    const ImageCtor = (globalThis as unknown as { Image: new () => Img }).Image;
    const img = new ImageCtor();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ApiError('bad_request', "That photo couldn't be opened. Try another one.", 0));
    img.src = uri;
  });
}

function canvas(w: number, h: number): { c: Canvas; ctx: Ctx2D } {
  const c = doc().createElement('canvas') as Canvas;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new ApiError('unsupported', "Photos can't be prepared here.", 0);
  return { c, ctx };
}

/** Bake the blur into a new JPEG. Throws when no region is given unless
    opts.confirmNoFace is true. */
export async function bakeBlur(source: BlurSource, regions: readonly BlurRegion[], opts: BakeOptions = {}): Promise<BlurredPhoto> {
  const clean = requireRegions(regions, opts);
  const img = await loadImage(source.uri);
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, opts.maxSide ?? MAX_PHOTO_SIDE);
  const { c, ctx } = canvas(width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const r of clean) {
    const x = Math.round(r.x * width);
    const y = Math.round(r.y * height);
    const w = Math.max(1, Math.round(r.width * width));
    const h = Math.max(1, Math.round(r.height * height));
    // 1. pixelate: shrink the area to ~8 blocks across, scale back up.
    const blocks = Math.max(2, Math.round(Math.min(8, w / 4)));
    const tw = blocks;
    const th = Math.max(2, Math.round((h / w) * blocks));
    const small = canvas(tw, th);
    small.ctx.imageSmoothingEnabled = true;
    small.ctx.drawImage(c, x, y, w, h, 0, 0, tw, th);
    ctx.save();
    ctx.beginPath();
    if (r.shape === 'rect') ctx.rect(x, y, w, h);
    else ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small.c, 0, 0, tw, th, x, y, w, h);
    // 2. soften the blocks where the browser supports canvas filters.
    if ('filter' in ctx) {
      ctx.filter = `blur(${Math.max(4, Math.round(w / 12))}px)`;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small.c, 0, 0, tw, th, x, y, w, h);
      ctx.filter = 'none';
    }
    ctx.restore();
  }

  const dataUrl = c.toDataURL('image/jpeg', JPEG_QUALITY);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { uri: dataUrl, base64, width, height, regions: clean.length } as BlurredPhoto;
}

/** Skia is not used on the web build. */
export const BLUR_ENGINE = 'canvas' as const;
