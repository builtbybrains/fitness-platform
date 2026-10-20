// The person's questionnaire, read once per request (RLS-scoped through
// their own client), with everything derived from it that the AI functions
// need: age and age rule, schedule, equipment, injuries, a prompt summary.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { ageOn, ageRule, type AgeRule, type ActivityLevel, type Goal, type JobActivity, trainingSchedule, WEEKDAY_NAMES } from './rules.ts';
import { availableEquipment, type Equipment, type InjuryArea, injuriesFromText, INJURY_AREAS, type TrainLocation } from './exercises.ts';
import { fail } from './http.ts';

export type ProfileRow = {
  id: string;
  name: string;
  kcal_target: number;
  water_target: number;
  height_cm: number | null;
  age: number | null;
  gender: string;
  weight_kg: number | null;
  phone: string;
  birth_date: string | null;
  activity_level: ActivityLevel | null;
  job_activity: JobActivity | null;
  /** Sports they play: activity kinds (mobile/src/data/activities.ts SPORTS). */
  sports: string[];
  sports_other: string;
  sleep_hours: number | null;
  goal: Goal | null;
  timeline_months: number | null;
  target_weight_kg: number | null;
  train_location: TrainLocation | null;
  equipment: string[];
  equipment_other: string;
  training_days: number[];
  training_time: string;
  diet_type: string;
  allergies: string[];
  allergies_other: string;
  dislikes: string;
  injuries: string;
  injury_areas: string[];
  conditions: string[];
  timezone: string;
  onboarding_done_at: string | null;
};

export type Person = ProfileRow & {
  /** From birth_date only (null without one). The `age` column is written
      by the client, so it never decides the age rule. */
  ageYears: number | null;
  rule: AgeRule;
  minor: boolean;
  /** Monday-first, true = training day. */
  schedule: boolean[];
  available: Equipment[];
  injuryAreas: InjuryArea[];
};

const COLUMNS =
  'id, name, kcal_target, water_target, height_cm, age, gender, weight_kg, phone, birth_date, activity_level, job_activity, sports, sports_other, sleep_hours, goal, timeline_months, target_weight_kg, train_location, equipment, equipment_other, training_days, training_time, diet_type, allergies, allergies_other, dislikes, injuries, injury_areas, conditions, timezone, onboarding_done_at';

export async function loadPerson(supabase: SupabaseClient, userId: string, today: string): Promise<Person> {
  const { data, error } = await supabase.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error(`read profile: ${error.message}`);
  return toPerson((data ?? { id: userId }) as Partial<ProfileRow>, today);
}

export function toPerson(p: Partial<ProfileRow>, today: string): Person {
  const row: ProfileRow = {
    id: String(p.id ?? ''),
    name: p.name ?? '',
    kcal_target: p.kcal_target ?? 2200,
    water_target: p.water_target ?? 8,
    height_cm: p.height_cm ?? null,
    age: p.age ?? null,
    gender: p.gender ?? '',
    weight_kg: p.weight_kg ?? null,
    phone: p.phone ?? '',
    birth_date: p.birth_date ?? null,
    activity_level: p.activity_level ?? null,
    job_activity: p.job_activity ?? null,
    sports: Array.isArray(p.sports) ? p.sports.map(String) : [],
    sports_other: p.sports_other ?? '',
    sleep_hours: p.sleep_hours ?? null,
    goal: p.goal ?? null,
    timeline_months: p.timeline_months ?? null,
    target_weight_kg: p.target_weight_kg ?? null,
    train_location: p.train_location ?? null,
    equipment: p.equipment ?? [],
    equipment_other: p.equipment_other ?? '',
    training_days: p.training_days?.length ? p.training_days : [1, 2, 3, 4, 5, 6],
    training_time: p.training_time ?? 'evening',
    diet_type: p.diet_type ?? 'none',
    allergies: p.allergies ?? [],
    allergies_other: p.allergies_other ?? '',
    dislikes: p.dislikes ?? '',
    injuries: p.injuries ?? '',
    injury_areas: p.injury_areas ?? [],
    conditions: p.conditions ?? [],
    timezone: p.timezone ?? 'Asia/Beirut',
    onboarding_done_at: p.onboarding_done_at ?? null,
  };
  const ageYears = ageOn(row.birth_date, today);
  const rule = ageRule(ageYears);
  const injuryAreas = [...new Set([
    ...row.injury_areas.filter((a): a is InjuryArea => (INJURY_AREAS as readonly string[]).includes(a)),
    ...injuriesFromText(row.injuries),
  ])];
  return {
    ...row,
    ageYears,
    rule,
    minor: rule === 'minor',
    schedule: trainingSchedule(row.training_days),
    available: availableEquipment(row.train_location ?? 'home_none', row.equipment),
    injuryAreas,
  };
}

