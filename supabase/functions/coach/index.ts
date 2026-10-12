// BUILT AI coach v2.
// Deploy: supabase functions deploy coach --project-ref <ref>
//
// POST { message, conversationId?: "default", localDay?: "yyyy-mm-dd" }
// → 200 { reply, model, saved, suggestPlanChange: string | null, remembered: MemoryFact[],
//         suggestions: string[], thread: { id, title }, remaining_today: number }
//   reply              at most about 90 words; may hold a short list (lines
//                      starting "- ") and **bold** for key numbers. Never
//                      headings or em dashes.
//   suggestPlanChange  set when the message asks for a plan change ("my knee
//                      hurts", "only 3 days this week"). The app offers an
//                      "Update my plan" button that calls `planner` with
//                      { instruction: suggestPlanChange }.
//   remembered         facts saved to coach memory from this message (the
//                      app can show "Saved to memory").
//   suggestions        up to 3 follow-ups the person might tap next (each at
//                      most 48 characters, plain text). Built-in ones when
//                      there is no AI.
//   thread             the conversation this went into. Its title is named
//                      on the first exchange (AI: 2 to 5 words; without AI:
//                      the message cut to 48 characters) unless the person
//                      already chose one.
//   remaining_today    messages left today after this one.
//
// Threads: every saved exchange updates public.coach_threads through
// coach_thread_touch() (count, preview, title). The app lists, renames,
// pins and archives threads directly (docs/API.md, "Coach threads").
//
// Context (all RLS-scoped through the person's token): today's plan and
// what's done, food logged, water, the questionnaire, coach memory, and the
// last 14 days of behaviour (workouts done and missed, exercise swaps,
// activities, the last check-in). After each message a second, cheap call
// (run in parallel) extracts durable facts, plan-change requests, follow-up
// suggestions and (first exchange only) a title; facts are de-duplicated
// before saving.
//
// Limit: 60 messages per person per UTC day, counted from coach_messages.
//
// Daily note (the card on Today, asked for at most once a day per device):
// POST { mode: "daily_note", localDay?: "yyyy-mm-dd", summary: {
//   day: "workout" | "rest", focus?: string, minutes?: number,
//   workoutDone?: boolean, done7?: number, planned7?: number, streak?: number,
//   mealsYesterday?: { eaten: number, planned: number } | null } }
// → 200 { note }   one or two sentences, at most 200 characters. An empty
//                  note means "no AI right now": the app shows its own tip.
// Reads the profile and coach memory; never writes chat history or memory.
// Limit: NOTE_LIMIT per person per UTC day, counted in ai_usage (kind
// 'coach', which chat messages don't use: they count coach_messages).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { body, fail, json, localDay, preflight, serverError } from '../_shared/http.ts';
import { requireUser } from '../_shared/env.ts';
import { aiProvider, chat, clampInt, extractJson, str } from '../_shared/ai.ts';
import { MINOR_RULES, SAFETY_RULES } from '../_shared/safety.ts';
import { describePerson, loadPerson } from '../_shared/profile.ts';
import { cleanFacts, loadMemory, memoryForPrompt, type MemoryCategory, saveFacts } from '../_shared/memory.ts';
import { injuriesFromText } from '../_shared/exercises.ts';
import { LIMITS, limitReached, utcDayStart } from '../_shared/usage.ts';
import { cleanReply, cleanSuggestions, cleanTitle, cutTitle, needsTitle, previewText, rulesSuggestions } from '../_shared/coachExtras.ts';

