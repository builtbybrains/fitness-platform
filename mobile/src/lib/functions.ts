/* Calling the Supabase Edge Functions (coach, planner, analyze-meal) with
   errors a person can read. supabase-js reports every non-2xx as
   "Edge Function returned a non-2xx status code"; the real reason (for
   example the daily limit, HTTP 429) is in the response body, so read it. */

import { supabase } from './supabase';

export class FunctionCallError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'FunctionCallError';
    this.status = status;
  }
}

const OFFLINE_MESSAGE = "You're offline. Try again when you're connected.";
const GENERIC_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

export function messageForStatus(status: number, serverMessage?: string): string {
  if (status === 429) return serverMessage || "You've reached today's limit. Try again tomorrow.";
  if (status === 401) return 'Your session has ended. Sign in again to continue.';
  if (status === 0) return OFFLINE_MESSAGE;
  return serverMessage || GENERIC_MESSAGE;
}

/** Invoke an Edge Function. Resolves with its JSON body; throws a
    FunctionCallError whose message is safe to show on screen. */
export async function callFunction<T = Record<string, unknown>>(name: string, body: unknown): Promise<T> {
  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  } catch {
    throw new FunctionCallError(OFFLINE_MESSAGE, 0);
  }
  const { data, error } = result;
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).status === 'number' && typeof (ctx as Response).json === 'function') {
      const res = ctx as Response;
      let serverMessage: string | undefined;
      try {
        const j = (await res.clone().json()) as { error?: unknown };
        if (typeof j?.error === 'string') serverMessage = j.error;
      } catch {
        /* not JSON */
      }
      throw new FunctionCallError(messageForStatus(res.status, serverMessage), res.status);
    }
    const fetchFailed = (error as { name?: string }).name === 'FunctionsFetchError';
    throw new FunctionCallError(fetchFailed ? OFFLINE_MESSAGE : GENERIC_MESSAGE, fetchFailed ? 0 : 500);
  }
  const maybeError = (data as { error?: unknown } | null)?.error;
  if (typeof maybeError === 'string' && maybeError) throw new FunctionCallError(maybeError, 200);
  return data as T;
}
