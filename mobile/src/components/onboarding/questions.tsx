/* The questionnaire, one question at a time. Each question knows its
   onboarding step (for resume), how to draw itself from a draft, and how to
   turn the draft into a profile patch (or a message saying what to fix).
   The questionnaire shows them one per screen; Profile's edit screens show
   a group of them together. */

import React from 'react';
import { Text, View } from 'react-native';

import { C, T } from '../../design';
import { Field } from '../Field';
import { Button } from '../Button';
import { normalizePhone, paceFor } from '../../api/profile';
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
  OnboardingStep,
  ProfilePatchV2,
  ProfileV2,
  TimelineMonths,
  TrainLocation,
} from '../../types';
import { Caution, ChipGroup, DayPicker, GroupLabel, OptionList, Segmented, Stepper } from './Controls';
import {
  ACTIVITY_LEVELS,
  ALLERGIES,
  CONDITIONS,
  DIETS,
  DOCTOR_FIRST,
  EQUIPMENT,
  GENDERS,
  GOALS,
  INJURY_AREAS,
  JOB_ACTIVITIES,
  LOCATIONS,
  TIMELINES,
  type Option,
} from './options';

// ─────────────────────────────── draft ───────────────────────────────

type TimeMode = 'morning' | 'midday' | 'evening' | 'exact';

export type Draft = {
  name: string;
  phoneCode: string;
  phoneLocal: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  gender: Gender;
  height: string;
  weight: string;
  activity_level: ActivityLevel | null;
  job_activity: JobActivity | null;
  sleep_hours: number;
  goal: Goal | null;
  timeline_months: TimelineMonths | null;
  target: string;
  train_location: TrainLocation | null;
  equipment: HomeEquipment[];
  equipment_other: string;
  training_days: number[];
  time_mode: TimeMode;
  exact_time: string;
  diet_type: DietType;
  allergies: Allergy[];
  allergies_other: string;
  dislikes: string;
  injury_areas: InjuryArea[];
  injuries: string;
  conditions: Condition[];
};

export function draftFromProfile(p: ProfileV2): Draft {
  const [y, m, d] = (p.birth_date ?? '').split('-');
  const lebanese = p.phone.startsWith('+961');
  const tt = p.training_time;
  const preset = tt === 'morning' || tt === 'midday' || tt === 'evening';
  return {
    name: p.name ?? '',
    phoneCode: '+961',
    phoneLocal: !p.phone ? '' : lebanese ? p.phone.slice(4) : p.phone,
    dobDay: d ? String(Number(d)) : '',
    dobMonth: m ? String(Number(m)) : '',
    dobYear: y ?? '',
    gender: p.gender === 'male' || p.gender === 'female' ? p.gender : '',
    height: p.height_cm != null ? String(p.height_cm) : '',
    weight: p.weight_kg != null ? String(p.weight_kg) : '',
    activity_level: p.activity_level,
    job_activity: p.job_activity,
    sleep_hours: p.sleep_hours ?? 7,
    goal: p.goal,
    timeline_months: p.timeline_months,
    target: p.target_weight_kg != null ? String(p.target_weight_kg) : '',
    train_location: p.train_location,
    equipment: [...(p.equipment ?? [])],
    equipment_other: p.equipment_other ?? '',
    training_days: p.training_days?.length ? [...p.training_days] : [1, 2, 3, 4, 5, 6],
    time_mode: preset ? (tt as TimeMode) : /^\d{2}:\d{2}$/.test(tt) ? 'exact' : 'evening',
    exact_time: preset ? '' : tt,
    diet_type: p.diet_type ?? 'none',
    allergies: [...(p.allergies ?? [])],
    allergies_other: p.allergies_other ?? '',
    dislikes: p.dislikes ?? '',
    injury_areas: [...(p.injury_areas ?? [])],
    injuries: p.injuries ?? '',
    conditions: [...(p.conditions ?? [])],
  };
}

function num(s: string): number {
  return Number.parseFloat(s.replace(',', '.').trim());
}

