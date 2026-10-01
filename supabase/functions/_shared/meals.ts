// Food AI shared by the `meals` and `analyze-meal` functions: photo and
// typed estimates with follow-up questions, finalising with answers, meal
// swaps and "cook from what I have".

import { type AiProvider, chat, extractJson, str } from './ai.ts';
import {
  applyAnswers,
  cleanEstimate,
  cleanMeal,
  cleanQuestions,
  type FoodEstimate,
  type FoodQuestion,
  MEAL_SLOTS,
  type MealSlot,
  parseFoodText,
  type PlanMeal,
  violates,
} from './food.ts';
import { dietRulesOf, rulesSwaps } from './plan.ts';
import type { Person } from './profile.ts';
import { MINOR_RULES, SAFETY_RULES } from './safety.ts';

export type FoodAnalysis =
  | { status: 'questions'; draft: FoodEstimate; questions: FoodQuestion[]; model: string }
  | { status: 'final'; estimate: FoodEstimate; model: string };

const ESTIMATE_JSON =
  '{"label":"<short name, max 6 words>","confidence":"low"|"medium"|"high","items":[{"name":"...","portion":"e.g. 1 pita, 2 tbsp","kcal":0,"protein":0,"carbs":0,"fat":0}],"questions":[{"id":"q1","question":"...","options":["...","..."]}]}';

const ESTIMATOR = [
  'You are a nutrition estimator for people in Lebanon; you know Lebanese and Middle Eastern dishes and portions well.',
  'Estimate every item: kcal, protein, carbs and fat in grams, and make kcal agree with the macros (4/4/9). Drinks, oils, butter and sauces count.',
  'Ask follow-up questions ONLY when the answer would change the total by more than about 15% (portion size, cooking oil or butter, sauce, what is in a drink). At most 3 questions, each with 2 to 4 short options. If you can estimate confidently, "questions" is [].',
  'Describe only the food; never comment on the person\'s body, weight or health.',
  `Reply with ONLY a JSON object, no prose, no markdown: ${ESTIMATE_JSON}`,
].join(' ');

function acceptEstimate(source: FoodEstimate['source']) {
  return (text: string): { estimate: FoodEstimate; questions: FoodQuestion[] } | null => {
    const j = extractJson(text);
    if (!j) return null;
    const estimate = cleanEstimate(j, source);
    return estimate ? { estimate, questions: cleanQuestions(j.questions) } : null;
  };
}

function toAnalysis(r: { estimate: FoodEstimate; questions: FoodQuestion[] }, model: string): FoodAnalysis {
  return r.questions.length && r.estimate.kcal > 0
    ? { status: 'questions', draft: r.estimate, questions: r.questions, model }
    : { status: 'final', estimate: r.estimate, model };
}

