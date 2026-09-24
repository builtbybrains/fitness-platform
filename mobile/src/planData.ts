/* Plan week generator. Sessions and meals are deterministic from the date;
   completion state (the `done` matrix) comes from the database via the plan
   store. A fresh week starts with everything unchecked — the app earns its
   checkmarks honestly. */

export const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export type PlanExercise = {
  name: string;
  sets: number;
  reps: number;
  kg?: number;
  unit?: 'reps' | 's' | 'm';
  rest?: number; // seconds of rest after each set
};

export const DEFAULT_REST = 90;

export function restFor(e: PlanExercise): number {
  return e.rest ?? DEFAULT_REST;
}

export type PlanWorkout = {
  kind: 'workout';
  focus: string;
  minutes: number;
  exercises: PlanExercise[];
};

export type PlanRest = {
  kind: 'rest';
  focus: 'Recovery';
  minutes: number;
  note: string;
};

export type PlanSession = PlanWorkout | PlanRest;

export type PlanMeal = {
  slot: MealSlot;
  label: string;
  kcal: number;
  protein: number;
};

export type PlanDayDone = {
  workout: boolean;
  exercises: number[][]; // per exercise index: list of completed set indices
  meals: string[]; // completed meal slots
};

export type PlanDay = {
  id: string; // yyyy-mm-dd
  index: number; // 0 = Monday
  session: PlanSession;
  meals: PlanMeal[];
  done: PlanDayDone;
};

const SESSIONS: PlanSession[] = [
  {
    kind: 'workout',
    focus: 'Upper body · Strength',
    minutes: 45,
    exercises: [
      { name: 'Incline dumbbell press', sets: 4, reps: 10, kg: 16 },
      { name: 'Seated row', sets: 4, reps: 12, kg: 40 },
      { name: 'Lateral raise', sets: 3, reps: 15, kg: 8 },
      { name: 'Cable triceps push-down', sets: 3, reps: 12, kg: 25 },
    ],
  },
  {
    kind: 'workout',
    focus: 'Lower body · Strength',
    minutes: 50,
    exercises: [
      { name: 'Back squat', sets: 4, reps: 8, kg: 60 },
      { name: 'Romanian deadlift', sets: 3, reps: 10, kg: 50 },
      { name: 'Walking lunge', sets: 3, reps: 12, kg: 12 },
      { name: 'Standing calf raise', sets: 3, reps: 15, kg: 30 },
    ],
  },
  {
    kind: 'rest',
    focus: 'Recovery',
    minutes: 0,
    note: 'Easy 20-minute walk, 10 minutes of stretching, in bed by 23:00.',
  },
  {
    kind: 'workout',
    focus: 'Full body · Conditioning',
    minutes: 40,
    exercises: [
      { name: 'Kettlebell swing', sets: 4, reps: 15, kg: 16 },
      { name: 'Rowing intervals', sets: 5, reps: 250, unit: 'm', rest: 60 },
      { name: 'Push-up ladder', sets: 3, reps: 12 },
      { name: 'Plank', sets: 3, reps: 45, unit: 's', rest: 45 },
    ],
  },
  {
    kind: 'workout',
    focus: 'Upper body · Hypertrophy',
    minutes: 45,
    exercises: [
      { name: 'Bench press', sets: 4, reps: 10, kg: 45 },
      { name: 'Lat pulldown', sets: 4, reps: 12, kg: 35 },
      { name: 'Arnold press', sets: 3, reps: 12, kg: 10 },
      { name: 'Face pull', sets: 3, reps: 15, kg: 20 },
    ],
  },
  { kind: 'rest', focus: 'Recovery', minutes: 0, note: 'Full rest day. Hydrate, sleep 8 hours, no screens after 22:30.' },
  {
    kind: 'workout',
    focus: 'Lower body · Strength',
    minutes: 50,
    exercises: [
      { name: 'Deadlift', sets: 4, reps: 6, kg: 70 },
      { name: 'Leg press', sets: 4, reps: 10, kg: 90 },
      { name: 'Leg curl', sets: 3, reps: 12, kg: 35 },
      { name: 'Standing calf raise', sets: 3, reps: 15, kg: 30 },
    ],
  },
];

const TRAINING_MEALS: PlanMeal[] = [
  { slot: 'Breakfast', label: 'Greek yogurt bowl, berries, oats', kcal: 430, protein: 38 },
  { slot: 'Lunch', label: 'Grilled chicken bowl', kcal: 612, protein: 48 },
  { slot: 'Dinner', label: 'Salmon, sweet potato, salad', kcal: 590, protein: 42 },
  { slot: 'Snack', label: 'Whey shake + banana', kcal: 260, protein: 24 },
];

const REST_MEALS: PlanMeal[] = [
  { slot: 'Breakfast', label: 'Eggs on rye, avocado', kcal: 380, protein: 24 },
  { slot: 'Lunch', label: 'Tuna wrap, mixed greens', kcal: 520, protein: 40 },
  { slot: 'Dinner', label: 'Turkey chili, rice', kcal: 560, protein: 44 },
  { slot: 'Snack', label: 'Cottage cheese + apple', kcal: 220, protein: 18 },
];

export function exerciseLabel(e: PlanExercise): string {
  const rep = e.unit === 's' ? `${e.reps}s` : e.unit === 'm' ? `${e.reps}m` : `${e.reps}`;
  return `${e.sets} × ${rep}${e.kg != null ? ` · ${e.kg} kg` : ''}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function weekStart(from: Date): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return d;
}

export function todayIndexInWeek(today = new Date()): number {
  return (today.getDay() + 6) % 7;
}

export function buildWeek(today = new Date()): PlanDay[] {
  const start = weekStart(today);
  const days: PlanDay[] = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const session = SESSIONS[i];
    const meals = session.kind === 'workout' ? TRAINING_MEALS : REST_MEALS;
    days.push({
      id: isoDay(date),
      index: i,
      session,
      meals,
      done: { workout: false, exercises: [], meals: [] },
    });
  }
  return days;
}