/** yyyy-mm-dd from the three date fields, or a message. */
export function birthDateOf(d: Pick<Draft, 'dobDay' | 'dobMonth' | 'dobYear'>): { value: string } | { error: string } {
  const day = Number.parseInt(d.dobDay, 10);
  const month = Number.parseInt(d.dobMonth, 10);
  const year = Number.parseInt(d.dobYear, 10);
  if (!d.dobDay || !d.dobMonth || !d.dobYear) return { error: 'Enter the day, month and year you were born.' };
  if (!(year >= 1900 && year <= 2100) || d.dobYear.length !== 4) return { error: 'Enter the year with four digits, for example 1995.' };
  if (!(month >= 1 && month <= 12)) return { error: 'Enter a month from 1 to 12.' };
  const max = new Date(year, month, 0).getDate();
  if (!(day >= 1 && day <= max)) return { error: `Enter a day from 1 to ${max}.` };
  const pad = (n: number) => String(n).padStart(2, '0');
  return { value: `${year}-${pad(month)}-${pad(day)}` };
}

/** The E.164 phone from the two phone fields ('' when empty, null when invalid). */
export function phoneOf(d: Pick<Draft, 'phoneCode' | 'phoneLocal'>): string | null {
  const local = d.phoneLocal.trim();
  if (!local) return '';
  const code = d.phoneCode.trim().startsWith('+') ? d.phoneCode.trim() : `+${d.phoneCode.trim()}`;
  const international = local.startsWith('+') || local.startsWith('00');
  return normalizePhone(international ? local : `${code}${local.replace(/^0+/, '')}`, code);
}

// ─────────────────────────────── questions ───────────────────────────────

export type QuestionId =
  | 'name'
  | 'phone'
  | 'birth_date'
  | 'gender'
  | 'body'
  | 'activity'
  | 'job'
  | 'sleep'
  | 'goal'
  | 'timeline'
  | 'location'
  | 'schedule'
  | 'diet'
  | 'allergies'
  | 'dislikes'
  | 'injuries'
  | 'conditions';

export type QuestionCtx = {
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  profile: ProfileV2;
  /** Profile edit screens draw the title as a group label. */
  compact?: boolean;
};

type PatchResult = { patch: ProfilePatchV2 } | { error: string };

export type Question = {
  id: QuestionId;
  step: OnboardingStep;
  title: string;
  helper?: string;
  /** Short label for Profile's edit screens. */
  short: string;
  render: (ctx: QuestionCtx) => React.ReactNode;
  toPatch: (d: Draft, p: ProfileV2) => PatchResult;
  /** Primary button label when it should say more than "Continue". */
  cta?: (d: Draft) => string | undefined;
};

const ok = (patch: ProfilePatchV2): PatchResult => ({ patch });
const fix = (error: string): PatchResult => ({ error });

function Optional({ children }: { children: string }) {
  return <Text style={T.small}>{children}</Text>;
}

