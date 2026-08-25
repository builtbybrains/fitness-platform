import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Goal = 'lose' | 'maintain' | 'gain';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active';
export type Budget = 'low' | 'standard' | 'premium';

/**
 * Health context the coach must respect. Kept deliberately short: only what
 * genuinely changes a recommendation, never a full medical history.
 */
export interface Medical {
  conditions: string[];
  injuries: string[];
  allergies: string[];
  medications: string;
  notes: string;
  /** Set once the user has been through the health step. */
  completed: boolean;
}

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  startWeightKg: number;
  age: number;
  goal: Goal;
  activity: Activity;
  diet: string[];
  training: string[];
  budget: Budget;
  /** For a bulking goal this is the weight to add, in kg. */
  goalDeltaKg: number;
}

export interface Reminder {
  id: string;
  label: string;
  detail: string;
  time: string;
  enabled: boolean;
}

interface State {
  hydrated: boolean;
  signedIn: boolean;
  /** Signed in without an account. Everything works; nothing syncs. */
  guest: boolean;
  onboarded: boolean;
  premium: boolean;
  renewsOn: string | null;
  profile: Profile;
  medical: Medical;
  reminders: Reminder[];
  /** ISO dates the user completed a workout, newest last. */
  workoutLog: string[];
  /** Share analytics to improve recommendations. */
  shareAnalytics: boolean;
  /** Water glasses logged today. */
  water: number;

  signIn: (email: string, firstName?: string, lastName?: string) => void;
  continueAsGuest: () => void;
  signOut: () => void;
  setMedical: (patch: Partial<Medical>) => void;
  logWorkout: () => void;
  setShareAnalytics: (v: boolean) => void;
  completeOnboarding: (patch: Partial<Profile>) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  toggleReminder: (id: string) => void;
  setReminderTime: (id: string, time: string) => void;
  addWater: (n: number) => void;
  setPremium: (active: boolean) => void;
}

const DEFAULT_PROFILE: Profile = {
  firstName: 'Alex',
  lastName: '',
  email: '',
  heightCm: 178,
  weightKg: 84.8,
  targetWeightKg: 82,
  startWeightKg: 92,
  age: 31,
  goal: 'lose',
  activity: 'moderate',
  diet: ['High protein'],
  training: ['Strength'],
  budget: 'standard',
  goalDeltaKg: 10,
};

const DEFAULT_MEDICAL: Medical = {
  conditions: [],
  injuries: [],
  allergies: [],
  medications: '',
  notes: '',
  completed: false,
};

const DEFAULT_REMINDERS: Reminder[] = [
  { id: 'breakfast', label: 'Breakfast', detail: 'Start the day on target', time: '08:00', enabled: true },
  { id: 'water', label: 'Water', detail: 'Every 2 hours', time: '10:00', enabled: true },
  { id: 'lunch', label: 'Lunch', detail: 'Midday meal', time: '12:30', enabled: true },
  { id: 'workout', label: 'Workout', detail: "Today's session", time: '18:00', enabled: true },
  { id: 'dinner', label: 'Dinner', detail: 'Close out your macros', time: '20:00', enabled: true },
  { id: 'goal', label: 'Daily goal', detail: 'Check your progress', time: '21:30', enabled: false },
  { id: 'progress', label: 'Weekly progress', detail: 'Sunday review', time: '09:00', enabled: true },
];

export const useStore = create<State>()(
  persist(
    (set) => ({
      hydrated: false,
      signedIn: false,
      guest: false,
      onboarded: false,
      premium: false,
      renewsOn: null,
      profile: DEFAULT_PROFILE,
      medical: DEFAULT_MEDICAL,
      reminders: DEFAULT_REMINDERS,
      workoutLog: [],
      shareAnalytics: true,
      water: 6,

      continueAsGuest: () => set({ signedIn: true, guest: true }),

      setMedical: (patch) => set((st) => ({ medical: { ...st.medical, ...patch } })),

      logWorkout: () =>
        set((st) => {
          const today = new Date().toISOString().slice(0, 10);
          if (st.workoutLog.includes(today)) return st;
          return { workoutLog: [...st.workoutLog, today].slice(-90) };
        }),

      setShareAnalytics: (v) => set({ shareAnalytics: v }),

      signIn: (email, firstName, lastName) =>
        set((st) => ({
          signedIn: true,
          guest: false,
          profile: {
            ...st.profile,
            email,
            firstName: firstName || st.profile.firstName,
            lastName: lastName ?? st.profile.lastName,
          },
        })),

      signOut: () =>
        set({ signedIn: false, guest: false, onboarded: false, premium: false, renewsOn: null }),

      completeOnboarding: (patch) =>
        set((st) => ({
          onboarded: true,
          profile: { ...st.profile, ...patch, startWeightKg: patch.weightKg ?? st.profile.startWeightKg },
        })),

      updateProfile: (patch) => set((st) => ({ profile: { ...st.profile, ...patch } })),

      toggleReminder: (id) =>
        set((st) => ({
          reminders: st.reminders.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        })),

      setReminderTime: (id, time) =>
        set((st) => ({
          reminders: st.reminders.map((r) => (r.id === id ? { ...r, time } : r)),
        })),

      addWater: (n) => set((st) => ({ water: Math.max(0, Math.min(12, st.water + n)) })),

      setPremium: (active) =>
        set(() => {
          if (!active) return { premium: false, renewsOn: null };
          const next = new Date();
          next.setMonth(next.getMonth() + 1);
          return {
            premium: true,
            renewsOn: next.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
          };
        }),
    }),
    {
      name: 'vital-store-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        signedIn, guest, onboarded, premium, renewsOn,
        profile, medical, reminders, workoutLog, shareAnalytics, water,
      }) => ({
        signedIn, guest, onboarded, premium, renewsOn,
        profile, medical, reminders, workoutLog, shareAnalytics, water,
      }),
      onRehydrateStorage: () => (state) => {
        useStore.setState({ hydrated: true });
        void state;
      },
    },
  ),
);

/** Derived numbers the dashboard and progress screens share. */
export function useDerived() {
  const profile = useStore((s) => s.profile);
  const water = useStore((s) => s.water);
  const workoutLog = useStore((s) => s.workoutLog);

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const trainedToday = workoutLog.includes(today);
  const trainedYesterday = workoutLog.includes(yesterday);

  const lost = Math.max(0, profile.startWeightKg - profile.weightKg);
  const toLose = Math.max(0.1, profile.startWeightKg - profile.targetWeightKg);

  return {
    trainedToday,
    trainedYesterday,
    /** Days since the last logged session, capped so the copy stays sane. */
    daysSinceWorkout: trainedToday ? 0 : trainedYesterday ? 1 : Math.min(7, workoutLog.length ? 2 : 3),
    lost,
    toLose,
    weightProgress: Math.min(1, lost / toLose),
    calorieTarget: 2100,
    caloriesEaten: 1260,
    waterGlasses: water,
    waterTarget: 8,
    workoutMinutes: 32,
    streak: 24,
    dailyGoal: 0.72,
  };
}
