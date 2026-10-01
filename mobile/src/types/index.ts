/* Shared types for BUILT v2: the contract between the backend (Supabase
   tables and Edge Functions) and every screen. Import from here:

     import type { ProfileV2, PlanV2, FoodAnalysis } from '../src/types';

   Field names match the database columns and the JSON the functions return
   (docs/API.md has every shape with examples). Types only, no runtime code. */

import type { ActivityLevel, DailyTargets, Goal, JobActivity, PaceCheck, TimelineMonths } from '../api/rules';
import type { Equipment, InjuryArea, Muscle, TrainLocation } from '../data/exercises';
import type { ActivityKind, Effort } from '../data/activities';

export type { ActivityLevel, DailyTargets, Goal, JobActivity, PaceCheck, TimelineMonths } from '../api/rules';
export type { Equipment, Exercise, InjuryArea, Level, Muscle, Pattern, TrainLocation } from '../data/exercises';
export type { ActivityKind, Effort } from '../data/activities';

// ═══════════════════════════════ errors ═══════════════════════════════

/** Every api/ function throws ApiError (api/errors.ts) with one of these. */
export type ApiErrorCode =
  | 'needs_account' // device-only mode: this feature needs an account
  | 'offline' // the server could not be reached
  | 'bad_request' // the input was refused (message says why)
  | 'unauthorized' // signed out or the session ended
  | 'forbidden' // not allowed (e.g. under 13)
  | 'not_found'
  | 'payload_too_large' // photo too big
  | 'limit_reached' // today's AI limit (message says which)
  | 'not_configured' // the AI key isn't set on the server yet
  | 'ai_busy' // every AI model failed; try again
  | 'under_13' // database: birth date under 13 (BU013)
  | 'waiver_required' // database: finishing onboarding without the waiver (BU014)
  | 'guardian_required' // database: a minor without guardian consent (BU015)
  | 'birth_date_required' // database: finishing without a birth date (BU016)
  | 'not_blurred' // body photo without baked blur (never uploaded)
  | 'unsupported' // not on this platform (web, Expo Go, no health app)
  | 'server_error';

// ═══════════════════════════════ profile ═══════════════════════════════

export type Gender = 'male' | 'female' | '';
export type HomeEquipment = 'dumbbells' | 'bands' | 'kettlebell' | 'pullup_bar' | 'bench' | 'other';
export type DietType = 'none' | 'halal' | 'vegetarian' | 'vegan' | 'pescatarian' | 'lactose_free' | 'gluten_free';
export type Allergy = 'nuts' | 'peanuts' | 'dairy' | 'eggs' | 'gluten' | 'shellfish' | 'fish' | 'soy' | 'sesame' | 'other';
export type Condition =
  | 'high_blood_pressure'
  | 'diabetes'
  | 'asthma'
  | 'heart_condition'
  | 'pregnant'
  | 'postpartum'
  | 'eating_disorder_history'
  | 'joint_pain'
  | 'other';
/** 'morning' | 'midday' | 'evening', or an exact time "HH:MM". */
export type TrainingTime = 'morning' | 'midday' | 'evening' | (string & {});

/** Which reminders are on (all on by default). */
export type ReminderPrefs = {
  workout: boolean;
  meals: boolean;
  water: boolean;
  weigh_in: boolean;
  checkin: boolean;
  streak: boolean;
  plan_updated: boolean;
  report_reply: boolean;
  /** Optional meal reminder times, "HH:MM". */
  meal_times?: Partial<Record<MealSlot, string>>;
  /** Optional water reminder interval in hours. */
  water_every_hours?: number;
};

export type HealthSyncPrefs = {
  enabled: boolean;
  provider?: 'apple_health' | 'health_connect';
  write_workouts?: boolean;
  last_sync_at?: string | null;
};

/** Questionnaire steps in order. profiles.onboarding_step holds the step
    to resume at; 'done' once finished. */
export type OnboardingStep =
  | 'name'
  | 'phone'
  | 'birth_date'
  | 'gender'
  | 'body'
  | 'activity'
  | 'lifestyle'
  | 'goal'
  | 'timeline'
  | 'location'
  | 'schedule'
  | 'diet'
  | 'health'
  | 'photo'
  | 'waiver'
  | 'done';

