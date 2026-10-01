/* "Move this workout": a sheet listing the days of this week. Picking one
   makes the two days trade places (a workout onto a rest day, or two
   workouts swapped). Past days and finished workouts can't move. */

import React, { useState } from 'react';
import { Text } from 'react-native';

import { T } from '../../design';
import type { WeekDay } from '../../planData';
import { Notice } from '../Bits';
import { Sheet } from './Sheet';
import { ChoiceRow } from './Controls';
import { dayTitle } from './labels';

type Props = {
  visible: boolean;
  onClose: () => void;
  days: WeekDay[];
  from: WeekDay | null;
  movable: Set<string>;
  /** Today's id: earlier days aren't listed. */
  today: string;
  onMove: (toIdx: number) => Promise<{ ok: boolean; error?: string }>;
};

export function MoveDaySheet({ visible, onClose, days, from, movable, today, onMove }: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!from) return null;
  const isRest = from.session.kind === 'rest';

  async function pick(i: number) {
    if (busy != null) return;
    setBusy(i);
    setError(null);
    const r = await onMove(i);
    setBusy(null);
    if (r.ok) onClose();
    else if (r.error) setError(r.error);
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isRest ? 'Move your rest day' : `Move ${from.session.kind === 'workout' ? from.session.focus : 'this workout'}`}
      subtitle="Pick a day left this week. The two days trade places."
    >
      {days.filter((d) => d.id >= today).map((d) => {
        const here = d.id === from.id;
        const can = movable.has(d.id);
        const shows = d.session.kind === 'rest' ? 'Rest day' : d.session.focus;
        const why = here ? 'Where it is now' : !can ? (d.session.kind === 'workout' && d.done.workout ? 'Done, stays put' : 'Already passed') : shows;
        return (
          <ChoiceRow
            key={d.id}
            title={dayTitle(d.index, d.id)}
            detail={busy === d.index ? 'Moving' : why}
            selected={here}
            disabled={here || !can || (busy != null && busy !== d.index)}
            onPress={() => void pick(d.index)}
            accessibilityLabel={here ? `${dayTitle(d.index, d.id)}, where it is now` : `Move to ${dayTitle(d.index, d.id)}. Currently ${shows}`}
          />
        );
      })}
      {error ? <Notice tone="error">{error}</Notice> : <Text style={T.small}>Your coach notes the change so next week fits better.</Text>}
    </Sheet>
  );
}
