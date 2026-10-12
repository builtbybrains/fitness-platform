// Environment, Supabase clients and settings for the Edge Functions.
//
// Clients:
//   userClient(req)   acts as the signed-in person (their JWT), so
//                     row-level security applies to every read and write.
//                     Every app-facing function uses this for user data.
//   serviceClient()   the service role. Used only for: reading app_config,
//                     the admin function, and sending push notifications.
//
// Settings: setting('OPENROUTER_API_KEY') reads the Edge Function secret
// first and falls back to the service-role-only `app_config` table (key,
// value), so the AI key and models can be set from the SQL editor when
// secrets can't be (supabase/README.md, "AI key and models").

import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2';

import { fail } from './http.ts';

function firstKey(jsonEnv: string | undefined): string {
  if (!jsonEnv) return '';
  try {
    const parsed = JSON.parse(jsonEnv) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? '';
  } catch {
    return '';
  }
}

export function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? '';
}

/** The public (anon / publishable) key. */
export function anonKey(): string {
  return Deno.env.get('SUPABASE_ANON_KEY') || firstKey(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'));
}

/** The service-role (secret) key. Never sent to a client. */
export function serviceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || firstKey(Deno.env.get('SUPABASE_SECRET_KEYS'));
}

export function userClient(req: Request): SupabaseClient {
  return createClient(supabaseUrl(), anonKey(), {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(supabaseUrl(), serviceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return service;
}

/** The signed-in person and their client, or a 401 response. */
export async function requireUser(
  req: Request,
  message = 'Sign in to continue.',
): Promise<{ supabase: SupabaseClient; user: User } | Response> {
  const supabase = userClient(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return fail('unauthorized', message, 401);
  return { supabase, user: data.user };
}

// ─────────────────────────── settings ───────────────────────────

let cache: { at: number; values: Record<string, string> } | null = null;
const CACHE_MS = 60_000;

async function configTable(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const values: Record<string, string> = {};
  try {
    if (serviceKey()) {
      const { data, error } = await serviceClient().from('app_config').select('key, value');
      if (error) console.warn('[settings] app_config:', error.message);
      for (const row of data ?? []) values[String(row.key)] = String(row.value ?? '');
    }
  } catch (e) {
    console.warn('[settings] app_config unreachable:', e instanceof Error ? e.message : String(e));
  }
  cache = { at: Date.now(), values };
  return values;
}

/** A setting: the Edge Function secret when set, else app_config, else ''. */
export async function setting(name: string): Promise<string> {
  const fromEnv = (Deno.env.get(name) ?? '').trim();
  if (fromEnv) return fromEnv;
  return ((await configTable())[name] ?? '').trim();
}
