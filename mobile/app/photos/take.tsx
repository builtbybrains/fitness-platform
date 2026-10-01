/* One body photo: take it (expo-camera) or pick it, find the face on the
   phone, let the person place the blur, show the baked result, then upload
   that baked image and nothing else. Opened by the questionnaire and the
   monthly check-in with ?kind=front|side|back&setId=…&source=signup|checkin;
   on success it records the photo in the photo set store and goes back. */

import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { C, FONT, R, screen, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { Button, IconButton, LinkButton } from '../../src/components/Button';
import { Notice } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { asApiError } from '../../src/api/errors';
import { bodyPhotoPath, uploadBodyPhoto } from '../../src/api/photos';
import { detectFaces } from '../../src/api/device/faces';
import { bakeBlur } from '../../src/api/device/blur';
import { BlurEditor, newRegion, RegionCount } from '../../src/components/profile/BlurEditor';
import { PoseGuide } from '../../src/components/profile/PoseGuide';
import { markUploaded } from '../../src/components/profile/photoSetStore';
import { CheckRow } from '../../src/components/onboarding/Controls';
import type { BlurRegion, BlurredPhoto, BodyPhotoKind, BodyPhotoSource } from '../../src/types';

type Stage = 'choose' | 'camera' | 'detect' | 'edit' | 'preview';
type Picked = { uri: string; width: number; height: number };

const KIND_LABEL: Record<BodyPhotoKind, string> = { front: 'Front photo', side: 'Side photo', back: 'Back photo' };
const KIND_TIP: Record<BodyPhotoKind, string> = {
  front: 'Face the camera, arms a little away from your body.',
  side: 'Turn to your right, arms relaxed by your sides.',
  back: 'Turn your back to the camera, arms a little out.',
};

function sizeOf(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => Image.getSize(uri, (width, height) => resolve({ width, height }), () => resolve({ width: 0, height: 0 })));
}

