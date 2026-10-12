// BUILT meals: everything food the AI helps with.
// Deploy: supabase functions deploy meals --project-ref <ref>
//
// POST { mode, … }  (full shapes and examples: docs/API.md, "meals")
//   mode "photo"    { imageBase64, note? }             → FoodAnalysis
//   mode "text"     { text }  e.g. "2 eggs, 1 pita, labneh" → FoodAnalysis
//   mode "answer"   { draft, questions, answers }       → { status: "final", estimate }
//   mode "swap"     { meal, reason? }                   → { options: PlanMeal[] }
//   mode "generate" { have, slot?, kcal? }               → { meal: PlanMeal & { steps } }
// FoodAnalysis is { status: "questions", draft, questions } when a follow-up
// would change the estimate a lot (portion, oil, sauce, drink), or
// { status: "final", estimate }. Nothing is saved here: the app saves the
// confirmed estimate to food_logs itself, so "retake" leaves nothing behind.
//
// Without an AI key: typed food and swaps still work (built-in food table
// and meal library); photos and "generate" answer 503 not_configured.
// Limits per person per UTC day: photos 30, typed food and answers 60,
// swaps 30, generated meals 20.

import { body, fail, json, localDay, preflight, serverError } from '../_shared/http.ts';
import { requireUser } from '../_shared/env.ts';
import { aiProvider, str } from '../_shared/ai.ts';
import { cleanEstimate, cleanMeal, cleanQuestions, type FoodEstimate } from '../_shared/food.ts';
import { analyzePhoto, analyzeText, finalise, generateMeal, isSlot, swapMeal } from '../_shared/meals.ts';
import { loadPerson } from '../_shared/profile.ts';
import { LIMITS, limitReached, takeQuota } from '../_shared/usage.ts';

const MAX_IMAGE_BASE64 = 2_500_000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  try {
    const auth = await requireUser(req, 'Sign in to log food with BUILT.');
    if (auth instanceof Response) return auth;
    const { supabase, user } = auth;
    const b = await body(req);
    const mode = String(b.mode ?? '');

    switch (mode) {
      case 'photo': {
        const image = String(b.imageBase64 ?? '').replace(/^data:image\/\w+;base64,/, '');
        if (!image) return fail('bad_request', 'Choose a photo first.', 400);
        if (image.length > MAX_IMAGE_BASE64) return fail('payload_too_large', 'That photo is too large. Try a smaller one.', 413);
        const ai = await aiProvider('vision');
        if (!ai) return fail('not_configured', "Photo estimates aren't set up yet. Type what you ate instead.", 503);
        if (!(await takeQuota(supabase, 'meal_photo'))) {
          return limitReached(`You've checked ${LIMITS.meal_photo} photos today, the daily limit. Type what you ate instead, or try again tomorrow.`);
        }
        const result = await analyzePhoto(ai, image, str(b.note, 200));
        if (!result) return fail('ai_busy', 'Photo check is busy right now. Try again in a moment, or type what you ate.', 502);
        return json(result);
      }

      case 'text': {
        const text = str(b.text, 600);
        if (!text) return fail('bad_request', 'Type what you ate first.', 400);
        if (!(await takeQuota(supabase, 'food_text'))) {
          return limitReached(`You've logged ${LIMITS.food_text} foods by text today, the daily limit. Try again tomorrow.`);
        }
        return json(await analyzeText(await aiProvider('text'), text));
      }

      case 'answer': {
        const draftRaw = b.draft && typeof b.draft === 'object' ? (b.draft as Record<string, unknown>) : null;
        const source = draftRaw?.source === 'photo' ? 'photo' : draftRaw?.source === 'generated' ? 'generated' : 'text';
        const draft: FoodEstimate | null = draftRaw ? cleanEstimate(draftRaw, source) : null;
        const answers = Array.isArray(b.answers)
          ? b.answers
              .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
              .map((a) => ({ id: str(a.id, 40), answer: str(a.answer, 200) }))
              .filter((a) => a.id && a.answer)
              .slice(0, 5)
          : [];
        if (!draft) return fail('bad_request', 'Start a new estimate first.', 400);
        if (!answers.length) return json({ status: 'final', estimate: draft, model: 'none' });
        if (!(await takeQuota(supabase, 'food_text'))) {
          return limitReached(`You've reached today's limit for food estimates. Save this one as it is, or try again tomorrow.`);
        }
        const { estimate, model } = await finalise(await aiProvider('text'), draft, cleanQuestions(b.questions), answers);
        return json({ status: 'final', estimate, model });
      }

      case 'swap': {
        const raw = b.meal && typeof b.meal === 'object' ? (b.meal as Record<string, unknown>) : null;
        const slot = isSlot(raw?.slot) ? raw!.slot : null;
        const meal = raw && slot ? cleanMeal(raw, slot) : null;
        if (!meal) return fail('bad_request', 'Pick a meal from your plan to swap.', 400);
        if (!(await takeQuota(supabase, 'meal_swap'))) {
          return limitReached(`You've swapped ${LIMITS.meal_swap} meals today, the daily limit. Try again tomorrow.`);
        }
        const person = await loadPerson(supabase, user.id, localDay(b.localDay));
        const { options, model } = await swapMeal(await aiProvider('text'), meal, str(b.reason, 200), person);
        if (!options.length) return fail('ai_busy', "We couldn't find a swap that fits your diet right now. Try again in a moment.", 502);
        return json({ options, model });
      }

      case 'generate': {
        const have = str(b.have, 500);
        if (!have) return fail('bad_request', 'List what you have at home first.', 400);
        const slot = isSlot(b.slot) ? b.slot : 'Lunch';
        const kcal = Number(b.kcal) > 0 ? Math.min(2000, Math.round(Number(b.kcal))) : null;
        const ai = await aiProvider('text');
        if (!ai) return fail('not_configured', "Meal ideas aren't set up yet.", 503);
        if (!(await takeQuota(supabase, 'meal_generate'))) {
          return limitReached(`You've asked for ${LIMITS.meal_generate} meal ideas today, the daily limit. Try again tomorrow.`);
        }
        const person = await loadPerson(supabase, user.id, localDay(b.localDay));
        const result = await generateMeal(ai, have, slot, kcal, person);
        if (!result) return fail('ai_busy', "Couldn't come up with a meal right now. Try again in a moment.", 502);
        return json(result);
      }

      default:
        return fail('bad_request', 'Unknown request.', 400);
    }
  } catch (e) {
    return serverError('meals', e);
  }
});
