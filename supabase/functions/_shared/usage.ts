// Daily limits on paid AI calls, so no single account can burn the AI
// budget. Counts live in public.ai_usage and only change through the
// public.bump_ai_usage() database function (see supabase/schema.sql), which
// counts atomically and refuses once the limit is reached. "A day" is the
// UTC day.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { json } from './http.ts';

export const LIMITS = {
  coach: 60, // user messages per day (counted from coach_messages)
  plan: 5, // plan generations per day
  meal_photo: 30, // photo estimates per day
} as const;

/** Count one call of `kind` for the signed-in user of `supabase` (their own
    client, so auth.uid() is them). Resolves true when allowed. Throws when
    the counter itself fails (for example schema.sql hasn't been run). */
export async function takeQuota(
  supabase: SupabaseClient,
  kind: 'plan' | 'meal_photo',
): Promise<boolean> {
  const { data, error } = await supabase.rpc('bump_ai_usage', { p_kind: kind, p_limit: LIMITS[kind] });
  if (error) throw new Error(`bump_ai_usage failed: ${error.message}`);
  return data !== null && data !== undefined;
}

/** Start of the current UTC day, ISO string. */
export function utcDayStart(now = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function limitReached(message: string): Response {
  return json({ error: message }, 429);
}
