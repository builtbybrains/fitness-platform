/* Face blur baked into the pixels, iOS and Android (Skia, offscreen).
   Same API as blur.ts (web); Metro picks this file on native.

   Each region gets a very strong Gaussian blur (sigma = a quarter of the
   region's size, applied twice), clipped to an ellipse or rectangle, so
   the face can't be recovered. The result is a new JPEG, resized so the
   longest side is at most 1280 px. Works in Expo dev builds and Expo Go
   (Skia ships in Expo Go). */

import { ClipOp, ImageFormat, Skia, TileMode } from '@shopify/react-native-skia';

import { ApiError } from '../errors';
import type { BlurRegion, BlurredPhoto } from '../../types';
import { type BakeOptions, type BlurSource, fitSize, JPEG_QUALITY, MAX_PHOTO_SIDE, requireRegions } from './blurShared';
import type * as WebBlur from './blur';

export type { BakeOptions, BlurSource } from './blurShared';

export async function bakeBlur(source: BlurSource, regions: readonly BlurRegion[], opts: BakeOptions = {}): Promise<BlurredPhoto> {
  const clean = requireRegions(regions, opts);
  const data = await Skia.Data.fromURI(source.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new ApiError('bad_request', "That photo couldn't be opened. Try another one.", 0);
  const { width, height } = fitSize(image.width(), image.height(), opts.maxSide ?? MAX_PHOTO_SIDE);
  const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
  if (!surface) throw new ApiError('unsupported', "Photos can't be prepared on this device.", 0);

  const canvas = surface.getCanvas();
  const srcRect = Skia.XYWHRect(0, 0, image.width(), image.height());
  const dstRect = Skia.XYWHRect(0, 0, width, height);
  canvas.drawImageRect(image, srcRect, dstRect, Skia.Paint());

  for (const r of clean) {
    const rect = Skia.XYWHRect(r.x * width, r.y * height, r.width * width, r.height * height);
    const sigma = Math.max(12, Math.max(rect.width, rect.height) / 4);
    const paint = Skia.Paint();
    const blur = Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null);
    paint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, blur));
    canvas.save();
    if (r.shape === 'rect') {
      canvas.clipRect(rect, ClipOp.Intersect, true);
    } else {
      const path = Skia.Path.Make();
      path.addOval(rect);
      canvas.clipPath(path, ClipOp.Intersect, true);
    }
    canvas.drawImageRect(image, srcRect, dstRect, paint);
    canvas.restore();
  }

  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, Math.round(JPEG_QUALITY * 100));
  if (!base64) throw new ApiError('server_error', "That photo couldn't be prepared. Try again.", 0);
  return { uri: `data:image/jpeg;base64,${base64}`, base64, width, height, regions: clean.length } as BlurredPhoto;
}

export const BLUR_ENGINE = 'skia' as const;

// Compile-time check that this file matches the web version's API.
const _parity: Omit<typeof WebBlur, 'BLUR_ENGINE'> = { bakeBlur };
void _parity;
