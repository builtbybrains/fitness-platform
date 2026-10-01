// BUILT AI coach: the only place the AI key lives.
// Deploy: supabase functions deploy coach --project-ref <ref>
// AI provider and model: see ../_shared/ai.ts (OPENROUTER_API_KEY or
// OPENAI_API_KEY; AI_MODEL overrides the default free model chain).
// With no key at all the function answers with built-in coaching rules.
//
// The client calls this with the user's Supabase JWT plus the device's local
// date (localDay), because the server's UTC "today" can differ from the
// user's day. The function reads the user's real stats from Postgres (RLS
// applies through the user's own token; no service-role key is used), builds
// a short coach prompt, asks the model, and stores both messages.
//
// Limit: 60 user messages per person per UTC day, counted from
// coach_messages (people can't delete their own coach messages; see
// schema.sql). Over the limit the function answers HTTP 429.
//
// Conversations: the client sends conversationId ("default" for the original
// chat); history is scoped to that conversation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { CORS, json, serverError } from '../_shared/http.ts';
import { aiConfig, chat } from '../_shared/ai.ts';
import { SAFETY_RULES } from '../_shared/safety.ts';
import { LIMITS, limitReached, utcDayStart } from '../_shared/usage.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sign in to talk to your coach.' }, 401);

    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.message ?? '').trim().slice(0, 800);
    if (!userMessage) return json({ error: 'Type a message first.' }, 400);
    const conversationId = String(body?.conversationId ?? 'default').trim().slice(0, 60) || 'default';
    // The client's LOCAL calendar day (yyyy-mm-dd), not the server's UTC day.
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.localDay ?? ''))
      ? String(body.localDay)
      : new Date().toISOString().slice(0, 10);

    // ── daily limit ──
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

    // Today's real stats (RLS-scoped to this user).
    const [day, waterRow, profile, foodLogs, planRow] = await Promise.all([
      supabase.from('plan_days').select('workout_done, exercises_done, meals_done')
        .eq('user_id', user.id).eq('day', today).maybeSingle(),
      supabase.from('water').select('count').eq('user_id', user.id).eq('day', today).maybeSingle(),
      supabase.from('profiles').select('name, kcal_target, water_target, age').eq('id', user.id).maybeSingle(),
      supabase.from('food_logs').select('label, kcal, protein').eq('user_id', user.id).eq('day', today).order('created_at'),
      supabase.from('ai_plans').select('plan').eq('user_id', user.id).maybeSingle(),
    ]);

    // The plan is a generic Mon→Sun week; find today's entry so we can report
    // planned-vs-done (the client checklist only stores what's checked).
    const planDays = (planRow.data?.plan as { days?: { session?: { kind?: string; exercises?: unknown[] }; meals?: { slot?: string; kcal?: number }[] }[] } | null)?.days;
    const planDay = Array.isArray(planDays) && planDays.length === 7
      ? planDays[(new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7]
      : undefined;
    const plannedMeals = Array.isArray(planDay?.meals) ? planDay!.meals : [];
    const plannedMealCount = plannedMeals.length;
    const plannedKcal = plannedMeals.reduce((a, m) => a + (Number(m?.kcal) || 0), 0);
    const plannedExercises = planDay?.session?.kind === 'workout' && Array.isArray(planDay.session.exercises)
      ? planDay.session.exercises.length
      : 0;
    const isRestDay = planDay?.session?.kind === 'rest';

    const exercisesDone = Array.isArray(day.data?.exercises_done)
      ? (day.data.exercises_done as unknown[]).filter((r) => Array.isArray(r) && r.length > 0).length
      : 0;
    const mealsDone: string[] = Array.isArray(day.data?.meals_done) ? day.data.meals_done : [];
    const checkedKcal = plannedMeals
      .filter((m) => mealsDone.includes(String(m?.slot ?? '')))
      .reduce((a, m) => a + (Number(m?.kcal) || 0), 0);
    const waterCount = waterRow.data?.count ?? 0;
    const photoLogs = (foodLogs.data ?? []).map((f) => `${f.label} (${f.kcal} kcal)`);
    const photoKcal = (foodLogs.data ?? []).reduce((a, f) => a + (Number(f.kcal) || 0), 0);
    const kcalTarget = profile.data?.kcal_target ?? 2200;
    const estimatedIntake = checkedKcal + photoKcal;
    const age = Number(profile.data?.age);

    const facts = [
      `User: ${profile.data?.name || 'athlete'}.`,
      Number.isFinite(age) && age > 0 ? `Age: ${age}.` : '',
      `Today is ${today} (the user's local date; treat it as today, never second-guess it).`,
      isRestDay
        ? 'Plan today: REST / recovery day.'
        : `Plan today: workout with ${plannedExercises} exercises.`,
      `Workout: ${day.data?.workout_done ? 'DONE' : 'not done yet'} (${exercisesDone} of ${plannedExercises || 'unknown'} exercises started).`,
      `Meals: ${mealsDone.length} of ${plannedMealCount} checked off (${mealsDone.length ? mealsDone.join(', ') : 'none yet'}).`,
      `Planned meals today total ${plannedKcal} kcal; checked-off meals so far = ${checkedKcal} kcal.`,
      `Water: ${waterCount} of ${profile.data?.water_target ?? 8} glasses.`,
      `Daily calorie goal: ${kcalTarget} kcal.`,
      photoLogs.length
        ? `Extra food logged from photos: ${photoLogs.join(', ')}; adds ${photoKcal} kcal on top of checked-off plan meals.`
        : 'No extra food logged from photos today.',
      `Estimated intake so far: about ${estimatedIntake} of ${kcalTarget} kcal (checked meals + photo log).`,
    ].filter(Boolean).join(' ');

    const system = [
      'You are the BUILT coach: warm, direct, budget-aware, never guilt-trips.',
      'Real-life mode: if the user is behind, propose the smallest next step.',
      'Answer in at most 90 words, plain text, no markdown headings.',
      SAFETY_RULES,
      'CRITICAL: the FACTS line below is ground truth about the user\'s day. Never claim a workout is undone when the facts say it is done, and never invent numbers that contradict the facts.',
      `FACTS: ${facts}`,
    ].join(' ');

    // Recent history for context (oldest → newest), scoped to this conversation.
    const { data: history } = await supabase
      .from('coach_messages')
      .select('role, body')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10);
    const turns = (history ?? []).reverse()
      .map((m) => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.body }));

    let reply = '';
    let model = 'rules';
    const ai = aiConfig({
      modelEnv: 'AI_MODEL',
      openRouterDefaults: ['nvidia/nemotron-3-super-120b-a12b:free', 'dots-studio/dots-3-note-preview:free'],
      openAiDefault: 'gpt-4o-mini',
    });
    if (ai) {
      const answer = await chat(
        ai,
        {
          messages: [{ role: 'system', content: system }, ...turns, { role: 'user', content: userMessage }],
          max_tokens: 600,
          temperature: 0.6,
          timeoutMs: 45_000,
        },
        (text) => text || null,
        'coach',
      );
      if (answer) {
        reply = answer.value;
        model = answer.model;
      }
    }
    if (!reply) reply = rulesReply(userMessage, facts);

    const { error: insertErr } = await supabase.from('coach_messages').insert([
      { user_id: user.id, role: 'user', body: userMessage, conversation_id: conversationId },
      { user_id: user.id, role: 'coach', body: reply.slice(0, 4000), conversation_id: conversationId },
    ]);
    if (insertErr) {
      // The person still gets the answer; it just won't be in their history.
      console.error('[coach] saving messages failed:', insertErr.message);
    }

    return json({ reply, model, saved: !insertErr });
  } catch (e) {
    return serverError('coach', e);
  }
});

function rulesReply(message: string, facts: string): string {
  const m = message.toLowerCase();
  const workoutDone = /workout: done/i.test(facts);
  const water = facts.match(/water: (\d+) of (\d+)/i);
  if (/diabet|pregnan|eating disorder|anorex|bulimi|heart|kidney|chest pain/.test(m)) {
    return 'That one is worth checking with your doctor or a registered dietitian before you change how you eat or train. I can keep helping with general habits: sleep, water and steady movement.';
  }
  if (m.includes('workout') || m.includes('train')) {
    return workoutDone
      ? 'Your workout is already logged for today. Recovery is the work now: protein on your next plate and a glass of water.'
      : 'Smallest next step: one set of your first exercise. Momentum does the rest, so start there.';
  }
  if (m.includes('water') || m.includes('hydrat')) {
    return water
      ? `Water check: ${water[1]} of ${water[2]} glasses today. Aim to finish your target an hour before bed.`
      : 'Keep sipping. One glass now counts.';
  }
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. Smallest next step wins. What is it for you right now?';
}
