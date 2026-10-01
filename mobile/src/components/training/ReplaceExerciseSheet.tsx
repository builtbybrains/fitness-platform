/* "Replace an exercise": three alternatives for the same muscle group that
   fit where the person trains and avoid their injuries. They choose this
   week only or every week, then confirm. */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { C, T } from '../../design';
import type { Exercise } from '../../data/exercises';
import type { PlanExerciseV2 } from '../../types';
import { setsLabel } from '../../planData';
import { Button } from '../Button';
import { Notice } from '../Bits';
import { Sheet } from './Sheet';
import { ChoiceRow, Segmented, StateBlock } from './Controls';
import { equipmentLabel, muscleLabel } from './labels';

type Props = {
  visible: boolean;
  onClose: () => void;
  exercise: PlanExerciseV2 | null;
  options: Exercise[];
  onReplace: (replacement: Exercise, scope: 'week' | 'always') => Promise<{ ok: boolean; error?: string }>;
};

export function ReplaceExerciseSheet({ visible, onClose, exercise, options, onReplace }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [scope, setScope] = useState<'week' | 'always'>('week');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPicked(null);
      setScope('week');
      setError(null);
    }
  }, [visible, exercise?.name]);

  if (!exercise) return null;
  const choice = options.find((o) => o.id === picked) ?? null;

  async function confirm() {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    const r = await onReplace(choice, scope);
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error ?? "That didn't save. Try again.");
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Replace ${exercise.name}`}
      subtitle={`${muscleLabel(exercise.muscle)}. These fit your kit and steer clear of your injuries.`}
      footer={
        options.length ? (
          <Button label={choice ? `Use ${choice.name}` : 'Pick an alternative'} onPress={() => void confirm()} disabled={!choice} busy={busy} />
        ) : undefined
      }
    >
      {options.length === 0 ? (
        <StateBlock
          kind="empty"
          icon="dumbbell"
          title="No safe swap for this one"
          body="Nothing else for this muscle fits your kit and injuries. Ask your coach in Change my plan and it can rework the session."
        />
      ) : (
        <>
          <Segmented
            label="How long"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'week', label: 'This week' },
              { value: 'always', label: 'Every week' },
            ]}
          />
          <View style={{ gap: 8 }}>
            {options.map((o) => (
              <ChoiceRow
                key={o.id}
                title={o.name}
                detail={`${equipmentLabel(o.equipment)} · ${setsLabel({ sets: exercise.unit === o.unit ? exercise.sets : o.sets, reps: exercise.unit === o.unit ? exercise.reps : o.reps, unit: o.unit })}${o.cue ? `\n${o.cue}` : ''}`}
                selected={picked === o.id}
                onPress={() => setPicked(o.id)}
              />
            ))}
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {exercise.replaced_from ? <Text style={[T.small, { color: C.muted }]}>Originally {exercise.replaced_from}.</Text> : null}
        </>
      )}
    </Sheet>
  );
}
