/* Push notifications from the server (admin replies to a report, plan
   updated after a check-in). Local reminders (workout, meals, water,
   weigh-in, streak) are scheduled on the device and don't need this.

   registerPushToken() asks for permission when `prompt` is true, gets the
   Expo push token and stores it for the signed-in account. Call it after
   sign-in (and once a day is fine; it is idempotent). It needs:
   - a phone (not a simulator) and a development or production build;
   - the EAS project id in app.json → expo.extra.eas.projectId (set by
     `eas init`). Without it the result is { ok: false, reason: 'no_project_id' }. */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { supabase } from '../lib/supabase';
import { isCloudUser } from '../lib/cloud';
import { getNotifications } from '../lib/notify';
import type { PushRegistration } from '../types';

export async function registerPushToken(userId: string, opts: { prompt?: boolean } = {}): Promise<PushRegistration> {
  if (!isCloudUser(userId)) return { ok: false, reason: 'needs_account' };
  if (Platform.OS === 'web') return { ok: false, reason: 'web' };
  const N = getNotifications();
  if (!N) return { ok: false, reason: 'unavailable' };
  try {
    const Device = require('expo-device') as typeof import('expo-device');
    if (!Device.isDevice) return { ok: false, reason: 'not_device' };

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('default', {
        name: 'BUILT',
        importance: N.AndroidImportance.DEFAULT,
        lightColor: '#A3FF3D',
      });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== 'granted' && opts.prompt) ({ status } = await N.requestPermissionsAsync());
    if (status !== 'granted') return { ok: false, reason: 'denied' };

    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
    const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return { ok: false, reason: 'no_project_id' };

    const { data: token } = await N.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) return { ok: false, reason: 'error' };
    return { ok: true, token };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** Stop pushes to this device (call before signing out). */
export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  if (!isCloudUser(userId)) return;
  await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
}