/** One row of public.profiles (v2). */
export type ProfileV2 = {
  id: string;
  name: string;
  kcal_target: number;
  water_target: number;
  height_cm: number | null;
  /** Kept in sync with birth_date by the database. */
  age: number | null;
  gender: Gender | string;
  weight_kg: number | null;
  created_at?: string;
  updated_at?: string;
  /** E.164, e.g. "+96170123456"; '' when not given. */
  phone: string;
  /** yyyy-mm-dd */
  birth_date: string | null;
  activity_level: ActivityLevel | null;
  job_activity: JobActivity | null;
  sleep_hours: number | null;
  goal: Goal | null;
  timeline_months: TimelineMonths | null;
  target_weight_kg: number | null;
  train_location: TrainLocation | null;
  equipment: HomeEquipment[];
  equipment_other: string;
  /** 0 = Sunday … 6 = Saturday. Default Monday to Saturday. */
  training_days: number[];
  training_time: TrainingTime;
  diet_type: DietType;
  allergies: Allergy[];
  allergies_other: string;
  dislikes: string;
  /** Free text. */
  injuries: string;
  /** Checkbox areas (they drive exercise choice). */
  injury_areas: InjuryArea[];
  conditions: Condition[];
  waiver_version: string;
  waiver_accepted_at: string | null;
  guardian_name: string;
  guardian_consent_at: string | null;
  onboarding_step: OnboardingStep | '';
  onboarding_done_at: string | null;
  last_active_at: string | null;
  /** IANA zone, default "Asia/Beirut". */
  timezone: string;
  /** "HH:MM:SS" from the database; "HH:MM" accepted when saving. */
  quiet_hours_start: string;
  quiet_hours_end: string;
  reminder_prefs: ReminderPrefs;
  health_sync: HealthSyncPrefs;
};

/** What saveProfilePatch accepts (age, ids and timestamps are managed). */
export type ProfilePatchV2 = Partial<Omit<ProfileV2, 'id' | 'age' | 'created_at' | 'updated_at' | 'last_active_at'>>;

// ═══════════════════════════════ plan v2 ═══════════════════════════════

export type MealSlot = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export type ExerciseRef = { id: string; name: string };

export type PlanExerciseV2 = {
  /** Library id (data/exercises.ts), or null for an exercise not in it. */
  id: string | null;
  name: string;
  muscle: Muscle | null;
  sets: number;
  /** Reps, seconds or metres per set, by `unit`. */
  reps: number;
  unit: 'reps' | 's' | 'm';
  /** Seconds of rest after each set. */
  rest: number;
  /** Always null: BUILT never prescribes a load. */
  kg: null;
  note?: string;
  /** The same exercise for each place the person might train. */
  variants: Partial<Record<TrainLocation, ExerciseRef>>;
  /** Name of the exercise this replaced (after "Replace an exercise"). */
  replaced_from?: string;
};

export type PlanWorkoutV2 = {
  kind: 'workout';
  focus: string;
  minutes: number;
  /** training_time from the profile. */
  time: string;
  exercises: PlanExerciseV2[];
};

export type PlanRestV2 = { kind: 'rest'; focus: 'Recovery'; minutes: 0; note: string };

export type PlanMealV2 = {
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

export type PlanDayV2 = { session: PlanWorkoutV2 | PlanRestV2; meals: PlanMealV2[] };

/** ai_plans.plan when version is 2. A superset of the v1 week, so v1
    readers (planData.ts) keep working. days[0] is Monday. */
export type PlanV2 = {
  version: 2;
  generated_at: string;
  source: 'ai' | 'rules';
  model: string;
  /** Exactly 7, Monday first. */
  days: PlanDayV2[];
  kcal_target: number;
  water_target: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number };
  location: TrainLocation;
  equipment: Equipment[];
  /** 0 = Sunday … 6 = Saturday. */
  training_days: number[];
  training_time: string;
  pace: PaceCheck | null;
  minor: boolean;
  /** Two sentences: the approach. */
  summary: string;
  /** What changed from the previous plan and why. */
  changes: string;
  /** The change request that produced this plan, if any. */
  instruction: string | null;
};

/** Per-week changes without regenerating (public.plan_overrides). */
export type PlanOverrides = {
  /** Monday of the calendar week, yyyy-mm-dd. */
  week_start: string;
  /** day_order[i] = plan day index shown on weekday i (0 = Monday). */
  day_order: number[];
  /** "<planDayIndex>:<exerciseIndex>" → replacement. Keys use PLAN day
      indexes, so they survive moving days. */
  exercise_swaps: Record<string, PlanExerciseV2>;
  updated_at?: string;
};

