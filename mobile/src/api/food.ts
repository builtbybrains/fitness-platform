/* Food with AI (Edge Function `meals`).

   Logging food (photo or typed):
     const a = await analyzeFood(userId, { text: '2 eggs, 1 pita, labneh' });
     if (a.status === 'questions') {
       // show a.questions (tap options or free text), then:
       const est = await answerFoodQuestions(userId, a.draft, a.questions, answers);
     }
     // show the estimate, let the person confirm or edit, then save it with
     // foodLogs.ts using foodLogRow(...) for the row.
   Off-plan food counts toward the day's calories.

   Plan meals: swapMeal() gives 3 options with similar calories and
   protein; generateMealFromHome() makes one meal from what they have.
   All of these need an account. */

import { invoke, requireAccount } from './client';
import { ApiError } from './errors';
import { todayId } from '../lib/dates';
import { base64Bytes, stripDataUri } from './base64';
import type { FoodAnalysis, FoodAnswer, FoodEstimate, FoodLogRowV2, FoodQuestion, GeneratedMeal, MealSlot, PlanMealV2 } from '../types';

const FOOD_ACCOUNT = 'Food estimates need an account. Sign up free to use them.';
const MAX_PHOTO_BYTES = 1_800_000;

/** Estimate a meal from a photo (JPEG base64, ideally resized to about
    1024 px first) or from text. */
export async function analyzeFood(userId: string, input: { photoBase64: string; note?: string } | { text: string }): Promise<FoodAnalysis> {
  requireAccount(userId, FOOD_ACCOUNT);
  if ('text' in input) {
    const text = input.text.trim();
    if (!text) throw new ApiError('bad_request', 'Type what you ate first.', 400);
    return invoke<FoodAnalysis>('meals', { mode: 'text', text: text.slice(0, 600) });
  }
  const image = stripDataUri(input.photoBase64);
  if (!image) throw new ApiError('bad_request', 'Choose a photo first.', 400);
  if (base64Bytes(image) > MAX_PHOTO_BYTES) throw new ApiError('payload_too_large', 'That photo is too large. Try a smaller one.', 413);
  return invoke<FoodAnalysis>('meals', { mode: 'photo', imageBase64: image, note: input.note ?? '' });
}

/** Finalise an estimate with the person's answers. With no answers the
    draft comes back as the final estimate. */
export async function answerFoodQuestions(userId: string, draft: FoodEstimate, questions: FoodQuestion[], answers: FoodAnswer[]): Promise<FoodEstimate> {
  requireAccount(userId, FOOD_ACCOUNT);
  const data = await invoke<{ status: 'final'; estimate: FoodEstimate }>('meals', { mode: 'answer', draft, questions, answers });
  return data.estimate;
}

/** Three alternatives for a planned meal: similar calories (within 10%),
    at least as much protein, within their diet, allergies and dislikes. */
export async function swapMeal(userId: string, meal: PlanMealV2, reason?: string): Promise<PlanMealV2[]> {
  requireAccount(userId, FOOD_ACCOUNT);
  const data = await invoke<{ options: PlanMealV2[] }>('meals', { mode: 'swap', meal, reason: reason ?? '', localDay: todayId() });
  return Array.isArray(data.options) ? data.options : [];
}

/** One meal from what they have at home ("eggs, tomatoes, pita"). */
export async function generateMealFromHome(userId: string, have: string, opts: { slot?: MealSlot; kcal?: number } = {}): Promise<GeneratedMeal> {
  requireAccount(userId, FOOD_ACCOUNT);
  if (!have.trim()) throw new ApiError('bad_request', 'List what you have at home first.', 400);
  const data = await invoke<{ meal: GeneratedMeal }>('meals', { mode: 'generate', have: have.trim().slice(0, 500), slot: opts.slot ?? 'Lunch', kcal: opts.kcal ?? null, localDay: todayId() });
  return data.meal;
}

/** A planned (or swapped, or generated) meal as an estimate, so checking
    it off can log it like any other food. */
export function estimateFromMeal(meal: PlanMealV2, source: 'plan' | 'generated' = 'plan'): FoodEstimate {
  return {
    label: meal.label,
    kcal: meal.kcal,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    confidence: 'high',
    items: (meal.items ?? []).map((name) => ({ name, portion: '', kcal: 0, protein: 0, carbs: 0, fat: 0 })),
    source,
  };
}

/** The food_logs row for a confirmed estimate (v2 columns included). Use
    it in foodLogs.ts when saving. */
export function foodLogRow(
  userId: string,
  estimate: FoodEstimate,
  opts: { id: string; day: string; slot?: MealSlot | ''; followUp?: { question: string; answer: string }[]; createdAt?: string },
): FoodLogRowV2 {
  const clamp = (v: number, hi: number) => Math.min(hi, Math.max(0, Math.round(Number(v) || 0)));
  return {
    id: opts.id,
    user_id: userId,
    day: opts.day,
    label: estimate.label.slice(0, 120),
    kcal: clamp(estimate.kcal, 5000),
    protein: clamp(estimate.protein, 300),
    carbs: clamp(estimate.carbs, 1000),
    fat: clamp(estimate.fat, 500),
    confidence: estimate.confidence,
    source: estimate.source,
    slot: opts.slot ?? '',
    follow_up: (opts.followUp ?? []).slice(0, 5),
    items: estimate.items.slice(0, 15),
    created_at: opts.createdAt ?? new Date().toISOString(),
  };
}

/** Sum of the macros of a list of logs or meals. */
export function sumMacros(list: { kcal: number; protein: number; carbs?: number; fat?: number }[]): { kcal: number; protein: number; carbs: number; fat: number } {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const x of list) {
    total.kcal += x.kcal || 0;
    total.protein += x.protein || 0;
    total.carbs += x.carbs || 0;
    total.fat += x.fat || 0;
  }
  return total;
}