const PLAN_CHANGE_RE = /(change|update|adjust|redo|rebuild|modify|swap|replace|move|switch)\b.{0,40}\b(plan|workouts?|training|program|schedule|days?|meals?|diet|exercises?)|\bonly\s+(\d|one|two|three|four|five|six)\s+days?\b|\b(my|the)\s+(knee|back|shoulder|wrist|elbow|hip|ankle|neck)\b.{0,20}\b(hurts?|pain|sore|injur\w*)|\bno (equipment|gym)\b|\b(travel|traveling|travelling)\b.{0,30}\bweek\b|\btoo (hard|easy)\b/i;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const auth = await requireUser(req, 'Sign in to talk to your coach.');
    if (auth instanceof Response) return auth;
    const { supabase, user } = auth;

    const b = await body(req);
    if (b.mode === 'daily_note') return await dailyNote(supabase, user.id, b);
    const userMessage = str(b.message, 800);
    if (!userMessage) return fail('bad_request', 'Type a message first.', 400);
    const conversationId = str(b.conversationId, 60, 'default');
    const today = localDay(b.localDay);
    const receivedAt = Date.now();

    const { count: sentToday, error: countErr } = await supabase
      .from('coach_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', utcDayStart());
    if (countErr) throw new Error(`count coach_messages: ${countErr.message}`);
    if ((sentToday ?? 0) >= LIMITS.coach) {
      return limitReached(`You've sent ${LIMITS.coach} messages today, the daily limit. Your coach is back tomorrow.`);
    }

    const since = shift(today, -13);
    const [person, memory, day, waterRow, foodLogs, planRow, recentDays, overrides, activities, lastCheckin, history, threadRow] = await Promise.all([
      loadPerson(supabase, user.id, today),
      loadMemory(supabase, user.id),
      supabase.from('plan_days').select('workout_done, exercises_done, meals_done').eq('user_id', user.id).eq('day', today).maybeSingle(),
      supabase.from('water').select('count').eq('user_id', user.id).eq('day', today).maybeSingle(),
      supabase.from('food_logs').select('label, kcal, protein').eq('user_id', user.id).eq('day', today).order('created_at'),
      supabase.from('ai_plans').select('plan').eq('user_id', user.id).maybeSingle(),
      supabase.from('plan_days').select('day, workout_done').eq('user_id', user.id).gte('day', since).lte('day', today),
      supabase.from('plan_overrides').select('week_start, exercise_swaps, day_order').eq('user_id', user.id).gte('week_start', shift(since, -6)),
      supabase.from('activities').select('day, kind, minutes, kcal').eq('user_id', user.id).gte('day', since).order('day', { ascending: false }).limit(20),
      supabase.from('checkins').select('kind, day, ai_summary').eq('user_id', user.id).order('day', { ascending: false }).limit(1).maybeSingle(),
      // Same-time pairs (older rows) come back reply first, so reversed they read in order.
      supabase.from('coach_messages').select('role, body').eq('user_id', user.id).eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('role', { ascending: true }).limit(10),
      supabase.from('coach_threads').select('title, message_count').eq('user_id', user.id).eq('id', conversationId).maybeSingle(),
    ]);
    if (threadRow.error) console.warn('[coach] reading the thread failed:', threadRow.error.message);

    // Today against the plan (Monday-first generic week).
    type Day = { session?: { kind?: string; focus?: string; exercises?: { name?: string }[] }; meals?: { slot?: string; label?: string; kcal?: number }[] };
    const planDays = (planRow.data?.plan as { days?: Day[] } | null)?.days;
    const weekIdx = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
    const planDay = Array.isArray(planDays) && planDays.length === 7 ? planDays[weekIdx] : undefined;
    const plannedMeals = Array.isArray(planDay?.meals) ? planDay!.meals : [];
    const plannedExercises = planDay?.session?.kind === 'workout' && Array.isArray(planDay.session.exercises) ? planDay.session.exercises : [];
    const isRestDay = planDay?.session?.kind === 'rest';
    const exercisesDone = Array.isArray(day.data?.exercises_done)
      ? (day.data.exercises_done as unknown[]).filter((r) => Array.isArray(r) && r.length > 0).length
      : 0;
    const mealsDone: string[] = Array.isArray(day.data?.meals_done) ? day.data.meals_done : [];
    const checkedKcal = plannedMeals.filter((m) => mealsDone.includes(String(m?.slot ?? ''))).reduce((a, m) => a + (Number(m?.kcal) || 0), 0);
    const logged = foodLogs.data ?? [];
    const loggedKcal = logged.reduce((a, f) => a + (Number(f.kcal) || 0), 0);
    const kcalTarget = person.kcal_target ?? 2200;

    // Behaviour over the last 14 days.
    const doneDays = new Set((recentDays.data ?? []).filter((r) => r.workout_done).map((r) => String(r.day).slice(0, 10)));
    let planned = 0;
    let missed = 0;
    for (let i = 13; i >= 1; i--) {
      const d = shift(today, -i);
      const idx = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
      const training = Array.isArray(planDays) && planDays.length === 7 ? planDays[idx]?.session?.kind === 'workout' : person.schedule[idx];
      if (training) {
        planned++;
        if (!doneDays.has(d)) missed++;
      }
    }
    const swaps = (overrides.data ?? []).flatMap((o) => Object.values((o.exercise_swaps ?? {}) as Record<string, { name?: string; replaced_from?: string }>))
      .map((s) => (s.replaced_from ? `${s.replaced_from} → ${s.name}` : s.name))
      .filter(Boolean);
    const moved = (overrides.data ?? []).filter((o) => Array.isArray(o.day_order) && o.day_order.some((v: number, i: number) => v !== i)).length;
    const acts = (activities.data ?? []).map((a) => `${a.kind} ${a.minutes} min`);

    const waterCount = Number(waterRow.data?.count) || 0;
    const waterTarget = person.water_target ?? 8;
    const dayFacts = [
      isRestDay ? 'Plan today: REST / recovery day.' : planDay ? `Plan today: ${planDay.session?.focus ?? 'workout'} with ${plannedExercises.length} exercises (${plannedExercises.map((e) => e.name).filter(Boolean).slice(0, 6).join(', ')}).` : 'No AI plan yet (the built-in week).',
      `Workout: ${day.data?.workout_done ? 'DONE' : 'not done yet'} (${exercisesDone} of ${plannedExercises.length || 'unknown'} exercises started).`,
      `Estimated intake so far: about ${checkedKcal + loggedKcal} of ${kcalTarget} kcal.`,
      `Water: ${waterCount} of ${waterTarget} glasses.`,
    ];
    const facts = [
      `Today is ${today} (the user's local date; treat it as today).`,
      dayFacts[0],
      dayFacts[1],
      `Meals checked off: ${mealsDone.length} of ${plannedMeals.length} (${mealsDone.join(', ') || 'none yet'}), ${checkedKcal} kcal.`,
      logged.length ? `Other food logged today: ${logged.map((f) => `${f.label} (${f.kcal} kcal)`).join(', ')}.` : 'No other food logged today.',
      dayFacts[2],
      dayFacts[3],
      `Last 14 days: ${planned - missed} of ${planned} planned workouts done${missed ? `, ${missed} missed` : ''}.`,
      swaps.length ? `Recent exercise swaps: ${swaps.slice(0, 5).join('; ')}.` : '',
      moved ? `Moved workout days in ${moved} recent week(s).` : '',
      acts.length ? `Recent activities: ${acts.slice(0, 6).join(', ')}.` : '',
      lastCheckin.data?.ai_summary ? `Last ${lastCheckin.data.kind} check-in (${lastCheckin.data.day}): ${String(lastCheckin.data.ai_summary).slice(0, 300)}` : '',
    ].filter(Boolean).join(' ');

    const system = [
      'You are the BUILT coach: warm, direct, practical, never guilt-trips. You know the user\'s plan, their day and their history.',
      'Real-life mode: if the user is behind, propose the smallest next step.',
      'Answer in at most 90 words. Plain text; a short list (each line starting with "- ") and **bold** for key numbers are fine. No markdown headings, no tables, no emoji, no em dashes.',
      SAFETY_RULES,
      person.minor ? MINOR_RULES : '',
      'If the user asks to change their plan (an injury, fewer days, no equipment, too hard or too easy), say you can update it and that they can tap "Update my plan".',
      `PROFILE: ${describePerson(person)}`,
      memoryForPrompt(memory),
      'CRITICAL: the FACTS below are ground truth about the user\'s day. Never contradict them or invent numbers.',
      `FACTS: ${facts}`,
    ].filter(Boolean).join(' ');

    const turns = (history.data ?? []).reverse().map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.body }));
    const wantTitle = needsTitle(threadRow.data ?? null, history.data?.length ?? 0, userMessage);

    const ai = await aiProvider('text');
    const [replyAnswer, extracted] = await Promise.all([
      ai
        ? chat(ai, { messages: [{ role: 'system', content: system }, ...turns, { role: 'user', content: userMessage }], max_tokens: 600, temperature: 0.6, timeoutMs: 45_000 }, (t) => cleanReply(t) || null, 'coach')
        : Promise.resolve(null),
      ai
        ? chat(
            ai,
            {
              messages: [
                {
                  role: 'system',
                  content: [
                    'You read ONE user message sent to a fitness coach. You extract durable facts the coach should remember, detect plan-change requests, and suggest what the user might ask next.',
                    'Durable facts: injuries and pain, health conditions, food likes and dislikes, schedule constraints, equipment they have, preferences about training. NOT moods, not today-only events, not questions. Facts come ONLY from the MESSAGE, never from the CONTEXT.',
                    `Categories: ${['injury', 'health', 'preference', 'like', 'dislike', 'schedule', 'goal', 'equipment', 'food', 'training', 'other'].join(', ')}.`,
                    'Write each fact in the third person, short ("Left knee hurts on deep squats").',
                    'plan_change: if the user wants their plan changed, restate the request as a short instruction in their words; otherwise null.',
                    'suggestions: up to 3 short follow-up messages the USER might send the coach next, written as the user would type them to the coach (for example "Make it 30 minutes", "Swap today\'s dinner", "What should I eat after training?"). Each at most 48 characters, plain text, no emoji, no quotes, no markdown. Fit them to the MESSAGE and the CONTEXT; never repeat the message.',
                    wantTitle ? 'title: a 2 to 5 word title for this chat, naming its topic (for example "Knee friendly leg day"). No quotes, no emoji, no trailing period.' : '',
                    `Reply with ONLY JSON: {"facts":[{"fact":"...","category":"..."}],"plan_change":null,"suggestions":["..."]${wantTitle ? ',"title":"..."' : ''}}`,
                  ].filter(Boolean).join(' '),
                },
                { role: 'user', content: `CONTEXT: ${dayFacts.join(' ')}\n\nMESSAGE: ${userMessage}` },
              ],
              max_tokens: 400,
              temperature: 0,
              timeoutMs: 25_000,
            },
            (t) => extractJson(t),
            'coach:memory',
          )
        : Promise.resolve(null),
    ]);

    const reply = replyAnswer?.value || rulesReply(userMessage, facts);
    const coachAt = Math.max(Date.now(), receivedAt + 1);
    const model = replyAnswer?.model ?? 'rules';

    let newFacts = cleanFacts(extracted?.value?.facts);
    if (!extracted) newFacts = rulesFacts(userMessage);
    const aiChange = extracted ? str(extracted.value.plan_change, 300) : '';
    const suggestPlanChange = aiChange || (PLAN_CHANGE_RE.test(userMessage) ? userMessage.slice(0, 300) : '') || null;

    let suggestions = cleanSuggestions(extracted?.value?.suggestions, userMessage);
    if (!suggestions.length) {
      suggestions = rulesSuggestions({
        hasPlan: !!planDay,
        restDay: isRestDay,
        workoutDone: !!day.data?.workout_done,
        waterCount,
        waterTarget,
        kcalSoFar: checkedKcal + loggedKcal,
        kcalTarget,
        message: userMessage,
      });
    }
    const newTitle = wantTitle ? (cleanTitle(extracted?.value?.title) ?? cutTitle(userMessage)) : null;

    // Save the exchange (distinct times, so the reply always sorts after the
    // message), then update the thread; memory is saved alongside.
    const saveExchange = async () => {
      const insert = await supabase.from('coach_messages').insert([
        { user_id: user.id, role: 'user', body: userMessage, conversation_id: conversationId, created_at: new Date(receivedAt).toISOString() },
        { user_id: user.id, role: 'coach', body: reply.slice(0, 4000), conversation_id: conversationId, created_at: new Date(coachAt).toISOString() },
      ]);
      if (insert.error) {
        console.error('[coach] saving messages failed:', insert.error.message);
        return { saved: false, title: null as string | null };
      }
      const touch = await supabase.rpc('coach_thread_touch', { p_id: conversationId, p_preview: previewText(reply), p_role: 'coach', p_added: 2, p_title: newTitle });
      if (touch.error) console.warn('[coach] updating the thread failed:', touch.error.message);
      const row = touch.data as { title?: unknown } | null;
      return { saved: true, title: typeof row?.title === 'string' ? row.title : null };
    };
    const [saved, remembered] = await Promise.all([saveExchange(), saveFacts(supabase, user.id, newFacts, 'chat', memory)]);

    return json({
      reply,
      model,
      saved: saved.saved,
      suggestPlanChange,
      remembered,
      suggestions,
      thread: { id: conversationId, title: saved.title ?? newTitle ?? threadRow.data?.title ?? '' },
      remaining_today: Math.max(0, LIMITS.coach - (sentToday ?? 0) - 1),
    });
  } catch (e) {
    return serverError('coach', e);
  }
});

