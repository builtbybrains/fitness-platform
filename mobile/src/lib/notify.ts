/* expo-notifications, loaded lazily and wrapped so Expo Go on Android
   (SDK 53+) degrades gracefully instead of throwing at import time — that
   static throw is what broke _layout and profile in Step 4. Every call
   no-ops when notifications are unavailable (Expo Go Android). */

import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

export const WATER_CATEGORY = 'WATER_REMINDER';
export const WATER_ACTION = 'ADD_GLASS';

/* A category with an action button: Android shows it on the notification,
   iOS in the expanded view. Tapping it reaches the response listener in
   useWater as actionIdentifier === WATER_ACTION. */
export function ensureCategories(): void {
  const N = getNotifications();
  if (!N) return;
  N.setNotificationCategoryAsync(WATER_CATEGORY, [
    { identifier: WATER_ACTION, buttonTitle: '+1 glass', options: { opensAppToForeground: true } },
  ]).catch(() => {});
}

export function notificationsAvailable(): boolean {
  if (Platform.OS !== 'android') return true; // iOS Expo Go still supports local notifications
  return getNotifications() !== null;
}

export function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== 'android') {
    cached = require('expo-notifications') as NotificationsModule;
    return cached;
  }
  try {
    // On Android, merely touching this module can throw inside Expo Go.
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/* Probe: calling anything on the module can still throw on Android Expo Go. */
export function probeNotifications(): boolean {
  const N = getNotifications();
  if (!N) return false;
  try {
    void N.getPermissionsAsync();
    return true;
  } catch {
    cached = null;
    return false;
  }
}
