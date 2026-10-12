/* Take or pick a meal photo, then resize it to about 1024 px and compress
   it to JPEG on the device (api/food analyzeFood takes up to 1.8 MB).
   Resolves bare base64 plus a preview uri, or null when cancelled. */

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_DIM = 1024;

export class PermissionDenied extends Error {
  kind: 'camera' | 'photos';
  constructor(kind: 'camera' | 'photos') {
    super(kind);
    this.kind = kind;
  }
}

export async function takeMealPhoto(useCamera: boolean): Promise<{ base64: string; uri: string } | null> {
  const perm = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new PermissionDenied(useCamera ? 'camera' : 'photos');

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const shot = useCamera ? await ImagePicker.launchCameraAsync({ ...opts, allowsEditing: true, aspect: [4, 3] }) : await ImagePicker.launchImageLibraryAsync(opts);
  if (shot.canceled || !shot.assets?.length) return null;
  const asset = shot.assets[0];

  const ctx = ImageManipulator.manipulate(asset.uri);
  const w = asset.width || 0;
  const h = asset.height || 0;
  if (w && h && Math.max(w, h) > MAX_DIM) {
    const scale = MAX_DIM / Math.max(w, h);
    ctx.resize({ width: Math.round(w * scale), height: Math.round(h * scale) });
  } else if (!w || !h) {
    ctx.resize({ width: MAX_DIM });
  }
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error("Couldn't process that photo. Try another one.");
  return { base64: out.base64, uri: `data:image/jpeg;base64,${out.base64}` };
}

export function permissionText(kind: 'camera' | 'photos'): { title: string; body: string } {
  return kind === 'camera'
    ? { title: 'Camera access is off', body: 'To photograph a meal, allow camera access for BUILT in your Settings.' }
    : { title: 'Photo access is off', body: 'To log a meal from a photo, allow photo access for BUILT in your Settings.' };
}
