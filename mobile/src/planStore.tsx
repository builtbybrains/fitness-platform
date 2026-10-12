/* Shared plan state for the signed-in person (or device-only identity).

   - The plan is read with api/plan getPlan() (v1 plans are upgraded on
     read). Without one, the starter week (planData.starterPlan) is built
     from the person's questionnaire: their training days (Sunday rest by
     default), where they train, injuries and diet.
   - The week is ALWAYS rendered through weekView(plan, overrides, monday):
     moved days and this-week exercise swaps live in plan_overrides.
   - Where they train this week (home, home with kit, gym) picks each
     exercise's variant (planForLocation); the choice is kept per week on
     this device and defaults to the questionnaire answer.
   - Meal swaps are kept per week on this device (the API has no table for
     them); the coach is told about them as behaviour.
   - Activities (walking, football …) for the last 8 weeks live here too,
     so Today and Progress update the moment one is logged.
   - Completion rows (`history`) cover the past year plus this week, so the
     streak and Progress follow real history across weeks.
   - Every toggle computes the next state from the LATEST state, updates the
     screen at once, and saves the full intended row. */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { addDays, isoDay, mondayIndex, parseDay, weekStartId } from './lib/dates';
import { isCloudUser } from './lib/cloud';
import { loadLocal, saveLocal } from './lib/localFallback';
import { useToday } from './lib/useToday';
import {
  composeWeekV2,
  daysToClearOnRegenerate,
  DoneMap,
  DoneRow,
  EMPTY_DONE,
  locationsFor,
  MealSwaps,
  scheduleOf,
  starterPlan,
  WeekDay,
  WeekSchedule,
} from './planData';
import { clearDaysProgress, fetchDoneRange, saveDayProgress } from './data';
import { currentStreak, STREAK_HORIZON_DAYS } from './streak';
import { useAuth } from './auth';
import { emptyOverrides, exerciseOptions, generatePlan, getPlan, getWeekOverrides, moveWorkoutDay, planForLocation, replaceExercise as apiReplaceExercise, resetWeek as apiResetWeek, swapDays, weekView } from './api/plan';
import { deleteActivity, listActivities, logActivity as apiLogActivity } from './api/activities';
import { rememberFact } from './api/memory';
import { emptyProfile, targetsFor } from './api/profile';
import { asApiError } from './api/errors';
import { ageOn, ageRule } from './api/rules';
import type { Exercise, TrainLocation } from './data/exercises';
import type { Activity, ActivityInput, ApiErrorCode, MealSlot, PlanMealV2, PlanOverrides, PlanV2, ProfileV2 } from './types';

/** 'local': device-only identity, nothing syncs. 'offline': an account
    whose server couldn't be reached; changes upload when it's back.
    'synced': the last read or write reached the server. */
export type SyncState = 'local' | 'offline' | 'synced';

export type Targets = { kcal: number; protein: number; carbs: number; fat: number; water: number };

export type ActionResult = { ok: boolean; error?: string; code?: ApiErrorCode };
export type PlanChangeResult = ActionResult & { changes?: string; summary?: string };

