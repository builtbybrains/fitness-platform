/* Body photos and the photo estimate.

   The flow (sign-up step 14 and the monthly check-in):
     1. Take or pick the photo (expo-camera / expo-image-picker).
     2. detectFaces(uri, w, h)          api/device/faces  (suggested boxes)
     3. Let the person adjust the boxes (draggable, resizable).
     4. bakeBlur(source, regions)       api/device/blur   → BlurredPhoto
     5. uploadBodyPhoto(userId, { photo, kind, setId, source })
     6. runBodyAnalysis(userId, setId)  once the set is uploaded (front
        required; side and back optional).
   Only a BlurredPhoto can be uploaded, so an unblurred photo never leaves
   the phone. Files live in the private `body-photos` bucket at
   <user id>/<set id>/<kind>.jpg; only their owner can read them.
   Photos need an account (needs_account otherwise). */

import { supabase } from '../lib/supabase';
import { newId } from '../lib/cloud';
import { todayId } from '../lib/dates';
import { base64Bytes, base64ToBytes } from './base64';
import { invoke, requireAccount } from './client';
import { ApiError, fromDbError, MESSAGES } from './errors';
import type { BlurredPhoto, BodyAnalysis, BodyPhoto, BodyPhotoKind, BodyPhotoSource } from '../types';

const BUCKET = 'body-photos';
const MAX_BYTES = 6 * 1024 * 1024;
const PHOTO_ACCOUNT = 'Progress photos need an account so they can be stored privately. Sign up free to add them.';

/** A new id for a set of photos taken together. */
export function newPhotoSetId(): string {
  return newId();
}

export function bodyPhotoPath(userId: string, setId: string, kind: BodyPhotoKind): string {
  return `${userId}/${setId}/${kind}.jpg`;
}

function assertBlurred(photo: BlurredPhoto, kind: BodyPhotoKind): void {
  const ok = !!photo && typeof photo.base64 === 'string' && photo.base64.length > 100 && typeof photo.regions === 'number';
  if (!ok) throw new ApiError('not_blurred', 'Blur your face before saving the photo.', 0);
  if (kind !== 'back' && photo.regions < 1) throw new ApiError('not_blurred', 'Place the blur over your face before saving the photo.', 0);
}

/** Upload one face-blurred photo and record it. Retaking the same kind in
    the same set replaces it. */
export async function uploadBodyPhoto(
  userId: string,
  args: { photo: BlurredPhoto; kind: BodyPhotoKind; setId: string; source: BodyPhotoSource },
): Promise<BodyPhoto> {
  requireAccount(userId, PHOTO_ACCOUNT);
  assertBlurred(args.photo, args.kind);
  if (base64Bytes(args.photo.base64) > MAX_BYTES) throw new ApiError('payload_too_large', 'That photo is too large. Retake it and try again.', 413);
  const path = bodyPhotoPath(userId, args.setId, args.kind);
  const bytes = base64ToBytes(args.photo.base64);

  // A retake: remove the old file and row first (photos can't be edited).
  await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
  await supabase.from('body_photos').delete().eq('user_id', userId).eq('set_id', args.setId).eq('kind', args.kind);

  const up = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (up.error) {
    throw /fetch|network/i.test(up.error.message)
      ? new ApiError('offline', MESSAGES.offline, 0)
      : new ApiError('server_error', "Your photo couldn't be saved. Try again in a moment.", 500);
  }
  const { data, error } = await supabase
    .from('body_photos')
    .insert({ user_id: userId, set_id: args.setId, kind: args.kind, source: args.source, storage_path: path })
    .select('*')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    throw fromDbError(error, "Your photo couldn't be saved. Try again in a moment.");
  }
  return data as BodyPhoto;
}

/** Every body photo, newest first. */
export async function listBodyPhotos(userId: string): Promise<BodyPhoto[]> {
  requireAccount(userId, PHOTO_ACCOUNT);
  const { data, error } = await supabase.from('body_photos').select('*').eq('user_id', userId).order('taken_at', { ascending: false }).limit(200);
  if (error) throw fromDbError(error, "Couldn't load your photos.");
  return (data ?? []) as BodyPhoto[];
}

/** A short-lived link to show one of the person's own photos. */
export async function bodyPhotoUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw new ApiError('not_found', "That photo couldn't be opened.", 404);
  return data.signedUrl;
}

/** Delete a whole set (files and rows). */
export async function deletePhotoSet(userId: string, setId: string): Promise<void> {
  requireAccount(userId, PHOTO_ACCOUNT);
  const { data } = await supabase.from('body_photos').select('storage_path').eq('user_id', userId).eq('set_id', setId);
  const paths = (data ?? []).map((r) => String(r.storage_path));
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from('body_photos').delete().eq('user_id', userId).eq('set_id', setId);
  if (error) throw fromDbError(error, "Couldn't delete those photos. Try again.");
}

/** The AI's rough starting point from an uploaded set plus the
    questionnaire. not_configured when no AI key is set (carry on without
    it: the planner uses the answers alone). */
export async function runBodyAnalysis(userId: string, setId: string): Promise<BodyAnalysis> {
  requireAccount(userId, PHOTO_ACCOUNT);
  const data = await invoke<{ analysis: BodyAnalysis }>('body-analysis', { photo_set_id: setId, localDay: todayId() });
  return data.analysis;
}

export async function latestBodyAnalysis(userId: string): Promise<BodyAnalysis | null> {
  requireAccount(userId, PHOTO_ACCOUNT);
  const { data, error } = await supabase
    .from('body_analyses')
    .select('id, photo_set_id, created_at, result, model')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDbError(error, "Couldn't load your photo estimate.");
  return (data as BodyAnalysis | null) ?? null;
}
