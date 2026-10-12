// Food knowledge the functions use without AI, and to check what the AI
// writes:
//   * allergen and diet checks on a meal label (violates()),
//   * a meal library (Lebanese everyday food first) for rules plans and
//     swaps, scaled to a calorie target (scaleMeal, pickMeals),
//   * a typed-food parser for "2 eggs, 1 pita, labneh" with portion
//     questions when an amount is missing (parseFoodText, applyAnswers).

import { clampInt, str } from './ai.ts';
import { macroKcal, mentionsSupplement } from './rules.ts';

export type MealSlot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
export const MEAL_SLOTS: readonly MealSlot[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export type PlanMeal = {
  slot: MealSlot;
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  items?: string[];
  /** Servings of the standard recipe (1 = as written). */
  portion?: number;
};

export type FoodItem = { name: string; portion: string; kcal: number; protein: number; carbs: number; fat: number };
export type FoodQuestion = { id: string; question: string; options: string[]; allowFreeText: boolean };
export type FoodEstimate = {
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'low' | 'medium' | 'high';
  items: FoodItem[];
  source: 'photo' | 'text' | 'generated' | 'plan';
};

export type DietRules = {
  diet: string; // none | halal | vegetarian | vegan | pescatarian | lactose_free | gluten_free
  allergies: string[];
  allergiesOther: string;
  dislikes: string;
  minor: boolean;
};

// ─────────────────────────── allergens and diets ───────────────────────────

const TAGS: Record<string, RegExp> = {
  nuts: /\b(almonds?|walnuts?|cashews?|pistachios?|hazelnuts?|pecans?|pine nuts?|mixed nuts|nuts?|nutella|praline|marzipan)\b/i,
  peanuts: /\b(peanuts?|peanut butter|satay)\b/i,
  dairy: /\b(milk|cheese|yogh?urt|labneh|laban|halloumi|akkawi|feta|butter|cream|whey|casein|kashk|ayran|ghee|ice cream|latte|cappuccino|mozzarella|parmesan|cottage)\b/i,
  eggs: /\b(eggs?|omelett?e|mayo(nnaise)?|frittata|shakshuka)\b/i,
  gluten: /\b(bread|pita|khubz|wraps?|pasta|bulgur|burghul|freekeh|couscous|ka'?ak|manoushe|mana'?ish|manakish|kibbeh|toast|oats?|porridge|wheat|barley|crackers?|bagels?|croissant|pizza|noodles|fattoush|tabbouleh|sandwich|burger bun|cereal|granola)\b/i,
  shellfish: /\b(shrimps?|prawns?|crabs?|lobsters?|calamari|squid|mussels?|oysters?|clams?|scallops?)\b/i,
  fish: /\b(fish|salmon|tuna|sardines?|hammour|sea ?bass|cod|anchov(y|ies)|samkeh|sultan ibrahim|trout|mackerel|tilapia)\b/i,
  soy: /\b(soy|soya|tofu|edamame|tempeh|miso)\b/i,
  sesame: /\b(sesame|tahini|tahina|hummus|za'?atar|halva|halawa|moutabal|baba ?gh?anouj|ka'?ak|tarator)\b/i,
  meat: /\b(beef|lamb|mutton|veal|kafta|kofta|kibbeh|steak|sujuk|soujouk|makanek|shawarma meat|meat|mince|burger|awarma|yakhneh|koussa mahshi|pork|bacon|ham|salami|pepperoni)\b/i,
  poultry: /\b(chicken|turkey|taouk|tawook|djej)\b/i,
  pork: /\b(pork|bacon|ham|prosciutto|pepperoni|lard)\b/i,
  alcohol: /\b(wine|beer|vodka|whisky|arak|rum)\b/i,
  honey: /\bhoney\b/i,
};

/** Why this meal label breaks the person's rules, or null when it is fine. */
export function violates(label: string, rules: DietRules): string | null {
  const has = (tag: string) => TAGS[tag].test(label);
  for (const a of rules.allergies) {
    if (a !== 'other' && TAGS[a] && has(a)) return `contains ${a}`;
  }
  for (const word of rules.allergiesOther.split(/[,;/]| and /i).map((w) => w.trim()).filter((w) => w.length > 2)) {
    if (new RegExp(`\\b${escapeRe(word)}`, 'i').test(label)) return `contains ${word}`;
  }
  switch (rules.diet) {
    case 'vegan':
      if (['meat', 'poultry', 'fish', 'shellfish', 'eggs', 'dairy', 'honey'].some(has)) return 'not vegan';
      break;
    case 'vegetarian':
      if (['meat', 'poultry', 'fish', 'shellfish'].some(has)) return 'not vegetarian';
      break;
    case 'pescatarian':
      if (['meat', 'poultry'].some(has)) return 'not pescatarian';
      break;
    case 'halal':
      if (['pork', 'alcohol'].some(has)) return 'not halal';
      break;
    case 'lactose_free':
      if (has('dairy')) return 'contains dairy';
      break;
    case 'gluten_free':
      if (has('gluten')) return 'contains gluten';
      break;
  }
  for (const word of rules.dislikes.split(/[,;/]| and /i).map((w) => w.trim()).filter((w) => w.length > 2)) {
    if (new RegExp(`\\b${escapeRe(word)}`, 'i').test(label)) return `has ${word}, which they dislike`;
  }
  if (rules.minor && mentionsSupplement(label)) return 'supplement for a minor';
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────── meal library ───────────────────────────────

type LibMeal = { slot: MealSlot; label: string; kcal: number; protein: number; carbs: number; fat: number };

const m = (slot: MealSlot, label: string, kcal: number, protein: number, carbs: number, fat: number): LibMeal => ({ slot, label, kcal, protein, carbs, fat });

export const MEAL_LIBRARY: readonly LibMeal[] = [
  // Breakfast
  m('Breakfast', 'Labneh with olive oil, cucumber, tomato and pita', 430, 18, 45, 20),
  m('Breakfast', "Za'atar manoushe with tomato and mint", 450, 10, 55, 21),
  m('Breakfast', 'Foul medammas with lemon, olive oil and pita', 480, 20, 65, 15),
  m('Breakfast', 'Three-egg omelette with tomato, parsley and toast', 420, 26, 28, 22),
  m('Breakfast', 'Greek yogurt with oats, banana and a drizzle of date syrup', 420, 28, 60, 7),
  m('Breakfast', 'Grilled halloumi with eggs and vegetables', 460, 30, 10, 33),
  m('Breakfast', 'Balila: warm chickpeas with cumin, lemon and olive oil', 400, 17, 55, 12),
  m('Breakfast', 'Eggs with tomatoes and potatoes', 400, 20, 30, 22),
  m('Breakfast', 'Tofu scramble with peppers and pita', 400, 24, 35, 17),
  m('Breakfast', 'Oats with soy milk, dates and walnuts', 450, 15, 65, 15),
  // Lunch
  m('Lunch', 'Shish taouk with rice and salad', 620, 45, 70, 16),
  m('Lunch', 'Mujadara (lentils and rice) with salad', 560, 20, 85, 15),
  m('Lunch', 'Grilled kafta with bulgur and fattoush', 650, 38, 60, 28),
  m('Lunch', 'Chicken shawarma wrap with garlic and pickles', 600, 38, 55, 24),
  m('Lunch', 'Tuna salad with chickpeas and greens', 480, 38, 35, 18),
  m('Lunch', 'Loubieh bi zeit (green beans in olive oil) with rice', 480, 10, 70, 18),
  m('Lunch', 'Mloukhieh with chicken and rice', 620, 42, 70, 16),
  m('Lunch', 'Grilled fish with potatoes and green salad', 560, 40, 50, 20),
  m('Lunch', 'Falafel bowl with hummus and salad', 600, 20, 65, 28),
  m('Lunch', 'Beef and vegetable yakhneh with rice', 600, 38, 65, 18),
  m('Lunch', 'Grilled halloumi and quinoa salad', 520, 25, 45, 26),
  m('Lunch', 'Garlic shrimp with rice and salad', 520, 35, 60, 14),
  m('Lunch', 'Red lentil soup with a chickpea salad', 480, 22, 70, 12),
  // Dinner
  m('Dinner', 'Grilled chicken breast, sweet potato and salad', 520, 45, 45, 15),
  m('Dinner', 'Baked kibbeh with yogurt and salad', 580, 30, 45, 30),
  m('Dinner', 'Salmon, rice and grilled vegetables', 600, 38, 55, 24),
  m('Dinner', 'Chicken and vegetable freekeh', 560, 40, 60, 15),
  m('Dinner', 'Stuffed zucchini (koussa) with rice and yogurt', 520, 24, 60, 20),
  m('Dinner', 'Chickpea and spinach stew with rice', 500, 18, 75, 14),
  m('Dinner', 'Eggs, hummus and vegetables plate', 480, 24, 30, 28),
  m('Dinner', 'Lean beef kafta with roasted potatoes', 600, 40, 45, 28),
  m('Dinner', 'Tofu and vegetable stir-fry with rice', 520, 26, 65, 16),
  m('Dinner', 'Sea bass with roasted vegetables and rice', 540, 40, 50, 18),
  m('Dinner', 'Lentil and vegetable stew with potatoes', 480, 22, 75, 10),
  // Snacks
  m('Snack', 'Greek yogurt with berries', 180, 17, 18, 4),
  m('Snack', 'Apple and a handful of almonds', 200, 5, 22, 11),
  m('Snack', 'Hummus with carrots and cucumber', 180, 6, 18, 9),
  m('Snack', 'Two boiled eggs and a tomato', 170, 13, 4, 10),
  m('Snack', 'Laban (yogurt drink) and two dates', 210, 8, 38, 3),
  m('Snack', 'Banana and peanut butter', 210, 6, 28, 9),
  m('Snack', 'Cottage cheese with cucumber', 150, 18, 6, 5),
  m('Snack', 'Edamame with sea salt', 180, 16, 12, 8),
  m('Snack', 'Roasted chickpeas', 180, 9, 27, 5),
  m('Snack', 'Fruit salad with pumpkin seeds', 160, 5, 28, 5),
];

/** A library meal scaled to about `kcal` (0.6× to 1.8× the recipe). */
export function scaleMeal(meal: LibMeal, kcal: number): PlanMeal {
  const f = Math.min(1.8, Math.max(0.6, kcal / meal.kcal));
  return {
    slot: meal.slot,
    label: meal.label,
    kcal: Math.round((meal.kcal * f) / 5) * 5,
    protein: Math.round(meal.protein * f),
    carbs: Math.round(meal.carbs * f),
    fat: Math.round(meal.fat * f),
    portion: Math.round(f * 100) / 100,
  };
}

/** Library meals for a slot that fit the rules, best protein density first,
    skipping labels in `avoid`. */
export function libraryOptions(slot: MealSlot, rules: DietRules, avoid: readonly string[] = []): LibMeal[] {
  const skip = new Set(avoid.map((a) => a.toLowerCase()));
  return MEAL_LIBRARY.filter((x) => x.slot === slot && !skip.has(x.label.toLowerCase()) && !violates(x.label, rules))
    .slice()
    .sort((a, b) => b.protein / b.kcal - a.protein / a.kcal);
}

/** Share of the day's calories per slot. */
export const SLOT_SHARE: Record<MealSlot, number> = { Breakfast: 0.25, Lunch: 0.35, Dinner: 0.3, Snack: 0.1 };

/** A day of meals from the library adding up to about `kcal`. `dayIndex`
    rotates choices so the week isn't the same every day. */
export function libraryDay(kcal: number, rules: DietRules, dayIndex: number): PlanMeal[] {
  const out: PlanMeal[] = [];
  for (const slot of MEAL_SLOTS) {
    const opts = libraryOptions(slot, rules);
    const pick = opts.length ? opts[dayIndex % opts.length] : MEAL_LIBRARY.find((x) => x.slot === slot)!;
    out.push(scaleMeal(pick, kcal * SLOT_SHARE[slot]));
  }
  return out;
}

/** Clean a meal from the AI: macros in range, kcal consistent with macros. */
export function cleanMeal(raw: Record<string, unknown>, slot: MealSlot): PlanMeal | null {
  const label = str(raw.label, 120);
  if (!label) return null;
  const protein = clampInt(raw.protein, 0, 150, 25);
  const carbs = clampInt(raw.carbs, 0, 300, 50);
  const fat = clampInt(raw.fat, 0, 150, 15);
  let kcal = clampInt(raw.kcal, 50, 2000, macroKcal(protein, carbs, fat));
  const fromMacros = macroKcal(protein, carbs, fat);
  if (fromMacros > 0 && Math.abs(fromMacros - kcal) / Math.max(kcal, 1) > 0.25) kcal = fromMacros;
  const items = Array.isArray(raw.items) ? raw.items.map((i) => str(i, 60)).filter(Boolean).slice(0, 8) : undefined;
  return { slot, label, kcal: Math.round(kcal / 5) * 5, protein, carbs, fat, ...(items?.length ? { items } : {}) };
}

/** Scale a day's meals so they add up to between 95% and 105% of `kcal`,
    and never below `floor`. */
export function fitDay(meals: PlanMeal[], kcal: number, floor: number): PlanMeal[] {
  const total = meals.reduce((a, x) => a + x.kcal, 0);
  if (!total) return meals;
  const goal = Math.max(floor, kcal);
  if (total >= goal * 0.95 && total <= goal * 1.05) return meals;
  const f = goal / total;
  return meals.map((x) => ({
    ...x,
    kcal: Math.round((x.kcal * f) / 5) * 5,
    protein: Math.round(x.protein * f),
    carbs: Math.round(x.carbs * f),
    fat: Math.round(x.fat * f),
  }));
}

// ─────────────────────────── typed food parser ───────────────────────────

type Unit = 'piece' | 'slice' | 'cup' | 'tbsp' | 'tsp' | 'g' | 'bowl' | 'plate' | 'glass' | 'can' | 'skewer' | 'handful' | 'serving';

type FoodDef = {
  keys: RegExp;
  name: string;
  unit: Unit;
  /** grams in one unit, for "150 g" style amounts. */
  grams?: number;
  per: [kcal: number, protein: number, carbs: number, fat: number];
  /** Ask how much when no amount is given (amount changes the total a lot). */
  ask?: string[];
};

const F = (keys: RegExp, name: string, unit: Unit, per: FoodDef['per'], grams?: number, ask?: string[]): FoodDef => ({ keys, name, unit, per, grams, ask });

const FOODS: FoodDef[] = [
  F(/\beggs?\b/i, 'Egg', 'piece', [78, 6.3, 0.6, 5.3], 50),
  F(/\b(pitas?|khubz|arabic bread|lebanese bread)\b/i, 'Pita', 'piece', [165, 5.5, 33, 0.7], 60),
  F(/\blabneh\b/i, 'Labneh', 'tbsp', [30, 1.6, 0.8, 2.2], 20, ['1 tbsp', '2 tbsp', '3 tbsp', 'A small bowl (6 tbsp)']),
  F(/\bhummus\b/i, 'Hummus', 'tbsp', [27, 1.2, 2, 1.6], 15, ['2 tbsp', '4 tbsp', 'A small bowl (8 tbsp)']),
  F(/\bolive oil\b|\boil\b/i, 'Olive oil', 'tbsp', [120, 0, 0, 14], 14, ['1 tsp', '1 tbsp', '2 tbsp']),
  F(/\bza'?atar (manoushe|manakish|mana'?ish)|manoushe|manakish|mana'?ish\b/i, "Za'atar manoushe", 'piece', [400, 9, 50, 18]),
  F(/\bhalloumi\b/i, 'Halloumi', 'slice', [95, 6.5, 0.5, 7.5], 30, ['2 slices', '3 slices', '4 slices']),
  F(/\b(akkawi|white cheese|feta)\b/i, 'White cheese', 'slice', [80, 5, 0.5, 6.5], 30, ['1 slice', '2 slices', '3 slices']),
  F(/\bcheese\b/i, 'Cheese', 'slice', [110, 7, 0.4, 9], 28, ['1 slice', '2 slices', '3 slices']),
  F(/\b(rice)\b/i, 'Rice, cooked', 'cup', [205, 4.3, 45, 0.4], 160, ['Half a cup', '1 cup', '2 cups']),
  F(/\b(bulgur|burghul)\b/i, 'Bulgur, cooked', 'cup', [150, 5.6, 34, 0.4], 180, ['Half a cup', '1 cup', '2 cups']),
  F(/\b(shish )?taouk|tawook\b/i, 'Shish taouk', 'skewer', [180, 28, 2, 7], 100),
  F(/\bshawarma\b/i, 'Chicken shawarma wrap', 'piece', [550, 35, 50, 22]),
  F(/\bchicken\b/i, 'Chicken breast', 'g', [1.65, 0.31, 0, 0.036], 1, ['100 g', '150 g', '200 g']),
  F(/\bfalafel\b/i, 'Falafel', 'piece', [57, 2.3, 5.4, 3], 17, ['3 pieces', '5 pieces', 'A falafel sandwich (5 pieces)']),
  F(/\bkafta|kofta\b/i, 'Kafta', 'skewer', [250, 18, 3, 19], 100),
  F(/\btabbouleh\b/i, 'Tabbouleh', 'cup', [150, 3, 15, 9], 160),
  F(/\bfattoush\b/i, 'Fattoush', 'bowl', [220, 4, 22, 13]),
  F(/\bfoul|ful medames|foul medammas\b/i, 'Foul medammas', 'bowl', [250, 13, 30, 9]),
  F(/\bmujadara\b/i, 'Mujadara', 'cup', [280, 11, 45, 7]),
  F(/\blentil soup|shorbet adas\b/i, 'Lentil soup', 'bowl', [230, 13, 35, 4]),
  F(/\bbananas?\b/i, 'Banana', 'piece', [105, 1.3, 27, 0.4], 118),
  F(/\bapples?\b/i, 'Apple', 'piece', [95, 0.5, 25, 0.3], 180),
  F(/\boranges?\b/i, 'Orange', 'piece', [62, 1.2, 15, 0.2], 130),
  F(/\bdates?\b/i, 'Date', 'piece', [66, 0.4, 18, 0], 24),
  F(/\bgreek yogh?urt\b/i, 'Greek yogurt', 'cup', [130, 20, 8, 0.8], 200),
  F(/\b(yogh?urt|laban)\b/i, 'Yogurt', 'cup', [120, 7, 9, 6], 200),
  F(/\bmilk\b/i, 'Milk', 'glass', [120, 8, 12, 5], 240),
  F(/\b(latte|cappuccino)\b/i, 'Latte', 'glass', [150, 8, 12, 6]),
  F(/\b(coffee|espresso|tea)\b/i, 'Coffee or tea, no sugar', 'glass', [3, 0, 0, 0]),
  F(/\bsugar\b/i, 'Sugar', 'tsp', [16, 0, 4, 0], 4),
  F(/\b(bread|toast)\b/i, 'Bread', 'slice', [80, 3, 15, 1], 30),
  F(/\boats|oatmeal|porridge\b/i, 'Oats', 'cup', [300, 10, 54, 6], 80, ['Half a cup', '1 cup']),
  F(/\bpeanut butter\b/i, 'Peanut butter', 'tbsp', [95, 3.5, 3, 8], 16, ['1 tbsp', '2 tbsp']),
  F(/\b(almonds?|walnuts?|cashews?|nuts|pistachios?)\b/i, 'Nuts', 'handful', [170, 6, 6, 15], 28, ['A small handful', 'A handful', 'Two handfuls']),
  F(/\btuna\b/i, 'Tuna', 'can', [150, 33, 0, 1], 120),
  F(/\bsalmon\b/i, 'Salmon', 'g', [2.08, 0.2, 0, 0.13], 1, ['100 g', '150 g', '200 g']),
  F(/\b(fries|chips)\b/i, 'Fries', 'serving', [365, 4, 48, 17]),
  F(/\bpotato(es)?\b/i, 'Potato', 'piece', [160, 4, 37, 0.2], 170),
  F(/\bavocados?\b/i, 'Avocado (half)', 'piece', [120, 1.5, 6, 11], 70),
  F(/\b(cucumbers?|tomato(es)?|salad|lettuce|vegetables|veggies)\b/i, 'Vegetables', 'serving', [25, 1, 5, 0.2]),
  F(/\bpizza\b/i, 'Pizza', 'slice', [285, 12, 36, 10]),
  F(/\bburger\b/i, 'Burger', 'piece', [500, 25, 40, 25]),
  F(/\b(cola|soda|pepsi|coke|soft drink)\b/i, 'Soft drink', 'can', [140, 0, 39, 0]),
  F(/\bjuice\b/i, 'Juice', 'glass', [110, 1, 26, 0]),
  F(/\bprotein bar\b/i, 'Protein bar', 'piece', [200, 20, 20, 7]),
  F(/\bwhey|protein shake\b/i, 'Protein shake', 'serving', [120, 24, 3, 1.5]),
  F(/\bkibbeh\b/i, 'Kibbeh', 'piece', [190, 9, 15, 10], 80),
  F(/\bsambousek\b/i, 'Sambousek', 'piece', [120, 4, 10, 7]),
];

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, quarter: 0.25, couple: 2, few: 3,
};

const UNIT_RE: [RegExp, Unit][] = [
  [/\b(g|grams?|gr)\b/i, 'g'],
  [/\b(tbsp|tablespoons?|spoons?)\b/i, 'tbsp'],
  [/\b(tsp|teaspoons?)\b/i, 'tsp'],
  [/\bcups?\b/i, 'cup'],
  [/\bslices?\b/i, 'slice'],
  [/\bbowls?\b/i, 'bowl'],
  [/\bplates?\b/i, 'plate'],
  [/\b(glass(es)?|mugs?)\b/i, 'glass'],
  [/\bcans?\b/i, 'can'],
  [/\bskewers?\b/i, 'skewer'],
  [/\bhandfuls?\b/i, 'handful'],
  [/\b(pieces?|pcs)\b/i, 'piece'],
];

/** Amount and unit in a phrase ("2 tbsp", "150g", "half a cup"), or null. */
export function parseAmount(text: string): { qty: number; unit: Unit | null } | null {
  const t = text.toLowerCase();
  let qty: number | null = null;
  const frac = /(\d+)\s*\/\s*(\d+)/.exec(t);
  const num = /(\d+(?:[.,]\d+)?)/.exec(t);
  if (frac) qty = Number(frac[1]) / Number(frac[2]);
  else if (num) qty = Number(num[1].replace(',', '.'));
  else {
    for (const [w, n] of Object.entries(WORD_NUM)) {
      if (new RegExp(`\\b${w}\\b`).test(t)) {
        qty = (qty ?? 1) * n;
        if (w === 'half' || w === 'quarter') break;
      }
    }
  }
  const small = /\bsmall\b/.test(t) ? 0.7 : /\b(large|big)\b/.test(t) ? 1.4 : 1;
  const unit = UNIT_RE.find(([re]) => re.test(t))?.[1] ?? null;
  if (qty == null && unit == null && small === 1) return null;
  return { qty: (qty ?? 1) * small, unit };
}

function amountIn(def: FoodDef, a: { qty: number; unit: Unit | null } | null): number | null {
  if (!a) return null;
  // A bare count of a food measured in grams means pieces ("2 chicken
  // breasts"); a big bare number means grams ("150 chicken").
  if (!a.unit && def.unit === 'g') return a.qty < 10 ? a.qty * 150 : a.qty;
  if (!a.unit || a.unit === def.unit) return a.qty;
  if (a.unit === 'g' && def.grams) return a.qty / def.grams;
  if (def.unit === 'g' && a.unit === 'piece') return a.qty * 150;
  if (a.unit === 'tsp' && def.unit === 'tbsp') return a.qty / 3;
  if (a.unit === 'tbsp' && def.unit === 'tsp') return a.qty * 3;
  if (a.unit === 'bowl' && def.unit === 'tbsp') return a.qty * 6;
  if (a.unit === 'bowl' && def.unit === 'cup') return a.qty * 1.5;
  if (a.unit === 'plate' && def.unit === 'cup') return a.qty * 2;
  return a.qty;
}

function portionText(def: FoodDef, qty: number): string {
  const q = Math.round(qty * 100) / 100;
  if (def.unit === 'g') return `${Math.round(q)} g`;
  const unit = def.unit === 'serving' ? (q === 1 ? 'serving' : 'servings') : def.unit === 'piece' ? '' : q === 1 ? def.unit : `${def.unit}${def.unit.endsWith('s') ? '' : 's'}`;
  return `${q}${unit ? ` ${unit}` : ''}`;
}

function itemFor(def: FoodDef, qty: number): FoodItem {
  const [k, p, c, f] = def.per;
  return {
    name: def.name,
    portion: portionText(def, qty),
    kcal: Math.round(k * qty),
    protein: Math.round(p * qty),
    carbs: Math.round(c * qty),
    fat: Math.round(f * qty),
  };
}

export function totals(items: FoodItem[]): Pick<FoodEstimate, 'kcal' | 'protein' | 'carbs' | 'fat'> {
  return {
    kcal: Math.min(5000, items.reduce((a, i) => a + i.kcal, 0)),
    protein: Math.min(300, items.reduce((a, i) => a + i.protein, 0)),
    carbs: Math.min(1000, items.reduce((a, i) => a + i.carbs, 0)),
    fat: Math.min(500, items.reduce((a, i) => a + i.fat, 0)),
  };
}

/** Rules estimate of typed food. Unknown parts and missing amounts that
    matter become questions (ids "item:<n>" refer to draft.items[n]). */
export function parseFoodText(text: string): { draft: FoodEstimate; questions: FoodQuestion[] } {
  const parts = text
    .split(/,|;|\n|\+|\band\b|\bwith\b|&/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const items: FoodItem[] = [];
  const questions: FoodQuestion[] = [];
  for (const part of parts) {
    const def = FOODS.find((f) => f.keys.test(part));
    if (!def) {
      items.push({ name: str(part, 60), portion: '', kcal: 0, protein: 0, carbs: 0, fat: 0 });
      questions.push({
        id: `item:${items.length - 1}`,
        question: `What is "${str(part, 40)}" and roughly how much? You can also type its calories.`,
        options: [],
        allowFreeText: true,
      });
      continue;
    }
    const amt = amountIn(def, parseAmount(part.replace(def.keys, ' ')));
    const qty = amt ?? (def.unit === 'g' ? 150 : 1);
    items.push(itemFor(def, qty));
    if (amt == null && def.ask) {
      questions.push({ id: `item:${items.length - 1}`, question: `How much ${def.name.toLowerCase()}?`, options: def.ask, allowFreeText: true });
    }
  }
  const label = items.map((i) => i.name).slice(0, 4).join(', ');
  const draft: FoodEstimate = {
    label: str(label, 120, 'Meal'),
    ...totals(items),
    confidence: questions.length ? 'low' : 'medium',
    items,
    source: 'text',
  };
  return { draft, questions: questions.slice(0, 3) };
}

/** Apply answers to a rules draft: each "item:<n>" answer re-estimates that
    item with the amount (or food) the person gave. A plain number with
    "kcal" sets the calories directly. */
export function applyAnswers(draft: FoodEstimate, answers: { id: string; answer: string }[]): FoodEstimate {
  const items = draft.items.map((i) => ({ ...i }));
  for (const a of answers) {
    const idx = Number(/^item:(\d+)$/.exec(a.id)?.[1]);
    if (!Number.isInteger(idx) || !items[idx]) continue;
    const answer = str(a.answer, 120);
    const kcal = /(\d{2,4})\s*(k?cal|calories)/i.exec(answer);
    const def = FOODS.find((f) => f.keys.test(items[idx].name)) ?? FOODS.find((f) => f.keys.test(answer));
    if (kcal) {
      const k = Math.min(3000, Number(kcal[1]));
      items[idx] = { ...items[idx], portion: items[idx].portion || answer, kcal: k, protein: items[idx].protein || Math.round((k * 0.15) / 4), carbs: items[idx].carbs || Math.round((k * 0.5) / 4), fat: items[idx].fat || Math.round((k * 0.35) / 9) };
    } else if (def) {
      const amt = amountIn(def, parseAmount(answer)) ?? 1;
      items[idx] = itemFor(def, amt);
    }
  }
  return { ...draft, items, ...totals(items), confidence: 'medium' };
}

/** Clean an estimate the AI wrote (items with macros); totals recomputed. */
export function cleanEstimate(raw: Record<string, unknown>, source: FoodEstimate['source']): FoodEstimate | null {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: FoodItem[] = rawItems
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .slice(0, 15)
    .map((i) => {
      const protein = clampInt(i.protein, 0, 200, 0);
      const carbs = clampInt(i.carbs, 0, 400, 0);
      const fat = clampInt(i.fat, 0, 200, 0);
      let kcal = clampInt(i.kcal, 0, 3000, macroKcal(protein, carbs, fat));
      const fromMacros = macroKcal(protein, carbs, fat);
      if (fromMacros > 0 && Math.abs(fromMacros - kcal) / Math.max(kcal, 1) > 0.3) kcal = fromMacros;
      return { name: str(i.name, 60, 'Item'), portion: str(i.portion, 40), kcal, protein, carbs, fat };
    });
  const label = str(raw.label, 120, items.map((i) => i.name).slice(0, 3).join(', '));
  if (!label) return null;
  if (!items.length) {
    const kcal = clampInt(raw.kcal, 0, 5000, 0);
    if (!kcal && !/no food/i.test(label)) return null;
    items.push({ name: label.slice(0, 60), portion: '', kcal, protein: clampInt(raw.protein, 0, 300, 0), carbs: clampInt(raw.carbs, 0, 1000, 0), fat: clampInt(raw.fat, 0, 500, 0) });
  }
  const confidence = raw.confidence === 'low' || raw.confidence === 'high' ? raw.confidence : 'medium';
  return { label, ...totals(items), confidence, items, source };
}

export function cleanQuestions(raw: unknown): FoodQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is Record<string, unknown> => !!q && typeof q === 'object')
    .map((q, i) => ({
      id: str(q.id, 40, `q${i + 1}`),
      question: str(q.question, 160),
      options: Array.isArray(q.options) ? q.options.map((o) => str(o, 50)).filter(Boolean).slice(0, 4) : [],
      allowFreeText: true,
    }))
    .filter((q) => q.question)
    .slice(0, 3);
}
