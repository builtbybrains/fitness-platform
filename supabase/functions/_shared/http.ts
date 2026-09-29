// Shared HTTP helpers for the BUILT Edge Functions.

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

/** What clients see when something breaks. The real error goes to the
    function logs (Dashboard → Edge Functions → <function> → Logs), never to
    the client. */
export const GENERIC_ERROR = 'Something went wrong on our side. Try again in a moment.';

export function serverError(where: string, e: unknown): Response {
  console.error(`[${where}]`, e instanceof Error ? `${e.name}: ${e.message}` : e);
  return json({ error: GENERIC_ERROR }, 500);
}
