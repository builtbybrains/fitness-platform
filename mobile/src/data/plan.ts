export interface PlanItem {
  id: string;
  kind: 'meal' | 'workout' | 'water';
  title: string;
  subtitle: string;
  meta: string;
  done: boolean;
}

export const todayPlan: PlanItem[] = [
  {
    id: 'breakfast',
    kind: 'meal',
    title: 'Breakfast',
    subtitle: 'Greek yogurt, berries and oats',
    meta: '420 kcal · 32g protein',
    done: true,
  },
  {
    id: 'lunch',
    kind: 'meal',
    title: 'Lunch',
    subtitle: 'Grilled chicken, quinoa and greens',
    meta: '612 kcal · 48g protein',
    done: true,
  },
  {
    id: 'workout',
    kind: 'workout',
    title: 'Workout',
    subtitle: 'Upper body strength',
    meta: '32 min · 6 exercises',
    done: false,
  },
  {
    id: 'water',
    kind: 'water',
    title: 'Water reminder',
    subtitle: 'Drink 1 glass',
    meta: 'Next at 15:30',
    done: false,
  },
  {
    id: 'dinner',
    kind: 'meal',
    title: 'Dinner',
    subtitle: 'Salmon and sweet potato',
    meta: '640 kcal · 44g protein',
    done: false,
  },
];

export interface Exercise {
  id: string;
  name: string;
  detail: string;
  art: 'bench' | 'row' | 'raise' | 'pushdown' | 'facepull' | 'plank' | 'squat' | 'run';
  /** Minutes on the player's auto-started timer. */
  minutes: number;
  done: boolean;
}

export const exercises: Exercise[] = [
  { id: '1', name: 'Incline dumbbell press', detail: '4 × 10 · 16 kg', art: 'bench', minutes: 10, done: false },
  { id: '2', name: 'Seated row', detail: '4 × 12 · 40 kg', art: 'row', minutes: 10, done: false },
  { id: '3', name: 'Lateral raise', detail: '3 × 15 · 8 kg', art: 'raise', minutes: 10, done: false },
  { id: '4', name: 'Cable triceps push-down', detail: '3 × 12 · 25 kg', art: 'pushdown', minutes: 10, done: false },
  { id: '5', name: 'Face pull', detail: '3 × 15 · 20 kg', art: 'facepull', minutes: 10, done: false },
  { id: '6', name: 'Plank', detail: '3 × 45 sec', art: 'plank', minutes: 10, done: false },
];

export const macros = [
  { label: 'Protein', value: 130, target: 150, unit: 'g' },
  { label: 'Carbs', value: 174, target: 210, unit: 'g' },
  { label: 'Fats', value: 55, target: 68, unit: 'g' },
];

/** Twelve weeks of weight, used by the progress chart. */
export const weeklyWeights = [92, 91.4, 90.9, 90.1, 89.4, 88.9, 88.2, 87.6, 86.9, 86.2, 85.5, 84.8];

export const consistency = [
  { label: 'Workouts', value: 0.92, detail: '18 of 20 sessions' },
  { label: 'Water', value: 0.75, detail: '6 of 8 glasses today' },
  { label: 'Calories', value: 0.88, detail: 'On target 24 of 28 days' },
];