export type PlanResult = {
  plan: PlanV2;
  changes: string;
  summary: string;
  stored: boolean;
  model: string;
};

export type PlanChangeLogEntry = { at: string; instruction: string | null; changes: string; kcal_target: number; source: string };

// ═══════════════════════════════ food ═══════════════════════════════

export type FoodSource = 'photo' | 'text' | 'plan' | 'generated';
export type Confidence = 'low' | 'medium' | 'high';

export type FoodItem = { name: string; portion: string; kcal: number; protein: number; carbs: number; fat: number };

export type FoodQuestion = {
  id: string;
  question: string;
  /** 0 to 4 tap answers; free text is always allowed. */
  options: string[];
  allowFreeText: boolean;
};

export type FoodAnswer = { id: string; answer: string };

/** An estimate the person confirms (or edits) before it counts. Totals
    are the sum of `items`. */
export type FoodEstimate = {
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
  items: FoodItem[];
  source: FoodSource;
};

export type FoodAnalysis =
  | { status: 'questions'; draft: FoodEstimate; questions: FoodQuestion[]; model: string }
  | { status: 'final'; estimate: FoodEstimate; model: string };

export type GeneratedMeal = PlanMealV2 & { steps: string[] };

/** One row of public.food_logs (v2 columns included). */
export type FoodLogRowV2 = {
  id: string;
  user_id: string;
  day: string;
  label: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
  source: FoodSource;
  slot: MealSlot | '';
  follow_up: { question: string; answer: string }[];
  items: FoodItem[];
  created_at: string;
};

// ═══════════════════════════════ activities ═══════════════════════════════

export type Activity = {
  id: string;
  day: string;
  kind: ActivityKind;
  /** Free text for 'other' (or the health app's name for an import). */
  label: string;
  minutes: number;
  effort: Effort;
  kcal: number;
  source: 'manual' | 'health';
  external_id: string | null;
  created_at: string;
  /** True while only on this device. */
  pending?: boolean;
};

export type ActivityInput = { kind: ActivityKind; minutes: number; effort: Effort; day?: string; label?: string };

export type HealthDaily = { day: string; steps: number | null; active_kcal: number | null; sleep_minutes: number | null; source: 'apple_health' | 'health_connect' | '' };

// ═══════════════════════════════ check-ins ═══════════════════════════════

export type CheckinKind = 'weekly' | 'monthly';

export type CheckinAnswers = {
  /** 1 very low … 5 great */
  energy?: number;
  /** 1 very poor … 5 great */
  sleep?: number;
  /** 1 never hungry … 5 always hungry */
  hunger?: number;
  /** 1 too easy … 3 about right … 5 too hard */
  difficulty?: number;
  /** 0..100, % of the plan followed */
  adherence?: number;
  notes?: string;
};

export type Measurements = { waist_cm?: number; hips_cm?: number; chest_cm?: number; arm_cm?: number; thigh_cm?: number };

export type PlanChanges = { changes: string; instruction: string; kcal_before: number; kcal_after: number; kcal_delta: number };

export type Checkin = {
  id: string;
  user_id: string;
  kind: CheckinKind;
  day: string;
  weight_kg: number | null;
  measurements: Measurements;
  answers: CheckinAnswers;
  photo_set_id: string | null;
  photo_ids: string[];
  ai_summary: string;
  plan_changes: PlanChanges | null;
  created_at: string;
  updated_at: string;
};

export type CheckinInput = {
  kind: CheckinKind;
  /** Local day, default today. */
  day?: string;
  weight_kg?: number | null;
  measurements?: Measurements;
  answers?: CheckinAnswers;
  /** Monthly photos: upload and analyse them first, then pass the set. */
  photo_set_id?: string | null;
};

export type CheckinResult = {
  checkin: Checkin;
  summary: string;
  plan_changes: PlanChanges | null;
  plan: PlanV2 | null;
  /** True when saved on this device only (no account). */
  localOnly?: boolean;
};

export type CheckinsDue = { weekly: boolean; monthly: boolean };

// ═══════════════════════════════ coach ═══════════════════════════════