type PlanStore = {
  days: WeekDay[];
  /** Index of today in `days` (0 = Monday). Rolls over at midnight. */
  todayIdx: number;
  /** Today's id, yyyy-mm-dd (local day). */
  todayId: string;
  /** Monday of the week shown. */
  weekStart: string;
  offline: boolean;
  syncState: SyncState;
  /** True while the planner is building or changing the plan. */
  generating: boolean;
  /** True when the plan came from the AI planner. */
  aiPlan: boolean;
  /** True once the stored plan (or its absence) is known. */
  planLoaded: boolean;
  /** The plan in use (stored or starter), before this week's changes. */
  plan: PlanV2;
  profile: ProfileV2 | null;
  targets: Targets;
  /** Where they train this week, and the choices they have. */
  location: TrainLocation;
  locations: TrainLocation[];
  setLocation: (loc: TrainLocation) => void;
  /** True when this week has moved days or exercise swaps. */
  weekChanged: boolean;
  schedule: WeekSchedule;
  history: DoneMap;
  historyLoaded: boolean;
  /** True when the last history read couldn't reach the server: `history`
      is this device's saved copy (possibly empty). */
  historyOffline: boolean;
  /** Read the plan, this week's changes, history, activities and the
      profile again (the "Try again" behind every offline notice). */
  reload: () => Promise<void>;
  streak: number;
  /** Build a new plan, or change it with a request in the person's words.
      Resolves "what changed and why". Needs an account. */
  regenerate: (instruction?: string) => Promise<PlanChangeResult>;
  /** Swap what two weekdays (0 = Monday) show this week. */
  moveDay: (fromIdx: number, toIdx: number) => Promise<ActionResult>;
  resetWeek: () => Promise<ActionResult>;
  /** Up to 3 alternatives that fit equipment and injuries. */
  optionsFor: (dayId: string, exerciseIdx: number) => Exercise[];
  replaceExercise: (dayId: string, exerciseIdx: number, replacement: Exercise, scope: 'week' | 'always') => Promise<ActionResult>;
  /** Show another meal in a slot on one day (or null to undo). */
  swapMeal: (dayId: string, slot: MealSlot, meal: PlanMealV2 | null) => Promise<void>;
  activities: Activity[];
  activitiesLoaded: boolean;
  logActivity: (input: ActivityInput) => Promise<{ ok: boolean; activity?: Activity; error?: string }>;
  removeActivity: (id: string) => Promise<void>;
  toggleWorkout: (dayId: string) => Promise<void>;
  setWorkoutDone: (dayId: string, done: boolean) => Promise<void>;
  toggleExercise: (dayId: string, idx: number) => Promise<void>;
  toggleSet: (dayId: string, exerciseIdx: number, setIdx: number) => Promise<void>;
  toggleMeal: (dayId: string, slot: string) => Promise<void>;
};

const Ctx = createContext<PlanStore | null>(null);

function allSets(day: WeekDay): number[][] {
  return day.session.kind === 'workout' ? day.session.exercises.map((ex) => Array.from({ length: ex.sets }, (_, s) => s)) : [];
}

function everySetDone(day: WeekDay, exercises: number[][]): boolean {
  if (day.session.kind !== 'workout' || !day.session.exercises.length) return false;
  return day.session.exercises.every((e, i) => (exercises[i] ?? []).filter((x) => x < e.sets).length === e.sets);
}

function isMinor(p: ProfileV2 | null, today: string): boolean {
  if (!p) return false;
  return ageRule(ageOn(p.birth_date, today) ?? p.age) === 'minor';
}

