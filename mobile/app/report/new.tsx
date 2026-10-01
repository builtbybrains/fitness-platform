/* Report a problem: a category, what happened, and an optional screenshot
   from the photo library. */

import { useState } from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';

import { C, FONT, R, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { asApiError } from '../../src/api/errors';
import { createReport } from '../../src/api/reports';
import { Button } from '../../src/components/Button';
import { Field } from '../../src/components/Field';
import { Notice } from '../../src/components/Bits';
import { Icon } from '../../src/components/Icon';
import { GroupLabel } from '../../src/components/onboarding/Controls';
import { Chip } from '../../src/components/training/Controls';
import { SubScreen } from '../../src/components/profile/SubScreen';
import { REPORT_CATEGORIES } from '../../src/components/profile/reportBits';
import type { ReportCategory } from '../../src/types';

const MAX = 4000;
type Shot = { uri: string; base64: string; mime: 'image/jpeg' | 'image/png' };

export default function NewReport() {
  const { userId } = useAuth();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<Shot | null>(null);
  const [busy, setBusy] = useState<'send' | 'pick' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick() {
    setErr(null);
    setBusy('pick');
    try {
      if (Platform.OS !== 'web') {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) {
          setErr('BUILT needs access to your photos to attach a screenshot. You can allow it in your phone settings.');
          return;
        }
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true, exif: false });
      const a = res.canceled ? null : res.assets?.[0];
      if (!a) return;
      let b64 = a.base64 ?? '';
      if (!b64 && a.uri.startsWith('data:')) b64 = a.uri.slice(a.uri.indexOf(',') + 1);
      if (!b64) {
        setErr("That screenshot couldn't be read. Try another one.");
        return;
      }
      const png = (a.mimeType ?? '').includes('png') || a.uri.startsWith('data:image/png');
      setShot({ uri: a.uri, base64: b64, mime: png ? 'image/png' : 'image/jpeg' });
    } catch {
      setErr("That screenshot couldn't be opened. Try another one.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!userId) return;
    if (!category) return setErr('Pick what the problem is about.');
    if (!message.trim()) return setErr('Tell us what happened first.');
    setErr(null);
    setBusy('send');
    try {
      const r = await createReport(userId, {
        category,
        message,
        screenshotBase64: shot?.base64 ?? null,
        screenshotMime: shot?.mime,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version ?? '',
      });
      router.replace({ pathname: '/report/[id]', params: { id: r.id, sent: '1' } });
    } catch (e) {
      setErr(asApiError(e).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SubScreen
      title="Report a problem"
      footer={
        <>
          {err ? <Notice tone="error">{err}</Notice> : null}
          <Button label={busy === 'send' ? 'Sending' : 'Send report'} onPress={send} busy={busy === 'send'} />
        </>
      }
    >
      <View style={{ gap: 12 }}>
        <GroupLabel>What is it about?</GroupLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Category">
          {REPORT_CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={category === c.id}
              onPress={() => {
                setCategory(c.id);
                setErr(null);
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Field
          label="What happened?"
          value={message}
          onChangeText={(t) => setMessage(t.slice(0, MAX))}
          multiline
          placeholder="What you did, what you expected, and what happened instead."
          style={{ minHeight: 140, textAlignVertical: 'top' }}
        />
        <Text style={[T.small, { textAlign: 'right' }]}>
          {message.length} / {MAX}
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <GroupLabel>Screenshot (optional)</GroupLabel>
        {shot ? (
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <Image source={{ uri: shot.uri }} style={{ width: 72, height: 128, borderRadius: R.input, backgroundColor: C.card }} resizeMode="cover" accessibilityLabel="Attached screenshot" />
            <View style={{ flex: 1, gap: 8 }}>
              <Text style={T.meta}>Attached. Only you and BUILT support can see it.</Text>
              <Button compact variant="secondary" label="Remove" onPress={() => setShot(null)} style={{ alignSelf: 'flex-start' }} />
            </View>
          </View>
        ) : (
          <Pressable
            onPress={pick}
            disabled={busy === 'pick'}
            accessibilityRole="button"
            accessibilityLabel="Add a screenshot from your photos"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              minHeight: 56,
              paddingHorizontal: 16,
              borderRadius: R.tile,
              borderWidth: 1,
              borderColor: C.lineStrong,
              backgroundColor: pressed ? C.raised : 'transparent',
            })}
          >
            <Icon name="image" size={22} />
            <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 15, color: C.text }}>{busy === 'pick' ? 'Opening your photos' : 'Add a screenshot'}</Text>
          </Pressable>
        )}
      </View>
    </SubScreen>
  );
}
