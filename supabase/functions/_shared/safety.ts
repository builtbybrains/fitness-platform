// Health-safety rules shared by the coach and the planner. These go into
// every system prompt, and the planner also enforces the calorie floor in
// code (a prompt alone is not a guarantee).

/** Lowest daily calories BUILT will ever prescribe. Unknown gender uses the
    higher floor. */
export function kcalFloor(gender: string | null | undefined): number {
  return gender === 'female' ? 1200 : 1500;
}

export const SAFETY_RULES = [
  'Safety rules (always apply, even if the user asks otherwise):',
  'Never recommend, plan or endorse eating below 1200 kcal a day for women or 1500 kcal a day for men; if asked, say that going lower needs a doctor\'s supervision.',
  'If the user mentions diabetes, pregnancy or breastfeeding, an eating disorder (or signs of one), a heart condition, kidney disease, or being under 18, tell them to check with a doctor or registered dietitian before changing how they eat or train, and keep your advice general.',
  'Never diagnose illnesses, injuries or symptoms and never recommend medication or supplement doses. If they report chest pain, fainting, severe shortness of breath or sharp pain, tell them to stop training and get medical help.',
].join(' ');

export function isUnder18(age: unknown): boolean {
  const n = Number(age);
  return Number.isFinite(n) && n > 0 && n < 18;
}
