/* Auth: Supabase email+password accounts handled entirely in-app. Session
   persists via AsyncStorage; signUp passes `name` through metadata and a
   server trigger creates the profile row. Email verification is off for
   now (PRODUCT.md), so a sign-up returns a session straight away.

   The profile is the full v2 questionnaire row (ProfileV2), loaded with
   api/profile getProfile and saved with saveProfilePatch, which validate
   the same rules as the database in every mode.

   Three modes:
   - cloud:        a signed-in account. The profile lives in `profiles`, with
                   a copy on the device so the app opens offline.
   - local:        "Continue without an account", or Supabase unreachable at
                   launch for a device that already has a local identity. A
                   device-only identity (`local-…` id) keeps the app fully
                   usable. Its whole profile is stored on the device, and it
                   NEVER talks to Supabase.
   - unconfigured: Supabase env vars missing entirely; local mode only.

   Anyone whose onboarding_done_at is null (every v1 account included) is
   routed into the questionnaire by the entry gate (app/index.tsx).

   Sign-out returns to the login screen and keeps the device-only identity
   (and its data) for the next "Continue without an account". */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';

import { supabase } from './lib/supabase';
import { clearFoodCache } from './lib/foodCache';
import { todayId } from './lib/dates';
import { saveWeight, WEIGHT_MAX_KG, WEIGHT_MIN_KG } from './data';
import { supabaseConfigured } from '../supabase.config';
import { asApiError } from './api/errors';
import { emptyProfile, getProfile, saveProfilePatch } from './api/profile';
import { registerPushToken, unregisterPushToken } from './api/push';
import type { ApiErrorCode, ProfilePatchV2, ProfileV2 } from './types';

/** The signed-in person's profile: the whole v2 questionnaire row. */
export type Profile = ProfileV2;
export type ProfilePatch = ProfilePatchV2;

export type SaveResult = { error?: string; code?: ApiErrorCode; profile?: ProfileV2 };

type AuthCtx = {
  ready: boolean;
  /** True once the signed-in user's profile fetch has settled (or there is
      no cloud user). The entry gate waits for this before routing. */
  profileLoaded: boolean;
  /** Set when a signed-in profile couldn't be loaded at all (offline with
      no device copy). The gate shows it with a retry. */
  profileError: string | null;
  userId: string | null;
  email: string | null;
  session: Session | null;
  profile: Profile | null;
  /** True once the questionnaire is finished (onboarding_done_at set). */
  onboarded: boolean;
  /** Signed in, but the server couldn't be reached for the profile. */
  offline: boolean;
  /** Device-only identity: no account, nothing leaves the device. */
  localMode: boolean;
  /** Bumped whenever a new plan was stored outside the plan store (end of
      the questionnaire, a monthly check-in, a profile change). Plan
      readers can add it to their load effect to pick the new plan up. */
  planEpoch: number;
  notifyPlanChanged: () => void;
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  continueOffline: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** Save questionnaire answers or settings (validated first). A new
      weight_kg is also logged in the weight history for today. Works with
      and without an account. */
  saveProfile: (patch: ProfilePatch) => Promise<SaveResult>;
  /** Put a profile returned by an api/ call (acceptWaiver,
      completeOnboarding, enableHealthSync…) on screen. */
  applyProfile: (p: ProfileV2) => void;
  /** Log today's body weight: adds it to the weight history and updates the
      profile's current weight. Works with and without an account. */
  logWeight: (kg: number) => Promise<{ error?: string }>;
};

const Ctx = createContext<AuthCtx | null>(null);

// Storage keys predate the BUILT name; keeping them keeps people's data.
const LOCAL_USER_KEY = 'vital.localUser';
const LOCAL_MODE_KEY = 'vital.localMode';

type StoredLocalUser = { userId: string; name: string; profile?: Partial<ProfileV2> };

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

