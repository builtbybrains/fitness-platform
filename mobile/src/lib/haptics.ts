/* Small physical feedback for the moments that matter. Phones use the
   haptic engine (expo-haptics); in the browser, Android Chrome buzzes through
   navigator.vibrate (see vibration.ts) and browsers without it stay silent.
   The Vibration setting (Profile, Reminders) turns all of it off; it is
   kept on this device and read once at startup. Failures are ignored, so
   callers can fire and forget. */

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { VIBRATION_KEY, vibrationFromStored, webVibrate, type HapticKind } from './vibration';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

let enabled = true;
const listeners = new Set<(on: boolean) => void>();

function publish(on: boolean) {
  enabled = on;
  listeners.forEach((l) => l(on));
}

AsyncStorage.getItem(VIBRATION_KEY)
  .then((v) => publish(vibrationFromStored(v)))
  .catch(() => {});

function fire(kind: HapticKind, onPhone: () => Promise<void>) {
  if (!enabled) return;
  if (native) onPhone().catch(() => {});
  else webVibrate(kind);
}

export const haptic = {
  /** Ticking something off: a set, a meal, a glass of water. */
  tap: () => fire('tap', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Choosing between options: moving a day, swapping a meal or exercise, a tab. */
  select: () => fire('select', () => Haptics.selectionAsync()),
  /** A finish: workout complete, milestone unlocked. */
  success: () => fire('success', () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A commit you can feel: letting go of pull to refresh, a swipe passing its point. */
  heavy: () => fire('heavy', () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
};

/** Whether vibration is on right now. */
export function vibrationOn(): boolean {
  return enabled;
}

/** Turn vibration on or off on this device. */
export async function setVibration(on: boolean): Promise<{ error?: string }> {
  publish(on);
  try {
    await AsyncStorage.setItem(VIBRATION_KEY, on ? '1' : '0');
    return {};
  } catch {
    return { error: "Couldn't save that on this device. It applies until you close BUILT." };
  }
}

/** The Vibration setting, kept in step with every screen that shows it. */
export function useVibration(): boolean {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    setOn(enabled);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}
