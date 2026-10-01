/* Reminders (PRODUCT.md "Reminders"): workout on training days at the
   chosen time, meals, water, the weekly weigh-in, the monthly check-in and
   "streak at risk" in the evening, all scheduled on the phone, each one
   switchable, all outside quiet hours (default 22:00 to 07:00). "Plan
   updated" and "reply to a problem report" are server pushes; their
   switches live in the same reminder_prefs and the server honours them.

   - useReminders(): the settings (from the profile), save helpers, and the
     notification permission.
   - useReminderScheduler(): mounted once at the root; reschedules whenever
     the profile changes and when the app comes back to the foreground.
   - requestReminderPermission(): ask for notifications (from a screen that
     explains why).

   Everything no-ops on the web and in Expo Go on Android, where local
   notifications aren't available. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from './auth';
import { DEFAULT_REMINDERS } from './api/profile';
import { lastMonthlyCheckinDay } from './api/checkins';
import { registerPushToken } from './api/push';
import { fetchDayDone } from './data';
import { addDays, todayId } from './lib/dates';
import { ensureCategories, getNotifications, notificationsAvailable, planReminders, probeNotifications, type PlannedReminder } from './lib/notify';
import { clockOf } from './components/onboarding/options';
import type { ProfileV2, ReminderPrefs } from './types';

export type Permission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** "22:00:00" → "22:00". */
export function hhmm(t: string | null | undefined, fallback: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : fallback;
}

export async function getReminderPermission(): Promise<Permission> {
  const N = getNotifications();
  if (!N || !notificationsAvailable()) return 'unavailable';
  try {
    const p = await N.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain === false ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Ask for notification permission. Resolves true when granted. */
export async function requestReminderPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N || !notificationsAvailable()) return false;
  try {
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', { name: 'BUILT', importance: N.AndroidImportance.DEFAULT, lightColor: '#A3FF3D' });
    }
    const cur = await N.getPermissionsAsync();
    if (cur.granted) return true;
    const p = await N.requestPermissionsAsync();
    return !!p.granted;
  } catch {
    return false;
  }
}

/** The day the monthly check-in falls due: 30 days after the last one, or
    after finishing the questionnaire. */
export function monthlyDueDay(lastMonthly: string | null, onboardedAt: string | null | undefined): string | null {
  const since = lastMonthly ?? (onboardedAt ? onboardedAt.slice(0, 10) : null);
  return since ? addDays(since, 30) : null;
}

async function schedule(list: PlannedReminder[]): Promise<number> {
  const N = getNotifications();
  if (!N) return 0;
  // Clear every BUILT reminder (ids start with "built-"), then add the new set.
  const existing = await N.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(existing.filter((n) => n.identifier.startsWith('built-')).map((n) => N.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
  ensureCategories();
  let n = 0;
  for (const r of list) {
    const trigger =
      r.trigger.type === 'daily'
        ? { type: N.SchedulableTriggerInputTypes.DAILY, hour: r.trigger.hour, minute: r.trigger.minute }
        : r.trigger.type === 'weekly'
          ? { type: N.SchedulableTriggerInputTypes.WEEKLY, weekday: r.trigger.weekday, hour: r.trigger.hour, minute: r.trigger.minute }
          : { type: N.SchedulableTriggerInputTypes.DATE, date: r.trigger.date };
    await N.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, sound: true, categoryIdentifier: r.category, data: r.url ? { url: r.url, type: r.kind } : { type: r.kind } },
      trigger: trigger as never,
    })
      .then(() => n++)
      .catch(() => {});
  }
  return n;
}

/** Plan and schedule from a profile. Resolves how many were scheduled (0
    without permission). */
export async function rescheduleReminders(userId: string, profile: ProfileV2): Promise<number> {
  if ((await getReminderPermission()) !== 'granted') return 0;
  const today = todayId();
  const [lastMonthly, done] = await Promise.all([
    lastMonthlyCheckinDay(userId).catch(() => null),
    fetchDayDone(userId, today).catch(() => null),
  ]);
  const list = planReminders({
    prefs: { ...DEFAULT_REMINDERS, ...profile.reminder_prefs },
    quietStart: hhmm(profile.quiet_hours_start, '22:00'),
    quietEnd: hhmm(profile.quiet_hours_end, '07:00'),
    trainingDays: profile.training_days,
    trainingClock: clockOf(profile.training_time),
    monthlyDueDay: monthlyDueDay(lastMonthly, profile.onboarding_done_at),
    now: new Date(),
    workoutDoneToday: !!done?.done?.workout,
  });
  return schedule(list);
}

/** Mount once at the root. */
export function useReminderScheduler() {
  const { userId, profile } = useAuth();
  const key = profile
    ? JSON.stringify([profile.id, profile.reminder_prefs, profile.quiet_hours_start, profile.quiet_hours_end, profile.training_days, profile.training_time, profile.onboarding_done_at])
    : '';
  const latest = useRef<{ userId: string | null; profile: ProfileV2 | null }>({ userId, profile });
  latest.current = { userId, profile };

  useEffect(() => {
    if (!userId || !profile?.onboarding_done_at || !notificationsAvailable()) return;
    void rescheduleReminders(userId, profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId]);

  useEffect(() => {
    if (!notificationsAvailable()) return;
    const sub = AppState.addEventListener('change', (s) => {
      const { userId: id, profile: p } = latest.current;
      if (s === 'active' && id && p?.onboarding_done_at) void rescheduleReminders(id, p);
    });
    return () => sub.remove();
  }, []);
}

/** Reminder settings for the settings screen. */
export function useReminders() {
  const { userId, profile, saveProfile, session } = useAuth();
  const [permission, setPermission] = useState<Permission>('undetermined');
  const [supported] = useState(() => notificationsAvailable() && probeNotifications());
  const [push, setPush] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getReminderPermission().then((p) => alive && setPermission(p));
    return () => {
      alive = false;
    };
  }, []);

  const prefs: ReminderPrefs = { ...DEFAULT_REMINDERS, ...(profile?.reminder_prefs ?? {}) };
  const quietStart = hhmm(profile?.quiet_hours_start, '22:00');
  const quietEnd = hhmm(profile?.quiet_hours_end, '07:00');

  const update = useCallback(
    async (patch: Partial<ReminderPrefs>) => {
      // JSON fields are replaced whole: merge first.
      const res = await saveProfile({ reminder_prefs: { ...DEFAULT_REMINDERS, ...(profile?.reminder_prefs ?? {}), ...patch } });
      return res;
    },
    [profile?.reminder_prefs, saveProfile],
  );

  const setQuietHours = useCallback((start: string, end: string) => saveProfile({ quiet_hours_start: start, quiet_hours_end: end }), [saveProfile]);

  const allow = useCallback(async () => {
    const ok = await requestReminderPermission();
    const p = await getReminderPermission();
    setPermission(ok ? 'granted' : p);
    if (ok && userId && session) {
      // Server pushes (report replies, plan updated). Quietly reports
      // no_project_id until EAS is set up; that isn't an error to show.
      const r = await registerPushToken(userId, { prompt: false }).catch(() => null);
      setPush(r?.ok ? 'on' : r?.reason ?? null);
    }
    if (ok && userId && profile) await rescheduleReminders(userId, profile);
    return ok;
  }, [userId, session, profile]);

  return { prefs, quietStart, quietEnd, update, setQuietHours, permission, allow, supported, push, web: Platform.OS === 'web' };
}
