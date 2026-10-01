/* ApiError: what every api/ function throws. `message` is always safe to
   show on screen as is; `code` is for branching (types: ApiErrorCode).

     try { await generatePlan(userId) }
     catch (e) {
       const err = asApiError(e);
       if (err.code === 'needs_account') showSignUpSheet();
       else showToast(err.message);
     } */

import type { ApiErrorCode } from '../types';

export class ApiError extends Error {
  code: ApiErrorCode;
  /** HTTP status, or 0 when the request never reached the server. */
  status: number;
  constructor(code: ApiErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const MESSAGES = {
  needsAccount: 'This needs an account. Sign up free to use it; your plan comes with you.',
  offline: "You're offline. Try again when you're connected.",
  generic: 'Something went wrong on our side. Try again in a moment.',
  session: 'Your session has ended. Sign in again to continue.',
} as const;

export function needsAccount(message: string = MESSAGES.needsAccount): ApiError {
  return new ApiError('needs_account', message);
}

/** Map a Postgres / PostgREST error to an ApiError. Recognises the
    profile rules raised by the database (BU013 to BU016). */
export function fromDbError(error: { code?: string; message?: string } | null | undefined, fallback: string = MESSAGES.generic): ApiError {
  const code = error?.code ?? '';
  const msg = error?.message ?? '';
  switch (code) {
    case 'BU013':
      return new ApiError('under_13', 'BUILT is for people aged 13 and over.', 400);
    case 'BU014':
      return new ApiError('waiver_required', 'Accept the waiver to finish.', 400);
    case 'BU015':
      return new ApiError('guardian_required', 'A parent or guardian needs to give consent first.', 400);
    case 'BU016':
      return new ApiError('birth_date_required', msg || 'Add your date of birth to finish.', 400);
    case '23514':
      return new ApiError('bad_request', 'One of those answers isn\'t valid. Check it and try again.', 400);
    case '42501':
      return new ApiError('unauthorized', MESSAGES.session, 401);
    case 'PGRST301':
    case 'PGRST303':
      return new ApiError('unauthorized', MESSAGES.session, 401);
  }
  if (!code && /fetch|network|timed? ?out/i.test(msg)) return new ApiError('offline', MESSAGES.offline, 0);
  return new ApiError('server_error', fallback, 500);
}

export function asApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
    const status = (e as { status: number }).status;
    const message = e instanceof Error ? e.message : MESSAGES.generic;
    return new ApiError(codeForStatus(status), message, status);
  }
  return new ApiError('server_error', e instanceof Error && e.message ? e.message : MESSAGES.generic, 500);
}

export function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 0:
      return 'offline';
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 413:
      return 'payload_too_large';
    case 429:
      return 'limit_reached';
    case 502:
      return 'ai_busy';
    case 503:
      return 'not_configured';
    default:
      return 'server_error';
  }
}
