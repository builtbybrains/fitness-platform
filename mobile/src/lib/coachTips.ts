/* Built-in coach tips for the Today note: shown while the day's note loads,
   without an account, offline, or whenever the coach can't answer. One tip
   per calendar day, picked from the date so it holds still all day and
   changes tomorrow. Pure: no React, no native modules. */

export const COACH_TIPS: readonly string[] = [
  'Protein on every plate today. Eggs, chicken, fish, labneh or lentils all count.',
  'Start your workout with the first set, not the whole session. Momentum does the rest.',
  'Drink a glass of water before each meal. Easy wins add up.',
  'Sleep is training too. Aim for seven hours or more tonight.',
  'Leave two reps in the tank on every set. Good form builds more than grinding.',
  'Short on time? Ten focused minutes beat a skipped day.',
  'Walk for ten minutes after your biggest meal. It helps you recover and digest.',
  'Consistency beats intensity. Show up today and the results follow.',
  'Plan tomorrow tonight: lay out your kit and pick your first meal.',
  'Hit your protein early. A strong breakfast makes the rest of the day easier.',
  'Rest days build you up. Move lightly, eat well, sleep early.',
  'Add a little weight or one more rep than last time. That is progress.',
  'Keep a water bottle in sight. You drink more of what you can see.',
  'Vegetables on half the plate keep you full without crowding your calories.',
  'Warm up for five minutes before you lift. Your joints will thank you.',
  'Missed a day? Pick up with the next workout. No need to make it up.',
  'Slow down the lowering part of each rep. More control, more strength.',
  'Eat a meal with protein and carbs within a few hours after training.',
  'Screens off half an hour before bed. Better sleep, better sessions.',
  'Log what you eat today, even the snacks. What you track, you can change.',
];

/** The tip for a day id (yyyy-mm-dd): the same all day, a new one tomorrow. */
export function tipFor(dayId: string): string {
  const [y, m, d] = dayId.split('-').map((n) => Number.parseInt(n, 10) || 0);
  // Days since the epoch, so consecutive days walk through the list in order.
  const n = Math.floor(Date.UTC(y, Math.max(0, m - 1), d) / 86_400_000);
  const len = COACH_TIPS.length;
  return COACH_TIPS[((n % len) + len) % len];
}
