// VITAL food-photo analyzer — turns a meal photo into a calorie estimate.
// Deploy: supabase functions deploy analyze-meal --project-ref <ref>
//
// The client sends { imageBase64 } (bare base64 or a data URI of a JPEG).
// We ask a free vision model on OpenRouter for ONLY a JSON object
// {label, kcal, protein, confidence}, then return it. The app stores the row
// itself (food_logs, RLS-scoped) once the user confirms the estimate — so a
// "retake" never leaves an orphan row behind.
//
// Free-tier vision models intermittently return upstream capacity errors, so
// we walk a fallback chain. Override the first pick with the VISION_MODEL
// secret if needed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM = [
  'You are a nutrition estimator. You look at a photo of food and estimate its nutrition.',
  'Reply with ONLY a JSON object, no prose, no markdown:',
  '{"label":"<short dish name, max 6 words>","kcal":<total calories as integer>,"protein":<grams as integer>,"confidence":"low"|"medium"|"high"}',
  'kcal: realistic total energy for everything visible in the photo (drinks and sauces count).',
  'protein: estimated grams of protein for the same items.',
  'confidence: how certain the food identification is ("low" for ambiguous or distant shots).',
  'If the photo contains no identifiable food, reply exactly {"label":"No food detected","kcal":0,"protein":0,"confidence":"low"}.',
].join(' ');

const MODEL_CHAIN = [
  ...(Deno.env.get('VISION_MODEL') ? [Deno.env.get('VISION_MODEL')!] : []),
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
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
    if (!Deno.env.get('OPENROUTER_API_KEY')) {
      return json({ error: 'Vision is not configured yet' }, 503);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Not signed in' }, 401);

    const { imageBase64 } = await req.json().catch(() => ({ imageBase64: '' }));
    const image = String(imageBase64 ?? '').replace(/^data:image\/\w+;base64,/, '');
    if (!image) return json({ error: 'imageBase64 is required' }, 400);
    if (image.length > 2_500_000) return json({ error: 'Image too large' }, 413);

    const messages = [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Estimate the nutrition of this meal.' },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
        ],
      },
    ];

    let lastError = 'Vision model unavailable';
    for (const model of MODEL_CHAIN) {
      try {
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: OPENROUTER_HEADERS,
          signal: AbortSignal.timeout(60_000),
          body: JSON.stringify({
            model,
            messages,
            max_tokens: 800,
            temperature: 0.2,
            // Reasoning models otherwise spend the token budget (and leak)
            // chain-of-thought; this makes them answer directly.
            reasoning: { enabled: false },
          }),
        });
        if (!r.ok) {
          lastError = `${model} -> HTTP ${r.status}`;
          continue;
        }
        const j = await r.json();
        const text = String(j.choices?.[0]?.message?.content ?? '');
        const estimate = parseEstimate(text);
        if (!estimate) {
          lastError = `${model} -> unparseable reply`;
          continue;
        }
        return json({ estimate, model });
      } catch (e) {
        lastError = `${model} -> ${String(e?.message ?? e)}`;
      }
    }

    return json({ error: 'The vision model is busy right now — try again in a moment.', detail: lastError }, 502);
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function parseEstimate(text: string): { label: string; kcal: number; protein: number; confidence: string } | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1));
    const label = String(raw.label ?? '').trim().slice(0, 120);
    if (!label) return null;
    const clamp = (v: unknown, lo: number, hi: number) =>
      Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
    const confidence = ['low', 'medium', 'high'].includes(raw.confidence) ? raw.confidence : 'medium';
    return { label, kcal: clamp(raw.kcal, 0, 5000), protein: clamp(raw.protein, 0, 300), confidence };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}
