/* Supabase client: sessions persist via AsyncStorage so login survives app
   restarts. The anon key is public by design: row-level security protects
   every row; the AI coach key stays server-side in the Edge Function.

   On phones the token refresh timer only runs while the app is in the
   foreground (Supabase's documented React Native pattern): a timer left
   running in the background is suspended by the OS and the session can
   lapse, so it restarts each time the app becomes active. The browser
   manages this itself, so the web skips it. */

import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../supabase.config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

let refreshWired = false;

function wireAutoRefresh() {
  if (refreshWired || Platform.OS === 'web') return;
  refreshWired = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

wireAutoRefresh();
