/* Calling the Edge Functions with typed results and ApiError failures.
   Same transport as lib/functions.ts (supabase.functions.invoke with the
   signed-in person's token), but keeps the server's `code` so screens can
   branch on it. */

import { supabase } from '../lib/supabase';
import { isCloudUser } from '../lib/cloud';
import { ApiError, codeForStatus, MESSAGES, needsAccount } from './errors';
import type { ApiErrorCode } from '../types';

const KNOWN: readonly ApiErrorCode[] = [
  'needs_account', 'offline', 'bad_request', 'unauthorized', 'forbidden', 'not_found', 'payload_too_large',
  'limit_reached', 'not_configured', 'ai_busy', 'server_error',
];

/** Invoke an Edge Function. Resolves its JSON; throws ApiError. */
export async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke(name, { body });
  } catch {
    throw new ApiError('offline', MESSAGES.offline, 0);
  }
  const { data, error } = result;
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).status === 'number' && typeof (ctx as Response).json === 'function') {
      const res = ctx as Response;
      let message: string | undefined;
      let code: string | undefined;
      try {
        const j = (await res.clone().json()) as { error?: unknown; code?: unknown };
        if (typeof j?.error === 'string') message = j.error;
        if (typeof j?.code === 'string') code = j.code;
      } catch {
        /* not JSON */
      }
      const c: ApiErrorCode = code && (KNOWN as readonly string[]).includes(code) ? (code as ApiErrorCode) : code === 'session_expired' ? 'unauthorized' : codeForStatus(res.status);
      const fallback = res.status === 401 ? MESSAGES.session : MESSAGES.generic;
      throw new ApiError(c, message || fallback, res.status);
    }
    const fetchFailed = (error as { name?: string }).name === 'FunctionsFetchError';
    throw new ApiError(fetchFailed ? 'offline' : 'server_error', fetchFailed ? MESSAGES.offline : MESSAGES.generic, fetchFailed ? 0 : 500);
  }
  const maybe = data as { error?: unknown; code?: unknown } | null;
  if (typeof maybe?.error === 'string' && maybe.error) {
    throw new ApiError(typeof maybe.code === 'string' && (KNOWN as readonly string[]).includes(maybe.code) ? (maybe.code as ApiErrorCode) : 'server_error', maybe.error, 200);
  }
  return data as T;
}

/** Throws needs_account unless this is a signed-in account. */
export function requireAccount(userId: string | null | undefined, message?: string): asserts userId is string {
  if (!isCloudUser(userId)) throw needsAccount(message);
}

/** Today's LOCAL day id, sent to functions so "today" is the person's day. */
export { todayId } from '../lib/dates';
