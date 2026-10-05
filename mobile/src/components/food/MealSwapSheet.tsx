/* "Swap" a planned meal: three alternatives with similar calories and at
   least as much protein, within the person's diet, allergies and dislikes.
   The coach picks them with an account; without one (or when the AI can't
   be reached) they come from the BUILT meal library, and the sheet says so. */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { C, T } from '../../design';
import { useAuth } from '../../auth';
import { swapMeal } from '../../api/food';
import { asApiError } from '../../api/errors';
import { localMealSwaps } from '../../planData';
import type { PlanMealV2, ProfileV2 } from '../../types';
import { Button } from '../Button';
import { Notice } from '../Bits';
import { Sheet } from '../training/Sheet';
import { ChoiceRow, macroText, StateBlock } from '../training/Controls';
import { MealImage } from './MealImage';

type Props = {
  visible: boolean;
  onClose: () => void;
  meal: (PlanMealV2 & { swapped?: boolean }) | null;
  /** The plan's own meal for this slot (to undo a swap). */
  original: PlanMealV2 | null;
  profile: ProfileV2 | null;
  onPick: (meal: PlanMealV2 | null) => Promise<void>;
};

export function MealSwapSheet({ visible, onClose, meal, original, profile, onPick }: Props) {
  const { userId } = useAuth();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [options, setOptions] = useState<PlanMealV2[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!visible || !meal || !userId) return;
    let alive = true;
    setState('loading');
    setPicked(null);
    setNote(null);
    const local = () => localMealSwaps(meal, { diet_type: profile?.diet_type, allergies: profile?.allergies, dislikes: profile?.dislikes });
    swapMeal(userId, meal)
      .then((list) => {
        if (!alive) return;
        const usable = list.filter((m) => m && m.label);
        if (usable.length) {
          setOptions(usable.slice(0, 3));
        } else {
          setOptions(local());
          setNote('Picked from the BUILT meal library.');
        }
        setState('ready');
      })
      .catch((e) => {
        if (!alive) return;
        const err = asApiError(e);
        const lib = local();
        setOptions(lib);
        setNote(
          err.code === 'needs_account'
            ? 'Swaps from the BUILT meal library. With an account your coach picks them around your diet and history.'
            : `${err.message} Here are swaps from the BUILT meal library.`,
        );
        setState(lib.length ? 'ready' : 'error');
      });
    return () => {
      alive = false;
    };
  }, [visible, meal, userId, profile, attempt]);

  if (!meal) return null;

  async function confirm(choice: PlanMealV2 | null) {
    if (busy) return;
    setBusy(true);
    await onPick(choice);
    setBusy(false);
    onClose();
  }

  const choice = picked != null ? options[picked] : null;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Swap ${meal.slot.toLowerCase()}`}
      subtitle={`Similar calories, at least as much protein. Now: ${meal.label}, ${meal.kcal} kcal.`}
      footer={state === 'ready' && options.length ? <Button label={choice ? 'Use this meal' : 'Pick a meal'} onPress={() => void confirm(choice)} disabled={!choice} busy={busy} /> : undefined}
    >
      {state === 'loading' ? (
        <StateBlock kind="loading" title="Finding swaps that fit your plan" />
      ) : state === 'error' || options.length === 0 ? (
        <StateBlock kind="error" title="No swaps right now" body="Nothing in the library fits this meal and your diet. Try again in a moment." action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }} />
      ) : (
        <View style={{ gap: 8 }}>
          {options.map((o, i) => (
            <ChoiceRow
              key={`${o.label}-${i}`}
              title={o.label}
              detail={macroText(o)}
              left={<MealImage label={o.label} items={o.items} size="sheet" />}
              selected={picked === i}
              onPress={() => setPicked(i)}
            />
          ))}
          {note ? <Notice>{note}</Notice> : null}
        </View>
      )}
      {meal.swapped && original ? (
        <View style={{ gap: 8, paddingTop: 4 }}>
          <Text style={[T.small, { color: C.muted }]}>Your plan had {original.label}.</Text>
          <Button variant="secondary" label="Go back to the plan's meal" onPress={() => void confirm(null)} disabled={busy} />
        </View>
      ) : null}
    </Sheet>
  );
}
