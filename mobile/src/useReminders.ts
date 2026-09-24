/* Reminders: local scheduled notifications (no server push needed). Two
   toggles — a daily water nudge and a workout nudge — plus persisted
   preferences. Everything survives app restarts via AsyncStorage.

   Expo Go on Android removed expo-notifications (SDK 53+), so every call
   goes through the lazy loader and silently no-ops there; the UI shows a
   notice. Real local notifications work in dev builds and on iOS. */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getNotifications, ensureCategories, WATER_CATEGORY, probeNotifications, notificationsAvailable } from './lib/notify';

const KEY = 'vital.reminders.v1';

export type ReminderPrefs = {
  water: boolean;
  waterHour: number; // 0-23
  workout: boolean;
  workoutHour: number;
};

const DEFAULTS: ReminderPrefs = {
  water: false,
  waterHour: 14,
  workout: false,
  workoutHour: 18,
};

const WATER_BODY = 'Time for a glass of water — your streak likes hydration.';
const WORKOUT_BODY = 'Workout time. One set is enough to start.';

export function useReminders() {
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULTS);
  const [granted, setGranted] = useState<boolean | null>(null); // null = unknown
  const [supported, setSupported] = useState<boolean>(notificationsAvailable());

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) {
          try {
            setPrefs({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<ReminderPrefs>) });
          } catch {
            /* defaults */
          }
        }
      })
      .catch(() => {});
    setSupported(probeNotifications());
    const N = getNotifications();
    if (!N) {
      setGranted(false);
      return;
    }
    N.getPermissionsAsync()
      .then((p) => setGranted(p.granted))
      .catch(() => setGranted(false));
  }, []);

  const update = useCallback(
    async (patch: Partial<ReminderPrefs>) => {
      const next = { ...prefs, ...patch };
      setPrefs(next);
      await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});

      const N = getNotifications();
      if (!N) return; // Expo Go on Android: prefs saved, nothing to schedule

      if (!next.water && !next.workout) {
        await N.cancelAllScheduledNotificationsAsync().catch(() => {});
        return;
      }
      if (granted === false) {
        const req = await N.requestPermissionsAsync().catch(() => null);
        const ok = Boolean(req?.granted);
        setGranted(ok);
        if (!ok) return;
      } else {
        setGranted(true);
      }

      await N.cancelAllScheduledNotificationsAsync().catch(() => {});
      ensureCategories();
      const daily = (hour: number, title: string, body: string, id: string, category?: string) =>
        N.scheduleNotificationAsync({
          content: { title, body, sound: true, categoryIdentifier: category },
          trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour, minute: 0 },
          identifier: id,
        }).catch(() => {});
      if (next.water) await daily(next.waterHour, '💧 Hydration check', WATER_BODY, 'vital-water', WATER_CATEGORY);
      if (next.workout) await daily(next.workoutHour, '🔥 Training time', WORKOUT_BODY, 'vital-workout');
    },
    [prefs, granted],
  );

  return { prefs, update, granted, supported };
}
