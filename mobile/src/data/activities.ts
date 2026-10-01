/* General activities people log outside their plan (walking, football,
   padel …) and the calories they burn: MET × body weight (kg) × hours.

   MET values follow the 2024 Adult Compendium of Physical Activities,
   rounded, one per effort level. Pure module, no imports. */

export type ActivityKind =
  | 'walking' | 'running' | 'football' | 'basketball' | 'swimming'
  | 'cycling' | 'padel' | 'hiking' | 'dancing' | 'strength' | 'other';

export type Effort = 'easy' | 'moderate' | 'hard';

export type ActivityDef = {
  kind: ActivityKind;
  label: string;
  met: Record<Effort, number>;
};

export const EFFORTS: readonly Effort[] = ['easy', 'moderate', 'hard'];

/** How each effort level feels, in plain words (for the effort picker). */
export const EFFORT_HINTS: Record<Effort, string> = {
  easy: 'You could chat the whole time.',
  moderate: 'Talking takes some effort.',
  hard: 'Only a few words at a time.',
};

/** In the order the picker shows them. `strength` is used for workouts
    imported from Apple Health or Health Connect and gym sessions outside the
    plan; `other` takes a free-text label. */
export const ACTIVITIES: readonly ActivityDef[] = [
  { kind: 'walking', label: 'Walking', met: { easy: 2.8, moderate: 3.5, hard: 5.0 } },
  { kind: 'running', label: 'Running', met: { easy: 7.0, moderate: 9.8, hard: 11.8 } },
  { kind: 'football', label: 'Football', met: { easy: 7.0, moderate: 8.0, hard: 10.0 } },
  { kind: 'basketball', label: 'Basketball', met: { easy: 6.0, moderate: 6.5, hard: 8.0 } },
  { kind: 'swimming', label: 'Swimming', met: { easy: 5.8, moderate: 8.3, hard: 10.0 } },
  { kind: 'cycling', label: 'Cycling', met: { easy: 4.0, moderate: 6.8, hard: 10.0 } },
  { kind: 'padel', label: 'Padel', met: { easy: 5.0, moderate: 6.0, hard: 8.0 } },
  { kind: 'hiking', label: 'Hiking', met: { easy: 5.3, moderate: 6.0, hard: 7.8 } },
  { kind: 'dancing', label: 'Dancing', met: { easy: 3.5, moderate: 5.0, hard: 7.3 } },
  { kind: 'strength', label: 'Strength training', met: { easy: 3.5, moderate: 5.0, hard: 6.0 } },
  { kind: 'other', label: 'Other', met: { easy: 3.0, moderate: 4.5, hard: 6.5 } },
];

/** Used when the person hasn't entered a weight yet. */
export const DEFAULT_WEIGHT_KG = 70;
export const MAX_ACTIVITY_MINUTES = 720;

const BY_KIND = new Map(ACTIVITIES.map((a) => [a.kind, a]));

export function activityDef(kind: string): ActivityDef {
  return BY_KIND.get(kind as ActivityKind) ?? BY_KIND.get('other')!;
}

export function isActivityKind(kind: string): kind is ActivityKind {
  return BY_KIND.has(kind as ActivityKind);
}

/** Calories burned: MET × weight (kg) × hours, rounded. Minutes are clamped
    to 0..720 and a missing or implausible weight uses 70 kg. */
export function kcalFor(kind: string, minutes: number, effort: Effort, weightKg?: number | null): number {
  const m = Math.min(MAX_ACTIVITY_MINUTES, Math.max(0, Number(minutes) || 0));
  const w = weightKg && weightKg >= 30 && weightKg <= 300 ? weightKg : DEFAULT_WEIGHT_KG;
  const met = activityDef(kind).met[effort] ?? activityDef(kind).met.moderate;
  return Math.round(met * w * (m / 60));
}
