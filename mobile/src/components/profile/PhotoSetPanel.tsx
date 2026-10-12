/* Front (required), side and back (optional) body photo slots. Each slot
   opens the capture route; a taken slot shows the face-blurred photo that
   was uploaded and can be retaken. Used by the questionnaire and the
   monthly check-in. */

import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import { C, FONT, R, T } from '../../design';
import { Icon } from '../Icon';
import { bodyPhotoUrl } from '../../api/photos';
import type { BodyPhotoKind, BodyPhotoSource } from '../../types';
import { usePhotoSet, type TakenPhoto } from './photoSetStore';

const SLOTS: { kind: BodyPhotoKind; label: string; required: boolean }[] = [
  { kind: 'front', label: 'Front', required: true },
  { kind: 'side', label: 'Side', required: false },
  { kind: 'back', label: 'Back', required: false },
];

export function openPhotoCapture(kind: BodyPhotoKind, setId: string, source: BodyPhotoSource) {
  router.push({ pathname: '/photos/take', params: { kind, setId, source } });
}

function Thumb({ photo, label }: { photo: TakenPhoto; label: string }) {
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    if (photo.uri || !photo.path) return;
    let alive = true;
    bodyPhotoUrl(photo.path, 600)
      .then((u) => alive && setSigned(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [photo.uri, photo.path]);
  const uri = photo.uri || signed;
  if (!uri) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check" size={28} />
      </View>
    );
  }
  return <Image source={{ uri }} style={{ flex: 1, width: '100%' }} resizeMode="cover" accessibilityLabel={`${label} photo, face blurred`} />;
}

export function PhotoSetPanel({ setId, source }: { setId: string; source: BodyPhotoSource }) {
  const set = usePhotoSet(setId);
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {SLOTS.map((s) => {
        const taken = set[s.kind];
        return (
          <Pressable
            key={s.kind}
            onPress={() => openPhotoCapture(s.kind, setId, source)}
            accessibilityRole="button"
            accessibilityLabel={taken ? `${s.label} photo added. Retake it.` : `Add ${s.label.toLowerCase()} photo${s.required ? ', required' : ', optional'}`}
            style={({ pressed }) => ({ flex: 1, gap: 8, opacity: pressed ? 0.85 : 1 })}
          >
            <View
              style={{
                aspectRatio: 3 / 4,
                borderRadius: R.tile,
                overflow: 'hidden',
                backgroundColor: C.card,
                borderWidth: 1,
                borderColor: taken ? C.greenBorder : C.lineStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {taken ? (
                <Thumb photo={taken} label={s.label} />
              ) : (
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: s.required ? C.green : C.raised, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={s.required ? 'camera' : 'plus'} size={22} color={s.required ? C.onGreen : C.text} />
                  </View>
                </View>
              )}
            </View>
            <View style={{ gap: 0 }}>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 15, color: C.text }}>{s.label}</Text>
              <Text style={T.small}>{taken ? 'Tap to retake' : s.required ? 'Required' : 'Optional'}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
