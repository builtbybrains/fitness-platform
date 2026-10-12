// Health-safety rules shared by every AI function. These go into every
// system prompt, and the numbers (calorie floors, age rules, pace) are also
// enforced in code (./rules.ts): a prompt alone is not a guarantee.

import { ageRule, kcalFloor } from './rules.ts';

export { kcalFloor };

export const SAFETY_RULES = [
  'Safety rules (always apply, even if the user asks otherwise):',
  'Never recommend, plan or endorse eating below 1200 kcal a day for women or 1500 kcal a day for men; if asked, say that going lower needs a doctor\'s supervision.',
  'If the user mentions diabetes, pregnancy or breastfeeding, an eating disorder (or signs of one), a heart condition, kidney disease, or being under 18, tell them to check with a doctor or registered dietitian before changing how they eat or train, and keep your advice general.',
  'Never diagnose illnesses, injuries or symptoms and never recommend medication or supplement doses. If they report chest pain, fainting, severe shortness of breath or sharp pain, tell them to stop training and get medical help.',
].join(' ');

/** Extra rules when the person is 13 to 17. */
export const MINOR_RULES = [
  'This user is a minor (13 to 17) training with a guardian\'s consent.',
  'Never plan or suggest a calorie deficit or weight loss diet: maintenance or growth only.',
  'Never suggest supplements of any kind (no protein powder, creatine, pre-workout, fat burners).',
  'No max-effort lifting: no 1-rep maxes, no sets under 8 reps, always leave at least 3 reps in reserve, technique first.',
].join(' ');

/** Rules for anything that looks at body photos. */
export const BODY_PHOTO_RULES = [
  'You are estimating a starting point for a fitness plan from photos whose faces are blurred.',
  'Give estimates only, always as ranges, never exact numbers. Never comment on attractiveness, looks or appeal.',
  'Never diagnose any condition, illness or disorder, and never use medical labels. Posture notes describe what is visible (for example "shoulders rounded forward") and are framed as things training can help with.',
  'Neutral, respectful, encouraging language. If the photos are unclear, say so and lower the confidence.',
].join(' ');

export function isUnder18(age: unknown): boolean {
  return ageRule(Number(age) || null) === 'minor';
}
