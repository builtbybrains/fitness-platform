/* The Today week strip: one state per day of the plan's week (Monday to
   Sunday, the same week the Plan tab shows). A finished workout always
   reads as done; otherwise rest days are rest, today is open, earlier
   training days were missed (shown quietly, never as a failure) and later
   ones are planned. Pure: no React, no native modules. */

export type StripState = 'done' | 'today' | 'planned' | 'missed' | 'rest';

export type StripDay = {
  id: string;
  /** 0 = Monday … 6 = Sunday. */
  index: number;
  letter: string;
  state: StripState;
  isToday: boolean;
  /** Screen-reader label: "Wednesday, workout done". */
  label: string;
};

/** The week's days as the plan store gives them (structural subset of WeekDay). */
export type StripInput = { id: string; index: number; session: { kind: string }; done: { workout: boolean } };

const LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const PHRASE: Record<StripState, string> = {
  done: 'workout done',
  today: 'workout to do',
  planned: 'workout planned',
  missed: 'workout not logged',
  rest: 'rest day',
};

export function stripState(day: StripInput, today: string): StripState {
  if (day.done.workout) return 'done';
  if (day.session.kind !== 'workout') return 'rest';
  if (day.id === today) return 'today';
  return day.id < today ? 'missed' : 'planned';
}

export function weekStrip(days: readonly StripInput[], today: string): StripDay[] {
  return days.map((d) => {
    const state = stripState(d, today);
    const isToday = d.id === today;
    const i = Math.min(6, Math.max(0, d.index));
    return {
      id: d.id,
      index: d.index,
      letter: LETTER[i],
      state,
      isToday,
      label: `${NAME[i]}${isToday ? ', today' : ''}, ${PHRASE[state]}`,
    };
  });
}

/** Workouts done and planned this week (rest days don't count). */
export function weekCounts(strip: readonly StripDay[]): { done: number; planned: number } {
  const training = strip.filter((d) => d.state !== 'rest');
  return { done: training.filter((d) => d.state === 'done').length, planned: training.length };
}