export async function analyzePhoto(ai: AiProvider, imageBase64: string, note: string, allowQuestions = true): Promise<FoodAnalysis | null> {
  const answer = await chat(
    ai,
    {
      messages: [
        { role: 'system', content: ESTIMATOR + (allowQuestions ? '' : ' Do not ask questions: "questions" must be [].') + ' If the photo shows no food, reply {"label":"No food detected","confidence":"low","items":[],"questions":[]}.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Estimate this meal.${note ? ` The person adds: "${note}".` : ''}` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      max_tokens: 1200,
      temperature: 0.2,
      timeoutMs: 60_000,
    },
    acceptEstimate('photo'),
    'meals:photo',
  );
  return answer ? toAnalysis(allowQuestions ? answer.value : { ...answer.value, questions: [] }, answer.model) : null;
}

export async function analyzeText(ai: AiProvider | null, text: string): Promise<FoodAnalysis> {
  if (ai) {
    const answer = await chat(
      ai,
      {
        messages: [
          { role: 'system', content: ESTIMATOR },
          { role: 'user', content: `What I ate: ${text}` },
        ],
        max_tokens: 1200,
        temperature: 0.2,
        timeoutMs: 45_000,
      },
      acceptEstimate('text'),
      'meals:text',
    );
    if (answer) return toAnalysis(answer.value, answer.model);
  }
  const { draft, questions } = parseFoodText(text);
  return questions.length ? { status: 'questions', draft, questions, model: 'rules' } : { status: 'final', estimate: draft, model: 'rules' };
}

export async function finalise(
  ai: AiProvider | null,
  draft: FoodEstimate,
  questions: FoodQuestion[],
  answers: { id: string; answer: string }[],
): Promise<{ estimate: FoodEstimate; model: string }> {
  const ruleIds = answers.every((a) => /^item:\d+$/.test(a.id));
  if (ai && !ruleIds) {
    const qa = answers.map((a) => `${questions.find((q) => q.id === a.id)?.question ?? a.id} → ${a.answer}`).join('\n');
    const answer = await chat(
      ai,
      {
        messages: [
          { role: 'system', content: `${ESTIMATOR} This is the final estimate: "questions" must be [].` },
          { role: 'user', content: `Draft estimate: ${JSON.stringify({ label: draft.label, items: draft.items })}\nThe person answered:\n${qa}\nReturn the corrected final estimate.` },
        ],
        max_tokens: 1000,
        temperature: 0.1,
        timeoutMs: 45_000,
      },
      acceptEstimate(draft.source),
      'meals:answer',
    );
    if (answer) return { estimate: { ...answer.value.estimate, confidence: answer.value.estimate.confidence === 'low' ? 'medium' : answer.value.estimate.confidence }, model: answer.model };
  }
  return { estimate: applyAnswers(draft, answers), model: 'rules' };
}

export async function swapMeal(ai: AiProvider | null, meal: PlanMeal, reason: string, p: Person): Promise<{ options: PlanMeal[]; model: string }> {
  const rules = dietRulesOf(p);
  const ok = (x: PlanMeal) =>
    !violates(x.label, rules) &&
    !(x.items ?? []).some((i) => violates(i, rules)) &&
    x.label.toLowerCase() !== meal.label.toLowerCase();
  const near = (x: PlanMeal): PlanMeal => {
    if (Math.abs(x.kcal - meal.kcal) <= meal.kcal * 0.1) return x;
    const f = meal.kcal / Math.max(1, x.kcal);
    return { ...x, kcal: Math.round((x.kcal * f) / 5) * 5, protein: Math.round(x.protein * f), carbs: Math.round(x.carbs * f), fat: Math.round(x.fat * f) };
  };
  let options: PlanMeal[] = [];
  let model = 'rules';
  if (ai) {
    const answer = await chat(
      ai,
      {
        messages: [
          {
            role: 'system',
            content: [
              'You suggest meal swaps for a fitness plan. Everyday food someone in Lebanon can make or buy.',
              SAFETY_RULES,
              p.minor ? MINOR_RULES : '',
              'Give 3 different alternatives for the same meal slot with similar calories (within 10%) and at least as much protein.',
              `Respect strictly: diet ${p.diet_type}; allergies ${[...p.allergies, p.allergies_other].filter(Boolean).join(', ') || 'none'}; dislikes ${p.dislikes || 'none'}.`,
              'Reply with ONLY JSON: {"options":[{"label":"...","kcal":0,"protein":0,"carbs":0,"fat":0,"items":["..."]}]}',
            ].filter(Boolean).join(' '),
          },
          { role: 'user', content: `Swap this ${meal.slot.toLowerCase()}: ${meal.label} (${meal.kcal} kcal, ${meal.protein} g protein, ${meal.carbs} g carbs, ${meal.fat} g fat).${reason ? ` Reason: ${reason}` : ''}` },
        ],
        max_tokens: 900,
        temperature: 0.7,
        timeoutMs: 40_000,
      },
      (text) => {
        const j = extractJson(text);
        if (!j || !Array.isArray(j.options)) return null;
        const list = j.options
          .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
          .map((o) => cleanMeal(o, meal.slot))
          .filter((x): x is PlanMeal => !!x)
          .map(near)
          .filter((x) => ok(x) && x.protein >= meal.protein * 0.8);
        return list.length ? list : null;
      },
      'meals:swap',
    );
    if (answer) {
      options = answer.value;
      model = answer.model;
    }
  }
  if (options.length < 3) {
    const extra = rulesSwaps(meal, p).filter((x) => ok(x) && !options.some((o) => o.label === x.label));
    options = [...options, ...extra].slice(0, 3);
  }
  return { options: options.slice(0, 3), model: options.length && model !== 'rules' ? model : 'rules' };
}

export type GeneratedMeal = PlanMeal & { steps: string[] };

export async function generateMeal(ai: AiProvider, have: string, slot: MealSlot, kcal: number | null, p: Person): Promise<{ meal: GeneratedMeal; model: string } | null> {
  const rules = dietRulesOf(p);
  const answer = await chat(
    ai,
    {
      messages: [
        {
          role: 'system',
          content: [
            'You turn what someone has at home into one simple, healthy meal for a fitness plan. Use only what they list plus water, salt, pepper, spices, lemon and a little oil.',
            SAFETY_RULES,
            p.minor ? MINOR_RULES : '',
            `Respect strictly: diet ${p.diet_type}; allergies ${[...p.allergies, p.allergies_other].filter(Boolean).join(', ') || 'none'}; dislikes ${p.dislikes || 'none'}. Leave out any listed ingredient that breaks these.`,
            'kcal, protein, carbs and fat (grams) must agree (4/4/9). Up to 5 short steps.',
            'Reply with ONLY JSON: {"label":"...","kcal":0,"protein":0,"carbs":0,"fat":0,"items":["2 eggs","1 pita"],"steps":["..."]}',
          ].filter(Boolean).join(' '),
        },
        { role: 'user', content: `I have: ${have}. Make me a ${slot.toLowerCase()}${kcal ? ` of about ${kcal} kcal` : ''}.` },
      ],
      max_tokens: 800,
      temperature: 0.6,
      timeoutMs: 40_000,
    },
    (text) => {
      const j = extractJson(text);
      if (!j) return null;
      const meal = cleanMeal(j, slot);
      if (!meal || violates(meal.label, rules) || (meal.items ?? []).some((i) => violates(i, rules))) return null;
      const steps = Array.isArray(j.steps) ? j.steps.map((s) => str(s, 200)).filter(Boolean).slice(0, 5) : [];
      return { ...meal, steps };
    },
    'meals:generate',
  );
  return answer ? { meal: answer.value, model: answer.model } : null;
}

export function isSlot(v: unknown): v is MealSlot {
  return (MEAL_SLOTS as readonly unknown[]).includes(v);
}
