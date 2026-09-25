// VITAL AI coach — the ONLY place the AI key lives.
// Deploy: supabase functions deploy coach --project-ref <ref>
// Set the key as a secret: supabase secrets set OPENAI_API_KEY=sk-...
//
// The client calls this with the user's Supabase JWT; the function reads the
// user's real stats from Postgres (RLS applies through the user's token),
// builds a short coach prompt, asks the model, and stores both messages.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { message } = await req.json().catch(() => ({ message: '' }));
    const userMessage = String(message ?? '').trim().slice(0, 800);
    if (!userMessage) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      });
    }

    // Today's real stats (RLS-scoped to this user).
    const today = new Date().toISOString().slice(0, 10);
    const [day, waterRow, profile] = await Promise.all([
      supabase.from('plan_days').select('workout_done, exercises_done, meals_done')
        .eq('day', today).maybeSingle(),
      supabase.from('water').select('count').eq('day', today).maybeSingle(),
      supabase.from('profiles').select('name, kcal_target, water_target').eq('id', user.id).maybeSingle(),
    ]);

    const exercisesDone = Array.isArray(day.data?.exercises_done) ? day.data.exercises_done.length : 0;
    const mealsDone = Array.isArray(day.data?.meals_done) ? day.data.meals_done.length : 0;
    const waterCount = waterRow.data?.count ?? 0;

    const facts = `User: ${profile.data?.name || 'athlete'}. Today ${today}: ` +
      `workout ${day.data?.workout_done ? 'done' : 'not done yet'}, ` +
      `${exercisesDone} exercises logged, ${mealsDone}/4 meals, ` +
      `water ${waterCount}/${profile.data?.water_target ?? 8} glasses.`;

    const system = [
      'You are the VITAL coach: warm, direct, budget-aware, never guilt-trips.',
      'Real-life mode: if the user is behind, propose the smallest next step.',
      'Answer in at most 90 words, plain text, no markdown headings.',
      `Facts: ${facts}`,
    ].join(' ');

    // Recent history for context (oldest → newest).
    const { data: history } = await supabase
      .from('coach_messages')
      .select('role, body')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    const turns = (history ?? []).reverse()
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.body }));

    let reply: string;
    const key = Deno.env.get('OPENAI_API_KEY');
    if (!key) {
      reply = rulesReply(userMessage, facts);
    } else {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: system },
              ...turns,
              { role: 'user', content: userMessage },
            ],
            max_tokens: 220,
            temperature: 0.6,
          }),
        });
        if (!r.ok) throw new Error(`OpenAI ${r.status}`);
        const j = await r.json();
        reply = String(j.choices?.[0]?.message?.content ?? '').trim();
        if (!reply) throw new Error('Empty completion');
      } catch {
        reply = rulesReply(userMessage, facts);
      }
    }

    await supabase.from('coach_messages').insert([
      { user_id: user.id, role: 'user', body: userMessage },
      { user_id: user.id, role: 'coach', body: reply },
    ]);

    return new Response(JSON.stringify({ reply }), {
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
  if (m.includes('water') || m.includes('hydrat')) {
    return `Water check: ${facts.match(/water \d+\/\d+/)?.[0] ?? 'log your glasses'}. Aim to finish your target an hour before bed — smallest next step: one glass now.`;
  }
  if (m.includes('protein') || m.includes('eat') || m.includes('meal')) {
    return 'Anchor every meal with protein: eggs or Greek yogurt at breakfast, a palm of chicken, fish or lentils at lunch and dinner. Budget picks: canned tuna, cottage cheese, frozen veg.';
  }
  if (m.includes('tired') || m.includes('rest') || m.includes('skip')) {
    return `Real-life mode: a 10-minute walk still counts and breaks no streaks. ${facts.includes('workout done') ? 'Today is already logged — recovery is the work now.' : 'Start with one set. Momentum does the rest.'}`;
  }
  return 'Keep it simple today: one workout, protein on every plate, water before 6pm. Smallest next step wins — what is it for you right now?';
}
