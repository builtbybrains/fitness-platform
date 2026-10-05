/* The AI coach (Edge Function `coach`). The coach knows the plan, today,
   the questionnaire, its memory and the last two weeks; it saves new facts
   to memory itself. When the reply comes with suggestPlanChange, offer an
   "Update my plan" button that calls generatePlan(userId, suggestPlanChange).
   dailyNote writes the short note on Today (mode daily_note: no history,
   no memory). */

import { invoke, requireAccount } from './client';
import { todayId } from '../lib/dates';
import { ApiError } from './errors';
import type { CoachReply, MemoryFact } from '../types';

export async function sendCoachMessage(userId: string, message: string, conversationId = 'default'): Promise<CoachReply> {
  requireAccount(userId, 'Your coach needs an account. Sign up free to start chatting.');
  const text = message.trim();
  if (!text) throw new ApiError('bad_request', 'Type a message first.', 400);
  const data = await invoke<Partial<CoachReply>>('coach', { message: text.slice(0, 800), conversationId, localDay: todayId() });
  return {
    reply: String(data.reply ?? ''),
    model: String(data.model ?? ''),
    saved: data.saved !== false,
    suggestPlanChange: typeof data.suggestPlanChange === 'string' && data.suggestPlanChange ? data.suggestPlanChange : null,
    remembered: Array.isArray(data.remembered) ? (data.remembered as MemoryFact[]) : [],
  };
}

/** What the Today note is written from: small, and clamped again on the server. */
export type DailyNoteSummary = {
  day: 'workout' | 'rest';
  focus?: string;
  minutes?: number;
  workoutDone?: boolean;
  /** Workouts done and planned in the last 7 days, today included. */
  done7: number;
  planned7: number;
  streak: number;
  /** Plan meals ticked yesterday, when yesterday is in this week. */
  mealsYesterday?: { eaten: number; planned: number } | null;
};

/** The coach's note for Today (one or two sentences). Resolves '' when the
    coach has no AI right now; the caller shows a built-in tip instead. */
export async function dailyNote(userId: string, summary: DailyNoteSummary): Promise<string> {
  requireAccount(userId);
  const data = await invoke<{ note?: unknown }>('coach', { mode: 'daily_note', localDay: todayId(), summary });
  return typeof data?.note === 'string' ? data.note.trim().slice(0, 220) : '';
}
