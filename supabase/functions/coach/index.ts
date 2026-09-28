// VITAL AI coach — the ONLY place the AI key lives.
// Deploy: supabase functions deploy coach --project-ref <ref>
// AI provider (first set wins):
//   supabase secrets set OPENROUTER_API_KEY=sk-or-...   # OpenRouter (any model)
//   supabase secrets set OPENAI_API_KEY=sk-...          # OpenAI directly
// Optional: supabase secrets set AI_MODEL=openai/gpt-4o-mini
// With no key at all the function answers with built-in coaching rules.
//
// The client calls this with the user's Supabase JWT plus the device's local
// date (localDay) — the server's UTC "today" can differ from the user's day.
// The function reads the user's real stats from Postgres (RLS applies through
// the user's token), builds a short coach prompt, asks the model, and stores
// both messages. Free-tier models intermittently fail, so we walk a fallback
// chain before settling for the built-in rules reply.
//
// Conversations: the client sends conversationId ("default" for the original
// chat); history is scoped to that conversation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL_CHAIN = [
  ...(Deno.env.get('AI_MODEL') ? [Deno.env.get('AI_MODEL')!] : []),
  'nvidia/nemotron-3-super-120b-a12b:free',
  'dots-studio/dots-3-note-preview:free',
];

const OPENROUTER_HEADERS = {
  'content-type': 'application/json',
  authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY') ?? ''}`,
  'HTTP-Referer': 'https://vital.app',
  'X-Title': 'VITAL',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not signed in' }), {
        status: 401,
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const userMessage = String(body?.message ?? '').trim().slice(0, 800);
    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }
    const conversationId = String(body?.conversationId ?? 'default').trim().slice(0, 60) || 'default';
    // The client's LOCAL calendar day (yyyy-mm-dd) — not the server's UTC day.
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.localDay ?? ''))
      ? String(body.localDay)
      : new Date().toISOString().slice(0, 10);

    // Today's real stats (RLS-scoped to this user).
    const [day, waterRow, profile, foodLogs, planRow] = await Promise.all([
      supabase.from('plan_days').select('workout_done, exercises_done, meals_done')
        .eq('day', today).maybeSingle(),
      supabase.from('water').select('count').eq('day', today).maybeSingle(),
      supabase.from('profiles').select('name, kcal_target, water_target').eq('id', user.id).maybeSingle(),
      supabase.from('food_logs').select('label, kcal, protein').eq('day', today).order('created_at'),
      supabase.from('ai_plans').select('plan').eq('user_id', user.id).maybeSingle(),
    ]);

    // The plan is a generic Mon→Sun week; find today's entry so we can report
    // planned-vs-done (the client checklist only stores what's checked).
    const planDays = (planRow.data?.plan as { days?: { session?: { kind?: string; exercises?: unknown[] }; meals?: { slot?: string; kcal?: number }[] }[] } | null)?.days;
    const planDay = Array.isArray(planDays) && planDays.length === 7
      ? planDays[(new Date(`${today}T12:00:00`).getDay() + 6) % 7]
      : undefined;
    const plannedMeals = Array.isArray(planDay?.meals) ? planDay!.meals : [];
    const plannedMealCount = plannedMeals.length;
    const plannedKcal = plannedMeals.reduce((a, m) => a + (Number(m?.kcal) || 0), 0);
    const plannedExercises = planDay?.session?.kind === 'workout' && Array.isArray(planDay.session.exercises)
      ? planDay.session.exercises.length
      : 0;
    const isRestDay = planDay?.session?.kind === 'rest';

    const exercisesDone = Array.isArray(day.data?.exercises_done) ? day.data.exercises_done.length : 0;
    const mealsDone = Array.isArray(day.data?.meals_done) ? day.data.meals_done : [];
    const checkedKcal = plannedMeals
      .filter((m) => mealsDone.includes(String(m?.slot ?? '')))
      .reduce((a, m) => a + (Number(m?.kcal) || 0), 0);
    const waterCount = waterRow.data?.count ?? 0;
    const photoLogs = (foodLogs.data ?? []).map((f) => `${f.label} (${f.kcal} kcal)`);
    const photoKcal = (foodLogs.data ?? []).reduce((a, f) => a + (Number(f.kcal) || 0), 0);
    const kcalTarget = profile.data?.kcal_target ?? 2200;
    const estimatedIntake = checkedKcal + photoKcal;

    const facts = [
      `User: ${profile.data?.name || 'athlete'}.`,
      `Today is ${today} (the user's local date — treat it as today, never second-guess it).`,
      isRestDay
        ? 'Plan today: REST / recovery day.'
        : `Plan today: workout with ${plannedExercises} exercises.`,
      `Workout: ${day.data?.workout_done ? 'DONE' : 'not done yet'} (${exercisesDone} of ${plannedExercises || 'unknown'} exercises logged).`,
      `Meals: ${mealsDone.length} of ${plannedMealCount} checked off (${mealsDone.length ? mealsDone.join(', ') : 'none yet'}).`,
      `Planned meals today total ${plannedKcal} kcal; checked-off meals so far = ${checkedKcal} kcal.`,
      `Water: ${waterCount} of ${profile.data?.water_target ?? 8} glasses.`,
      `Daily calorie goal: ${kcalTarget} kcal.`,
      photoLogs.length
        ? `Extra food logged from photos: ${photoLogs.join(', ')} — adds ${photoKcal} kcal on top of checked-off plan meals.`
        : 'No extra food logged from photos today.',
      `Estimated intake so far: about ${estimatedIntake} of ${kcalTarget} kcal (checked meals + photo log).`,
    ].join(' ');

    const system = [
      'You are the VITAL coach: warm, direct, budget-aware, never guilt-trips.',
      'Real-life mode: if the user is behind, propose the smallest next step.',
      'Answer in at most 90 words, plain text, no markdown headings.',
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
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.body }));

    let reply = '';
    let model = 'rules';
    if (Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('OPENAI_API_KEY')) {
      for (const candidate of MODEL_CHAIN) {
        try {
          const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: OPENROUTER_HEADERS,
            signal: AbortSignal.timeout(45_000),
            body: JSON.stringify({
              model: candidate,
              messages: [
                { role: 'system', content: system },
                ...turns,
                { role: 'user', content: userMessage },
              ],
              max_tokens: 600,
              temperature: 0.6,
              // Reasoning models otherwise spend the token budget (and leak)
              // chain-of-thought; this makes them answer directly.
              reasoning: { enabled: false },
            }),
          });
          if (!r.ok) continue;
          const j = await r.json();
          const text = String(j.choices?.[0]?.message?.content ?? '').trim();
          if (!text) continue;
          reply = text;
          model = candidate;
          break;
        } catch {
          /* try the next model in the chain */
        }
      }
    }
    if (!reply) reply = rulesReply(userMessage, facts);

    await supabase.from('coach_messages').insert([
      { user_id: user.id, role: 'user', body: userMessage, conversation_id: conversationId },
      { user_id: user.id, role: 'coach', body: reply, conversation_id: conversationId },
    ]);

    return new Response(JSON.stringify({ reply, model }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    });
  }
});

function rulesReply(message: string, facts: string): string {
  const m = message.toLowerCase();
  const workoutDone = /workout: DONE/.test(facts);
  const water = facts.match(/water: (\d+) of (\d+)/);
  if (m.includes('workout') || m.includes('train')) {
    return workoutDone
      ? 'Your workout is already logged for today — recovery is the work now: protein on your next plate and a glass of water.'
      : 'Smallest next step: one set of your first exercise. Momentum does the rest — start there.';
  }
  if (m.includes('water') || m.includes('hydrat')) {
    return water ? `Water check: ${water[1]} of ${water[2]} glasses today. Aim to finish your target an hour before bed.` : 'Keep sipping — one glass now counts.';
  }
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. Smallest next step wins — what is it for you right now?';
}