const ACTIVITY_WEEKS = 8;

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { userId, refreshProfile } = auth;
  const authProfile = auth.profile as ProfileV2 | null;
  const planEpoch = (auth as { planEpoch?: number }).planEpoch ?? 0;
  const today = useToday();
  const todayDate = useMemo(() => parseDay(today), [today]);
  const weekStart = weekStartId(todayDate);

  const [rawPlan, setRawPlan] = useState<PlanV2 | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [overrides, setOverrides] = useState<PlanOverrides>(() => emptyOverrides(weekStart));
  const [locationPref, setLocationPref] = useState<TrainLocation | null>(null);
  const [mealSwaps, setMealSwaps] = useState<MealSwaps>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoaded, setActivitiesLoaded] = useState(false);
  const [done, setDoneState] = useState<DoneMap>({});
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyOffline, setHistoryOffline] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [reachedServer, setReachedServer] = useState(true);

  const doneRef = useRef<DoneMap>({});
  const commit = useCallback((next: DoneMap) => {
    doneRef.current = next;
    setDoneState(next);
  }, []);
  const touched = useRef<Set<string>>(new Set());
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  // A different person: start from a clean slate.
  useEffect(() => {
    touched.current = new Set();
    commit({});
    setRawPlan(null);
    setPlanLoaded(false);
    setHistoryLoaded(false);
    setHistoryOffline(false);
    setActivities([]);
    setActivitiesLoaded(false);
    setMealSwaps({});
    setLocationPref(null);
    setReachedServer(true);
  }, [userId, commit]);

  // The stored plan (again when another screen stored a new one).
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    getPlan(userId)
      .then((p) => alive && setRawPlan(p))
      .catch(() => undefined)
      .finally(() => alive && setPlanLoaded(true));
    return () => {
      alive = false;
    };
  }, [userId, planEpoch]);

  // This week's overrides, location choice and meal swaps.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setOverrides(emptyOverrides(weekStart));
    getWeekOverrides(userId, weekStart)
      .then((o) => alive && setOverrides(o))
      .catch(() => undefined);
    loadLocal<TrainLocation>(userId, `planLocation:${weekStart}`).then((l) => alive && setLocationPref(l ?? null));
    loadLocal<MealSwaps>(userId, `mealSwaps:${weekStart}`).then((s) => alive && setMealSwaps(s ?? {}));
    return () => {
      alive = false;
    };
  }, [userId, weekStart, planEpoch]);

  // A year of completion history, plus this week.
  const loadHistory = useCallback(
    async (alive: () => boolean) => {
      if (!userId) return;
      const from = addDays(weekStart, -STREAK_HORIZON_DAYS);
      const to = addDays(weekStart, 6);
      const { done: saved, offline, local } = await fetchDoneRange(userId, from, to);
      if (!alive()) return;
      if (!local) setReachedServer(!offline);
      setHistoryOffline(!local && offline);
      const next: DoneMap = { ...saved };
      for (const id of touched.current) {
        if (doneRef.current[id]) next[id] = doneRef.current[id];
        else delete next[id];
      }
      commit(next);
      setHistoryLoaded(true);
    },
    [userId, weekStart, commit],
  );

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    touched.current = new Set();
    void loadHistory(() => alive);
    return () => {
      alive = false;
    };
  }, [userId, loadHistory]);

  // Activities for the last 8 weeks.
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    listActivities(userId, addDays(weekStart, -7 * (ACTIVITY_WEEKS - 1)), addDays(weekStart, 6))
      .then(({ activities: list }) => alive && setActivities(list))
      .catch(() => undefined)
      .finally(() => alive && setActivitiesLoaded(true));
    return () => {
      alive = false;
    };
  }, [userId, weekStart]);

  const profile = authProfile && userId && authProfile.id === userId ? authProfile : null;
  const minor = isMinor(profile, today);

  const basePlan = useMemo<PlanV2>(
    () =>
      rawPlan ??
      starterPlan({
        training_days: profile?.training_days,
        train_location: profile?.train_location,
        equipment: profile?.equipment,
        injury_areas: profile?.injury_areas,
        injuries: profile?.injuries,
        kcal_target: profile?.kcal_target,
        water_target: profile?.water_target,
        training_time: profile?.training_time,
        diet_type: profile?.diet_type,
        allergies: profile?.allergies,
        dislikes: profile?.dislikes,
        minor,
      }),
    [rawPlan, profile, minor],
  );

  const locations = useMemo(() => locationsFor(profile?.equipment ?? basePlan.equipment), [profile?.equipment, basePlan.equipment]);
  const preferred = locationPref ?? profile?.train_location ?? basePlan.location;
  const location: TrainLocation = locations.includes(preferred) ? preferred : locations.includes(basePlan.location) ? basePlan.location : locations[0];
  const shownPlan = useMemo(() => (location === basePlan.location ? basePlan : planForLocation(basePlan, location)), [basePlan, location]);

  const days = useMemo(() => composeWeekV2(weekView(shownPlan, overrides, weekStart), done, mealSwaps), [shownPlan, overrides, weekStart, done, mealSwaps]);
  const daysRef = useRef(days);
  daysRef.current = days;
  const basePlanRef = useRef(basePlan);
  basePlanRef.current = basePlan;

  const schedule = useMemo(() => scheduleOf(days), [days]);
  const streak = useMemo(() => currentStreak(done, schedule, today), [done, schedule, today]);
  const weekChanged = overrides.day_order.some((p, i) => p !== i) || Object.keys(overrides.exercise_swaps).length > 0;

  const targets = useMemo<Targets>(() => {
    const kcal = profile?.kcal_target || basePlan.kcal_target;
    const m = basePlan.macros;
    let protein = m.protein_g;
    let carbs = m.carbs_g;
    let fat = m.fat_g;
    if (!protein && profile) {
      const t = targetsFor(profile);
      protein = t.protein_g;
      carbs = t.carbs_g;
      fat = t.fat_g;
    }
    return { kcal, protein, carbs, fat, water: profile?.water_target || basePlan.water_target || 8 };
  }, [profile, basePlan]);

  /** Apply `compute` to the latest state of one day and save the result. */
  const patchDay = useCallback(
    async (dayId: string, compute: (cur: DoneRow, day: WeekDay) => DoneRow | null) => {
      const day = daysRef.current.find((d) => d.id === dayId);
      if (!day) return;
      const cur = doneRef.current[dayId] ?? EMPTY_DONE;
      const next = compute(cur, day);
      if (!next) return;
      touched.current.add(dayId);
      commit({ ...doneRef.current, [dayId]: next });
      if (!userId) return;
      const ok = await saveDayProgress(userId, dayId, next);
      if (isCloudUser(userId)) setReachedServer(ok);
    },
    [userId, commit],
  );

  const setWorkoutDone = useCallback(
    (dayId: string, on: boolean) =>
      patchDay(dayId, (cur, day) => {
        if (day.session.kind !== 'workout') return null;
        if (cur.workout === on && (!on || everySetDone(day, cur.exercises))) return null;
        return { ...cur, workout: on, exercises: on ? allSets(day) : [] };
      }),
    [patchDay],
  );

  const toggleWorkout = useCallback(
    (dayId: string) =>
      patchDay(dayId, (cur, day) => {
        if (day.session.kind !== 'workout') return null;
        const on = !cur.workout;
        return { ...cur, workout: on, exercises: on ? allSets(day) : [] };
      }),
    [patchDay],
  );

  const toggleExercise = useCallback(
    (dayId: string, idx: number) =>
      patchDay(dayId, (cur, day) => {
        if (day.session.kind !== 'workout') return null;
        const ex = day.session.exercises[idx];
        if (!ex) return null;
        const exercises = day.session.exercises.map((_, i) => [...(cur.exercises[i] ?? [])]);
        const full = exercises[idx].filter((x) => x < ex.sets).length === ex.sets;
        exercises[idx] = full ? [] : Array.from({ length: ex.sets }, (_, s) => s);
        return { ...cur, exercises, workout: everySetDone(day, exercises) };
      }),
    [patchDay],
  );

  const toggleSet = useCallback(
    (dayId: string, exerciseIdx: number, setIdx: number) =>
      patchDay(dayId, (cur, day) => {
        if (day.session.kind !== 'workout') return null;
        const exercises = cur.exercises.map((r) => [...(r ?? [])]);
        while (exercises.length <= exerciseIdx) exercises.push([]);
        const row = exercises[exerciseIdx];
        exercises[exerciseIdx] = row.includes(setIdx) ? row.filter((x) => x !== setIdx) : [...row, setIdx].sort((a, b) => a - b);
        return { ...cur, exercises, workout: everySetDone(day, exercises) };
      }),
    [patchDay],
  );

  const toggleMeal = useCallback(
    (dayId: string, slot: string) =>
      patchDay(dayId, (cur) => {
        const set = new Set(cur.meals);
        if (set.has(slot)) set.delete(slot);
        else set.add(slot);
        return { ...cur, meals: [...set] };
      }),
    [patchDay],
  );

  const regenerate = useCallback(
    async (instruction?: string): Promise<PlanChangeResult> => {
      if (!isCloudUser(userId)) {
        return { ok: false, code: 'needs_account', error: 'Your AI plan needs an account. Sign up free and your coach builds and changes it for you.' };
      }
      setGenerating(true);
      try {
        const res = await generatePlan(userId, instruction?.trim() || null);
        // Old checkmarks don't map onto new exercises: clear future days
        // (and today, unless its workout is finished). Past days are history.
        const clear = daysToClearOnRegenerate(doneRef.current, isoDay(new Date()));
        if (clear.length) {
          const next = { ...doneRef.current };
          for (const id of clear) {
            delete next[id];
            touched.current.add(id);
          }
          commit(next);
          await clearDaysProgress(userId, clear);
        }
        setRawPlan(res.plan);
        // A new plan clears this week's swaps on the server; moved days stay.
        void getWeekOverrides(userId, weekStart).then(setOverrides).catch(() => undefined);
        void refreshProfile();
        return { ok: true, changes: res.changes || res.plan.changes, summary: res.summary || res.plan.summary };
      } catch (e) {
        const err = asApiError(e);
        return { ok: false, error: err.message, code: err.code };
      } finally {
        setGenerating(false);
      }
    },
    [userId, weekStart, refreshProfile, commit],
  );

  const moveDay = useCallback(
    async (fromIdx: number, toIdx: number): Promise<ActionResult> => {
      if (!userId || fromIdx === toIdx) return { ok: false };
      const before = overridesRef.current;
      const from = daysRef.current[fromIdx];
      const to = daysRef.current[toIdx];
      setOverrides({ ...before, day_order: swapDays(before.day_order, fromIdx, toIdx) });
      // Sets ticked on either day belonged to the session that moved away.
      for (const d of [from, to]) {
        if (d && (doneRef.current[d.id]?.exercises.length ?? 0) > 0 && !doneRef.current[d.id]?.workout) {
          void patchDay(d.id, (cur) => ({ ...cur, exercises: [] }));
        }
      }
      try {
        setOverrides(await moveWorkoutDay(userId, weekStart, fromIdx, toIdx));
        return { ok: true };
      } catch (e) {
        setOverrides(before);
        return { ok: false, error: asApiError(e).message };
      }
    },
    [userId, weekStart, patchDay],
  );

  const resetWeek = useCallback(async (): Promise<ActionResult> => {
    if (!userId) return { ok: false };
    const before = overridesRef.current;
    setOverrides(emptyOverrides(weekStart));
    try {
      setOverrides(await apiResetWeek(userId, weekStart));
      return { ok: true };
    } catch (e) {
      setOverrides(before);
      return { ok: false, error: asApiError(e).message };
    }
  }, [userId, weekStart]);

  const optionProfile = useMemo(
    () => profile ?? { ...emptyProfile(userId ?? 'local'), train_location: basePlan.location, equipment: [] },
    [profile, userId, basePlan.location],
  );

  const optionsFor = useCallback(
    (dayId: string, exerciseIdx: number): Exercise[] => {
      const day = daysRef.current.find((d) => d.id === dayId);
      if (!day || day.session.kind !== 'workout') return [];
      const ex = day.session.exercises[exerciseIdx];
      if (!ex) return [];
      return exerciseOptions(ex, optionProfile, { location });
    },
    [optionProfile, location],
  );

  const replaceExercise = useCallback(
    async (dayId: string, exerciseIdx: number, replacement: Exercise, scope: 'week' | 'always'): Promise<ActionResult> => {
      const day = daysRef.current.find((d) => d.id === dayId);
      if (!userId || !day) return { ok: false };
      try {
        const res = await apiReplaceExercise(userId, {
          plan: basePlanRef.current,
          weekStart,
          planIndex: day.planIndex,
          exerciseIndex: exerciseIdx,
          replacement,
          scope,
          profile: { ...optionProfile, train_location: location },
        });
        if (scope === 'always') setRawPlan(res.plan);
        setOverrides(res.overrides);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: asApiError(e).message };
      }
    },
    [userId, weekStart, optionProfile, location],
  );

  const setLocation = useCallback(
    (loc: TrainLocation) => {
      setLocationPref(loc);
      if (userId) void saveLocal(userId, `planLocation:${weekStart}`, loc);
    },
    [userId, weekStart],
  );

  const swapMeal = useCallback(
    async (dayId: string, slot: MealSlot, meal: PlanMealV2 | null) => {
      if (!userId) return;
      const before = daysRef.current.find((d) => d.id === dayId)?.meals.find((m) => m.slot === slot);
      let next: MealSwaps = {};
      setMealSwaps((prev) => {
        const day = { ...(prev[dayId] ?? {}) };
        if (meal) day[slot] = meal;
        else delete day[slot];
        next = { ...prev, [dayId]: day };
        return next;
      });
      await saveLocal(userId, `mealSwaps:${weekStart}`, next);
      if (meal && before && before.label !== meal.label) {
        void rememberFact(userId, `Swapped ${slot.toLowerCase()} ${before.label} for ${meal.label}`, 'food', 'behaviour').catch(() => undefined);
      }
    },
    [userId, weekStart],
  );

  const logActivity = useCallback(
    async (input: ActivityInput) => {
      if (!userId) return { ok: false, error: 'Sign in first.' };
      try {
        const a = await apiLogActivity(userId, input, profile?.weight_kg);
        setActivities((prev) => [a, ...prev.filter((x) => x.id !== a.id)].sort((x, y) => (x.day === y.day ? (x.created_at < y.created_at ? 1 : -1) : x.day < y.day ? 1 : -1)));
        return { ok: true, activity: a };
      } catch (e) {
        return { ok: false, error: asApiError(e).message };
      }
    },
    [userId, profile?.weight_kg],
  );

  const removeActivity = useCallback(
    async (id: string) => {
      if (!userId) return;
      setActivities((prev) => prev.filter((a) => a.id !== id));
      await deleteActivity(userId, id).catch(() => undefined);
    },
    [userId],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      getPlan(userId)
        .then(setRawPlan)
        .catch(() => undefined),
      getWeekOverrides(userId, weekStart)
        .then(setOverrides)
        .catch(() => undefined),
      listActivities(userId, addDays(weekStart, -7 * (ACTIVITY_WEEKS - 1)), addDays(weekStart, 6))
        .then(({ activities: list }) => setActivities(list))
        .catch(() => undefined),
      loadHistory(() => true),
      refreshProfile().catch(() => undefined),
    ]);
  }, [userId, weekStart, loadHistory, refreshProfile]);

  const syncState: SyncState = !isCloudUser(userId) ? 'local' : reachedServer ? 'synced' : 'offline';
  const todayIdx = mondayIndex(todayDate);

  const value = useMemo<PlanStore>(
    () => ({
      days,
      todayIdx,
      todayId: today,
      weekStart,
      offline: syncState !== 'synced',
      syncState,
      generating,
      aiPlan: rawPlan?.source === 'ai',
      planLoaded,
      plan: basePlan,
      profile,
      targets,
      location,
      locations,
      setLocation,
      weekChanged,
      schedule,
      history: done,
      historyLoaded,
      historyOffline,
      reload,
      streak,
      regenerate,
      moveDay,
      resetWeek,
      optionsFor,
      replaceExercise,
      swapMeal,
      activities,
      activitiesLoaded,
      logActivity,
      removeActivity,
      toggleWorkout,
      setWorkoutDone,
      toggleExercise,
      toggleSet,
      toggleMeal,
    }),
    [days, todayIdx, today, weekStart, syncState, generating, rawPlan, planLoaded, basePlan, profile, targets, location, locations, setLocation, weekChanged, schedule, done, historyLoaded, historyOffline, reload, streak, regenerate, moveDay, resetWeek, optionsFor, replaceExercise, swapMeal, activities, activitiesLoaded, logActivity, removeActivity, toggleWorkout, setWorkoutDone, toggleExercise, toggleSet, toggleMeal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): PlanStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlan must be used inside <PlanProvider>');
  return ctx;
}