export default function TakePhoto() {
  const params = useLocalSearchParams<{ kind?: string; setId?: string; source?: string }>();
  const kind: BodyPhotoKind = params.kind === 'side' || params.kind === 'back' ? params.kind : 'front';
  const source: BodyPhotoSource = params.source === 'checkin' ? 'checkin' : 'signup';
  const setId = params.setId ?? '';
  const { userId } = useAuth();

  const [stage, setStage] = useState<Stage>('choose');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [regions, setRegions] = useState<BlurRegion[]>([]);
  const [detected, setDetected] = useState<{ detected: boolean; available: boolean }>({ detected: false, available: false });
  const [noFace, setNoFace] = useState(false);
  const [baked, setBaked] = useState<BlurredPhoto | null>(null);
  const [busy, setBusy] = useState<'pick' | 'bake' | 'upload' | 'shoot' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);

  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function startEditing(p: Picked) {
    setPicked(p);
    setBaked(null);
    setNoFace(false);
    setErr(null);
    setStage('detect');
    const size = p.width && p.height ? p : { ...p, ...(await sizeOf(p.uri)) };
    setPicked(size);
    const found = await detectFaces(size.uri, size.width, size.height);
    setRegions(found.regions);
    setDetected({ detected: found.detected, available: found.available });
    setStage('edit');
  }

  async function pickFromLibrary() {
    setErr(null);
    setBusy('pick');
    try {
      if (Platform.OS !== 'web') {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) {
          setErr('BUILT needs access to your photos to pick one. You can allow it in your phone settings.');
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      await startEditing({ uri: a.uri, width: a.width, height: a.height });
    } catch {
      setErr("That photo couldn't be opened. Try another one.");
    } finally {
      setBusy(null);
    }
  }

  async function openCamera() {
    setErr(null);
    if (!perm?.granted) {
      const p = await requestPerm();
      if (!p.granted) {
        setErr('BUILT needs your camera to take the photo. Allow it in your phone settings, or choose a photo from your library.');
        return;
      }
    }
    setStage('camera');
  }

  async function shoot() {
    if (!camera.current) return;
    setBusy('shoot');
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (pic) await startEditing({ uri: pic.uri, width: pic.width, height: pic.height });
    } catch {
      setErr("The camera couldn't take the photo. Try again, or choose one from your library.");
      setStage('choose');
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    if (!picked) return;
    setErr(null);
    setBusy('bake');
    try {
      const out = await bakeBlur({ uri: picked.uri, width: picked.width, height: picked.height }, regions, { confirmNoFace: kind === 'back' && noFace });
      setBaked(out);
      setStage('preview');
    } catch (e) {
      setErr(asApiError(e).message || 'Place the blur over your face first.');
    } finally {
      setBusy(null);
    }
  }

  async function upload() {
    if (!baked || !userId) return;
    setErr(null);
    setBusy('upload');
    try {
      // Only the baked image goes up: uploadBodyPhoto refuses anything that
      // didn't come out of bakeBlur.
      const row = await uploadBodyPhoto(userId, { photo: baked, kind, setId, source });
      markUploaded(setId, kind, baked.uri, row.storage_path ?? bodyPhotoPath(userId, setId, kind));
      leave();
    } catch (e) {
      const a = asApiError(e);
      if (a.code === 'not_blurred') setStage('edit');
      setErr(a.message);
    } finally {
      setBusy(null);
    }
  }

  if (!setId) {
    return (
      <SafeAreaView style={[screen, { padding: 24, justifyContent: 'center', gap: 16 }]}>
        <Text style={T.h1}>Start from your plan</Text>
        <Text style={[T.body, { color: C.muted }]}>Open body photos from the questionnaire or a monthly check-in.</Text>
        <Button label="Go back" onPress={leave} />
      </SafeAreaView>
    );
  }

  // ─── camera ───
  if (stage === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView ref={camera} style={{ flex: 1 }} facing={facing} />
        <SafeAreaView edges={['top', 'bottom']} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'space-between' }} pointerEvents="box-none">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 12 }}>
            <IconButton icon="close" onPress={() => setStage('choose')} accessibilityLabel="Close camera" />
            <IconButton icon="refresh" onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} accessibilityLabel="Switch camera" />
          </View>
          <View style={{ alignItems: 'center', gap: 12, paddingBottom: 24 }}>
            <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, color: C.text, textAlign: 'center', paddingHorizontal: 24 }}>{KIND_TIP[kind]}</Text>
            <IconButton icon="camera" variant="green" size={72} onPress={shoot} busy={busy === 'shoot'} accessibilityLabel="Take photo" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const header = (title: string, onBack: () => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 52 }}>
      <IconButton icon="chevronLeft" variant="bare" onPress={onBack} accessibilityLabel="Back" />
      <Text style={[T.h2, { flex: 1 }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );

  // ─── finding the face ───
  if (stage === 'detect') {
    return (
      <SafeAreaView style={screen} edges={['top', 'bottom']}>
        {header('Finding your face', () => setStage('choose'))}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }} accessibilityLiveRegion="polite">
          <ActivityIndicator color={C.green} size="large" />
          <Text style={[T.body, { color: C.muted, textAlign: 'center' }]}>Looking for faces on your phone. Nothing has been uploaded.</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── place the blur ───
  if (stage === 'edit' && picked) {
    const canPreview = regions.length > 0 || (kind === 'back' && noFace);
    const status = detected.detected
      ? 'Face found and covered. Check it, and adjust if you need to.'
      : 'Drag the blur over your face. Resize it from the corner dot.';
    return (
      <SafeAreaView style={screen} edges={['top', 'bottom']}>
        <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          {header('Blur your face', () => setStage('choose'))}
          <Text style={[T.meta, { paddingHorizontal: 20, color: C.stone }]} accessibilityLiveRegion="polite">
            {status}
          </Text>
          <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 16 }}>
            <BlurEditor uri={picked.uri} width={picked.width} height={picked.height} regions={regions} onChange={setRegions} />
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Button compact variant="secondary" icon="plus" label="Add blur area" onPress={() => setRegions((r) => [...r, newRegion(r.length)])} />
              <RegionCount n={regions.length} />
            </View>
            {kind === 'back' && regions.length === 0 ? <CheckRow checked={noFace} onChange={setNoFace} label="There is no face in this photo." /> : null}
            {err ? <Notice tone="error">{err}</Notice> : null}
            <Button
              label={busy === 'bake' ? 'Blurring' : 'Preview blur'}
              onPress={preview}
              busy={busy === 'bake'}
              disabled={!canPreview}
              accessibilityHint={canPreview ? undefined : 'Add a blur area first.'}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── the baked result ───
  if (stage === 'preview' && baked) {
    return (
      <SafeAreaView style={screen} edges={['top', 'bottom']}>
        <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          {header('Check your photo', () => setStage('edit'))}
          <Text style={[T.meta, { paddingHorizontal: 20, color: C.stone }]}>
            This is exactly what will be uploaded. The blur is part of the image now, and the original stays on this phone.
          </Text>
          <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <Image
                source={{ uri: baked.uri }}
                style={{ width: '100%', height: '100%', borderRadius: R.tile }}
                resizeMode="contain"
                accessibilityLabel="Blurred photo preview"
              />
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 12, gap: 8, borderTopWidth: 1, borderTopColor: C.line }}>
            {err ? <Notice tone="error">{err}</Notice> : null}
            <Button label={busy === 'upload' ? 'Uploading' : 'Upload photo'} onPress={upload} busy={busy === 'upload'} />
            <LinkButton onPress={() => setStage('edit')} accessibilityLabel="Adjust the blur">
              Adjust the blur
            </LinkButton>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── choose: camera or library ───
  return (
    <SafeAreaView style={screen} edges={['top', 'bottom']}>
      <View style={{ flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        {header(KIND_LABEL[kind], leave)}
        <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 20 }}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', backgroundColor: C.card, borderRadius: R.card, padding: 16 }}>
            <PoseGuide kind={kind} size={128} />
            <View style={{ flex: 1, gap: 10 }}>
              <Text style={T.bodyStrong}>{KIND_TIP[kind]}</Text>
              <Text style={T.meta}>Stand about two metres away, full body in the frame, in fitted clothes and good light.</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 4 }}>
            <Icon name="check" size={20} />
            <Text style={[T.meta, { flex: 1, color: C.stone }]}>
              Your face is blurred on this phone before the photo is uploaded. The blurred photo is stored privately and only you can see it.
            </Text>
          </View>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 12, paddingTop: 12, gap: 10 }}>
          {err ? <Notice tone="error">{err}</Notice> : null}
          <Button label="Take photo" icon="camera" onPress={openCamera} />
          <Button label={busy === 'pick' ? 'Opening' : 'Choose from library'} icon="image" variant="secondary" onPress={pickFromLibrary} busy={busy === 'pick'} />
        </View>
      </View>
    </SafeAreaView>
  );
}