async function loadOrCreateLocalUser(): Promise<StoredLocalUser> {
  const existing = await readLocalUser();
  if (existing) return existing;
  const created: StoredLocalUser = {
    userId: `local-${Math.random().toString(36).slice(2, 10)}`,
    name: '',
  };
  await AsyncStorage.setItem(LOCAL_USER_KEY, JSON.stringify(created)).catch(() => {});
  return created;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);
  const [localMode, setLocalModeState] = useState(!supabaseConfigured);
  const [localUserId, setLocalUserId] = useState<string | null>(null);
  const [planEpoch, setPlanEpoch] = useState(0);
  const localModeRef = useRef(!supabaseConfigured);
  const profileRef = useRef<Profile | null>(null);
  const pushToken = useRef<string | null>(null);

  const putProfile = useCallback((p: Profile | null) => {
    profileRef.current = p;
    setProfile(p);
  }, []);

  const setLocalMode = useCallback((on: boolean) => {
    localModeRef.current = on;
    setLocalModeState(on);
  }, []);

  const enterLocal = useCallback(
    async (u: StoredLocalUser) => {
      setLocalMode(true);
      setLocalUserId(u.userId);
      setSession(null);
      const p = await getProfile(u.userId).catch(() => emptyProfile(u.userId, u.name));
      putProfile(p);
    },
    [setLocalMode, putProfile],
  );

  // Session bootstrap.
  useEffect(() => {
    let alive = true;

    if (!supabaseConfigured) {
      loadOrCreateLocalUser()
        .then((u) => (alive ? enterLocal(u) : undefined))
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
        await enterLocal(await loadOrCreateLocalUser());
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
          await enterLocal(u);
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

  const loadCloudProfile = useCallback(
    async (id: string, alive: () => boolean = () => true) => {
      try {
        const p = await getProfile(id);
        if (!alive()) return;
        putProfile(p.name || !metaName ? p : { ...p, name: metaName });
        setOffline(false);
        setProfileError(null);
      } catch (e) {
        if (!alive()) return;
        const err = asApiError(e);
        if (err.code === 'unauthorized') {
          // The session ended on the server: back to sign-in.
          await supabase.auth.signOut().catch(() => {});
          setSession(null);
          putProfile(null);
          return;
        }
        setOffline(err.code === 'offline');
        setProfileError(err.message);
      }
    },
    [metaName, putProfile],
  );

  useEffect(() => {
    if (!cloudUserId) {
      if (!localModeRef.current) putProfile(null);
      setProfileLoaded(true);
      return;
    }
    let alive = true;
    setProfileLoaded(false);
    (async () => {
      await loadCloudProfile(cloudUserId, () => alive);
      if (alive) setProfileLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [cloudUserId, loadCloudProfile, putProfile]);

  // Register for server pushes (report replies, plan updated) once signed
  // in. Silent: without permission, on the web or before EAS is set up
  // (no_project_id) it simply resolves { ok: false }.
  useEffect(() => {
    if (!cloudUserId || Platform.OS === 'web') return;
    let alive = true;
    registerPushToken(cloudUserId, { prompt: false })
      .then((r) => {
        if (alive && r.ok) pushToken.current = r.token;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [cloudUserId]);

  const signUp = useCallback(
    async (email: string, password: string, name = '') => {
      if (!supabaseConfigured) {
        return { error: "Accounts aren't available in this build. Continue without an account instead." };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
      if (password.length < 8) return { error: 'Use at least 8 characters for your password.' };

      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
      if (error) return { error: error.message };
      if (!data.session) {
        // Only when email confirmation is switched back on in Supabase.
        return { error: 'CONFIRM_EMAIL:Account created. Check your inbox to confirm your email, then sign in.' };
      }
      await AsyncStorage.removeItem(LOCAL_MODE_KEY).catch(() => {});
      setLocalMode(false);
      return {};
    },
    [setLocalMode],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabaseConfigured) {
        return { error: "Accounts aren't available in this build. Continue without an account instead." };
      }
      if (!email || !password) return { error: 'Enter your email and password.' };
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
      const id = session.user?.id;
      if (id && pushToken.current) await unregisterPushToken(id, pushToken.current).catch(() => {});
      pushToken.current = null;
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
    setProfileError(null);
    if (supabaseConfigured) {
      putProfile(null);
      setLocalUserId(null);
      setLocalMode(false);
    }
    // The device-only identity (vital.localUser) and its data are kept, so
    // "Continue without an account" opens the same plan again.
  }, [session, setLocalMode, putProfile]);

  const continueOffline = useCallback(async () => {
    if (supabaseConfigured) await AsyncStorage.setItem(LOCAL_MODE_KEY, '1').catch(() => {});
    await enterLocal(await loadOrCreateLocalUser());
    setOffline(false);
    setProfileError(null);
    setProfileLoaded(true);
    setReady(true);
  }, [enterLocal]);

  const userId = cloudUserId ?? (localMode ? localUserId : null);

  const refreshProfile = useCallback(async () => {
    if (cloudUserId) {
      await loadCloudProfile(cloudUserId);
      setProfileLoaded(true);
      return;
    }
    if (localMode && localUserId) {
      const p = await getProfile(localUserId).catch(() => null);
      if (p) putProfile(p);
    }
  }, [cloudUserId, localMode, localUserId, loadCloudProfile, putProfile]);

  const applyProfile = useCallback((p: ProfileV2) => putProfile(p), [putProfile]);

  const saveProfile = useCallback(
    async (patch: ProfilePatch): Promise<SaveResult> => {
      if (!userId) return { error: 'Sign in or continue without an account first.', code: 'unauthorized' };
      try {
        const current = profileRef.current ?? undefined;
        const next = await saveProfilePatch(userId, patch, current && current.id === userId ? current : undefined);
        putProfile(next);
        return { profile: next };
      } catch (e) {
        const err = asApiError(e);
        return { error: err.message, code: err.code };
      }
    },
    [userId, putProfile],
  );

  const logWeight = useCallback(
    async (kg: number): Promise<{ error?: string }> => {
      if (!userId) return { error: 'Sign in or continue without an account first.' };
      if (!Number.isFinite(kg) || kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
        return { error: `Weight should be between ${WEIGHT_MIN_KG} and ${WEIGHT_MAX_KG} kg.` };
      }
      const value = Math.round(kg * 10) / 10;
      const unchanged = profileRef.current?.weight_kg === value;
      // saveProfilePatch logs the entry whenever the weight changes; log it
      // here too when it didn't, so every weigh-in lands in the history.
      const res = await saveProfile({ weight_kg: value });
      if (!res.error && unchanged) await saveWeight(userId, todayId(), value).catch(() => {});
      return res.error ? { error: res.error } : {};
    },
    [userId, saveProfile],
  );

  const notifyPlanChanged = useCallback(() => setPlanEpoch((n) => n + 1), []);

  const email = session?.user?.email ?? null;
  const onboarded = !!profile?.onboarding_done_at;

  const value = useMemo<AuthCtx>(
    () => ({
      ready,
      profileLoaded,
      profileError,
      userId,
      email,
      session: localMode ? null : session,
      profile,
      onboarded,
      offline,
      localMode,
      planEpoch,
      notifyPlanChanged,
      signUp,
      signIn,
      signOut,
      continueOffline,
      refreshProfile,
      saveProfile,
      applyProfile,
      logWeight,
    }),
    [ready, profileLoaded, profileError, userId, email, session, profile, onboarded, offline, localMode, planEpoch, notifyPlanChanged, signUp, signIn, signOut, continueOffline, refreshProfile, saveProfile, applyProfile, logWeight],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
