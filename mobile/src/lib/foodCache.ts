/* Shared in-memory state for food logs (photo, typed, generated), so a log
   added on the Food screens shows up on Today at once. Keyed by user and day: a
   different user (or a new day) never sees the previous one's rows, and
   sign-out clears it. Pure module (no native imports). */

export type Confidence = 'low' | 'medium' | 'high';

export type FoodSource = 'photo' | 'text' | 'plan' | 'generated';
export type MealSlot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export type Estimate = {
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
  source?: FoodSource;
  slot?: MealSlot | '';
  items?: { name: string; portion: string; kcal: number; protein: number; carbs: number; fat: number }[];
  followUp?: { question: string; answer: string }[];
};

export type FoodLog = Estimate & {
  id: string;
  day: string;
  created_at: string;
  /** True while the row exists only on this device (not uploaded yet). */
  pending?: boolean;
};

export type FoodState = { key: string; logs: FoodLog[]; loaded: boolean };

/** A whole number clamped to 0..hi. */
export function n(v: unknown, hi: number): number {
  return Math.min(hi, Math.max(0, Math.round(Number(v) || 0)));
}

/** The food_logs row the app writes for a log (also used when a
    device-only person's history moves into a new account). */
export function foodLogRow(userId: string, l: FoodLog) {
  return {
    id: l.id,
    user_id: userId,
    day: l.day,
    label: l.label.slice(0, 120),
    kcal: n(l.kcal, 5000),
    protein: n(l.protein, 300),
    carbs: n(l.carbs, 1000),
    fat: n(l.fat, 500),
    confidence: l.confidence,
    source: l.source ?? 'photo',
    slot: l.slot ?? '',
    follow_up: (l.followUp ?? []).slice(0, 5),
    items: (l.items ?? []).slice(0, 15),
    created_at: l.created_at || new Date().toISOString(),
  };
}

export function cacheKey(userId: string, dayId: string): string {
  return `${userId}|${dayId}`;
}

let cache: FoodState | null = null;
const listeners = new Set<(s: FoodState | null) => void>();

export function getFoodCache(key: string): FoodState | null {
  return cache && cache.key === key ? cache : null;
}

export function publishFood(s: FoodState): void {
  cache = s;
  for (const l of listeners) l(s);
}

export function subscribeFood(l: (s: FoodState | null) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Forget everything (sign-out). */
export function clearFoodCache(): void {
  cache = null;
  for (const l of listeners) l(null);
}

/** Server rows are the truth for everything the server has; rows still
    pending on this device are kept on top, minus any being deleted.
    Sorted by creation time. */
export function mergeFoodLogs(server: FoodLog[], local: FoodLog[], deleting: ReadonlySet<string> = new Set()): FoodLog[] {
  const byId = new Map<string, FoodLog>();
  for (const r of server) if (!deleting.has(r.id)) byId.set(r.id, { ...r, pending: undefined });
  for (const r of local) {
    if (deleting.has(r.id) || byId.has(r.id)) continue;
    if (r.pending || r.id.startsWith('local-')) byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}
