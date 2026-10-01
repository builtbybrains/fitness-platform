/* Face detection on iOS and Android with Google ML Kit, through
   @infinitered/react-native-mlkit-face-detection (an Expo module: works in
   a development or production build, not in Expo Go). Same API as
   faces.ts (web).

   Faces come back as padded ellipses (hair, ears and jaw covered) in
   fractions of the photo. When the native module is missing (Expo Go) or
   finds nothing, one suggested box is returned for the person to place;
   the screen must always let them adjust or add boxes before baking. */

import type { FaceDetection } from '../../types';
import { padRegion, SUGGESTED_FACE_REGION } from './blurShared';
import type * as WebFaces from './faces';

type Detector = {
  initialize: (o?: unknown) => Promise<void>;
  detectFaces: (uri: string) => Promise<{ faces: { frame: { origin: { x: number; y: number }; size: { x: number; y: number } } }[]; success: boolean } | undefined>;
};

let detector: Detector | null | undefined;

async function getDetector(): Promise<Detector | null> {
  if (detector !== undefined) return detector;
  try {
    // Required lazily: in Expo Go the native module is absent and the
    // import itself throws.
    const mod = require('@infinitered/react-native-mlkit-face-detection') as { RNMLKitFaceDetector: new (o?: unknown, defer?: boolean) => Detector };
    const d = new mod.RNMLKitFaceDetector({ performanceMode: 'accurate', minFaceSize: 0.05 }, true);
    await d.initialize({ performanceMode: 'accurate', minFaceSize: 0.05 });
    detector = d;
  } catch {
    detector = null;
  }
  return detector;
}

export async function detectFaces(uri: string, width: number, height: number): Promise<FaceDetection> {
  const fallback: FaceDetection = { regions: [{ ...SUGGESTED_FACE_REGION }], detected: false, available: false };
  const d = await getDetector();
  if (!d || !width || !height) return fallback;
  try {
    const res = await d.detectFaces(uri);
    const faces = res?.success ? res.faces : [];
    if (!faces.length) return { ...fallback, available: true };
    return {
      regions: faces.map((f) =>
        padRegion({ x: f.frame.origin.x / width, y: f.frame.origin.y / height, width: f.frame.size.x / width, height: f.frame.size.y / height, shape: 'ellipse' }),
      ),
      detected: true,
      available: true,
    };
  } catch {
    return { ...fallback, available: true };
  }
}

export function faceDetectionAvailable(): boolean {
  return detector !== null;
}

const _parity: typeof WebFaces = { detectFaces, faceDetectionAvailable };
void _parity;
