/* The AI coach (Edge Function `coach`). The coach knows the plan, today,
   the questionnaire, its memory and the last two weeks; it saves new facts
   to memory itself. When the reply comes with suggestPlanChange, offer an
   "Update my plan" button that calls generatePlan(userId, suggestPlanChange). */

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
