/* Which object image stands above each questionnaire screen. Grouped by what
   the questions are about, so the object changes only when the topic does:
   - about you, your body, your goal, health: the dumbbell
   - the timeline: the medal (the finish line), shown as the B badge
   - where and when you train: the kettlebell
   - food: the shaker
   - the waiver and the finish: the medal, as above (the finish screen
     itself shows the B mark, see questionnaire.tsx)
   Pure, so it is unit tested. */

import type { ObjectKind } from '../../lib/objects/sceneTypes';

const BY_SCREEN: Record<string, ObjectKind> = {
  timeline: 'medal',
  location: 'kettlebell',
  schedule: 'kettlebell',
  diet: 'shaker',
  allergies: 'shaker',
  dislikes: 'shaker',
  waiver: 'medal',
  finish: 'medal',
};

/** The object for a questionnaire screen id; anything not listed is about you and your body. */
export function objectForScreen(id: string): ObjectKind {
  return BY_SCREEN[id] ?? 'dumbbell';
}