const NOTE_LIMIT = 6;
const NOTE_MAX = 200;

/** The client's summary of the week, validated and clamped. */
function noteFacts(raw: unknown, today: string): string {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rest = s.day === 'rest';
  const focus = str(s.focus, 60);
  const minutes = clampInt(s.minutes, 0, 240, 0);
  const done7 = clampInt(s.done7, 0, 7, 0);
  const planned7 = Math.max(done7, clampInt(s.planned7, 0, 7, 0));
  const streak = clampInt(s.streak, 0, 366, 0);
  const y = s.mealsYesterday && typeof s.mealsYesterday === 'object' ? (s.mealsYesterday as Record<string, unknown>) : null;
  const yPlanned = y ? clampInt(y.planned, 0, 8, 0) : 0;
  const yEaten = y ? Math.min(yPlanned, clampInt(y.eaten, 0, 8, 0)) : 0;
  return [
    `Today is ${today} (the user's local date).`,
    rest ? 'Plan today: rest day.' : `Plan today: ${focus || 'workout'}${minutes ? `, about ${minutes} min` : ''}, ${s.workoutDone === true ? 'already done' : 'not done yet'}.`,
    `Last 7 days: ${done7} of ${planned7} planned workouts done.`,
    `Workout streak: ${streak}.`,
    yPlanned ? `Yesterday: ${yEaten} of ${yPlanned} planned meals ticked off.` : '',
  ].filter(Boolean).join(' ');
}

