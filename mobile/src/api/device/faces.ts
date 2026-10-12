/* Face detection, WEB version: there is no on-device detector on the web,
   so this returns one suggested box (top centre) for the person to drag
   and resize over their face. Metro picks faces.native.ts on iOS/Android.

   Import as `import { detectFaces } from '../src/api/device/faces'`. */

import type { FaceDetection } from '../../types';
import { SUGGESTED_FACE_REGION } from './blurShared';

/** Find faces in a photo. `width`/`height` are the photo's pixel size (as
    returned by the camera or image picker). Never throws. */
export async function detectFaces(_uri: string, _width: number, _height: number): Promise<FaceDetection> {
  return { regions: [{ ...SUGGESTED_FACE_REGION }], detected: false, available: false };
}

/** True when automatic detection can run here. */
export function faceDetectionAvailable(): boolean {
  return false;
}
