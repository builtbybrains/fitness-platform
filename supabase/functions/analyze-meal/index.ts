// BUILT food-photo analyzer: turns a meal photo into a calorie estimate.
// Deploy: supabase functions deploy analyze-meal --project-ref <ref>
// AI provider and model: see ../_shared/ai.ts (OPENROUTER_API_KEY or
// OPENAI_API_KEY; VISION_MODEL overrides the default free vision chain and
// must accept images). Without a key it answers 503 "not set up yet".
//
// The client sends { imageBase64 } (bare base64 or a data URI of a JPEG).
// We ask a vision model for ONLY a JSON object {label, kcal, protein,
// confidence}, then return it. The app stores the row itself (food_logs,
// RLS-scoped) once the user confirms the estimate, so a "retake" never
// leaves an orphan row behind. Runs entirely on the user's own client; no
// service-role key.
//
// Limit: 30 photo estimates per person per UTC day (public.ai_usage).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { CORS, json, serverError } from '../_shared/http.ts';
import { aiConfig, chat } from '../_shared/ai.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

const SYSTEM = [
  'You are a nutrition estimator. You look at a photo of food and estimate its nutrition.',
  'Reply with ONLY a JSON object, no prose, no markdown:',
  '{"label":"<short dish name, max 6 words>","kcal":<total calories as integer>,"protein":<grams as integer>,"confidence":"low"|"medium"|"high"}',
  'kcal: realistic total energy for everything visible in the photo (drinks and sauces count).',
  'protein: estimated grams of protein for the same items.',
  'confidence: how certain the food identification is ("low" for ambiguous or distant shots).',
  'Never comment on the person\'s body, weight or health; describe only the food.',
  'If the photo contains no identifiable food, reply exactly {"label":"No food detected","kcal":0,"protein":0,"confidence":"low"}.',
].join(' ');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const ai = aiConfig({
      modelEnv: 'VISION_MODEL',
      openRouterDefaults: ['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', 'dots-studio/dots-3-note-preview:free'],
      openAiDefault: 'gpt-4o-mini',
    });
    if (!ai) return json({ error: "Photo estimates aren't set up yet." }, 503);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sign in to log meals from a photo.' }, 401);

    const { imageBase64 } = await req.json().catch(() => ({ imageBase64: '' }));
    const image = String(imageBase64 ?? '').replace(/^data:image\/\w+;base64,/, '');
    if (!image) return json({ error: 'Choose a photo first.' }, 400);
    if (image.length > 2_500_000) return json({ error: 'That photo is too large. Try a smaller one.' }, 413);

    if (!(await takeQuota(supabase, 'meal_photo'))) {
      return limitReached(`You've checked ${LIMITS.meal_photo} photos today, the daily limit. Try again tomorrow.`);
    }

    const answer = await chat(
      ai,
      {
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Estimate the nutrition of this meal.' },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0.2,
        timeoutMs: 60_000,
      },
      parseEstimate,
      'analyze-meal',
    );
    if (!answer) return json({ error: 'Photo check is busy right now. Try again in a moment.' }, 502);
    return json({ estimate: answer.value, model: answer.model });
  } catch (e) {
    return serverError('analyze-meal', e);
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
