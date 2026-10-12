/* Which muscles a session works, for the muscle map. Exercise names (or
   ids, or aliases) resolve through the exercise library; anything it
   doesn't know is skipped. Primary muscles are counted across the session
   and listed most-worked first; a muscle that is primary anywhere is never
   also listed as secondary.

   Pure module: no React, no native imports. */

import { findExercise, type Muscle } from '../data/exercises';

export type MuscleTone = 'main' | 'also' | 'none';

/** Muscles that light as "also" when a session is conditioning work. */
const CARDIO_LEGS: readonly Muscle[] = ['quads', 'calves'];

const NAME: Record<Muscle, string> = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  core: 'core',
  full_body: 'the full body',
  cardio: 'conditioning',
};

/** Most counted first; ties keep the order they first appeared in. */
function ranked(counts: Map<Muscle, number>): Muscle[] {
  const order = [...counts.keys()];
  return order.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || order.indexOf(a) - order.indexOf(b));
}

export function musclesForExercises(names: readonly string[]): { primary: Muscle[]; secondary: Muscle[] } {
  const main = new Map<Muscle, number>();
  const also = new Map<Muscle, number>();
  for (const name of names) {
    const ex = findExercise(name);
    if (!ex) continue;
    main.set(ex.muscle, (main.get(ex.muscle) ?? 0) + 1);
    for (const m of ex.secondary) also.set(m, (also.get(m) ?? 0) + 1);
  }
  for (const m of main.keys()) also.delete(m);
  return { primary: ranked(main), secondary: ranked(also) };
}

/** How one body segment that belongs to `muscle` is drawn. 'full_body'
    lights every segment as "also"; 'cardio' lights the legs as "also". */
export function toneFor(muscle: Muscle, primary: readonly Muscle[], secondary: readonly Muscle[]): MuscleTone {
  if (primary.includes(muscle)) return 'main';
  if (secondary.includes(muscle)) return 'also';
  const any = [...primary, ...secondary];
  if (any.includes('full_body')) return 'also';
  if (any.includes('cardio') && CARDIO_LEGS.includes(muscle)) return 'also';
  return 'none';
}

function list(ms: readonly Muscle[]): string {
  const words = ms.map((m) => NAME[m]);
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "Works chest and triceps, with shoulders": the map's screen reader label. */
export function muscleMapLabel(primary: readonly Muscle[], secondary: readonly Muscle[]): string {
  if (!primary.length && !secondary.length) return 'Muscle map, nothing targeted';
  if (!primary.length) return `Works ${list(secondary)}`;
  return secondary.length ? `Works ${list(primary)}, with ${list(secondary)}` : `Works ${list(primary)}`;
}

/** Display names, capitalised: "Chest, triceps". */
export function muscleNames(ms: readonly Muscle[]): string {
  const text = ms.map((m) => (m === 'full_body' ? 'full body' : NAME[m])).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
