/* Plain-language labels for plan data. */

import type { Equipment, Muscle } from '../../data/exercises';

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const EQUIPMENT: Record<Equipment, string> = {
  none: 'Bodyweight',
  dumbbells: 'Dumbbells',
  bands: 'Bands',
  kettlebell: 'Kettlebell',
  pullup_bar: 'Pull-up bar',
  bench: 'Bench',
  machines: 'Machines',
  barbell: 'Barbell',
};

const MUSCLE: Record<Muscle, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  full_body: 'Full body',
  cardio: 'Conditioning',
};

export function equipmentLabel(list: readonly Equipment[]): string {
  const real = list.filter((e) => e !== 'none');
  return real.length ? real.map((e) => EQUIPMENT[e]).join(', ') : EQUIPMENT.none;
}

export function muscleLabel(m: Muscle | null | undefined): string {
  return m ? MUSCLE[m] : 'Training';
}

/** "Thursday 2 Oct" */
export function dayTitle(index: number, id: string): string {
  const [, mm, dd] = id.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(mm || 1) - 1];
  return `${DAY_FULL[index]} ${dd} ${month}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "18:30", "morning" → "Mornings". */
export function timeLabel(t: string | null | undefined): string {
  if (!t) return '';
  if (/^\d{1,2}:\d{2}/.test(t)) return t.slice(0, 5);
  return t === 'morning' ? 'Morning' : t === 'midday' ? 'Midday' : t === 'evening' ? 'Evening' : '';
}