/** A model reply made safe for the Today card, or null when unusable. */
function cleanNote(text: string): string | null {
  let t = text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .trim()
    .replace(/^["'\u201C\u2018]+|["'\u201D\u2019]+$/g, '')
    .trim();
  if (t.length > NOTE_MAX) {
    const cut = t.slice(0, NOTE_MAX);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end >= 40 ? cut.slice(0, end + 1) : '';
  }
  return t.length >= 12 ? t : null;
}

async function dailyNote(supabase: SupabaseClient, userId: string, b: Record<string, unknown>): Promise<Response> {
  const today = localDay(b.localDay);
  const ai = await aiProvider('text');
  if (!ai) return json({ note: '' });

  const { data: count, error: quotaErr } = await supabase.rpc('bump_ai_usage', { p_kind: 'coach', p_limit: NOTE_LIMIT });
  if (quotaErr) throw new Error(`bump_ai_usage failed: ${quotaErr.message}`);
  if (count === null || count === undefined) return limitReached('Your coach already wrote today\'s notes. A new one comes tomorrow.');

  const [person, memory] = await Promise.all([loadPerson(supabase, userId, today), loadMemory(supabase, userId)]);
  const system = [
    'You are the BUILT coach writing the one short note a person sees at the top of their Today screen.',
    `Write ONE or TWO sentences, at most ${NOTE_MAX} characters in total, in the second person ("you").`,
    'Be warm, direct and practical: one concrete thing to do today, based on their plan and week. Never guilt-trip; if they missed workouts, point to the next step.',
    'Plain text only: no greeting, no sign-off, no quotes, no markdown, no emoji, no hashtags, no em dashes or en dashes.',
    'No medical claims and no supplement advice. Never invent numbers that are not in the FACTS.',
    SAFETY_RULES,
    person.minor ? MINOR_RULES : '',
    `PROFILE: ${describePerson(person)}`,
    memoryForPrompt(memory),
    `FACTS: ${noteFacts(b.summary, today)}`,
  ].filter(Boolean).join(' ');

  const answer = await chat(
    ai,
    { messages: [{ role: 'system', content: system }, { role: 'user', content: 'Write my note for today.' }], max_tokens: 120, temperature: 0.7, timeoutMs: 20_000 },
    cleanNote,
    'coach:note',
  );
  return json({ note: answer?.value ?? '' });
}

function shift(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Facts without AI: injuries and simple likes/dislikes. */
function rulesFacts(message: string): { fact: string; category: MemoryCategory }[] {
  const out: { fact: string; category: MemoryCategory }[] = [];
  const areas = injuriesFromText(message);
  if (areas.length && /(hurt|pain|sore|injur|ache|surgery|torn|sprain)/i.test(message)) {
    out.push({ fact: `Mentioned ${areas.map((a) => a.replace('_', ' ')).join(' and ')} pain or injury: "${message.slice(0, 100)}"`, category: 'injury' });
  }
  const dislike = /\bi (?:hate|don'?t like|do not like|can'?t stand)\s+([a-z' -]{3,40})/i.exec(message);
  if (dislike) out.push({ fact: `Dislikes ${dislike[1].trim()}`, category: 'dislike' });
  const like = /\bi (?:love|really like|enjoy)\s+([a-z' -]{3,40})/i.exec(message);
  if (like) out.push({ fact: `Likes ${like[1].trim()}`, category: 'like' });
  return out;
}

function rulesReply(message: string, facts: string): string {
  const m = message.toLowerCase();
  const workoutDone = /workout: done/i.test(facts);
  const water = facts.match(/water: (\d+) of (\d+)/i);
  if (/diabet|pregnan|eating disorder|anorex|bulimi|heart|kidney|chest pain/.test(m)) {
    return 'That one is worth checking with your doctor or a registered dietitian before you change how you eat or train. I can keep helping with general habits: sleep, water and steady movement.';
  }
  if (PLAN_CHANGE_RE.test(message)) {
    return 'I can update your plan for that. Tap "Update my plan" and I\'ll rebuild the week around it.';
  }
  if (m.includes('workout') || m.includes('train')) {
    return workoutDone
      ? 'Your workout is already logged for today. Recovery is the work now: protein on your next plate and a glass of water.'
      : 'Smallest next step: one set of your first exercise. Momentum does the rest, so start there.';
  }
  if (m.includes('water') || m.includes('hydrat')) {
    return water ? `Water check: ${water[1]} of ${water[2]} glasses today. Aim to finish your target an hour before bed.` : 'Keep sipping. One glass now counts.';
  }
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. Smallest next step wins. What is it for you right now?';
}
