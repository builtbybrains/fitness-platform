// Shared HTTP helpers for the BUILT Edge Functions.
//
// Every error body is { error: "<message safe to show>", code: "<code>" }.
// The app shows `error` as is; `code` is for branching (docs/API.md lists
// them). Real causes go to the function logs, never to the client.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'session_expired'
  | 'forbidden'
  | 'not_found'
  | 'method_not_allowed'
  | 'payload_too_large'
  | 'locked'
  | 'limit_reached'
  | 'needs_profile'
  | 'age_required'
  | 'not_configured'
  | 'ai_busy'
  | 'delete_failed'
  | 'server_error';

export function json(body: unknown, status = 200, headers: Record<string, string> = CORS): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json' },
  });
}

export function fail(code: ErrorCode, message: string, status: number, extra: Record<string, unknown> = {}, headers: Record<string, string> = CORS): Response {
  return json({ error: message, code, ...extra }, status, headers);
}

/** What clients see when something breaks. The real error goes to the
    function logs (Dashboard → Edge Functions → <function> → Logs), never to
    the client. */
export const GENERIC_ERROR = 'Something went wrong on our side. Try again in a moment.';

export function serverError(where: string, e: unknown, headers: Record<string, string> = CORS): Response {
  console.error(`[${where}]`, e instanceof Error ? `${e.name}: ${e.message}` : e);
  return fail('server_error', GENERIC_ERROR, 500, {}, headers);
}

export function preflight(req: Request, headers: Record<string, string> = CORS): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers }) : null;
}

/** Parse a JSON body; an empty or broken body is {}. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The client's LOCAL day (yyyy-mm-dd) when it is a real calendar date
    within one day of the server's UTC date (every time zone's local day
    is), else the server's UTC day. Ages are computed from this day, so a
    client can never move it further. */
export function localDay(v: unknown, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? ''));
  if (!m) return today;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = Date.UTC(y, mo - 1, d);
  const back = new Date(at);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return today;
  const todayAt = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.abs(at - todayAt) <= 86_400_000 ? m[0] : today;
}
