/* Auth: Supabase email+password accounts handled entirely in-app. Session
   persists via AsyncStorage; signUp passes `name` through metadata and a
   server trigger creates the profile row.

   Three modes:
   - cloud:        a signed-in account. The profile lives in `profiles`, with
                   a copy on the device so the app opens offline.
   - local:        "Continue without an account", or Supabase unreachable at
                   launch for a device that already has a local identity. A
                   device-only identity (`local-…` id) keeps the app fully
                   usable. Its whole profile is stored on the device, and it
                   NEVER talks to Supabase. Its data stays on this device;
                   nothing is uploaded when someone later signs in.
   - unconfigured: Supabase env vars missing entirely; local mode only.

   Sign-out returns to the login screen and keeps the device-only identity
   (and its data) for the next "Continue without an account". */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';

import { supabase } from './lib/supabase';
import { loadLocal, saveLocal } from './lib/localFallback';
import { clearFoodCache } from './lib/foodCache';
import { todayId } from './lib/dates';
import { saveWeight, WEIGHT_MAX_KG, WEIGHT_MIN_KG } from './data';
import { supabaseConfigured } from '../supabase.config';

export type Profile = {
  id: string;
  name: string;
  kcal_target: number;
  water_target: number;
  height_cm: number | null;
  age: number | null;
  gender: string; // '' | 'male' | 'female'
  weight_kg: number | null;
};

export type ProfilePatch = {
  name?: string;
  kcal_target?: number;
  water_target?: number;
  height_cm?: number | null;
  age?: number | null;
  gender?: string;
  weight_kg?: number | null;
};

type AuthCtx = {
  ready: boolean;
  /** True once the signed-in user's profile fetch has settled (or there is
      no cloud user). The entry gate waits for this before routing so the
      onboarding redirect can't lose a race with the profile fetch. */
  profileLoaded: boolean;
  userId: string | null;
  email: string | null;
  session: Session | null;
  profile: Profile | null;
  /** Signed in, but the server couldn't be reached for the profile. */
  offline: boolean;
  /** Device-only identity: no account, nothing leaves the device. */
  localMode: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  continueOffline: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Save profile fields. A new weight_kg is also logged in the weight
      history for today (Progress chart). Works with and without an account. */
  saveProfile: (patch: ProfilePatch) => Promise<{ error?: string }>;
  /** Log today's body weight: adds it to the weight history and updates the
      profile's current weight. Works with and without an account. */
  logWeight: (kg: number) => Promise<{ error?: string }>;
};

const Ctx = createContext<AuthCtx | null>(null);

// Storage keys predate the BUILT name; keeping them keeps people's data.
const LOCAL_USER_KEY = 'vital.localUser';
const LOCAL_MODE_KEY = 'vital.localMode';

type StoredLocalUser = { userId: string; name: string; profile?: Partial<Profile> };

const fallbackProfile = (id: string, name: string): Profile => ({
  id,
  name,
  kcal_target: 2200,
  water_target: 8,
  height_cm: null,
  age: null,
  gender: '',
  weight_kg: null,
});

function localProfileOf(stored: StoredLocalUser): Profile {
  return { ...fallbackProfile(stored.userId, stored.name), ...(stored.profile ?? {}), id: stored.userId, name: stored.profile?.name ?? stored.name };
}

async function readLocalUser(): Promise<StoredLocalUser | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLocalUser;
    return parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLocalUser(u: StoredLocalUser): Promise<void> {
  await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(u)).catch(() => {});
}

