/* Shared plan state: one week per signed-in user. Sessions/meals are
   deterministic from the date (planData); completion state lives in Supabase
   (plan_days table) through the data layer, mirroring locally for offline. */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { buildWeek, PlanDay, PlanDayDone } from './planData';
import { fetchWeekDone, saveDayProgress } from './data';
import { useAuth } from './auth';

type PlanStore = {
  days: PlanDay[];
  todayIdx: number;
  offline: boolean;
  toggleWorkout: (dayId: string) => Promise<void>;
  toggleExercise: (dayId: string, idx: number) => Promise<void>;
  toggleSet: (dayId: string, exerciseIdx: number, setIdx: number) => Promise<void>;
  toggleMeal: (dayId: string, slot: string) => Promise<void>;
};

const Ctx = createContext<PlanStore | null>(null);

function mergeDone(base: PlanDayDone, patch?: Partial<PlanDayDone>): PlanDayDone {
  if (!patch) return base;
  return {
    workout: patch.workout ?? base.workout,
    exercises: patch.exercises ?? base.exercises,
    meals: patch.meals ?? base.meals,
  };
}

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [days, setDays] = useState<PlanDay[]>(() => buildWeek());
  const [offline, setOffline] = useState(false);
  const { userId } = useAuth();
  const nextDoneRef = useRef<PlanDayDone | null>(null);

  // Load saved completion state for this user whenever the user changes.
  useEffect(() => {
    let alive = true;
    const start = days[0]?.id;
    const end = days[6]?.id;
    if (!userId || !start || !end) return;
    fetchWeekDone(userId, start, end).then(({ done, offline: off }) => {
      if (!alive) return;
      setOffline(off);
      const saved = done ?? {};
      setDays((prev) =>
        prev.map((d) => (saved[d.id] ? { ...d, done: mergeDone(d.done, saved[d.id]) } : d)),
      );
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const patchDay = useCallback(
    async (dayId: string, patch: Parameters<typeof saveDayProgress>[2]) => {
      setDays((prev) =>
        prev.map((d): PlanDay => {
          if (d.id !== dayId) return d;
          const next: PlanDayDone = {
            workout: patch.workout ?? d.done.workout,
            exercises: patch.exercises ?? d.done.exercises,
            meals: patch.meals ?? d.done.meals,
          };
          nextDoneRef.current = next;
          return { ...d, done: next };
        }),
      );
      const nextDone = nextDoneRef.current;
      if (userId && nextDone) {
        await saveDayProgress(userId, dayId, {
          workout: nextDone.workout,
          exercises: nextDone.exercises,
          meals: nextDone.meals,
        });
      }
    },
    [userId],
  );

  const toggleWorkout = useCallback(
    async (dayId: string) => {
      const d = days.find((x) => x.id === dayId);
      if (!d || d.session.kind !== 'workout') return;
      const on = !d.done.workout;
      await patchDay(dayId, {
        workout: on,
        exercises: on
          ? d.session.exercises.map((ex) => Array.from({ length: ex.sets }, (_, s) => s))
          : [],
      });
    },
    [days, patchDay],
  );

  const toggleExercise = useCallback(
    async (dayId: string, idx: number) => {
      const d = days.find((x) => x.id === dayId);
      if (!d || d.session.kind !== 'workout') return;
      const done = [...d.done.exercises];
      const ex = d.session.exercises[idx];
      const all = Array.isArray(done[idx]) && done[idx].length === ex.sets;
      done[idx] = all ? [] : Array.from({ length: ex.sets }, (_, s) => s);
      const allDone = d.session.exercises.every((e, i) => (done[i] ?? []).length === e.sets);
      await patchDay(dayId, { exercises: done, workout: allDone });
    },
    [days, patchDay],
  );

  const toggleSet = useCallback(
    async (dayId: string, exerciseIdx: number, setIdx: number) => {
      const d = days.find((x) => x.id === dayId);
      if (!d || d.session.kind !== 'workout') return;
      const done = d.done.exercises.map((r) => [...(r ?? [])]);
      while (done.length <= exerciseIdx) done.push([]);
      const row = done[exerciseIdx];
      const has = row.includes(setIdx);
      done[exerciseIdx] = has ? row.filter((x) => x !== setIdx) : [...row, setIdx].sort((a, b) => a - b);
      const allDone = d.session.exercises.every(
        (e, i) => (done[i] ?? []).filter((x) => x < e.sets).length === e.sets,
      );
      await patchDay(dayId, { exercises: done, workout: allDone });
    },
    [days, patchDay],
  );

  const toggleMeal = useCallback(
    async (dayId: string, slot: string) => {
      const d = days.find((x) => x.id === dayId);
      if (!d) return;
      const set = new Set(d.done.meals);
      if (set.has(slot)) set.delete(slot);
      else set.add(slot);
      await patchDay(dayId, { meals: [...set] });
    },
    [days, patchDay],
  );

  const todayIdx = useMemo(() => (new Date().getDay() + 6) % 7, []);
  const value = useMemo<PlanStore>(
    () => ({ days, todayIdx, offline, toggleWorkout, toggleExercise, toggleSet, toggleMeal }),
    [days, todayIdx, offline, toggleWorkout, toggleExercise, toggleSet, toggleMeal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
