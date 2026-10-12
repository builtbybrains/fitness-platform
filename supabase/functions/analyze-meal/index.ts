// BUILT analyze-meal (v1 endpoint, kept for app builds already installed).
// New builds call `meals` with mode "photo", which can also ask follow-up
// questions. This one answers in one step with the v1 shape, plus the v2
// macros and items:
//
// POST { imageBase64 }  (bare base64 or a data URI of a JPEG)
// → 200 { estimate: { label, kcal, protein, carbs, fat, confidence, items }, model }
//
// Same AI chain, limits (30 photos a day, shared with `meals`) and errors
// as `meals` photo mode. Nothing is saved here.

import { fail, json, preflight, serverError } from '../_shared/http.ts';
import { requireUser } from '../_shared/env.ts';
import { aiProvider } from '../_shared/ai.ts';
import { analyzePhoto } from '../_shared/meals.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const ai = await aiProvider('vision');
    if (!ai) return fail('not_configured', "Photo estimates aren't set up yet.", 503);

    const auth = await requireUser(req, 'Sign in to log meals from a photo.');
    if (auth instanceof Response) return auth;
    const { supabase } = auth;

    const { imageBase64 } = await req.json().catch(() => ({ imageBase64: '' }));
    const image = String(imageBase64 ?? '').replace(/^data:image\/\w+;base64,/, '');
    if (!image) return fail('bad_request', 'Choose a photo first.', 400);
    if (image.length > 2_500_000) return fail('payload_too_large', 'That photo is too large. Try a smaller one.', 413);

    if (!(await takeQuota(supabase, 'meal_photo'))) {
      return limitReached(`You've checked ${LIMITS.meal_photo} photos today, the daily limit. Try again tomorrow.`);
    }

    const result = await analyzePhoto(ai, image, '', false);
    if (!result) return fail('ai_busy', 'Photo check is busy right now. Try again in a moment.', 502);
    const est = result.status === 'final' ? result.estimate : result.draft;
    return json({ estimate: est, model: result.model });
  } catch (e) {
    return serverError('analyze-meal', e);
  }
});
