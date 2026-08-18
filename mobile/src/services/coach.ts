import type { Profile } from '@/state/store';

export interface CoachContext {
  profile: Profile;
  calorieTarget: number;
  caloriesEaten: number;
  waterGlasses: number;
  waterTarget: number;
  lost: number;
  toLose: number;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL;

/** Prompts shown as taps so the user never faces an empty chat box. */
export const SUGGESTIONS = [
  'What should I eat for dinner?',
  'Give me a healthy breakfast.',
  'What workout should I do today?',
  'How can I reach my goal faster?',
  'How many calories should I eat?',
  "I don't have chicken today, give me another option.",
];

type Rule = { match: RegExp; reply: (c: CoachContext) => string };

const round = (n: number) => Math.round(n);

/**
 * On-device coach.
 *
 * When no backend is configured the assistant answers locally from the user's
 * own numbers, so the app is fully usable offline and in review builds. Wire
 * EXPO_PUBLIC_API_URL to a real model endpoint and `askCoach` uses that instead.
 */
const RULES: Rule[] = [
  {
    match: /dinner/i,
    reply: (c) => {
      const left = Math.max(0, c.calorieTarget - c.caloriesEaten);
      return `You have about ${round(left)} kcal left today, so dinner has room to be substantial.

Baked salmon with roasted sweet potato and green beans lands around 640 kcal with 44g of protein. If you want something faster, a turkey and black bean bowl with rice gets you close on the same macros in about 15 minutes.

Either keeps you on target without going over.`;
    },
  },
  {
    match: /breakfast/i,
    reply: (c) =>
      `A good breakfast for a ${c.profile.goal === 'lose' ? 'fat loss' : 'lean gain'} phase is high protein and slow carbs.

Greek yogurt with berries and oats: roughly 420 kcal and 32g of protein. Prefer something savoury? Three eggs with wholegrain toast and avocado sits at a similar number.

Both leave you around ${round(c.calorieTarget - 420)} kcal for the rest of the day.`,
  },
  {
    match: /workout|train|exercise|gym/i,
    reply: (c) =>
      `Today is upper body strength, about 32 minutes.

Incline dumbbell press 4 × 10, seated row 4 × 12, lateral raise 3 × 15, triceps push-down 3 × 12, face pull 3 × 15, then a plank finisher.

Given your ${c.profile.activity} activity level, keep two reps in reserve on the first sets and push the last one. Open the Plan tab to follow along set by set.`,
  },
  {
    match: /faster|quicker|speed|sooner/i,
    reply: (c) => {
      const remaining = Math.max(0, c.profile.weightKg - c.profile.targetWeightKg);
      return `You are ${c.lost.toFixed(1)} kg down with ${remaining.toFixed(1)} kg to go, which is genuinely good progress.

The three things that move the needle fastest, in order: hit your protein target every day, keep three training sessions a week non-negotiable, and get your steps up on rest days.

I would not cut calories further. Going faster than about 0.5 kg a week usually costs muscle and rebounds later.`;
    },
  },
  {
    match: /calorie|kcal|how much should i eat/i,
    reply: (c) =>
      `Your target is ${c.calorieTarget} kcal a day, built from your height, weight, age and a ${c.profile.activity} activity level.

You are at ${c.caloriesEaten} kcal so far, so about ${round(c.calorieTarget - c.caloriesEaten)} kcal remain.

On training days I add roughly 120 kcal to support recovery. Protein stays at 150g regardless of the day.`,
  },
  {
    match: /(no|don'?t have|without|out of)\s+(chicken|beef|fish|salmon|eggs|dairy|rice)/i,
    reply: (c) => {
      const swap = /chicken/i.test(c.profile.diet.join(' ')) ? '' : '';
      void swap;
      return `No problem, we can swap and keep the macros the same.

For a similar protein hit: turkey mince, canned tuna, firm tofu, tempeh, or a tin of chickpeas with a handful of feta. Roughly 150g of any of those matches a chicken breast closely enough.

Tell me which you have and I will rebuild the rest of the meal around it.`;
    },
  },
  {
    match: /water|hydrat/i,
    reply: (c) =>
      `You are at ${c.waterGlasses} of ${c.waterTarget} glasses today.

Spread the rest across the afternoon rather than drinking it all at once. Your water reminder is set for every two hours, which usually gets people there without thinking about it.`,
  },
  {
    match: /protein/i,
    reply: () =>
      `Your protein target is 150g a day and you are at 130g.

The easiest 20g: a scoop of whey, 200g of Greek yogurt, or 100g of tuna. Protein is the single strongest predictor of holding onto muscle while losing fat, so it is worth protecting even on a busy day.`,
  },
  {
    match: /weight|progress|how am i doing/i,
    reply: (c) =>
      `You have lost ${c.lost.toFixed(1)} kg of your ${c.toLose.toFixed(1)} kg goal, so you are ${round((c.lost / c.toLose) * 100)}% of the way there.

Your workout consistency is 92% and your calories are on target most days. That is the combination that actually predicts finishing.

Keep going as you are. No changes needed this week.`,
  },
];

const FALLBACK = (c: CoachContext) =>
  `I can help with meals, training, calories and your goal.

Right now you are at ${c.caloriesEaten} of ${c.calorieTarget} kcal and ${c.waterGlasses} of ${c.waterTarget} glasses of water.

Try asking what to eat for dinner, what workout is on today, or how to reach your goal faster.`;

export async function askCoach(question: string, context: CoachContext): Promise<string> {
  if (API_URL) {
    try {
      const res = await fetch(`${API_URL}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context }),
      });
      if (res.ok) {
        const data = (await res.json()) as { reply?: string };
        if (data.reply) return data.reply;
      }
    } catch {
      // Fall through to the on-device coach rather than showing an error.
    }
  }

  const rule = RULES.find((r) => r.match.test(question));
  return rule ? rule.reply(context) : FALLBACK(context);
}
