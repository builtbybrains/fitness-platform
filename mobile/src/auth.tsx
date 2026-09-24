/* Auth: Supabase email+password accounts handled entirely in-app. Session
   persists via AsyncStorage; signUp passes `name` through metadata and a
   server trigger creates the profile row.

   Three modes:
   - cloud:     Supabase configured, real session
   - local:     Supabase configured but unreachable at launch, or the user
                tapped "Continue without an account" — a device-scoped
                pseudo-user keeps the app fully usable; signing in later
                adopts the cloud profile.
   - unconfigured: Supabase env vars missing entirely (setup guide shows).

   Sign-out always returns to the login screen and keeps the local identity
   so on-device data stays readable. */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';

import { supabase } from './lib/supabase';
import { supabaseConfigured } from '../supabase.config';

export type Profile = {
  id: string;
  name: string;
  kcal_target: number;
  water_target: number;
  height_cm: number | null;
  age: number | null;
  gender: string; // '' | 'male' | 'female'
};

type AuthCtx = {
  ready: boolean;
  userId: string | null;
  email: string | null;
  session: Session | null;
  profile: Profile | null;
  offline: boolean;
  localMode: boolean; // device-local identity (offline or "continue without account")
  signUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  continueOffline: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (patch: {
    name?: string;
    kcal_target?: number;
    water_target?: number;
    height_cm?: number | null;
    age?: number | null;
    gender?: string;
  }) => Promise<{ error?: string }>;
};

const Ctx = createContext<AuthCtx | null>(null);

const fallbackProfile = (id: string, name: string): Profile => ({
  id,
  name,
  kcal_target: 2200,
  water_target: 8,
  height_cm: null,
  age: null,
  gender: '',
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);
  const [localMode, setLocalMode] = useState(!supabaseConfigured);
  const localUserId = useRef<string | null>(null);

  const loadLocalIdentity = useCallback(async (): Promise<{ userId: string; name: string }> => {
    const raw = await AsyncStorage.getItem('vital.localUser');
    if (raw) {
      try {
        return JSON.parse(raw) as { userId: string; name: string };
      } catch {
        /* fall through and re-create */
      }
    }
    const local = {
      userId: `local-${Math.random().toString(36).slice(2, 10)}`,
      name: 'Local athlete',
    };
    await AsyncStorage.setItem('vital.localUser', JSON.stringify(local));
    return local;
  }, []);

  // Session bootstrap.
  useEffect(() => {
    let alive = true;

    if (!supabaseConfigured) {
      loadLocalIdentity()
        .then((local) => {
          if (!alive) return;
          localUserId.current = local.userId;
          setProfile(fallbackProfile(local.userId, local.name));
          setReady(true);
        })
        .catch(() => {
          if (alive) setReady(true);
        });
      return () => {
        alive = false;
      };
    }

    // A previous "continue offline" session? Show the app immediately.
    AsyncStorage.getItem('vital.localMode')
      .then((v) => {
        if (!alive) return;
        if (v === '1') {
          setLocalMode(true);
          return loadLocalIdentity().then((local) => {
            localUserId.current = local.userId;
            setProfile(fallbackProfile(local.userId, local.name));
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        supabase.auth
          .getSession()
          .then(({ data }) => {
            if (!alive) return;
            setSession(data.session ?? null);
            setReady(true);
          })
          .catch(() => {
            // Unreachable cloud: if the device remembers a local identity,
            // keep them in local mode; otherwise send them to login.
            AsyncStorage.getItem('vital.localUser')
              .then((raw) => {
                if (!alive) return;
                if (raw) {
                  setOffline(true);
                  setLocalMode(true);
                  try {
                    const local = JSON.parse(raw) as { userId: string; name: string };
                    localUserId.current = local.userId;
                    setProfile(fallbackProfile(local.userId, local.name));
                  } catch {
                    /* login screen will handle it */
                  }
                }
                setReady(true);
              })
              .catch(() => {
                if (alive) setReady(true);
              });
          });
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [loadLocalIdentity]);

  // Load the profile row whenever the signed-in user changes.
  const cloudUserId = session?.user?.id ?? null;
  useEffect(() => {
    if (!supabaseConfigured) return;
    if (!cloudUserId) {
      if (!localMode) setProfile(null);
      return;
    }
    let alive = true;
    (async () => {
      const metaName = (session?.user.user_metadata?.name as string | undefined) ?? '';
      try {
        const { data } = await supabase.from('profiles').select('*').eq('id', cloudUserId).maybeSingle();
        if (!alive) return;
        setProfile(data ? (data as Profile) : fallbackProfile(cloudUserId, metaName));
      } catch {
        if (alive) setProfile(fallbackProfile(cloudUserId, metaName));
      }
    })();
  }, [cloudUserId, localMode, session]);

  async function signUp(email: string, password: string, name: string) {
    if (!supabaseConfigured) {
      return { error: 'Supabase is not configured yet — see supabase/README.md' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address' };
    if (password.length < 8) return { error: 'Password must be at least 8 characters' };

    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (error) return { error: error.message };
    if (!data.session) {
      return { error: 'CONFIRM_EMAIL:Account created! Check your inbox to confirm your email, then sign in.' };
    }
    return {};
  }

  async function signIn(email: string, password: string) {
    if (!supabaseConfigured) {
      return { error: 'Supabase is not configured yet — see supabase/README.md' };
    }
    if (!email || !password) return { error: 'Email and password are required' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }

  async function signOut() {
    if (supabaseConfigured && session) {
      try {
        await supabase.auth.signOut();
      } catch {
        /* already signed out */
      }
    }
    setSession(null);
    setProfile(null);
    // Keep vital.localUser: the local identity (and its data) survives so
    // "continue without an account" still sees the same plan.
  }

  async function continueOffline() {
    if (supabaseConfigured) await AsyncStorage.setItem('vital.localMode', '1').catch(() => {});
    const local = await loadLocalIdentity();
    localUserId.current = local.userId;
    setProfile(fallbackProfile(local.userId, local.name));
    setLocalMode(true);
    setOffline(supabaseConfigured);
    setSession(null);
    setReady(true);
  }

  async function refreshProfile() {
    if (!supabaseConfigured || !cloudUserId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', cloudUserId).maybeSingle();
    if (data) setProfile(data as Profile);
  }

  async function saveProfile(patch: {
    name?: string;
    kcal_target?: number;
    water_target?: number;
    height_cm?: number | null;
    age?: number | null;
    gender?: string;
  }) {
    setProfile((prev) => (prev ? ({ ...prev, ...patch } as Profile) : prev));
    if (localMode || !cloudUserId) {
      if (patch.name) {
        const raw = await AsyncStorage.getItem('vital.localUser').catch(() => null);
        if (raw) {
          try {
            const local = JSON.parse(raw) as { userId: string; name: string };
            await AsyncStorage.setItem(
              'vital.localUser',
              JSON.stringify({ ...local, name: patch.name }),
            );
          } catch {
            /* ignore */
          }
        }
      }
      return {};
    }
    const { error } = await supabase.from('profiles').update(patch).eq('id', cloudUserId);
    if (error) {
      await refreshProfile();
      return { error: error.message };
    }
    return {};
  }

  const userId = cloudUserId ?? localUserId.current;
  const email = session?.user?.email ?? null;

  const value = useMemo<AuthCtx>(
    () => ({ ready, userId, email, session, profile, offline, localMode, signUp, signIn, signOut, continueOffline, refreshProfile, saveProfile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, userId, email, session, profile, offline, localMode],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