async function loadOrCreateLocalUser(): Promise<StoredLocalUser> {
  const existing = await readLocalUser();
  if (existing) return existing;
  const created: StoredLocalUser = {
    userId: `local-${Math.random().toString(36).slice(2, 10)}`,
    name: '',
  };
  await writeLocalUser(created);
  return created;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);
  const [localMode, setLocalModeState] = useState(!supabaseConfigured);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const localModeRef = useRef(!supabaseConfigured);

  const setLocalMode = useCallback((on: boolean) => {
    localModeRef.current = on;
    setLocalModeState(on);
  }, []);

  const enterLocal = useCallback(
    (u: StoredLocalUser) => {
      setLocalMode(true);
      setLocalUserId(u.userId);
      setProfile(localProfileOf(u));
      setSession(null);
    },
    [setLocalMode],
  );

  // Session bootstrap.
  useEffect(() => {
    let alive = true;

    if (!supabaseConfigured) {
      loadOrCreateLocalUser()
        .then((u) => {
          if (alive) enterLocal(u);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setReady(true);
        });
      return () => {
        alive = false;
      };
    }

    (async () => {
      // A previous "Continue without an account": open straight into local
      // mode without touching the network.
      const flag = await AsyncStorage.getItem(LOCAL_MODE_KEY).catch(() => null);
      if (!alive) return;
      if (flag === '1') {
        enterLocal(await loadOrCreateLocalUser());
        if (alive) setReady(true);
        return;
      }
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!alive) return;
        if (error && !data.session) throw error;
        setSession(data.session ?? null);
      } catch {
        // Unreachable cloud: if the device remembers a local identity, keep
        // them in local mode; otherwise the login screen shows.
        const u = await readLocalUser();
        if (alive && u) {
          setOffline(true);
          enterLocal(u);
        }
      } finally {
        if (alive) setReady(true);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      // A device-only identity ignores any leftover cloud session.
      if (!localModeRef.current) setSession(s);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [enterLocal]);

  // Load the profile row whenever the signed-in user changes.
  const cloudUserId = localMode ? null : session?.user?.id ?? null;
  const metaName = (session?.user?.user_metadata?.name as string | undefined) ?? '';
  useEffect(() => {
    if (!cloudUserId) {
      if (!localModeRef.current) setProfile(null);
      setProfileLoaded(true);
      return;
    }
    let alive = true;
    setProfileLoaded(false);
    (async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', cloudUserId).maybeSingle();
      if (!alive) return;
      if (!error && data) {
        setOffline(false);
        setProfile(data as Profile);
        await saveLocal(cloudUserId, 'profile', data);
      } else {
        // Offline (or the row isn't there yet): use the device copy so a
        // returning person isn't sent back to onboarding.
        const cached = await loadLocal<Profile>(cloudUserId, 'profile');
        if (!alive) return;
        setOffline(!!error);
        setProfile(cached ?? fallbackProfile(cloudUserId, metaName));
      }
      if (alive) setProfileLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [cloudUserId, metaName]);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    if (!supabaseConfigured) {
      return { error: "Accounts aren't available in this build. Continue without an account instead." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
    if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return { error: error.message };
    if (!data.session) {
      return { error: 'CONFIRM_EMAIL:Account created. Check your inbox to confirm your email, then sign in.' };
    }
    return {};
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabaseConfigured) {
        return { error: "Accounts aren't available in this build. Continue without an account instead." };
      }
      if (!email || !password) return { error: 'Email and password are required.' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { error: error.message };
      await AsyncStorage.removeItem(LOCAL_MODE_KEY).catch(() => {});
      setLocalMode(false);
      return {};
    },
    [setLocalMode],
  );

  const signOut = useCallback(async () => {
    if (supabaseConfigured && session) {
      try {
        await supabase.auth.signOut();
      } catch {
        /* already signed out */
      }
    }
    // Leave local mode (unless Supabase was never configured): the gate only
    // routes to the login screen when localMode is off.
    await AsyncStorage.removeItem(LOCAL_MODE_KEY).catch(() => {});
    clearFoodCache();
    setSession(null);
    setOffline(false);
    if (supabaseConfigured) {
      setProfile(null);
      setLocalUserId(null);
      setLocalMode(false);
    }
    // The device-only identity (vital.localUser) and its data are kept, so
    // "Continue without an account" opens the same plan again.
  }, [session, setLocalMode]);

  const continueOffline = useCallback(async () => {
    if (supabaseConfigured) await AsyncStorage.setItem(LOCAL_MODE_KEY, '1').catch(() => {});
    enterLocal(await loadOrCreateLocalUser());
    setOffline(false);
    setProfileLoaded(true);
    setReady(true);
  }, [enterLocal]);

  const refreshProfile = useCallback(async () => {
    if (!cloudUserId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', cloudUserId).maybeSingle();
    if (data) {
      setProfile(data as Profile);
      await saveLocal(cloudUserId, 'profile', data);
    }
  }, [cloudUserId]);

  const userId = cloudUserId ?? (localMode ? localUserId : null);

  const saveProfile = useCallback(
    async (patch: ProfilePatch): Promise<{ error?: string }> => {
      const clean: ProfilePatch = { ...patch };
      if (clean.weight_kg != null) {
        if (!Number.isFinite(clean.weight_kg) || clean.weight_kg < WEIGHT_MIN_KG || clean.weight_kg > WEIGHT_MAX_KG) {
          return { error: `Weight should be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.` };
        }
        clean.weight_kg = Math.round(clean.weight_kg * 10) / 10;
      }
      const weightChanged = clean.weight_kg != null && clean.weight_kg !== profile?.weight_kg;
      setProfile((prev) => (prev ? { ...prev, ...clean } : prev));

      if (!cloudUserId && !localMode) return { error: 'Sign in or continue without an account first.' };
      if (!cloudUserId) {
        // Device-only identity: persist the whole profile, not just the name,
        // so stats survive a reload and onboarding isn't shown again.
        const u = await loadOrCreateLocalUser();
        const nextProfile = { ...(u.profile ?? {}), ...clean };
        await writeLocalUser({ ...u, name: clean.name ?? u.name, profile: nextProfile });
        if (weightChanged && localUserId) await saveWeight(localUserId, todayId(), clean.weight_kg!).catch(() => {});
        return {};
      }

      const { error } = await supabase.from('profiles').update(clean).eq('id', cloudUserId);
      if (error) {
        await refreshProfile();
        return { error: "Couldn't save your profile. Check your connection and try again." };
      }
      const cached = await loadLocal<Profile>(cloudUserId, 'profile');
      await saveLocal(cloudUserId, 'profile', { ...(cached ?? {}), ...clean, id: cloudUserId });
      if (weightChanged) await saveWeight(cloudUserId, todayId(), clean.weight_kg!).catch(() => {});
      return {};
    },
    [cloudUserId, localMode, localUserId, profile?.weight_kg, refreshProfile],
  );

  const logWeight = useCallback(
    async (kg: number): Promise<{ error?: string }> => {
      if (!userId) return { error: 'Sign in or continue without an account first.' };
      if (!Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
        return { error: `Weight should be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.` };
      }
      const value = Math.round(kg * 10) / 10;
      const unchanged = profile?.weight_kg === value;
      // saveProfile logs the entry whenever the weight changes; log it here
      // too when it didn't, so every weigh-in lands in the history.
      const res = await saveProfile({ weight_kg: value });
      if (!res.error && unchanged) await saveWeight(userId, todayId(), value).catch(() => {});
      return res;
    },
    [userId, profile?.weight_kg, saveProfile],
  );

  const email = session?.user?.email ?? null;

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      profileLoaded,
      userId,
      email,
      session: localMode ? null : session,
      profile,
      offline,
      localMode,
      signUp,
      signIn,
      signOut,
      continueOffline,
      refreshProfile,
      saveProfile,
      logWeight,
    }),
    [ready, profileLoaded, userId, email, session, profile, offline, localMode, signUp, signIn, signOut, continueOffline, refreshProfile, saveProfile, logWeight],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
