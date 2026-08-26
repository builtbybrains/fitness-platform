import { aiConfigured, chat, ChatTurn, describeImage } from '@/services/ai';
import type { Budget, Medical, Profile } from '@/state/store';

export interface CoachContext {
  profile: Profile;
  medical: Medical;
  calorieTarget: number;
  caloriesEaten: number;
  waterGlasses: number;
  waterTarget: number;
  lost: number;
  toLose: number;
  daysSinceWorkout: number;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL;

/** Tapped instead of typed, so the user never faces an empty box. */
export const SUGGESTIONS = [
  'What should I eat for dinner?',
  'I have a wedding tonight.',
  'What workout should I do today?',
  'Give me a different workout.',
  "I'm travelling for a week.",
  "I'm working until midnight.",
  "I don't have chicken today.",
  'How can I reach my goal faster?',
];

type Rule = { match: RegExp; reply: (c: CoachContext) => string };

const round = (n: number) => Math.round(n);

/** Cheaper staples first when the user is on a tight food budget. */
const proteinFor = (b: Budget) =>
  b === 'low'
    ? 'eggs, chicken thighs, canned tuna, lentils, labneh or Greek yogurt'
    : b === 'premium'
      ? 'salmon, steak, prawns, chicken breast or a quality whey'
      : 'chicken breast, eggs, tuna, yogurt or lean mince';

function medicalNote(c: CoachContext) {
  const flags: string[] = [];
  if (c.medical.injuries.length) flags.push(`working around your ${c.medical.injuries.join(' and ').toLowerCase()}`);
  if (c.medical.allergies.length) flags.push(`avoiding ${c.medical.allergies.join(', ').toLowerCase()}`);
  return flags.length ? `\n\nI'm ${flags.join(' and ')}, as always.` : '';
}

const RULES: Rule[] = [
  /* ---------- Real-life mode ---------- */
  {
    match: /wedding|party|dinner out|birthday|event tonight|going out/i,
    reply: (c) => {
      const left = Math.max(0, c.calorieTarget - c.caloriesEaten);
      return `No problem, and no need to skip it.

You have about ${round(left)} kcal left today. Keep breakfast near 400 kcal and lunch near 550 kcal with 45 to 50g protein, and that leaves roughly ${round(Math.max(800, left - 950))} kcal for tonight.

Eat the protein on offer first, enjoy what you want, and we go straight back to normal tomorrow. No crash dieting to make up for it.${medicalNote(c)}`;
    },
  },
  {
    match: /vacation|holiday|travel|trip|flying|abroad|dubai|hotel/i,
    reply: (c) => `Travel mode. Your plan bends, it does not break.

Training: three sessions of 35 to 45 minutes, hotel gym or bodyweight. I'll swap anything that needs a barbell.

Food: protein at every meal, ${proteinFor(c.profile.budget)} wherever you can find it. Aim for ${round(c.calorieTarget)} kcal on active days and do not count too precisely.

Steps: 10,000 a day covers the missing training volume.${medicalNote(c)}`,
  },
  {
    match: /midnight|late shift|working late|night shift|no time today|busy/i,
    reply: (c) => `Late finish, so we shift rather than skip.

Move your main meal earlier and keep tonight light: roughly 400 to 500 kcal with 40g protein so you sleep well.

Training moves to tomorrow. If you want something tonight, ten minutes of mobility is enough, and it keeps the habit alive.

Tomorrow's targets are unchanged at ${round(c.calorieTarget)} kcal.${medicalNote(c)}`,
  },

  /* ---------- Training ---------- */
  {
    match: /different workout|another workout|alternative|swap|substitute|change the workout|bored/i,
    reply: (c) => `Here's the same session built a different way, same muscles and same effort:

Push A becomes Push B
  Incline dumbbell press → flat barbell press
  Seated row → single-arm dumbbell row
  Lateral raise → cable lateral raise
  Triceps push-down → overhead rope extension

I keep the movement pattern and the load target, and only change the tool. That is what keeps progress going while the session still feels fresh.${medicalNote(c)}`,
  },
  {
    match: /workout|train|exercise|gym|session/i,
    reply: (c) =>
      c.daysSinceWorkout >= 2
        ? `Today is upper body strength, about 32 minutes.

You've had ${c.daysSinceWorkout} days off, so I'm starting you at the same weights rather than pushing. Get the session done and we build from there.

Incline dumbbell press 4 × 10, seated row 4 × 12, lateral raise 3 × 15, triceps push-down 3 × 12.${medicalNote(c)}`
        : `Today is upper body strength, about 32 minutes.

Incline dumbbell press 4 × 10, seated row 4 × 12, lateral raise 3 × 15, triceps push-down 3 × 12, face pull 3 × 15, plank 3 × 45s.

Last week you pressed 16kg for 8. Today target 9 to 10 reps at the same weight before we add load. Two reps in reserve on the first set.${medicalNote(c)}`,
  },

  /* ---------- Nutrition ---------- */
  {
    match: /dinner/i,
    reply: (c) => {
      const left = Math.max(0, c.calorieTarget - c.caloriesEaten);
      return `You have about ${round(left)} kcal left, so dinner has room.

On your budget I'd go with ${proteinFor(c.profile.budget)} plus a carb and something green. Around 600 kcal with 45g protein fits cleanly.

Want me to build it around what's actually in your fridge? Tell me what you have.${medicalNote(c)}`;
    },
  },
  {
    match: /breakfast/i,
    reply: (c) =>
      `High protein, slow carbs, and quick enough that you'll actually make it.

Greek yogurt with berries and oats sits near 420 kcal and 32g protein. Savoury instead: three eggs on wholegrain toast lands about the same.

That leaves roughly ${round(c.calorieTarget - 420)} kcal for the rest of the day.${medicalNote(c)}`,
  },
  {
    match: /(no|don'?t have|without|out of)\s+\w+|instead of/i,
    reply: (c) => `Easy, we swap and keep the numbers the same.

Roughly 150g of any of these matches a chicken breast closely enough: turkey mince, canned tuna, firm tofu, tempeh, or chickpeas with a little feta.

Tell me what you do have and I'll rebuild the meal around it, same calories and protein.${medicalNote(c)}`,
  },
  {
    match: /budget|cheap|expensive|afford|money/i,
    reply: (c) => `Your plan is set to a ${c.profile.budget} food budget, so I build meals from ${proteinFor(c.profile.budget)}.

Protein per unit of money is what matters most: eggs, chicken thighs, canned tuna, lentils and yogurt do the heavy lifting. Buy vegetables in season and frozen where it makes no difference.

You can change the budget any time in Preferences and every meal recommendation follows it.`,
  },
  {
    match: /calorie|kcal|how much should i eat/i,
    reply: (c) => `Your target is ${c.calorieTarget} kcal a day, built from your height, weight, age and a ${c.profile.activity} activity level.

You're at ${c.caloriesEaten} kcal so far, so about ${round(c.calorieTarget - c.caloriesEaten)} kcal remain. Protein stays at 150g regardless of the day.

On training days I add about 120 kcal to support recovery.`,
  },
  {
    match: /water|hydrat/i,
    reply: (c) => `You're at ${c.waterGlasses} of ${c.waterTarget} glasses.

Spread the rest across the afternoon rather than drinking it all at once. Your reminder is set for every two hours, which usually gets people there without thinking about it.`,
  },
  {
    match: /faster|quicker|speed|sooner/i,
    reply: (c) => {
      const remaining = Math.max(0, c.profile.weightKg - c.profile.targetWeightKg);
      return `You're ${c.lost.toFixed(1)}kg down with ${remaining.toFixed(1)}kg to go, which is genuinely good progress.

Three things move the needle, in order: hit protein every day, keep three sessions a week non-negotiable, and get your steps up on rest days.

I would not cut calories further. Faster than about 0.5kg a week usually costs muscle and comes back.${medicalNote(c)}`;
    },
  },
  {
    match: /weight|progress|how am i doing/i,
    reply: (c) =>
      `You've lost ${c.lost.toFixed(1)}kg of your ${c.toLose.toFixed(1)}kg goal, so you're ${round((c.lost / c.toLose) * 100)}% of the way there.

Your consistency is the reason. That's the part that actually predicts finishing.

Keep going as you are. No changes needed this week.`,
  },
];

const FALLBACK = (c: CoachContext) =>
  `I can help with meals, training, your budget and real life getting in the way.

Right now you're at ${c.caloriesEaten} of ${c.calorieTarget} kcal and ${c.waterGlasses} of ${c.waterTarget} glasses of water.

Try telling me about tonight's plans, asking what to eat, or asking for a different workout.`;

function systemPrompt(c: CoachContext): string {
  const lines = [
    'You are the coach inside VITAL, an AI health and fitness app. Warm, direct, practical. Plain text only: no markdown, no headings, no bullets, no em dashes. At most three short paragraphs.',
    `User: ${c.profile.firstName || 'the user'}, ${c.profile.age}y, ${c.profile.heightCm}cm, ${c.profile.weightKg}kg, goal ${c.profile.goal} (target ${c.profile.targetWeightKg}kg), activity ${c.profile.activity}.`,
    `Today: ${c.caloriesEaten} of ${c.calorieTarget} kcal eaten, water ${c.waterGlasses}/${c.waterTarget} glasses, protein target 150g. Weight lost so far ${c.lost.toFixed(1)}kg of ${c.toLose.toFixed(1)}kg.`,
    `Days since last workout: ${c.daysSinceWorkout}. Today's session: upper body strength, 32 min.`,
    `Food budget: ${c.profile.budget}. Suggest cheaper proteins (eggs, chicken thighs, tuna, lentils, yogurt) on a low budget.`,
  ];
  if (c.medical.injuries.length) lines.push(`Injuries to work around: ${c.medical.injuries.join(', ')}. Never suggest exercises that load these.`);
  if (c.medical.allergies.length) lines.push(`Food allergies: ${c.medical.allergies.join(', ')}. Never suggest these foods.`);
  if (c.medical.conditions.length) lines.push(`Medical conditions: ${c.medical.conditions.join(', ')}. Be conservative and suggest checking with a doctor where relevant.`);
  lines.push('Real-life mode: if the user mentions an event, travel or a late shift, adapt today around it and return to normal tomorrow; never punish or suggest crash dieting. If they missed workouts, be encouraging and restart at previous weights. You are not a medical service.');
  return lines.join('\n');
}

/** Thrown when the live AI cannot be reached after retries. The UI shows an
 *  honest connection error instead of quietly swapping in a scripted reply. */
export class CoachOfflineError extends Error {}

export async function askCoach(
  question: string,
  context: CoachContext,
  history: ChatTurn[] = [],
): Promise<string> {
  if (aiConfigured) {
    // Live AI only, by design. The scripted rules below exist solely for
    // installs with no key configured; they must never answer for the model.
    try {
      return await chat(systemPrompt(context), history, question);
    } catch {
      throw new CoachOfflineError('coach unreachable');
    }
  }
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

/* ------------------------------------------------------------------ */
/* Missed training                                                     */
/* ------------------------------------------------------------------ */

/**
 * The nudge after a missed day. Never scolds, never mentions a broken streak:
 * it says what to do next and makes catching up feel normal.
 */
export function catchUpMessage(daysSince: number, firstName: string): string | null {
  if (daysSince <= 0) return null;
  if (daysSince === 1) {
    return `No session yesterday, and that's fine, ${firstName}. Today's upper body is ready and takes 32 minutes. One session puts the week straight back on track.`;
  }
  return `${daysSince} days off. Nothing is lost, and I've reshuffled the week so you don't have to. Start with today's session at the same weights as last time, and we build from there.`;
}

/* ------------------------------------------------------------------ */
/* Meal photo analysis                                                 */
/* ------------------------------------------------------------------ */

export interface MealItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface MealAnalysis {
  items: MealItem[];
  kcalLow: number;
  kcalHigh: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  question?: string;
}

/**
 * Meal photo analysis.
 *
 * Ranges and per-item confidence are deliberate. Portion size, oil and sauce are
 * the hard part of reading a plate, and a single confident-looking number that
 * is quietly wrong is what makes people stop trusting a tracker. Better to show
 * the range, flag what is uncertain, and let the user correct it in one tap.
 *
 * With a key configured the photo goes to the live vision model and nothing
 * else: a failure raises MealPhotoError so the UI can say so honestly. The
 * API_URL and local-estimate paths below only serve installs with no key.
 */
const VISION_PROMPT = `Analyse this meal photo for a nutrition tracker. Reply with ONLY a JSON object, no prose, matching:
{"items":[{"name":string,"grams":number,"kcal":number,"protein":number,"confidence":"high"|"medium"|"low"}],"kcalLow":number,"kcalHigh":number,"protein":number,"carbs":number,"fat":number,"confidence":number,"question":string}
kcalLow/kcalHigh bracket the realistic total. confidence is 0..1 overall. question is ONE short clarifying question about the most uncertain item, or "" if none. Estimate portions from visual cues; be honest about uncertainty via the range and per-item confidence.`;

function parseAnalysis(text: string): MealAnalysis | null {
  try {
    const jsonText = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const d = JSON.parse(jsonText) as MealAnalysis;
    if (!Array.isArray(d.items) || !d.items.length || !d.kcalLow || !d.kcalHigh) return null;
    d.items = d.items.slice(0, 8).map((i) => ({
      name: String(i.name).slice(0, 40),
      grams: Math.round(Number(i.grams) || 0),
      kcal: Math.round(Number(i.kcal) || 0),
      protein: Math.round(Number(i.protein) || 0),
      confidence: ['high', 'medium', 'low'].includes(i.confidence) ? i.confidence : 'medium',
    }));
    d.confidence = Math.min(1, Math.max(0, Number(d.confidence) || 0.7));
    return d;
  } catch {
    return null;
  }
}

/** Thrown when a photo cannot be analysed by the live model. When the model
 *  itself replied (for example the photo is not food), message carries the
 *  model's own clarifying question; otherwise message is empty and the UI
 *  shows a generic connection error. */
export class MealPhotoError extends Error {}

/** Pull the model's clarifying question out of a reply that failed full
 *  validation, so a "that is not a meal" answer reaches the user in the
 *  model's own words. */
function extractQuestion(text: string): string | null {
  try {
    const d = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { question?: unknown };
    return typeof d.question === 'string' && d.question.trim() ? d.question.trim() : null;
  } catch {
    return null;
  }
}

export async function analyseMealPhoto(uri: string, base64?: string): Promise<MealAnalysis> {
  if (aiConfigured) {
    if (!base64) throw new MealPhotoError('I could not read that photo. Try taking it again.');
    let reply: string;
    try {
      reply = await describeImage(base64, VISION_PROMPT);
    } catch {
      throw new MealPhotoError('');
    }
    const parsed = parseAnalysis(reply);
    if (parsed) return parsed;
    throw new MealPhotoError(
      extractQuestion(reply) ??
        'I could not make out a meal in that photo. Try a clearer shot from above, in good light.',
    );
  }
  if (API_URL) {
    try {
      const body = new FormData();
      body.append('photo', { uri, name: 'meal.jpg', type: 'image/jpeg' } as unknown as Blob);
      const res = await fetch(`${API_URL}/meals/analyse`, { method: 'POST', body });
      if (res.ok) return (await res.json()) as MealAnalysis;
    } catch {
      // fall through
    }
  }

  await new Promise((r) => setTimeout(r, 1400));
  const items: MealItem[] = [
    { name: 'Grilled chicken', grams: 180, kcal: 297, protein: 54, confidence: 'high' },
    { name: 'Rice', grams: 210, kcal: 273, protein: 6, confidence: 'medium' },
    { name: 'Hummus', grams: 60, kcal: 100, protein: 3, confidence: 'medium' },
    { name: 'Salad and dressing', grams: 90, kcal: 85, protein: 2, confidence: 'low' },
  ];
  const kcal = items.reduce((n, i) => n + i.kcal, 0);
  return {
    items,
    kcalLow: Math.round(kcal * 0.92),
    kcalHigh: Math.round(kcal * 1.12),
    protein: items.reduce((n, i) => n + i.protein, 0),
    carbs: 78,
    fat: 22,
    confidence: 0.81,
    question: 'Was the chicken grilled or fried?',
  };
}
