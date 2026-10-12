/* Edit one group of questionnaire answers from Profile (about you,
   activity and sleep, goal, training, food, health). Same questions and
   rules as sign-up; saved together. With an account, the plan can be
   rebuilt from the new answers straight away. */

import { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { C, T } from '../../src/design';
import { useAuth } from '../../src/auth';
import { isCloudUser } from '../../src/lib/cloud';
import { asApiError } from '../../src/api/errors';
import { generatePlan } from '../../src/api/plan';
import { Button } from '../../src/components/Button';
import { Notice } from '../../src/components/Bits';
import { GroupLabel } from '../../src/components/onboarding/Controls';
import { draftFromProfile, GROUPS, questionById, type Draft, type GroupId } from '../../src/components/onboarding/questions';
import { EmptyState, goBack, SubScreen } from '../../src/components/profile/SubScreen';
import type { ProfilePatchV2 } from '../../src/types';

export default function EditGroup() {
  const { group } = useLocalSearchParams<{ group: string }>();
  const g = GROUPS[group as GroupId];
  const { userId, profile, saveProfile, notifyPlanChanged, refreshProfile } = useAuth();
  const [draft, setDraft] = useState<Draft | null>(profile ? draftFromProfile(profile) : null);
  const [busy, setBusy] = useState<'save' | 'plan' | null>(null);
  const [flash, setFlash] = useState<{ tone: 'error' | 'success' | 'note'; text: string } | null>(null);
  const [saved, setSaved] = useState(false);

  if (!g || !profile || !draft) {
    return (
      <SubScreen title="Your answers">
        <EmptyState icon="person" title="Nothing to edit here" body="Go back to Profile and pick a group of answers." />
      </SubScreen>
    );
  }

  const set = (patch: Partial<Draft>) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  async function save() {
    if (!draft || !profile) return;
    let patch: ProfilePatchV2 = {};
    for (const id of g.questions) {
      const r = questionById(id).toPatch(draft, profile);
      if ('error' in r) return setFlash({ tone: 'error', text: r.error });
      patch = { ...patch, ...r.patch };
    }
    setBusy('save');
    setFlash(null);
    const res = await saveProfile(patch);
    setBusy(null);
    if (res.error) return setFlash({ tone: 'error', text: res.error });
    setSaved(true);
    setFlash({ tone: 'success', text: isCloudUser(userId) ? 'Saved. Rebuild your plan to use the new answers.' : 'Saved.' });
  }

  async function rebuild() {
    if (!userId) return;
    setBusy('plan');
    setFlash({ tone: 'note', text: 'Your coach is rebuilding your plan. This can take up to a minute.' });
    try {
      const r = await generatePlan(userId);
      notifyPlanChanged();
      await refreshProfile();
      setFlash({ tone: 'success', text: r.changes || 'Your plan is rebuilt from your new answers.' });
    } catch (e) {
      setFlash({ tone: 'error', text: asApiError(e).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <SubScreen
      title={g.title}
      footer={
        <>
          {flash ? <Notice tone={flash.tone}>{flash.text}</Notice> : null}
          {saved && isCloudUser(userId) ? (
            <Button label={busy === 'plan' ? 'Rebuilding your plan' : 'Rebuild my plan'} icon={busy === 'plan' ? undefined : 'refresh'} onPress={rebuild} busy={busy === 'plan'} />
          ) : (
            <Button label={busy === 'save' ? 'Saving' : 'Save changes'} onPress={save} busy={busy === 'save'} />
          )}
          {saved ? <Button label="Done" variant="secondary" onPress={() => goBack()} /> : null}
        </>
      }
    >
      {g.questions.map((id, i) => {
        const q = questionById(id);
        return (
          <View key={id} style={{ gap: 12, paddingTop: i ? 8 : 0, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <View style={{ gap: 4, paddingTop: i ? 16 : 0 }}>
              <GroupLabel>{q.short}</GroupLabel>
              {q.helper ? <Text style={T.meta}>{q.helper}</Text> : null}
            </View>
            {q.render({ draft, set, profile, compact: true })}
          </View>
        );
      })}
    </SubScreen>
  );
}