/** The age rule as a response: under 13, or no date of birth, stops the
    request (call it right after loadPerson, before any quota is taken).
    null means go ahead (adult, or a minor under the minor rules). */
export function ageGate(p: Pick<Person, 'rule'>): Response | null {
  if (p.rule === 'blocked') return fail('forbidden', 'BUILT is for people aged 13 and over.', 403);
  if (p.rule === 'unknown') return fail('age_required', 'Add your date of birth in Profile to use the coach and plans.', 403);
  return null;
}

const LABELS: Record<string, string> = {
  lose_fat: 'lose fat', build_muscle: 'build muscle', tone_up: 'tone up', stay_fit: 'stay fit', sports_performance: 'sports performance',
  sedentary: 'sedentary', light: 'lightly active', moderate: 'moderately active', very: 'very active', athlete: 'athlete',
  desk: 'desk job', on_feet: 'on their feet at work', physical: 'physical work',
  home_none: 'at home with no equipment', home_equipment: 'at home with some equipment', gym: 'in a gym',
};

const SPORT_NAMES: Record<string, string> = { martial_arts: 'martial arts', crossfit: 'CrossFit', dancing: 'dance' };

/** "football, tennis, squash": the sports they play, in plain words. */
export function sportsText(p: Pick<ProfileRow, 'sports' | 'sports_other'>): string {
  const named = (p.sports ?? []).filter((s) => s !== 'other').map((s) => SPORT_NAMES[s] ?? s.replace(/_/g, ' '));
  const other = (p.sports ?? []).includes('other') && p.sports_other?.trim() ? [p.sports_other.trim().slice(0, 120)] : [];
  return [...named, ...other].join(', ');
}

/** One compact paragraph about the person for a system prompt. Never
    includes the phone number or anything that identifies them. */
export function describePerson(p: Person): string {
  const days = p.training_days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_NAMES[d]).join(', ');
  const sports = sportsText(p);
  const allergies = [...p.allergies.filter((a) => a !== 'other'), p.allergies_other].filter(Boolean).join(', ');
  const parts = [
    p.name ? `Name: ${p.name.split(' ')[0]}.` : '',
    p.ageYears != null ? `Age: ${p.ageYears}${p.minor ? ' (minor, guardian consent given)' : ''}.` : '',
    p.gender ? `Gender: ${p.gender}.` : '',
    p.height_cm ? `Height: ${p.height_cm} cm.` : '',
    p.weight_kg ? `Weight: ${p.weight_kg} kg.` : '',
    p.goal ? `Goal: ${LABELS[p.goal] ?? p.goal}.` : '',
    p.timeline_months ? `Timeline: ${p.timeline_months} months${p.target_weight_kg ? `, target ${p.target_weight_kg} kg` : ''}.` : '',
    p.activity_level ? `Activity: ${LABELS[p.activity_level] ?? p.activity_level}.` : '',
    sports ? `Plays: ${sports}.` : '',
    p.job_activity ? `Work: ${LABELS[p.job_activity] ?? p.job_activity}.` : '',
    p.sleep_hours ? `Sleep: about ${p.sleep_hours} h.` : '',
    p.train_location ? `Trains ${LABELS[p.train_location] ?? p.train_location}${p.train_location === 'home_equipment' && p.equipment.length ? ` (${[...p.equipment.filter((e) => e !== 'other'), p.equipment_other].filter(Boolean).join(', ')})` : ''}.` : '',
    `Training days: ${days}; preferred time: ${p.training_time}.`,
    p.diet_type && p.diet_type !== 'none' ? `Diet: ${p.diet_type.replace('_', '-')}.` : '',
    allergies ? `Allergies: ${allergies}.` : '',
    p.dislikes ? `Dislikes: ${p.dislikes}.` : '',
    p.injuries || p.injuryAreas.length ? `Injuries: ${[p.injuries, p.injuryAreas.length ? `(areas: ${p.injuryAreas.join(', ')})` : ''].filter(Boolean).join(' ')}.` : '',
    p.conditions.length ? `Conditions: ${p.conditions.join(', ').replace(/_/g, ' ')}.` : '',
  ];
  return parts.filter(Boolean).join(' ');
}
