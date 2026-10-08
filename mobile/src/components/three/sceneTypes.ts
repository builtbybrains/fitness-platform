/* The data each data-driven 3D scene takes. Types only, so screens can
   import them without pulling three.js in. */

import type { MedalIcon } from './iconStrokes';
import type { MacroKey } from './layout';

export type ObjectKind = 'dumbbell' | 'kettlebell' | 'shaker' | 'medal';

export type SceneParams = {
  /** Today: the day's progress, 0..1. */
  ring: { progress: number };
  /** Food: grams eaten today and the segment lifted out, if any. */
  donut: { protein: number; carbs: number; fat: number; selected: MacroKey | null };
  /** Progress: the latest milestone's medal, carrying its badge icon. */
  shelf: { icon: MedalIcon };
  /** Workout: sets ticked, sets in the session, and whether it is done. */
  plates: { done: number; total: number; complete: boolean };
  /** Questionnaire: the object for the current group of questions. */
  object: { kind: ObjectKind };
};

export type SceneKind = keyof SceneParams;
