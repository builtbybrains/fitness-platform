/* Weekly weigh-ins and monthly check-ins (Edge Function `checkin`).

   Monthly with photos: upload the face-blurred set and runBodyAnalysis()
   first (api/photos.ts), then submitCheckin({ kind: 'monthly', photo_set_id }).
   The result carries the review (`summary`), what changed in the plan and
   why (`plan_changes`), and the new plan.
   No account: the check-in and weight are kept on the device and the
   summary is the weight trend only (no AI, no plan change). */

import { isCloudUser, newId } from '../lib/cloud';
import { loadLocal, updateLocal } from '../lib/localFallback';
import { supabase } from '../lib/supabase';
import { addDays, todayId } from '../lib/dates';
import { saveWeight } from '../data';
import { invoke } from './client';
import { ApiError, fromDbError } from './errors';
import { upgradePlan } from './plan';
import type { Checkin, CheckinInput, CheckinKind, CheckinResult, CheckinsDue } from '../types';

const LOCAL = 'checkins';

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** Which check-ins are due. Weekly: no weight logged for 7 days. Monthly:
    30 days since the last monthly check-in (or since onboarding). Pure. */
export function checkinsDue(args: { today?: string; lastWeightDay: string | null; lastMonthlyDay: string | null; startedDay: string | null }): CheckinsDue {
  const today = args.today ?? todayId();
  const weekly = !args.lastWeightDay || daysBetween(args.lastWeightDay, today) >= 7;
  const since = args.lastMonthlyDay ?? args.startedDay;
  const monthly = !!since && daysBetween(since, today) >= 30;
  return { weekly, monthly };
}

/** Save a check-in. Weekly needs a weight. */
export async function submitCheckin(userId: string, input: CheckinInput): Promise<CheckinResult> {
  const day = input.day ?? todayId();
  if (input.weight_kg != null && (input.weight_kg < 30 || input.weight_kg > 300)) throw new ApiError('bad_request', 'Weight should be between 30 and 300 kg.', 400);
  if (input.kind === 'weekly' && input.weight_kg == null) throw new ApiError('bad_request', 'Enter your weight first.', 400);

  if (!isCloudUser(userId)) {
    const previous = ((await loadLocal<Checkin[]>(userId, LOCAL)) ?? []).filter((c) => c.kind === input.kind && c.day < day && c.weight_kg != null)[0];
    const kg = input.weight_kg == null ? null : Math.round(input.weight_kg * 10) / 10;
    let summary = kg != null ? `Logged at ${kg} kg.` : 'Check-in saved.';
    if (kg != null && previous?.weight_kg != null) {
      const diff = Math.round((kg - previous.weight_kg) * 10) / 10;
      summary = diff === 0 ? `Steady at ${kg} kg since ${previous.day}.` : `${diff < 0 ? 'Down' : 'Up'} ${Math.abs(diff)} kg since ${previous.day} (${previous.weight_kg} → ${kg} kg).`;
    }
    const now = new Date().toISOString();
    const row: Checkin = {
      id: newId(), user_id: userId, kind: input.kind, day, weight_kg: kg, measurements: input.measurements ?? {}, answers: input.answers ?? {},
      photo_set_id: null, photo_ids: [], ai_summary: summary, plan_changes: null, created_at: now, updated_at: now,
    };
    await updateLocal<Checkin[]>(userId, LOCAL, (prev) => [row, ...(prev ?? []).filter((c) => !(c.kind === row.kind && c.day === row.day))].slice(0, 120));
    if (kg != null) await saveWeight(userId, day, kg).catch(() => false);
    return { checkin: row, summary, plan_changes: null, plan: null, localOnly: true };
  }

  const data = await invoke<CheckinResult>('checkin', {
    kind: input.kind,
    day,
    weight_kg: input.weight_kg ?? null,
    measurements: input.measurements ?? {},
    answers: input.answers ?? {},
    photo_set_id: input.photo_set_id ?? null,
  });
  if (input.weight_kg != null) await saveWeight(userId, day, input.weight_kg).catch(() => false);
  await updateLocal<Checkin[]>(userId, LOCAL, (prev) => [data.checkin, ...(prev ?? []).filter((c) => c.id !== data.checkin.id)].slice(0, 120));
  return { ...data, plan: upgradePlan(data.plan) };
}

/** Check-ins, newest first. */
export async function listCheckins(userId: string, kind?: CheckinKind, limit = 24): Promise<Checkin[]> {
  const local = ((await loadLocal<Checkin[]>(userId, LOCAL)) ?? []).filter((c) => !kind || c.kind === kind).slice(0, limit);
  if (!isCloudUser(userId)) return local;
  let q = supabase.from('checkins').select('*').eq('user_id', userId).order('day', { ascending: false }).limit(limit);
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) {
    if (local.length) return local;
    throw fromDbError(error, "Couldn't load your check-ins.");
  }
  return (data ?? []) as Checkin[];
}

/** The last day a monthly check-in was done, or null. */
export async function lastMonthlyCheckinDay(userId: string): Promise<string | null> {
  const [last] = await listCheckins(userId, 'monthly', 1);
  return last?.day ?? null;
}

/** Day id `n` days before today (for "since" filters). */
export function daysAgo(n: number, today = todayId()): string {
  return addDays(today, -n);
}
