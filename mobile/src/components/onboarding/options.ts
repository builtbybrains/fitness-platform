/* Every questionnaire answer with the words people see. One source for the
   questionnaire, the Profile summary rows and the edit screens. */

import type {
  ActivityLevel,
  Allergy,
  Condition,
  DietType,
  Gender,
  Goal,
  HomeEquipment,
  InjuryArea,
  JobActivity,
  ProfileV2,
  TimelineMonths,
  TrainLocation,
} from '../../types';

export type Option<T extends string | number> = { id: T; label: string; detail?: string };

export const GENDERS: Option<Exclude<Gender, ''>>[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
];

export const ACTIVITY_LEVELS: Option<ActivityLevel>[] = [
  { id: 'sedentary', label: 'Mostly sitting', detail: 'Little or no exercise. Most of the day at a desk or on the sofa.' },
  { id: 'light', label: 'Lightly active', detail: 'Light exercise or long walks one to three days a week.' },
  { id: 'moderate', label: 'Moderately active', detail: 'Exercise three to five days a week.' },
  { id: 'very', label: 'Very active', detail: 'Hard training six or seven days a week.' },
  { id: 'athlete', label: 'Athlete', detail: 'Training twice a day, or competing in a sport.' },
];

export const JOB_ACTIVITIES: Option<JobActivity>[] = [
  { id: 'desk', label: 'At a desk', detail: 'Office, study, driving. Sitting most of the day.' },
  { id: 'on_feet', label: 'On my feet', detail: 'Retail, teaching, nursing. Standing and walking a lot.' },
  { id: 'physical', label: 'Physical work', detail: 'Building, deliveries, farming. Lifting and carrying.' },
];

export const GOALS: Option<Goal>[] = [
  { id: 'lose_fat', label: 'Lose fat', detail: 'Drop body fat and keep your strength.' },
  { id: 'build_muscle', label: 'Build muscle', detail: 'Add size and strength with a small surplus.' },
  { id: 'tone_up', label: 'Tone up', detail: 'Firmer and more defined, without big swings on the scale.' },
  { id: 'stay_fit', label: 'Stay fit', detail: 'Keep moving, feel good, hold your weight.' },
  { id: 'sports_performance', label: 'Sports performance', detail: 'Speed, power and stamina for your sport.' },
];

export const TIMELINES: Option<TimelineMonths>[] = [
  { id: 1, label: '1 month' },
  { id: 3, label: '3 months' },
  { id: 6, label: '6 months' },
  { id: 12, label: '12 months' },
];

export const LOCATIONS: Option<TrainLocation>[] = [
  { id: 'home_none', label: 'Home, no equipment', detail: 'Bodyweight only. A chair and a wall are enough.' },
  { id: 'home_equipment', label: 'Home, with some equipment', detail: 'Then pick what you have.' },
  { id: 'gym', label: 'Gym', detail: 'Machines, racks, cables and free weights.' },
];

export const EQUIPMENT: Option<HomeEquipment>[] = [
  { id: 'dumbbells', label: 'Dumbbells' },
  { id: 'bands', label: 'Resistance bands' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'pullup_bar', label: 'Pull-up bar' },
  { id: 'bench', label: 'Bench' },
  { id: 'other', label: 'Other' },
];

/** Training time presets; an exact "HH:MM" is also allowed. */
export const TIMES: Option<'morning' | 'midday' | 'evening'>[] = [
  { id: 'morning', label: 'Morning', detail: 'Around 7:00' },
  { id: 'midday', label: 'Midday', detail: 'Around 12:30' },
  { id: 'evening', label: 'Evening', detail: 'Around 18:00' },
];

/** Clock time a preset stands for (reminders use it). */
export const TIME_OF_PRESET: Record<'morning' | 'midday' | 'evening', string> = {
  morning: '07:00',
  midday: '12:30',
  evening: '18:00',
};

export const DIETS: Option<DietType>[] = [
  { id: 'none', label: 'No restrictions' },
  { id: 'halal', label: 'Halal' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'lactose_free', label: 'Lactose-free' },
  { id: 'gluten_free', label: 'Gluten-free' },
];

export const ALLERGIES: Option<Allergy>[] = [
  { id: 'nuts', label: 'Tree nuts' },
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'gluten', label: 'Gluten' },
  { id: 'shellfish', label: 'Shellfish' },
  { id: 'fish', label: 'Fish' },
  { id: 'soy', label: 'Soy' },
  { id: 'sesame', label: 'Sesame' },
  { id: 'other', label: 'Other' },
];

export const INJURY_AREAS: Option<InjuryArea>[] = [
  { id: 'knee', label: 'Knee' },
  { id: 'lower_back', label: 'Lower back' },
  { id: 'shoulder', label: 'Shoulder' },
  { id: 'wrist', label: 'Wrist' },
  { id: 'elbow', label: 'Elbow' },
  { id: 'hip', label: 'Hip' },
  { id: 'ankle', label: 'Ankle' },
  { id: 'neck', label: 'Neck' },
];

export const CONDITIONS: Option<Condition>[] = [
  { id: 'high_blood_pressure', label: 'High blood pressure' },
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'asthma', label: 'Asthma' },
  { id: 'heart_condition', label: 'Heart condition' },
  { id: 'pregnant', label: 'Pregnant' },
  { id: 'postpartum', label: 'Recently gave birth' },
  { id: 'eating_disorder_history', label: 'History of disordered eating' },
  { id: 'joint_pain', label: 'Joint pain' },
  { id: 'other', label: 'Other' },
];

/** Conditions where we ask people to check with a doctor first. */
export const DOCTOR_FIRST: readonly Condition[] = ['heart_condition', 'pregnant', 'postpartum', 'eating_disorder_history', 'high_blood_pressure', 'diabetes'];

/** Monday-first display order of training_days values (0 = Sunday). */
export const WEEK_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function labelOf<T extends string | number>(list: readonly Option<T>[], id: T | null | undefined): string {
  return list.find((o) => o.id === id)?.label ?? '';
}

export function labelsOf<T extends string | number>(list: readonly Option<T>[], ids: readonly T[] | null | undefined): string[] {
  return (ids ?? []).map((id) => labelOf(list, id)).filter(Boolean);
}

/** "Mon, Wed, Fri" in week order. */
export function daysText(days: readonly number[]): string {
  if (days.length === 7) return 'Every day';
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(', ');
}

/** "Evening" or "18:30". */
export function timeText(t: ProfileV2['training_time']): string {
  return labelOf(TIMES, t as 'morning') || t;
}

/** "HH:MM" clock time for a training_time value. */
export function clockOf(t: ProfileV2['training_time']): string {
  return /^\d{2}:\d{2}$/.test(t) ? t : TIME_OF_PRESET[t as 'morning'] ?? TIME_OF_PRESET.evening;
}

/** "+961 70 123 456" for display. */
export function phoneText(e164: string): string {
  if (!e164) return '';
  if (e164.startsWith('+961') && e164.length >= 11) {
    const rest = e164.slice(4);
    return `+961 ${rest.slice(0, rest.length - 6)} ${rest.slice(-6, -3)} ${rest.slice(-3)}`;
  }
  return e164;
}

/** "5 May 1994" for a yyyy-mm-dd day. */
export function dateText(day: string | null): string {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[(m || 1) - 1]} ${y}`;
}
