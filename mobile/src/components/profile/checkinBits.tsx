/* Check-in questions, answer labels and the result view (the coach's
   review and what changed in the plan). */

import { Text, View } from 'react-native';

import { C, card, FONT, R, T } from '../../design';
import { BuiltMark } from '../BuiltLogo';
import { Notice } from '../Bits';
import { DrawCheck } from '../DrawCheck';
import type { Option } from '../onboarding/options';
import type { CheckinAnswers, Measurements, PlanChanges } from '../../types';

export type RatingKey = 'energy' | 'sleep' | 'hunger' | 'difficulty' | 'adherence';

export const RATINGS: { key: RatingKey; title: string; helper: string; short: string; options: Option<number>[] }[] = [
  {
    key: 'energy',
    title: 'How has your energy been?',
    helper: 'Most days this month.',
    short: 'Energy',
    options: [
      { id: 5, label: 'Great' },
      { id: 4, label: 'Good' },
      { id: 3, label: 'Okay' },
      { id: 2, label: 'Low' },
      { id: 1, label: 'Very low' },
    ],
  },
  {
    key: 'sleep',
    title: 'How have you slept?',
    helper: 'Most nights this month.',
    short: 'Sleep',
    options: [
      { id: 5, label: 'Great' },
      { id: 4, label: 'Well' },
      { id: 3, label: 'Okay' },
      { id: 2, label: 'Poorly' },
      { id: 1, label: 'Very poorly' },
    ],
  },
  {
    key: 'hunger',
    title: 'How hungry have you felt?',
    helper: 'Between meals, on a normal day.',
    short: 'Hunger',
    options: [
      { id: 1, label: 'Rarely hungry' },
      { id: 2, label: 'A little hungry' },
      { id: 3, label: 'Normal' },
      { id: 4, label: 'Often hungry' },
      { id: 5, label: 'Hungry all the time' },
    ],
  },
  {
    key: 'difficulty',
    title: 'How hard did the plan feel?',
    helper: 'Your workouts and your meals together.',
    short: 'Difficulty',
    options: [
      { id: 1, label: 'Too easy' },
      { id: 2, label: 'A bit easy' },
      { id: 3, label: 'About right' },
      { id: 4, label: 'A bit hard' },
      { id: 5, label: 'Too hard' },
    ],
  },
  {
    key: 'adherence',
    title: 'How much of the plan did you follow?',
    helper: 'Be honest. Your coach adjusts the plan to fit your real life.',
    short: 'Plan followed',
    options: [
      { id: 100, label: 'Nearly all of it' },
      { id: 75, label: 'Most of it' },
      { id: 50, label: 'About half' },
      { id: 25, label: 'Some of it' },
      { id: 0, label: 'Hardly any' },
    ],
  },
];

export const MEASUREMENTS: { key: keyof Measurements; label: string }[] = [
  { key: 'waist_cm', label: 'Waist (cm)' },
  { key: 'hips_cm', label: 'Hips (cm)' },
  { key: 'chest_cm', label: 'Chest (cm)' },
  { key: 'arm_cm', label: 'Upper arm (cm)' },
  { key: 'thigh_cm', label: 'Thigh (cm)' },
];

export function answerLabel(key: RatingKey, value: number | undefined): string {
  if (value == null) return '';
  const r = RATINGS.find((x) => x.key === key);
  return r?.options.find((o) => o.id === value)?.label ?? String(value);
}

export function answersSummary(a: CheckinAnswers): { label: string; value: string }[] {
  return RATINGS.filter((r) => a[r.key] != null).map((r) => ({ label: r.short, value: answerLabel(r.key, a[r.key]) }));
}

/** The coach's review, and what changed in the plan and why. */
/** A check-in's result. `saved` (just submitted, not opened from the
    history) leads with a check that draws itself on. */
export function CheckinResultView({ summary, changes, weight, saved }: { summary: string; changes: PlanChanges | null; weight: number | null | undefined; saved?: boolean }) {
  const delta = changes?.kcal_delta ?? 0;
  return (
    <View style={{ gap: 20 }}>
      {weight != null ? (
        <View style={[card, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={T.small}>Logged today</Text>
            <Text style={T.number}>{weight} kg</Text>
          </View>
          {saved ? (
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.greenTint, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Saved">
              <DrawCheck size={26} />
            </View>
          ) : null}
        </View>
      ) : saved ? (
        <Notice tone="success">Check-in saved.</Notice>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <BuiltMark size={32} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.green }}>Your coach</Text>
          <Text style={T.body}>{summary || 'Check-in saved.'}</Text>
        </View>
      </View>
      {changes ? (
        <View style={{ gap: 12, padding: 20, borderRadius: R.card, backgroundColor: C.card, borderWidth: 1, borderColor: C.greenBorder }}>
          <Text style={T.h3}>What changed in your plan</Text>
          {delta !== 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <Text style={[T.meta, { textDecorationLine: 'line-through' }]}>{changes.kcal_before.toLocaleString()} kcal</Text>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 22, color: C.text }}>{changes.kcal_after.toLocaleString()} kcal a day</Text>
              <Text style={{ fontFamily: FONT.bodySemi, fontSize: 14, color: C.green }}>
                {delta > 0 ? '+' : ''}
                {delta}
              </Text>
            </View>
          ) : (
            <Text style={T.meta}>Calories stay at {changes.kcal_after.toLocaleString()} a day.</Text>
          )}
          <Text style={[T.body, { color: C.stone }]}>{changes.changes}</Text>
        </View>
      ) : null}
    </View>
  );
}
