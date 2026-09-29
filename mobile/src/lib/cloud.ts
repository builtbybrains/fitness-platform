/* Which identities talk to the server. A signed-in account has a UUID id;
   the device-only identity ("Continue without an account") has a
   `local-…` id and must never reach Supabase: every query with it fails
   (it is not a UUID) and supabase-js keeps retrying. */

import { supabaseConfigured } from '../../supabase.config';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string | null | undefined): boolean {
  return !!id && UUID_RE.test(id);
}

/** True when this user id belongs to a real account on a configured backend. */
export function isCloudUser(userId: string | null | undefined): userId is string {
  return supabaseConfigured && isUuid(userId);
}

/** RFC 4122 v4 id generated on the device (Hermes has no crypto.randomUUID). */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}
