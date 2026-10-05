/* Small physical feedback for the moments that matter. Native only: on web
   every call is a no-op. Failures (no haptic engine, simulator) are ignored,
   so callers can fire and forget. */

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(p: () => Promise<void>) {
  if (!native) return;
  p().catch(() => {});
}

export const haptic = {
  /** Ticking something off: a set, a meal, a glass of water. */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Choosing between options: moving a day, swapping a meal or exercise. */
  select: () => safe(() => Haptics.selectionAsync()),
  /** A finish: workout complete, milestone unlocked. */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
