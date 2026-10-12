import { describe, expect, it } from 'vitest';

import { dateEyebrow, foodHeaderStats, groupThousands, kcalLeftText, planHeaderStats, weekCountLabel, weekCountText } from '../lib/headerStats';

describe('kcalLeftText', () => {
  it('says what is left, grouped like DayTotals', () => {
    expect(kcalLeftText(675, 2400)).toBe('1,725 kcal left');
    expect(kcalLeftText(0, 2400)).toBe('2,400 kcal left');
    expect(kcalLeftText(2400, 2400)).toBe('0 kcal left');
  });
  it('says what is over', () => {
    expect(kcalLeftText(2520, 2400)).toBe('120 kcal over');
    expect(kcalLeftText(3650.4, 2400)).toBe('1,250 kcal over');
  });
  it('rounds before comparing', () => {
    expect(kcalLeftText(2400.4, 2400)).toBe('0 kcal left');
  });
});

describe('groupThousands', () => {
  it('groups by three', () => {
    expect(groupThousands(7)).toBe('7');
    expect(groupThousands(1725)).toBe('1,725');
    expect(groupThousands(1234567)).toBe('1,234,567');
    expect(groupThousands(-1200)).toBe('-1,200');
  });
});

describe('week count', () => {
  it('matches the strip numbers', () => {
    expect(weekCountText(2, 6)).toBe('2 of 6 this week');
    expect(weekCountLabel(2, 6)).toBe('2 of 6 workouts done this week');
    expect(weekCountLabel(1, 1)).toBe('1 of 1 workout done this week');
  });
  it('handles a week with nothing planned', () => {
    expect(weekCountText(0, 0)).toBe('Rest week');
  });
});

describe('dateEyebrow', () => {
  it('leads with TODAY on today', () => {
    expect(dateEyebrow(3, '2026-10-08', true)).toBe('TODAY · THURSDAY 8 OCT');
  });
  it('is just the date on another day', () => {
    expect(dateEyebrow(4, '2026-10-09', false)).toBe('FRIDAY 9 OCT');
  });
});

describe('planHeaderStats', () => {
  it('shows the session, its length and the week on a workout day', () => {
    const s = planHeaderStats({ kind: 'workout', focus: 'Upper body · Strength', minutes: 45 }, { done: 2, planned: 6 });
    expect(s.map((x) => x.text)).toEqual(['Upper body · Strength', '45 min', '2 of 6 this week']);
    expect(s.map((x) => x.icon)).toEqual(['dumbbell', 'clock', 'check']);
  });
  it('drops the length on a rest day', () => {
    const s = planHeaderStats({ kind: 'rest' }, { done: 2, planned: 6 });
    expect(s.map((x) => x.text)).toEqual(['Rest day', '2 of 6 this week']);
  });
});

describe('foodHeaderStats', () => {
  const meals = [{ slot: 'Breakfast' }, { slot: 'Lunch' }, { slot: 'Snack' }, { slot: 'Dinner' }];
  it('names the first meal not eaten and the count', () => {
    const s = foodHeaderStats({ eatenKcal: 675, targetKcal: 2400, meals, eatenSlots: ['Breakfast'] });
    expect(s.map((x) => x.text)).toEqual(['1,725 kcal left', 'Next: Lunch', '1 of 4 eaten']);
  });
  it('skips a meal eaten out of order', () => {
    const s = foodHeaderStats({ eatenKcal: 900, targetKcal: 2400, meals, eatenSlots: ['Lunch'] });
    expect(s[1].text).toBe('Next: Breakfast');
    expect(s[2].text).toBe('1 of 4 eaten');
  });
  it('says all eaten when every meal is ticked', () => {
    const s = foodHeaderStats({ eatenKcal: 2520, targetKcal: 2400, meals, eatenSlots: ['Breakfast', 'Lunch', 'Snack', 'Dinner'] });
    expect(s.map((x) => x.text)).toEqual(['120 kcal over', 'All meals eaten']);
  });
  it('shows only calories with no meals planned', () => {
    expect(foodHeaderStats({ eatenKcal: 0, targetKcal: 2000, meals: [], eatenSlots: [] }).map((x) => x.text)).toEqual(['2,000 kcal left']);
  });
});
