// Push notifications through the Expo push service
// (https://exp.host/--/api/v2/push/send) to the tokens in public.push_tokens.
// Uses the service role (it reads other people's tokens), so only the admin
// function and server-side events call it, never with a client's input as
// the recipient.
//
// Respects the person's settings: a type they turned off in
// profiles.reminder_prefs is not sent; during their quiet hours
// (profiles.quiet_hours_start/end, in profiles.timezone) it is delivered
// silently (no sound). Tokens Expo reports as no longer registered are
// deleted.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type PushKind = 'report_reply' | 'plan_updated';
export type PushMessage = { title: string; body: string; data?: Record<string, unknown> };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Minutes since midnight of "HH:MM[:SS]". */
function minutesOf(t: string): number {
  const [h, m] = t.split(':').map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

/** Is `now` inside the quiet window (which may cross midnight)? */
export function inQuietHours(start: string, end: string, timeZone: string, now = new Date()): boolean {
  let local: number;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    local = Number(parts.find((p) => p.type === 'hour')?.value) * 60 + Number(parts.find((p) => p.type === 'minute')?.value);
  } catch {
    local = now.getUTCHours() * 60 + now.getUTCMinutes() + 180; // Beirut-ish fallback
    local %= 1440;
  }
  const s = minutesOf(start);
  const e = minutesOf(end);
  if (s === e) return false;
  return s < e ? local >= s && local < e : local >= s || local < e;
}

/** Send `msg` to every device of `userIds`. Resolves how many were sent.
    Never throws: a failed push must not fail the request that caused it. */
export async function sendPush(service: SupabaseClient, userIds: string[], msg: PushMessage, kind: PushKind): Promise<number> {
  try {
    if (!userIds.length) return 0;
    const [{ data: tokens }, { data: profiles }] = await Promise.all([
      service.from('push_tokens').select('user_id, token').in('user_id', userIds),
      service.from('profiles').select('id, reminder_prefs, quiet_hours_start, quiet_hours_end, timezone').in('id', userIds),
    ]);
    const prefs = new Map((profiles ?? []).map((p) => [p.id as string, p]));
    const messages = (tokens ?? [])
      .filter((t) => {
        const p = prefs.get(t.user_id as string);
        return (p?.reminder_prefs as Record<string, unknown> | undefined)?.[kind] !== false;
      })
      .map((t) => {
        const p = prefs.get(t.user_id as string);
        const quiet = p ? inQuietHours(String(p.quiet_hours_start ?? '22:00'), String(p.quiet_hours_end ?? '07:00'), String(p.timezone ?? 'Asia/Beirut')) : false;
        return {
          to: t.token as string,
          title: msg.title.slice(0, 80),
          body: msg.body.slice(0, 180),
          data: { ...(msg.data ?? {}), kind },
          ...(quiet ? {} : { sound: 'default' }),
          priority: quiet ? 'normal' : 'high',
          channelId: 'default',
        };
      });
    if (!messages.length) return 0;

    let sent = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const r = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        console.warn('[push] Expo answered', r.status);
        continue;
      }
      const j = (await r.json()) as { data?: { status?: string; details?: { error?: string } }[] };
      const dead: string[] = [];
      (j.data ?? []).forEach((ticket, k) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[k].to);
      });
      if (dead.length) await service.from('push_tokens').delete().in('token', dead);
    }
    return sent;
  } catch (e) {
    console.warn('[push] failed:', e instanceof Error ? e.message : String(e));
    return 0;
  }
}