export type MemoryCategory = 'injury' | 'health' | 'preference' | 'like' | 'dislike' | 'schedule' | 'goal' | 'equipment' | 'food' | 'training' | 'other';
export type MemorySource = 'chat' | 'behaviour' | 'checkin' | 'profile';
export type MemoryFact = { id: string; fact: string; category: MemoryCategory; source: MemorySource; created_at: string };

export type CoachReply = {
  reply: string;
  model: string;
  saved: boolean;
  /** Offer "Update my plan" and call generatePlan(userId, suggestPlanChange). */
  suggestPlanChange: string | null;
  /** Facts saved to memory from this message. */
  remembered: MemoryFact[];
};

// ═══════════════════════════════ photos ═══════════════════════════════

export type BodyPhotoKind = 'front' | 'side' | 'back';
export type BodyPhotoSource = 'signup' | 'checkin';

export type BodyPhoto = {
  id: string;
  user_id: string;
  set_id: string;
  kind: BodyPhotoKind;
  source: BodyPhotoSource;
  /** <user id>/<set id>/<kind>.jpg in the private body-photos bucket. */
  storage_path: string;
  taken_at: string;
  created_at: string;
};

export type BodyAnalysisResult = {
  /** Whole percentages, at least 4 points apart. An estimate, never exact. */
  body_fat_range: [number, number];
  build: 'lean' | 'average' | 'athletic' | 'muscular' | 'heavier' | 'unclear';
  posture_notes: string[];
  training_focus: string[];
  confidence: Confidence;
  summary: string;
};

export type BodyAnalysis = { id: string | null; photo_set_id: string | null; created_at: string; result: BodyAnalysisResult; model: string };

/** An area to blur, as fractions (0..1) of the image's width and height. */
export type BlurRegion = { x: number; y: number; width: number; height: number; shape: 'ellipse' | 'rect' };

/** Faces found on the device. `detected` is false when the detector isn't
    available (web, Expo Go) or found nothing: the regions are then one
    suggested box the person must place over their face. */
export type FaceDetection = { regions: BlurRegion[]; detected: boolean; available: boolean };

declare const BLURRED: unique symbol;

/** A JPEG whose blur is baked into the pixels. Only bakeBlur()
    (api/device/blur) creates one, and uploadBodyPhoto() only accepts this
    type, so an unblurred photo can't be uploaded by mistake. */
export type BlurredPhoto = {
  uri: string;
  /** JPEG, no data: prefix. */
  base64: string;
  width: number;
  height: number;
  /** How many areas were blurred (0 only with confirmNoFace). */
  regions: number;
  readonly [BLURRED]: true;
};

// ═══════════════════════════════ reports ═══════════════════════════════

export type ReportCategory = 'bug' | 'plan' | 'food' | 'account' | 'other';
export type ReportStatus = 'new' | 'in_progress' | 'fixed';

export type ReportMessage = { id: string; report_id: string; author: 'user' | 'admin'; body: string; created_at: string };

export type ProblemReport = {
  id: string;
  user_id: string;
  category: ReportCategory;
  message: string;
  screenshot_path: string | null;
  status: ReportStatus;
  platform: string;
  app_version: string;
  user_last_read_at: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

export type ProblemReportWithThread = ProblemReport & {
  messages: ReportMessage[];
  /** An admin reply the person hasn't opened yet. */
  unread: boolean;
};

export type ReportInput = {
  category: ReportCategory;
  message: string;
  /** Optional screenshot, JPEG or PNG base64 (no data: prefix). */
  screenshotBase64?: string | null;
  screenshotMime?: 'image/jpeg' | 'image/png';
  platform?: string;
  appVersion?: string;
};

// ═══════════════════════════════ push and health ═══════════════════════════════

export type PushRegistration =
  | { ok: true; token: string }
  | { ok: false; reason: 'needs_account' | 'web' | 'not_device' | 'denied' | 'no_project_id' | 'unavailable' | 'error' };

export type HealthWorkout = {
  /** The health app's id (used to avoid duplicates). */
  externalId: string;
  kind: ActivityKind;
  label: string;
  start: string;
  end: string;
  minutes: number;
  kcal: number | null;
};

export type HealthDayRead = { day: string; steps: number | null; activeKcal: number | null; sleepMinutes: number | null; weightKg: number | null };

export type HealthSyncResult = { ok: boolean; days: number; workouts: number; weights: number; reason?: string };