export const QUESTIONS: Question[] = [
  {
    id: 'name',
    step: 'name',
    title: 'What should we call you?',
    helper: 'Your first name is enough.',
    short: 'Name',
    render: ({ draft, set }) => (
      <Field
        label="First name"
        value={draft.name}
        onChangeText={(name) => set({ name })}
        autoComplete="given-name"
        textContentType="givenName"
        autoCapitalize="words"
        returnKeyType="done"
        placeholder="e.g. Karim"
      />
    ),
    toPatch: (d) => (d.name.trim().length < 1 ? fix('Enter your name.') : ok({ name: d.name.trim() })),
  },
  {
    id: 'phone',
    step: 'phone',
    title: 'Your phone number',
    helper: "Kept on file so BUILT can reach you. It isn't used to sign in.",
    short: 'Phone',
    render: ({ draft, set }) => (
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 96 }}>
          <Field
            label="Code"
            value={draft.phoneCode}
            onChangeText={(phoneCode) => set({ phoneCode })}
            keyboardType="phone-pad"
            accessibilityLabel="Country code"
            maxLength={5}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Number"
            value={draft.phoneLocal}
            onChangeText={(phoneLocal) => set({ phoneLocal })}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            accessibilityLabel="Phone number"
            placeholder="70 123 456"
          />
        </View>
      </View>
    ),
    toPatch: (d) => {
      const phone = phoneOf(d);
      if (phone === '') return fix('Enter your phone number.');
      if (phone == null) return fix('That number looks too short or too long. Check it and the country code.');
      return ok({ phone });
    },
  },
  {
    id: 'birth_date',
    step: 'birth_date',
    title: 'When were you born?',
    helper: 'Your age sets safe limits for your training and calories.',
    short: 'Date of birth',
    render: ({ draft, set }) => (
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Day" value={draft.dobDay} onChangeText={(dobDay) => set({ dobDay: dobDay.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={2} placeholder="DD" accessibilityLabel="Day of birth" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Month" value={draft.dobMonth} onChangeText={(dobMonth) => set({ dobMonth: dobMonth.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={2} placeholder="MM" accessibilityLabel="Month of birth" />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field label="Year" value={draft.dobYear} onChangeText={(dobYear) => set({ dobYear: dobYear.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={4} placeholder="YYYY" accessibilityLabel="Year of birth" />
        </View>
      </View>
    ),
    toPatch: (d) => {
      const r = birthDateOf(d);
      return 'error' in r ? fix(r.error) : ok({ birth_date: r.value });
    },
  },
  {
    id: 'gender',
    step: 'gender',
    title: "What's your gender?",
    helper: 'Used only to set your calorie and protein targets. Never shared.',
    short: 'Gender',
    render: ({ draft, set }) => <OptionList label="Gender" options={GENDERS} value={draft.gender || null} onChange={(gender) => set({ gender })} />,
    toPatch: (d) => (d.gender ? ok({ gender: d.gender }) : fix('Pick one so your targets are right.')),
  },
  {
    id: 'body',
    step: 'body',
    title: 'Height and weight',
    helper: 'Your starting point. You can update your weight any time.',
    short: 'Height and weight',
    render: ({ draft, set }) => (
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field label="Height (cm)" value={draft.height} onChangeText={(height) => set({ height })} keyboardType="decimal-pad" placeholder="e.g. 175" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Weight (kg)" value={draft.weight} onChangeText={(weight) => set({ weight })} keyboardType="decimal-pad" placeholder="e.g. 74.5" />
        </View>
      </View>
    ),
    toPatch: (d) => {
      const h = num(d.height);
      const w = num(d.weight);
      if (!Number.isFinite(h) || h < 100 || h > 250) return fix('Enter a height between 100 and 250 cm.');
      if (!Number.isFinite(w) || w < 30 || w > 300) return fix('Enter a weight between 30 and 300 kg.');
      return ok({ height_cm: Math.round(h), weight_kg: Math.round(w * 10) / 10 });
    },
  },
  {
    id: 'activity',
    step: 'activity',
    title: 'How active are you now?',
    helper: 'Pick the one closest to a normal week.',
    short: 'Activity level',
    render: ({ draft, set }) => (
      <OptionList label="Activity level" options={ACTIVITY_LEVELS} value={draft.activity_level} onChange={(activity_level) => set({ activity_level })} />
    ),
    toPatch: (d) => (d.activity_level ? ok({ activity_level: d.activity_level }) : fix('Pick your activity level to continue.')),
  },
  {
    id: 'job',
    step: 'lifestyle',
    title: "What's your day like?",
    helper: 'Your work or main daily activity.',
    short: 'Daily activity',
    render: ({ draft, set }) => <OptionList label="Daily activity" options={JOB_ACTIVITIES} value={draft.job_activity} onChange={(job_activity) => set({ job_activity })} />,
    toPatch: (d) => (d.job_activity ? ok({ job_activity: d.job_activity }) : fix('Pick the one that fits your day.')),
  },
  {
    id: 'sleep',
    step: 'lifestyle',
    title: 'How much do you sleep?',
    helper: 'An average night. Sleep shapes how hard your plan pushes.',
    short: 'Sleep',
    render: ({ draft, set }) => (
      <Stepper label="Hours of sleep" value={draft.sleep_hours} onChange={(sleep_hours) => set({ sleep_hours })} min={3} max={14} step={0.5} unit="hours a night" />
    ),
    toPatch: (d) => ok({ sleep_hours: d.sleep_hours }),
  },
  {
    id: 'goal',
    step: 'goal',
    title: "What's your main goal?",
    helper: 'Your plan is built around this. You can change it later.',
    short: 'Goal',
    render: ({ draft, set }) => <OptionList label="Goal" options={GOALS} value={draft.goal} onChange={(goal) => set({ goal })} />,
    toPatch: (d) => (d.goal ? ok({ goal: d.goal }) : fix('Pick your main goal to continue.')),
  },
  {
    id: 'timeline',
    step: 'timeline',
    title: 'Your timeline',
    helper: 'How long you want to give this goal. A target weight is optional.',
    short: 'Timeline',
    render: (ctx) => <TimelineQuestion {...ctx} />,
    toPatch: (d) => {
      if (!d.timeline_months) return fix('Pick a timeline.');
      if (!d.target.trim()) return ok({ timeline_months: d.timeline_months, target_weight_kg: null });
      const t = num(d.target);
      if (!Number.isFinite(t) || t < 30 || t > 300) return fix('Enter a target weight between 30 and 300 kg, or leave it empty.');
      return ok({ timeline_months: d.timeline_months, target_weight_kg: Math.round(t * 10) / 10 });
    },
  },
  {
    id: 'location',
    step: 'location',
    title: 'Where will you train?',
    helper: 'You can switch between home and gym any week.',
    short: 'Where you train',
    render: ({ draft, set }) => (
      <View style={{ gap: 20 }}>
        <OptionList label="Where you train" options={LOCATIONS} value={draft.train_location} onChange={(train_location) => set({ train_location })} />
        {draft.train_location === 'home_equipment' ? (
          <View style={{ gap: 12 }}>
            <GroupLabel>What do you have at home?</GroupLabel>
            <ChipGroup label="Equipment" options={EQUIPMENT} values={draft.equipment} onChange={(equipment) => set({ equipment })} />
            {draft.equipment.includes('other') ? (
              <Field label="Other equipment" value={draft.equipment_other} onChangeText={(equipment_other) => set({ equipment_other })} placeholder="e.g. step box, jump rope" />
            ) : null}
          </View>
        ) : null}
      </View>
    ),
    toPatch: (d) => {
      if (!d.train_location) return fix('Pick where you will train.');
      if (d.train_location === 'home_equipment' && !d.equipment.length) return fix('Pick the equipment you have, or choose home with no equipment.');
      if (d.equipment.includes('other') && d.train_location === 'home_equipment' && !d.equipment_other.trim()) return fix('Say what the other equipment is.');
      return ok({
        train_location: d.train_location,
        equipment: d.train_location === 'home_equipment' ? d.equipment : [],
        equipment_other: d.train_location === 'home_equipment' && d.equipment.includes('other') ? d.equipment_other.trim().slice(0, 120) : '',
      });
    },
  },
  {
    id: 'schedule',
    step: 'schedule',
    title: 'When do you train?',
    helper: 'Sunday is your rest day by default. Tap any day to change it.',
    short: 'Training days and time',
    render: ({ draft, set }) => (
      <View style={{ gap: 20 }}>
        <DayPicker value={draft.training_days} onChange={(training_days) => set({ training_days })} />
        <Text style={T.meta}>
          {draft.training_days.length} training day{draft.training_days.length === 1 ? '' : 's'}, {7 - draft.training_days.length} rest day
          {7 - draft.training_days.length === 1 ? '' : 's'} a week.
        </Text>
        <View style={{ gap: 12 }}>
          <GroupLabel>Preferred time</GroupLabel>
          <Segmented
            label="Preferred time"
            options={[
              { id: 'morning', label: 'Morning' },
              { id: 'midday', label: 'Midday' },
              { id: 'evening', label: 'Evening' },
              { id: 'exact', label: 'Set time' },
            ] as Option<TimeMode>[]}
            value={draft.time_mode}
            onChange={(time_mode) => set({ time_mode })}
          />
          {draft.time_mode === 'exact' ? (
            <Field
              label="Time (24-hour)"
              value={draft.exact_time}
              onChangeText={(exact_time) => set({ exact_time })}
              placeholder="18:30"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          ) : (
            <Text style={T.small}>{draft.time_mode === 'morning' ? 'Reminders around 7:00.' : draft.time_mode === 'midday' ? 'Reminders around 12:30.' : 'Reminders around 18:00.'}</Text>
          )}
        </View>
      </View>
    ),
    toPatch: (d) => {
      if (!d.training_days.length) return fix('Pick at least one training day.');
      let training_time: string = d.time_mode;
      if (d.time_mode === 'exact') {
        const m = /^(\d{1,2})[:.h]?(\d{2})$/.exec(d.exact_time.trim());
        const h = m ? Number(m[1]) : NaN;
        if (!m || h > 23 || Number(m[2]) > 59) return fix('Enter a time like 18:30.');
        training_time = `${String(h).padStart(2, '0')}:${m[2]}`;
      }
      return ok({ training_days: [...d.training_days].sort((a, b) => a - b), training_time });
    },
  },
  {
    id: 'diet',
    step: 'diet',
    title: 'How do you eat?',
    helper: 'Your meal plan follows it every day.',
    short: 'Diet',
    render: ({ draft, set }) => <OptionList label="Diet" options={DIETS} value={draft.diet_type} onChange={(diet_type) => set({ diet_type })} />,
    toPatch: (d) => ok({ diet_type: d.diet_type }),
  },
  {
    id: 'allergies',
    step: 'diet',
    title: 'Any food allergies?',
    helper: 'Your meals will never include these.',
    short: 'Allergies',
    render: ({ draft, set }) => (
      <View style={{ gap: 16 }}>
        <ChipGroup label="Allergies" options={ALLERGIES} values={draft.allergies} onChange={(allergies) => set({ allergies })} />
        {draft.allergies.includes('other') ? (
          <Field label="Other allergies" value={draft.allergies_other} onChangeText={(allergies_other) => set({ allergies_other })} placeholder="e.g. kiwi, mustard" />
        ) : null}
      </View>
    ),
    toPatch: (d) => {
      if (d.allergies.includes('other') && !d.allergies_other.trim()) return fix('Say what the other allergy is.');
      return ok({ allergies: d.allergies, allergies_other: d.allergies.includes('other') ? d.allergies_other.trim().slice(0, 200) : '' });
    },
    cta: (d) => (d.allergies.length ? undefined : 'No allergies'),
  },
  {
    id: 'dislikes',
    step: 'diet',
    title: "Foods you don't like",
    helper: "We'll keep them off your plan.",
    short: 'Dislikes',
    render: ({ draft, set }) => (
      <View style={{ gap: 8 }}>
        <Field
          label="Foods you dislike"
          value={draft.dislikes}
          onChangeText={(dislikes) => set({ dislikes })}
          placeholder="e.g. mushrooms, liver, eggplant"
          multiline
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
        <Optional>Optional.</Optional>
      </View>
    ),
    toPatch: (d) => ok({ dislikes: d.dislikes.trim().slice(0, 400) }),
    cta: (d) => (d.dislikes.trim() ? undefined : 'Nothing to add'),
  },
  {
    id: 'injuries',
    step: 'health',
    title: 'Any injuries or pain?',
    helper: 'Pick any area that hurts or was injured. Your plan works around it.',
    short: 'Injuries',
    render: ({ draft, set }) => (
      <View style={{ gap: 16 }}>
        <ChipGroup label="Injury areas" options={INJURY_AREAS} values={draft.injury_areas} onChange={(injury_areas) => set({ injury_areas })} />
        <Field
          label="Tell us more (optional)"
          value={draft.injuries}
          onChangeText={(injuries) => set({ injuries })}
          placeholder="e.g. old ACL repair on my left knee"
          multiline
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
      </View>
    ),
    toPatch: (d) => ok({ injury_areas: d.injury_areas, injuries: d.injuries.trim().slice(0, 600) }),
    cta: (d) => (d.injury_areas.length || d.injuries.trim() ? undefined : 'No injuries'),
  },
  {
    id: 'conditions',
    step: 'health',
    title: 'Any medical conditions?',
    helper: 'Optional and private. It keeps your plan safe.',
    short: 'Medical conditions',
    render: ({ draft, set }) => (
      <View style={{ gap: 16 }}>
        <ChipGroup label="Medical conditions" options={CONDITIONS} values={draft.conditions} onChange={(conditions) => set({ conditions })} />
        {draft.conditions.some((c) => DOCTOR_FIRST.includes(c)) ? (
          <Caution>Check with your doctor before you start. BUILT keeps your plan gentle, but it is not medical advice.</Caution>
        ) : null}
      </View>
    ),
    toPatch: (d) => ok({ conditions: d.conditions }),
    cta: (d) => (d.conditions.length ? undefined : 'None of these'),
  },
];

export function questionById(id: QuestionId): Question {
  return QUESTIONS.find((q) => q.id === id)!;
}

/** The safe-pace check for the timeline question, live as the person types. */
function TimelineQuestion({ draft, set, profile }: QuestionCtx) {
  const weight = num(draft.weight) || profile.weight_kg;
  const target = draft.target.trim() ? num(draft.target) : null;
  const pace =
    weight && draft.timeline_months
      ? paceFor({ weight_kg: weight, target_weight_kg: Number.isFinite(target as number) ? target : null, timeline_months: draft.timeline_months, birth_date: profile.birth_date, age: profile.age })
      : null;
  return (
    <View style={{ gap: 20 }}>
      <Segmented label="Timeline" options={TIMELINES} value={draft.timeline_months} onChange={(timeline_months) => set({ timeline_months })} />
      <Field
        label="Target weight in kg (optional)"
        value={draft.target}
        onChangeText={(t) => set({ target: t })}
        keyboardType="decimal-pad"
        placeholder={weight ? `You are ${weight} kg now` : 'e.g. 70'}
      />
      {pace && !pace.safe && pace.message ? (
        <Caution
          action={
            pace.suggestedMonths && pace.suggestedMonths !== draft.timeline_months ? (
              <Button
                compact
                variant="secondary"
                label={`Use ${pace.suggestedMonths} months`}
                onPress={() => set({ timeline_months: pace.suggestedMonths! })}
                style={{ alignSelf: 'flex-start' }}
              />
            ) : undefined
          }
        >
          {pace.message}
        </Caution>
      ) : pace && pace.direction !== 'maintain' ? (
        <Text style={[T.meta, { color: C.stone }]}>
          About {pace.weeklyKg} kg a week. That is a safe, steady pace.
        </Text>
      ) : null}
    </View>
  );
}

/** Profile groups: which questions each edit screen shows. */
export const GROUPS = {
  about: { title: 'About you', questions: ['name', 'phone', 'birth_date', 'gender', 'body'] as QuestionId[] },
  lifestyle: { title: 'Activity and sleep', questions: ['activity', 'job', 'sleep'] as QuestionId[] },
  goal: { title: 'Goal and timeline', questions: ['goal', 'timeline'] as QuestionId[] },
  training: { title: 'Training', questions: ['location', 'schedule'] as QuestionId[] },
  food: { title: 'Food', questions: ['diet', 'allergies', 'dislikes'] as QuestionId[] },
  health: { title: 'Health', questions: ['injuries', 'conditions'] as QuestionId[] },
} as const;

export type GroupId = keyof typeof GROUPS;
