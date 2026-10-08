-- BUILT schema for Supabase (Postgres). Version 2.
--
-- Run it in: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- It is safe to run again at any time (on a new project or an existing one):
-- every table, column, index, constraint, policy, function, trigger and
-- storage bucket is created only if missing or replaced in place. It never
-- deletes data.
--
-- Security model:
--   * Every user table has row-level security (RLS): a signed-in person can
--     only reach their own rows, enforced by the database.
--   * `authenticated` (signed-in people) gets only the table privileges each
--     table needs; RLS narrows that to their own rows.
--   * `anon` (not signed in) gets nothing, except INSERT on contact_messages
--     (the website contact form).
--   * Admin tables (admin_*), the ERP tables (erp_*, section "ERP" at the
--     end; also in supabase/erp.sql) and app_config are reachable by the
--     service role only (the Edge Functions). No client role can read them.
--   * Body photos and report screenshots live in private Storage buckets,
--     one folder per person; only that person can add or read their files.
--
-- Full reference for app and dashboard builders: docs/API.md.

-- Helper for re-runnable CHECK constraints (lives only for this session).
-- New constraints are added NOT VALID: enforced for every new or changed row,
-- without failing the script if an old row predates the rule.
create or replace function pg_temp.add_check(tbl regclass, cname text, expr text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = tbl and conname = cname) then
    execute format('alter table %s add constraint %I check (%s) not valid', tbl, cname, expr);
  end if;
end;
$$;

-- Helper for re-runnable policies (lives only for this session). A missing
-- policy is created; one that exists is changed in place with `alter policy`
-- (p_alter), never removed, so the script has no DROP POLICY statements.
create or replace function pg_temp.put_policy(p_schema text, p_table text, p_name text, p_create text, p_alter text)
returns void language plpgsql as $$
begin
  if exists (select 1 from pg_policies where schemaname = p_schema and tablename = p_table and policyname = p_name) then
    if p_alter is not null then execute p_alter; end if;
  else
    execute p_create;
  end if;
end; $$;

-- Password hashing and random tokens for the admin login (Supabase keeps
-- pgcrypto in the `extensions` schema; this is a no-op there).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ═══════════════════════════════ tables ═══════════════════════════════

-- profiles: one row per account. Name, personal stats, daily targets, and
-- (v2) the whole sign-up questionnaire.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  kcal_target int not null default 2200,
  water_target int not null default 8,
  height_cm real,
  age int,
  gender text not null default '',
  weight_kg real,
  created_at timestamptz not null default now()
);
-- Columns added after the first release (no-ops when present).
alter table public.profiles add column if not exists height_cm real;
alter table public.profiles add column if not exists age int;
alter table public.profiles add column if not exists gender text not null default '';
alter table public.profiles add column if not exists weight_kg real;

-- v2 questionnaire. `age` stays and is kept in sync from birth_date.
alter table public.profiles add column if not exists phone text not null default '';
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles add column if not exists activity_level text;
alter table public.profiles add column if not exists job_activity text;
alter table public.profiles add column if not exists sleep_hours real;
alter table public.profiles add column if not exists goal text;
alter table public.profiles add column if not exists timeline_months int;
alter table public.profiles add column if not exists target_weight_kg real;
alter table public.profiles add column if not exists train_location text;
alter table public.profiles add column if not exists equipment text[] not null default '{}';
alter table public.profiles add column if not exists equipment_other text not null default '';
alter table public.profiles add column if not exists training_days int[] not null default '{1,2,3,4,5,6}'; -- 0 = Sunday … 6 = Saturday
alter table public.profiles add column if not exists training_time text not null default 'evening';
alter table public.profiles add column if not exists diet_type text not null default 'none';
alter table public.profiles add column if not exists allergies text[] not null default '{}';
alter table public.profiles add column if not exists allergies_other text not null default '';
alter table public.profiles add column if not exists dislikes text not null default '';
alter table public.profiles add column if not exists injuries text not null default '';
alter table public.profiles add column if not exists injury_areas text[] not null default '{}';
alter table public.profiles add column if not exists conditions text[] not null default '{}';
alter table public.profiles add column if not exists waiver_version text not null default '';
alter table public.profiles add column if not exists waiver_accepted_at timestamptz;
alter table public.profiles add column if not exists guardian_name text not null default '';
alter table public.profiles add column if not exists guardian_consent_at timestamptz;
alter table public.profiles add column if not exists onboarding_step text not null default '';
alter table public.profiles add column if not exists onboarding_done_at timestamptz;
alter table public.profiles add column if not exists last_active_at timestamptz;
alter table public.profiles add column if not exists timezone text not null default 'Asia/Beirut';
alter table public.profiles add column if not exists quiet_hours_start time not null default '22:00';
alter table public.profiles add column if not exists quiet_hours_end time not null default '07:00';
alter table public.profiles add column if not exists reminder_prefs jsonb not null default
  '{"workout":true,"meals":true,"water":true,"weigh_in":true,"checkin":true,"streak":true,"plan_updated":true,"report_reply":true}'::jsonb;
alter table public.profiles add column if not exists health_sync jsonb not null default '{"enabled":false}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- Constraints only on v2 columns, so an older row with an odd v1 value can
-- still be updated.
select pg_temp.add_check('public.profiles', 'profiles_phone_e164', $c$phone = '' or phone ~ '^\+[1-9][0-9]{6,14}$'$c$);
select pg_temp.add_check('public.profiles', 'profiles_birth_date_range', $c$birth_date is null or birth_date >= date '1900-01-01'$c$);
select pg_temp.add_check('public.profiles', 'profiles_activity_level_values', $c$activity_level is null or activity_level in ('sedentary', 'light', 'moderate', 'very', 'athlete')$c$);
select pg_temp.add_check('public.profiles', 'profiles_job_activity_values', $c$job_activity is null or job_activity in ('desk', 'on_feet', 'physical')$c$);
select pg_temp.add_check('public.profiles', 'profiles_sleep_hours_range', 'sleep_hours is null or sleep_hours between 3 and 14');
select pg_temp.add_check('public.profiles', 'profiles_goal_values', $c$goal is null or goal in ('lose_fat', 'build_muscle', 'tone_up', 'stay_fit', 'sports_performance')$c$);
select pg_temp.add_check('public.profiles', 'profiles_timeline_values', 'timeline_months is null or timeline_months in (1, 3, 6, 12)');
select pg_temp.add_check('public.profiles', 'profiles_target_weight_range', 'target_weight_kg is null or target_weight_kg between 30 and 300');
select pg_temp.add_check('public.profiles', 'profiles_train_location_values', $c$train_location is null or train_location in ('home_none', 'home_equipment', 'gym')$c$);
select pg_temp.add_check('public.profiles', 'profiles_equipment_values', $c$equipment <@ array['dumbbells', 'bands', 'kettlebell', 'pullup_bar', 'bench', 'other']::text[]$c$);
select pg_temp.add_check('public.profiles', 'profiles_equipment_other_len', 'char_length(equipment_other) <= 200');
select pg_temp.add_check('public.profiles', 'profiles_training_days_values', 'training_days <@ array[0, 1, 2, 3, 4, 5, 6] and cardinality(training_days) between 1 and 7');
select pg_temp.add_check('public.profiles', 'profiles_training_time_values', $c$training_time in ('morning', 'midday', 'evening') or training_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'$c$);
select pg_temp.add_check('public.profiles', 'profiles_diet_type_values', $c$diet_type in ('none', 'halal', 'vegetarian', 'vegan', 'pescatarian', 'lactose_free', 'gluten_free')$c$);
select pg_temp.add_check('public.profiles', 'profiles_allergies_values', $c$allergies <@ array['nuts', 'peanuts', 'dairy', 'eggs', 'gluten', 'shellfish', 'fish', 'soy', 'sesame', 'other']::text[]$c$);
select pg_temp.add_check('public.profiles', 'profiles_allergies_other_len', 'char_length(allergies_other) <= 200');
select pg_temp.add_check('public.profiles', 'profiles_dislikes_len', 'char_length(dislikes) <= 500');
select pg_temp.add_check('public.profiles', 'profiles_injuries_len', 'char_length(injuries) <= 1000');
select pg_temp.add_check('public.profiles', 'profiles_injury_areas_values', $c$injury_areas <@ array['knee', 'lower_back', 'shoulder', 'wrist', 'elbow', 'hip', 'ankle', 'neck']::text[]$c$);
select pg_temp.add_check('public.profiles', 'profiles_conditions_values', $c$conditions <@ array['high_blood_pressure', 'diabetes', 'asthma', 'heart_condition', 'pregnant', 'postpartum', 'eating_disorder_history', 'joint_pain', 'other']::text[]$c$);
select pg_temp.add_check('public.profiles', 'profiles_waiver_version_len', 'char_length(waiver_version) <= 40');
select pg_temp.add_check('public.profiles', 'profiles_guardian_name_len', 'char_length(guardian_name) <= 120');
select pg_temp.add_check('public.profiles', 'profiles_onboarding_step_len', 'char_length(onboarding_step) <= 40');
select pg_temp.add_check('public.profiles', 'profiles_timezone_len', 'char_length(timezone) between 1 and 64');
select pg_temp.add_check('public.profiles', 'profiles_reminder_prefs_object', $c$jsonb_typeof(reminder_prefs) = 'object'$c$);
select pg_temp.add_check('public.profiles', 'profiles_health_sync_object', $c$jsonb_typeof(health_sync) = 'object'$c$);

create index if not exists profiles_created_idx on public.profiles (created_at desc);
create index if not exists profiles_last_active_idx on public.profiles (last_active_at desc nulls last);
create index if not exists profiles_goal_idx on public.profiles (goal);
create index if not exists profiles_activity_level_idx on public.profiles (activity_level);
create index if not exists profiles_train_location_idx on public.profiles (train_location);
create index if not exists profiles_birth_date_idx on public.profiles (birth_date);

-- plan_days: what was checked off on a day (workout, each set, each meal).
create table if not exists public.plan_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  workout_done boolean not null default false,
  exercises_done jsonb not null default '[]'::jsonb, -- [[setIdx,...], ...] per exercise
  meals_done jsonb not null default '[]'::jsonb,     -- ["Breakfast", ...]
  primary key (user_id, day)
);
create index if not exists plan_days_workouts_idx on public.plan_days (user_id, day) where workout_done;

-- water: glasses of water per day.
create table if not exists public.water (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0 check (count between 0 and 50),
  primary key (user_id, day)
);

-- weights: one body-weight entry per day (Progress chart).
create table if not exists public.weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kg real not null check (kg between 30 and 300),
  primary key (user_id, day)
);
create index if not exists weights_user_day_idx on public.weights (user_id, day desc);

-- coach_messages: the AI coach chat history, per conversation thread.
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.coach_messages
  add column if not exists conversation_id text not null default 'default';
-- If the column was added by hand earlier (nullable, no default), fix it up.
update public.coach_messages set conversation_id = 'default' where conversation_id is null;
alter table public.coach_messages alter column conversation_id set default 'default';
alter table public.coach_messages alter column conversation_id set not null;
select pg_temp.add_check('public.coach_messages', 'coach_messages_body_len', 'char_length(body) <= 4000');
select pg_temp.add_check('public.coach_messages', 'coach_messages_conversation_len', 'char_length(conversation_id) between 1 and 60');
create index if not exists coach_messages_user_idx
  on public.coach_messages (user_id, created_at desc);
create index if not exists coach_messages_conversation_idx
  on public.coach_messages (user_id, conversation_id, created_at desc);

-- ai_plans: the active AI-generated week (workouts, meals, targets) per user.
-- `plan` is JSON: version 1 (the original week) or version 2 (see
-- docs/API.md, "Plan v2"). change_log keeps the last 20 "what changed and
-- why" notes.
create table if not exists public.ai_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan jsonb not null,
  kcal_target int,
  water_target int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_plans add column if not exists change_log jsonb not null default '[]'::jsonb;
select pg_temp.add_check('public.ai_plans', 'ai_plans_change_log_array', $c$jsonb_typeof(change_log) = 'array'$c$);

-- plan_overrides: per-week changes a person makes to their plan without
-- regenerating it. day_order[i] = which plan day (0 = Monday … 6 = Sunday
-- of the plan) is shown on weekday i of that calendar week, so moving a
-- workout is a swap of two entries. exercise_swaps maps
-- "<planDayIndex>:<exerciseIndex>" to the replacement exercise (JSON).
-- Permanent changes are written into ai_plans.plan instead.
create table if not exists public.plan_overrides (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null, -- the Monday of the calendar week
  day_order int[] not null default '{0,1,2,3,4,5,6}',
  exercise_swaps jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
select pg_temp.add_check('public.plan_overrides', 'plan_overrides_monday', 'extract(isodow from week_start) = 1');
select pg_temp.add_check('public.plan_overrides', 'plan_overrides_day_order_perm', 'cardinality(day_order) = 7 and day_order @> array[0, 1, 2, 3, 4, 5, 6]');
select pg_temp.add_check('public.plan_overrides', 'plan_overrides_swaps_object', $c$jsonb_typeof(exercise_swaps) = 'object'$c$);

-- food_logs: food the person logged (photo, typed, from the plan, or a
-- generated meal), with the estimate they confirmed. The app creates the id
-- on the device so a retried upload never duplicates.
create table if not exists public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  label text not null default '',
  kcal int not null default 0,
  protein int not null default 0,
  confidence text not null default 'medium',
  created_at timestamptz not null default now()
);
-- Existing projects may have created food_logs by hand: add what's missing.
alter table public.food_logs add column if not exists label text not null default '';
alter table public.food_logs add column if not exists kcal int not null default 0;
alter table public.food_logs add column if not exists protein int not null default 0;
alter table public.food_logs add column if not exists confidence text not null default 'medium';
alter table public.food_logs add column if not exists created_at timestamptz not null default now();
-- v2: all macros, where the entry came from, follow-up answers and items.
alter table public.food_logs add column if not exists carbs int not null default 0;
alter table public.food_logs add column if not exists fat int not null default 0;
alter table public.food_logs add column if not exists source text not null default 'photo';
alter table public.food_logs add column if not exists slot text not null default '';
alter table public.food_logs add column if not exists follow_up jsonb not null default '[]'::jsonb;
alter table public.food_logs add column if not exists items jsonb not null default '[]'::jsonb;
select pg_temp.add_check('public.food_logs', 'food_logs_label_len', 'char_length(label) <= 120');
select pg_temp.add_check('public.food_logs', 'food_logs_kcal_range', 'kcal between 0 and 5000');
select pg_temp.add_check('public.food_logs', 'food_logs_protein_range', 'protein between 0 and 300');
select pg_temp.add_check('public.food_logs', 'food_logs_confidence_values', $c$confidence in ('low', 'medium', 'high')$c$);
select pg_temp.add_check('public.food_logs', 'food_logs_carbs_range', 'carbs between 0 and 1000');
select pg_temp.add_check('public.food_logs', 'food_logs_fat_range', 'fat between 0 and 500');
select pg_temp.add_check('public.food_logs', 'food_logs_source_values', $c$source in ('photo', 'text', 'plan', 'generated')$c$);
select pg_temp.add_check('public.food_logs', 'food_logs_slot_values', $c$slot in ('', 'Breakfast', 'Lunch', 'Dinner', 'Snack')$c$);
select pg_temp.add_check('public.food_logs', 'food_logs_follow_up_array', $c$jsonb_typeof(follow_up) = 'array'$c$);
select pg_temp.add_check('public.food_logs', 'food_logs_items_array', $c$jsonb_typeof(items) = 'array'$c$);
create index if not exists food_logs_user_day_idx
  on public.food_logs (user_id, day, created_at);

-- activities: general activities (walking, football, padel …) with the
-- calories they burned (MET × body weight × hours, computed in the app), and
-- workouts imported from Apple Health / Health Connect (source 'health',
-- external_id = the health app's id, so a re-sync never duplicates).
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kind text not null,
  label text not null default '',
  minutes int not null,
  effort text not null default 'moderate',
  kcal int not null default 0,
  source text not null default 'manual',
  external_id text,
  created_at timestamptz not null default now(),
  unique (user_id, external_id)
);
select pg_temp.add_check('public.activities', 'activities_kind_values', $c$kind in ('walking', 'running', 'football', 'basketball', 'swimming', 'cycling', 'padel', 'hiking', 'dancing', 'strength', 'other')$c$);
select pg_temp.add_check('public.activities', 'activities_label_len', 'char_length(label) <= 80');
select pg_temp.add_check('public.activities', 'activities_minutes_range', 'minutes between 1 and 720');
select pg_temp.add_check('public.activities', 'activities_effort_values', $c$effort in ('easy', 'moderate', 'hard')$c$);
select pg_temp.add_check('public.activities', 'activities_kcal_range', 'kcal between 0 and 5000');
select pg_temp.add_check('public.activities', 'activities_source_values', $c$source in ('manual', 'health')$c$);
select pg_temp.add_check('public.activities', 'activities_external_id_len', 'external_id is null or char_length(external_id) between 1 and 200');
create index if not exists activities_user_day_idx on public.activities (user_id, day desc, created_at);

-- health_daily: daily totals read from Apple Health / Health Connect.
create table if not exists public.health_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  steps int,
  active_kcal int,
  sleep_minutes int,
  source text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
select pg_temp.add_check('public.health_daily', 'health_daily_steps_range', 'steps is null or steps between 0 and 200000');
select pg_temp.add_check('public.health_daily', 'health_daily_kcal_range', 'active_kcal is null or active_kcal between 0 and 20000');
select pg_temp.add_check('public.health_daily', 'health_daily_sleep_range', 'sleep_minutes is null or sleep_minutes between 0 and 1440');
select pg_temp.add_check('public.health_daily', 'health_daily_source_values', $c$source in ('', 'apple_health', 'health_connect')$c$);

-- body_photos: progress photos, face blurred on the phone before upload.
-- The file lives in the private `body-photos` bucket at
-- <user id>/<set id>/<kind>.jpg; this row points to it. One set = the photos
-- taken together (front required; side and back optional).
create table if not exists public.body_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null,
  kind text not null,
  source text not null default 'signup',
  storage_path text not null,
  taken_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, set_id, kind)
);
select pg_temp.add_check('public.body_photos', 'body_photos_kind_values', $c$kind in ('front', 'side', 'back')$c$);
select pg_temp.add_check('public.body_photos', 'body_photos_source_values', $c$source in ('signup', 'checkin')$c$);
select pg_temp.add_check('public.body_photos', 'body_photos_path_own_folder', $c$storage_path like user_id::text || '/%' and char_length(storage_path) <= 200$c$);
create index if not exists body_photos_user_idx on public.body_photos (user_id, taken_at desc);

-- body_analyses: the AI's rough starting-point estimate from one photo set
-- plus the questionnaire (body-fat RANGE, build, posture notes, training
-- focus). Written by the body-analysis Edge Function.
create table if not exists public.body_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_set_id uuid,
  result jsonb not null,
  model text not null default '',
  created_at timestamptz not null default now()
);
select pg_temp.add_check('public.body_analyses', 'body_analyses_result_object', $c$jsonb_typeof(result) = 'object'$c$);
create index if not exists body_analyses_user_idx on public.body_analyses (user_id, created_at desc);

-- checkins: weekly weigh-ins and monthly check-ins (weight, measurements,
-- answers, photo set) plus the AI's review and the plan changes it made.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  day date not null,
  weight_kg real,
  measurements jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  photo_set_id uuid,
  photo_ids uuid[] not null default '{}',
  ai_summary text not null default '',
  plan_changes jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, day)
);
select pg_temp.add_check('public.checkins', 'checkins_kind_values', $c$kind in ('weekly', 'monthly')$c$);
select pg_temp.add_check('public.checkins', 'checkins_weight_range', 'weight_kg is null or weight_kg between 30 and 300');
select pg_temp.add_check('public.checkins', 'checkins_measurements_object', $c$jsonb_typeof(measurements) = 'object'$c$);
select pg_temp.add_check('public.checkins', 'checkins_answers_object', $c$jsonb_typeof(answers) = 'object'$c$);
select pg_temp.add_check('public.checkins', 'checkins_summary_len', 'char_length(ai_summary) <= 4000');
create index if not exists checkins_user_idx on public.checkins (user_id, kind, day desc);

-- coach_memory: durable facts the coach keeps about a person (injuries,
-- likes, schedule …), from chat, behaviour (swaps, missed days) or
-- check-ins. People can see and delete every item, never edit one.
-- fact_key de-duplicates the same fact written twice.
create table if not exists public.coach_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fact text not null,
  category text not null default 'other',
  source text not null default 'chat',
  fact_key text generated always as (btrim(lower(regexp_replace(fact, '[[:space:][:punct:]]+', ' ', 'g')))) stored,
  created_at timestamptz not null default now(),
  unique (user_id, fact_key)
);
select pg_temp.add_check('public.coach_memory', 'coach_memory_fact_len', 'char_length(btrim(fact)) between 3 and 240');
select pg_temp.add_check('public.coach_memory', 'coach_memory_category_values', $c$category in ('injury', 'health', 'preference', 'like', 'dislike', 'schedule', 'goal', 'equipment', 'food', 'training', 'other')$c$);
select pg_temp.add_check('public.coach_memory', 'coach_memory_source_values', $c$source in ('chat', 'behaviour', 'checkin', 'profile')$c$);
create index if not exists coach_memory_user_idx on public.coach_memory (user_id, created_at desc);

-- problem_reports + report_messages: "Report a problem" in the app. People
-- add and read their own; only the admin (service role) changes the status
-- or writes admin replies.
create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null,
  message text not null,
  screenshot_path text,
  status text not null default 'new',
  platform text not null default '',
  app_version text not null default '',
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select pg_temp.add_check('public.problem_reports', 'problem_reports_category_values', $c$category in ('bug', 'plan', 'food', 'account', 'other')$c$);
select pg_temp.add_check('public.problem_reports', 'problem_reports_message_len', 'char_length(btrim(message)) between 1 and 4000');
select pg_temp.add_check('public.problem_reports', 'problem_reports_status_values', $c$status in ('new', 'in_progress', 'fixed')$c$);
select pg_temp.add_check('public.problem_reports', 'problem_reports_screenshot_own_folder', $c$screenshot_path is null or (screenshot_path like user_id::text || '/%' and char_length(screenshot_path) <= 200)$c$);
select pg_temp.add_check('public.problem_reports', 'problem_reports_platform_len', 'char_length(platform) <= 20 and char_length(app_version) <= 40');
create index if not exists problem_reports_status_idx on public.problem_reports (status, last_message_at desc);
create index if not exists problem_reports_user_idx on public.problem_reports (user_id, created_at desc);
create index if not exists problem_reports_last_message_idx on public.problem_reports (last_message_at desc);

create table if not exists public.report_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.problem_reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade, -- the report's owner
  author text not null default 'user',
  body text not null,
  created_at timestamptz not null default now()
);
select pg_temp.add_check('public.report_messages', 'report_messages_author_values', $c$author in ('user', 'admin')$c$);
select pg_temp.add_check('public.report_messages', 'report_messages_body_len', 'char_length(btrim(body)) between 1 and 4000');
create index if not exists report_messages_report_idx on public.report_messages (report_id, created_at);
create index if not exists report_messages_user_idx on public.report_messages (user_id, created_at desc);

-- push_tokens: Expo push tokens, one row per device and account. Registered
-- through register_push_token() so a phone that changes hands moves to the
-- new account.
create table if not exists public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
select pg_temp.add_check('public.push_tokens', 'push_tokens_platform_values', $c$platform in ('ios', 'android', 'web')$c$);
select pg_temp.add_check('public.push_tokens', 'push_tokens_token_len', 'char_length(token) between 10 and 300');
create index if not exists push_tokens_token_idx on public.push_tokens (token);

-- ai_usage: how many paid AI calls each person made per day, per kind.
-- Written only by public.bump_ai_usage (below), called from the Edge
-- Functions; people can read their own counts but never change them.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  kind text not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);
-- v1 allowed three kinds inline; v2 adds more.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
select pg_temp.add_check('public.ai_usage', 'ai_usage_kind_values_v2', $c$kind in ('plan', 'meal_photo', 'coach', 'food_text', 'meal_swap', 'meal_generate', 'body_analysis', 'checkin')$c$);

-- contact_messages: the website contact form. Anyone may send one; nobody
-- can read, change or delete them through the API.
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topic text not null default '',
  message text not null,
  source text not null default 'website',
  created_at timestamptz not null default now()
);
select pg_temp.add_check('public.contact_messages', 'contact_messages_name_len', 'char_length(btrim(name)) between 1 and 120');
select pg_temp.add_check('public.contact_messages', 'contact_messages_email_len', 'char_length(email) between 3 and 254');
select pg_temp.add_check('public.contact_messages', 'contact_messages_email_shape', $c$email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'$c$);
select pg_temp.add_check('public.contact_messages', 'contact_messages_topic_len', 'char_length(topic) <= 120');
select pg_temp.add_check('public.contact_messages', 'contact_messages_message_len', 'char_length(btrim(message)) between 1 and 5000');
select pg_temp.add_check('public.contact_messages', 'contact_messages_source_len', 'char_length(source) between 1 and 40');
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);

-- ─────────────── service-role-only tables (admin, configuration) ───────────────

-- app_config: settings the Edge Functions read when a secret isn't set
-- (OPENROUTER_API_KEY, OPENAI_API_KEY, AI_MODEL, VISION_MODEL). Edit in
-- Table Editor → app_config, or with SQL (see supabase/README.md).
create table if not exists public.app_config (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- The one admin login. Username and a bcrypt hash; set with
-- select public.admin_set_credentials('name', 'password'); (README).
create table if not exists public.admin_credentials (
  id int primary key default 1 check (id = 1),
  username text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- Admin sessions: only a SHA-256 hash of each token is stored.
create table if not exists public.admin_sessions (
  token_hash text primary key,
  ip text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index if not exists admin_sessions_expires_idx on public.admin_sessions (expires_at);

-- Every admin login attempt, for the lockout (and an audit trail).
create table if not exists public.admin_login_attempts (
  id bigint generated always as identity primary key,
  ip text not null default '',
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_login_attempts_ip_idx on public.admin_login_attempts (ip, created_at desc);
create index if not exists admin_login_attempts_created_idx on public.admin_login_attempts (created_at desc);

-- Active lockouts: scope 'ip:<address>' or 'global'.
create table if not exists public.admin_lockouts (
  scope text primary key,
  locked_until timestamptz not null
);

-- ═══════════════════════════ row level security ═══════════════════════════

alter table public.profiles             enable row level security;
alter table public.plan_days            enable row level security;
alter table public.water                enable row level security;
alter table public.weights              enable row level security;
alter table public.coach_messages       enable row level security;
alter table public.ai_plans             enable row level security;
alter table public.plan_overrides       enable row level security;
alter table public.food_logs            enable row level security;
alter table public.activities           enable row level security;
alter table public.health_daily         enable row level security;
alter table public.body_photos          enable row level security;
alter table public.body_analyses        enable row level security;
alter table public.checkins             enable row level security;
alter table public.coach_memory         enable row level security;
alter table public.problem_reports      enable row level security;
alter table public.report_messages      enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.ai_usage             enable row level security;
alter table public.contact_messages     enable row level security;
alter table public.app_config           enable row level security;
alter table public.admin_credentials    enable row level security;
alter table public.admin_sessions       enable row level security;
alter table public.admin_login_attempts enable row level security;
alter table public.admin_lockouts       enable row level security;
-- (app_config and admin_* have no policies at all: with RLS on and no
-- grants, only the service role reaches them.)

select pg_temp.put_policy('public', 'profiles', 'own profile',
  $p$create policy "own profile" on public.profiles for all to authenticated using (auth.uid() = id) with check (auth.uid() = id)$p$,
  $p$alter policy "own profile" on public.profiles to authenticated using (auth.uid() = id) with check (auth.uid() = id)$p$);

select pg_temp.put_policy('public', 'plan_days', 'own plan days',
  $p$create policy "own plan days" on public.plan_days for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own plan days" on public.plan_days to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'water', 'own water',
  $p$create policy "own water" on public.water for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own water" on public.water to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'weights', 'own weights',
  $p$create policy "own weights" on public.weights for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own weights" on public.weights to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

-- Coach history: read and add your own messages. No update or delete, so
-- the daily message limit (counted from this table) can't be reset.
-- An older version of this script had one catch-all "own coach messages"
-- policy. It is left in place on purpose (dropping it would need a
-- destructive-statement confirmation): the table grants below limit
-- coach_messages to select and insert for `authenticated`, so the catch-all
-- cannot allow an update or delete.
select pg_temp.put_policy('public', 'coach_messages', 'read own coach messages',
  $p$create policy "read own coach messages" on public.coach_messages for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own coach messages" on public.coach_messages to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'coach_messages', 'add own coach messages',
  $p$create policy "add own coach messages" on public.coach_messages for insert to authenticated with check (auth.uid() = user_id)$p$,
  $p$alter policy "add own coach messages" on public.coach_messages to authenticated with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'ai_plans', 'own ai plan',
  $p$create policy "own ai plan" on public.ai_plans for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own ai plan" on public.ai_plans to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'plan_overrides', 'own plan overrides',
  $p$create policy "own plan overrides" on public.plan_overrides for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own plan overrides" on public.plan_overrides to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'food_logs', 'own food logs',
  $p$create policy "own food logs" on public.food_logs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own food logs" on public.food_logs to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'activities', 'own activities',
  $p$create policy "own activities" on public.activities for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own activities" on public.activities to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'health_daily', 'own health daily',
  $p$create policy "own health daily" on public.health_daily for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own health daily" on public.health_daily to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

-- Body photos: add, read and delete your own; never edit (no update policy).
select pg_temp.put_policy('public', 'body_photos', 'read own body photos',
  $p$create policy "read own body photos" on public.body_photos for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own body photos" on public.body_photos to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'body_photos', 'add own body photos',
  $p$create policy "add own body photos" on public.body_photos for insert to authenticated with check (auth.uid() = user_id)$p$,
  $p$alter policy "add own body photos" on public.body_photos to authenticated with check (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'body_photos', 'delete own body photos',
  $p$create policy "delete own body photos" on public.body_photos for delete to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "delete own body photos" on public.body_photos to authenticated using (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'body_analyses', 'read own body analyses',
  $p$create policy "read own body analyses" on public.body_analyses for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own body analyses" on public.body_analyses to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'body_analyses', 'add own body analyses',
  $p$create policy "add own body analyses" on public.body_analyses for insert to authenticated with check (auth.uid() = user_id)$p$,
  $p$alter policy "add own body analyses" on public.body_analyses to authenticated with check (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'body_analyses', 'delete own body analyses',
  $p$create policy "delete own body analyses" on public.body_analyses for delete to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "delete own body analyses" on public.body_analyses to authenticated using (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'checkins', 'own checkins',
  $p$create policy "own checkins" on public.checkins for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "own checkins" on public.checkins to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

-- Coach memory: read, add and delete your own facts; no edits.
select pg_temp.put_policy('public', 'coach_memory', 'read own memory',
  $p$create policy "read own memory" on public.coach_memory for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own memory" on public.coach_memory to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'coach_memory', 'add own memory',
  $p$create policy "add own memory" on public.coach_memory for insert to authenticated with check (auth.uid() = user_id)$p$,
  $p$alter policy "add own memory" on public.coach_memory to authenticated with check (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'coach_memory', 'delete own memory',
  $p$create policy "delete own memory" on public.coach_memory for delete to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "delete own memory" on public.coach_memory to authenticated using (auth.uid() = user_id)$p$);

-- Reports: add and read your own. The only column you may update is your
-- own "last read" time (column grant below); status is admin-only.
select pg_temp.put_policy('public', 'problem_reports', 'read own reports',
  $p$create policy "read own reports" on public.problem_reports for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own reports" on public.problem_reports to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'problem_reports', 'add own reports',
  $p$create policy "add own reports" on public.problem_reports for insert to authenticated with check (auth.uid() = user_id and status = 'new')$p$,
  $p$alter policy "add own reports" on public.problem_reports to authenticated with check (auth.uid() = user_id and status = 'new')$p$);
select pg_temp.put_policy('public', 'problem_reports', 'mark own reports read',
  $p$create policy "mark own reports read" on public.problem_reports for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "mark own reports read" on public.problem_reports to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

-- Report messages: read the thread of your own reports, add your own
-- replies (author is always 'user'; admin replies come from the service role).
select pg_temp.put_policy('public', 'report_messages', 'read own report messages',
  $p$create policy "read own report messages" on public.report_messages for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own report messages" on public.report_messages to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'report_messages', 'add own report messages',
  $p$create policy "add own report messages" on public.report_messages for insert to authenticated with check (auth.uid() = user_id and author = 'user' and exists (select 1 from public.problem_reports r where r.id = report_id and r.user_id = auth.uid()))$p$,
  $p$alter policy "add own report messages" on public.report_messages to authenticated with check (auth.uid() = user_id and author = 'user' and exists (select 1 from public.problem_reports r where r.id = report_id and r.user_id = auth.uid()))$p$);

select pg_temp.put_policy('public', 'push_tokens', 'read own push tokens',
  $p$create policy "read own push tokens" on public.push_tokens for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own push tokens" on public.push_tokens to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'push_tokens', 'delete own push tokens',
  $p$create policy "delete own push tokens" on public.push_tokens for delete to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "delete own push tokens" on public.push_tokens to authenticated using (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'ai_usage', 'read own ai usage',
  $p$create policy "read own ai usage" on public.ai_usage for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own ai usage" on public.ai_usage to authenticated using (auth.uid() = user_id)$p$);

select pg_temp.put_policy('public', 'contact_messages', 'anyone can send a contact message',
  $p$create policy "anyone can send a contact message" on public.contact_messages for insert to anon, authenticated with check (true)$p$,
  $p$alter policy "anyone can send a contact message" on public.contact_messages to anon, authenticated with check (true)$p$);

-- ═══════════════════════════════ functions ═══════════════════════════════

-- Profile row for every new signup (name comes from signup metadata).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Whole years between a birth date and a day.
create or replace function public.age_on(p_birth date, p_day date)
returns int language sql immutable set search_path = public as $$
  select extract(year from age(p_day, p_birth))::int
$$;

-- Profile rules the database enforces (the app checks them too):
--   * nobody under 13 (error code BU013);
--   * finishing onboarding needs a birth date (BU016) and the waiver (BU014);
--   * 13 to 17 year olds also need a guardian's name and consent (BU015).
-- `age` is kept in sync with birth_date. Only re-checked when one of the
-- fields involved changes, so routine updates never trip on an old row.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_age int;
begin
  if new.birth_date is not null then
    v_age := public.age_on(new.birth_date, current_date);
    new.age := v_age;
  end if;

  if tg_op = 'INSERT'
     or new.birth_date is distinct from old.birth_date
     or new.onboarding_done_at is distinct from old.onboarding_done_at
     or new.guardian_name is distinct from old.guardian_name
     or new.guardian_consent_at is distinct from old.guardian_consent_at
     or new.waiver_accepted_at is distinct from old.waiver_accepted_at then
    if new.birth_date is not null and new.birth_date > current_date then
      raise exception 'Enter a real date of birth.' using errcode = 'BU016';
    end if;
    if v_age is not null and v_age < 13 then
      raise exception 'BUILT is for people aged 13 and over.' using errcode = 'BU013';
    end if;
    if new.onboarding_done_at is not null then
      if new.birth_date is null then
        raise exception 'Add your date of birth to finish.' using errcode = 'BU016';
      end if;
      if new.waiver_accepted_at is null or new.waiver_version = '' then
        raise exception 'Accept the waiver to finish.' using errcode = 'BU014';
      end if;
      if v_age < 18 and (btrim(new.guardian_name) = '' or new.guardian_consent_at is null) then
        raise exception 'A parent or guardian needs to give consent first.' using errcode = 'BU015';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- last_active_at follows real use: any write to the person's data bumps it
-- (at most every 5 minutes). Never blocks the write that triggered it.
create or replace function public.touch_last_active()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Admin replies are not the person being active. (Read through JSON:
  -- the other tables have no `author` column.)
  if coalesce(to_jsonb(new) ->> 'author', 'user') <> 'user' then
    return null;
  end if;
  begin
    update public.profiles set last_active_at = now()
    where id = new.user_id and (last_active_at is null or last_active_at < now() - interval '5 minutes');
  exception when others then
    null;
  end;
  return null;
end;
$$;

do $touch$
declare
  t text;
begin
  foreach t in array array['plan_days', 'water', 'weights', 'food_logs', 'activities', 'coach_messages', 'checkins', 'report_messages', 'coach_memory'] loop
    execute format('create or replace trigger touch_last_active after insert or update on public.%I for each row execute function public.touch_last_active()', t);
  end loop;
end;
$touch$;

-- Keeps a report's last_message_at current when anyone adds a message.
create or replace function public.report_message_added()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.problem_reports
  set last_message_at = new.created_at, updated_at = now()
  where id = new.report_id;
  return null;
end;
$$;

create or replace trigger report_message_added
  after insert on public.report_messages
  for each row execute function public.report_message_added();

-- Count one AI call for the signed-in person, if they are under today's
-- limit. Returns the new count, or NULL when the limit is already reached
-- (nothing is counted then). Atomic, so parallel requests can't slip past.
-- "Today" is the UTC day.
create or replace function public.bump_ai_usage(p_kind text, p_limit int)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_count int;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.ai_usage as u (user_id, day, kind, count)
  values (uid, (now() at time zone 'utc')::date, p_kind, 1)
  on conflict (user_id, day, kind)
    do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into new_count;
  return new_count; -- NULL when the conflict row was at the limit
end;
$$;

revoke all on function public.bump_ai_usage(text, int) from public, anon;
grant execute on function public.bump_ai_usage(text, int) to authenticated, service_role;

-- Register this device's push token for the signed-in person. A token that
-- belonged to another account on the same phone moves to this one: the other
-- account's row is kept but its token is renamed ('retired:…'), so it can no
-- longer be pushed to and nothing is deleted.
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.push_tokens set token = 'retired:' || gen_random_uuid()::text, updated_at = now()
  where token = p_token and user_id <> uid;
  insert into public.push_tokens (user_id, token, platform, updated_at)
  values (uid, p_token, p_platform, now())
  on conflict (user_id, token) do update set platform = excluded.platform, updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated, service_role;

-- ─────────────────────────────── admin ───────────────────────────────
-- Every admin_* function is SECURITY DEFINER and executable by the service
-- role only (the `admin` Edge Function). Nobody can call them from the app
-- or the website directly.

-- Set (or change) the admin username and password. Run it in the SQL
-- Editor: select public.admin_set_credentials('username', 'password');
-- Signs out every admin session and clears lockouts. Nothing is deleted:
-- sessions are ended and lockouts lifted by setting their end time to now,
-- and the expired rows stay as an audit trail.
create or replace function public.admin_set_credentials(p_username text, p_password text)
returns text
language plpgsql
security definer set search_path = public, extensions, pg_temp
as $$
begin
  if p_username is null or char_length(btrim(p_username)) not between 3 and 64 then
    raise exception 'The username must be 3 to 64 characters.';
  end if;
  if p_password is null or char_length(p_password) < 12 then
    raise exception 'The password must be at least 12 characters.';
  end if;
  insert into public.admin_credentials (id, username, password_hash, updated_at)
  values (1, btrim(p_username), extensions.crypt(p_password, extensions.gen_salt('bf', 12)), now())
  on conflict (id) do update
    set username = excluded.username, password_hash = excluded.password_hash, updated_at = now();
  update public.admin_sessions set expires_at = now() where expires_at > now();
  update public.admin_lockouts set locked_until = now() where locked_until > now();
  return 'Admin login saved. Every earlier admin session is signed out.';
end;
$$;

-- Log in. Returns {"ok":true,"token":…,"expires_at":…} or
-- {"ok":false,"error":"invalid"|"locked"|"not_configured","locked_until":…}.
-- Lockout: 5 failed attempts from one address within 15 minutes lock that
-- address for 15 minutes; 20 failures from anywhere lock every login for
-- 15 minutes. Sessions last 12 hours. Expired sessions, lifted lockouts and
-- old attempts are never deleted: they stay as an audit trail, and every
-- check below only looks at rows that are still live.
create or replace function public.admin_login(p_username text, p_password text, p_ip text default '')
returns jsonb
language plpgsql
security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_ip text := left(coalesce(p_ip, ''), 100);
  v_lock timestamptz;
  v_cred public.admin_credentials;
  v_hash text;
  v_ok boolean;
  v_fails int;
  v_last_ok timestamptz;
  v_token text;
  v_expires timestamptz;
  -- bcrypt hash of a random string: keeps the timing equal when no admin
  -- login is configured or the username is wrong.
  c_dummy constant text := '$2a$12$tlOhBBmA4xrh6/43SYxdOeg0uhTwUDgMIOa1eu9VSGNKyEtRIciOW';
begin
  select max(locked_until) into v_lock from public.admin_lockouts
  where scope in ('ip:' || v_ip, 'global') and locked_until > now();
  if v_lock is not null then
    return jsonb_build_object('ok', false, 'error', 'locked', 'locked_until', v_lock);
  end if;

  select * into v_cred from public.admin_credentials where id = 1;
  v_hash := extensions.crypt(coalesce(p_password, ''), coalesce(v_cred.password_hash, c_dummy));
  v_ok := v_cred.id is not null
    and lower(btrim(coalesce(p_username, ''))) = lower(v_cred.username)
    and v_hash = v_cred.password_hash;

  insert into public.admin_login_attempts (ip, ok) values (v_ip, v_ok);

  if not v_ok then
    select max(created_at) into v_last_ok from public.admin_login_attempts where ip = v_ip and ok;
    select count(*) into v_fails from public.admin_login_attempts
    where ip = v_ip and not ok and created_at > now() - interval '15 minutes'
      and (v_last_ok is null or created_at > v_last_ok);
    if v_fails >= 5 then
      insert into public.admin_lockouts (scope, locked_until) values ('ip:' || v_ip, now() + interval '15 minutes')
      on conflict (scope) do update set locked_until = excluded.locked_until;
      v_lock := now() + interval '15 minutes';
    end if;
    select count(*) into v_fails from public.admin_login_attempts
    where not ok and created_at > now() - interval '15 minutes';
    if v_fails >= 20 then
      insert into public.admin_lockouts (scope, locked_until) values ('global', now() + interval '15 minutes')
      on conflict (scope) do update set locked_until = excluded.locked_until;
      v_lock := now() + interval '15 minutes';
    end if;
    if v_cred.id is null then
      return jsonb_build_object('ok', false, 'error', 'not_configured');
    end if;
    return jsonb_build_object('ok', false, 'error', case when v_lock is null then 'invalid' else 'locked' end, 'locked_until', v_lock);
  end if;

  update public.admin_lockouts set locked_until = now() where scope = 'ip:' || v_ip and locked_until > now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + interval '12 hours';
  insert into public.admin_sessions (token_hash, ip, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_ip, v_expires);
  return jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
end;
$$;

-- True when the token belongs to a live session (and marks it as seen).
create or replace function public.admin_session_check(p_token text)
returns boolean
language plpgsql
security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_found boolean;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update public.admin_sessions set last_seen_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and expires_at > now()
  returning true into v_found;
  return coalesce(v_found, false);
end;
$$;

-- Ends the session (expires it now); the row stays as an audit trail.
create or replace function public.admin_logout(p_token text)
returns void
language sql
security definer set search_path = public, extensions, pg_temp
as $$
  update public.admin_sessions set expires_at = now()
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now();
$$;

-- The workout streak, the same rule as the app (mobile/src/streak.ts): a
-- done workout adds one, a past scheduled training day left undone resets
-- to zero, rest days are neutral, today counts once done. The schedule is
-- the active plan's week, else the person's training days, else the
-- built-in week. Moved days (plan_overrides) are not considered.
create or replace function public.user_streak(p_user uuid, p_today date default null)
returns int
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_prof public.profiles;
  v_plan jsonb;
  v_today date;
  v_sched boolean[] := array[true, true, false, true, true, false, true]; -- Mon..Sun
  v_done date[];
  v_running int := 0;
  d date;
  i int;
begin
  select * into v_prof from public.profiles where id = p_user;
  v_today := coalesce(p_today, (now() at time zone coalesce(v_prof.timezone, 'Asia/Beirut'))::date);
  select plan into v_plan from public.ai_plans where user_id = p_user;
  if v_plan is not null and jsonb_typeof(v_plan -> 'days') = 'array' and jsonb_array_length(v_plan -> 'days') = 7 then
    for i in 0..6 loop
      v_sched[i + 1] := coalesce(v_plan -> 'days' -> i -> 'session' ->> 'kind', 'rest') = 'workout';
    end loop;
  elsif v_prof.onboarding_done_at is not null and v_prof.training_days is not null then
    for i in 0..6 loop
      v_sched[i + 1] := ((i + 1) % 7) = any (v_prof.training_days); -- Mon-first index → 0 = Sunday
    end loop;
  end if;

  select array_agg(day order by day) into v_done from public.plan_days
  where user_id = p_user and workout_done and day between v_today - 366 and v_today;
  if v_done is null then
    return 0;
  end if;
  d := v_done[1];
  while d <= v_today loop
    if d = any (v_done) then
      v_running := v_running + 1;
    elsif d < v_today and v_sched[extract(isodow from d)::int] then
      v_running := 0;
    end if;
    d := d + 1;
  end loop;
  return v_running;
end;
$$;

-- Age group label used by the admin filters.
create or replace function public.age_group(p_birth date, p_age int)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when a is null then 'unknown'
    when a < 18 then 'under_18'
    when a < 25 then '18_24'
    when a < 35 then '25_34'
    when a < 45 then '35_44'
    when a < 55 then '45_54'
    else '55_plus'
  end
  from (select coalesce(public.age_on(p_birth, current_date), p_age) as a) x
$$;

-- Due check-ins: weekly weigh-in when no weight was logged for 7 days;
-- monthly check-in when the last one (or signup) is 30+ days ago.
create or replace function public.checkins_due(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'weekly', coalesce((select max(day) from public.weights where user_id = p_user), date '1900-01-01') <= current_date - 7,
    'monthly', coalesce(
      (select max(day) from public.checkins where user_id = p_user and kind = 'monthly'),
      (select created_at::date from public.profiles where id = p_user)
    ) <= current_date - 30
  )
$$;

-- Overview numbers for the dashboard home. Days are Beirut days.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_start timestamptz := (v_today::timestamp at time zone 'Asia/Beirut');
  v_out jsonb;
begin
  with s as (
    select p.id, public.user_streak(p.id) as streak, public.checkins_due(p.id) as due
    from public.profiles p
  )
  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'new_this_week', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'active_today', (select count(*) from public.profiles where last_active_at >= v_start),
    'active_7d', (select count(*) from public.profiles where last_active_at >= now() - interval '7 days'),
    'onboarding_incomplete', (select count(*) from public.profiles where onboarding_done_at is null),
    'avg_streak', coalesce((select round(avg(streak)::numeric, 1) from s), 0),
    'checkins_due', jsonb_build_object(
      'weekly', (select count(*) from s where (due ->> 'weekly')::boolean),
      'monthly', (select count(*) from s where (due ->> 'monthly')::boolean)
    ),
    'open_reports', (select count(*) from public.problem_reports where status <> 'fixed'),
    'reports_by_status', jsonb_build_object(
      'new', (select count(*) from public.problem_reports where status = 'new'),
      'in_progress', (select count(*) from public.problem_reports where status = 'in_progress'),
      'fixed', (select count(*) from public.problem_reports where status = 'fixed')
    ),
    'users_by_goal', coalesce((select jsonb_object_agg(coalesce(goal, 'unknown'), n) from (
      select goal, count(*) as n from public.profiles group by goal) g), '{}'::jsonb),
    'signups_14d', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'count', n) order by d) from (
      select gs::date as d, (select count(*) from public.profiles
        where (created_at at time zone 'Asia/Beirut')::date = gs::date) as n
      from generate_series(v_today - 13, v_today, interval '1 day') gs) x), '[]'::jsonb),
    'generated_at', now()
  ) into v_out;
  return v_out;
end;
$$;

-- Users list with search, filters, sort and paging. p is JSON; every key
-- is optional:
--   q            text in name, email or phone
--   goal, activity_level, train_location, age_group   exact values
--   active       'today' | '7d' | '30d' | 'inactive_30d' | 'never'
--   signed_from, signed_to   yyyy-mm-dd (Beirut days, inclusive)
--   streak_min, streak_max   integers
--   onboarding   'done' | 'incomplete'
--   sort         'created_desc' (default) | 'created_asc' | 'last_active_desc' | 'name_asc' | 'streak_desc'
--   limit        1..5000 (default 50), offset (default 0)
-- Returns {"total": n, "rows": [...]}.
create or replace function public.admin_users(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 5000);
  v_offset int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_sort text := coalesce(p ->> 'sort', 'created_desc');
  v_out jsonb;
begin
  with base as (
    select
      pr.id, pr.name, u.email::text as email, pr.phone, pr.gender,
      coalesce(public.age_on(pr.birth_date, current_date), pr.age) as age,
      public.age_group(pr.birth_date, pr.age) as age_group,
      pr.goal, pr.activity_level, pr.train_location, pr.timeline_months,
      pr.created_at, pr.last_active_at, pr.onboarding_done_at
    from public.profiles pr
    join auth.users u on u.id = pr.id
    where (v_q is null or pr.name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%' or pr.phone like '%' || regexp_replace(v_q, '[^0-9+]', '', 'g') || '%' and regexp_replace(v_q, '[^0-9]', '', 'g') <> '')
      and (p ->> 'goal' is null or pr.goal = p ->> 'goal')
      and (p ->> 'activity_level' is null or pr.activity_level = p ->> 'activity_level')
      and (p ->> 'train_location' is null or pr.train_location = p ->> 'train_location')
      and (p ->> 'signed_from' is null or (pr.created_at at time zone 'Asia/Beirut')::date >= (p ->> 'signed_from')::date)
      and (p ->> 'signed_to' is null or (pr.created_at at time zone 'Asia/Beirut')::date <= (p ->> 'signed_to')::date)
      and (p ->> 'onboarding' is null
        or (p ->> 'onboarding' = 'done' and pr.onboarding_done_at is not null)
        or (p ->> 'onboarding' = 'incomplete' and pr.onboarding_done_at is null))
      and (p ->> 'active' is null
        or (p ->> 'active' = 'today' and pr.last_active_at >= (v_today::timestamp at time zone 'Asia/Beirut'))
        or (p ->> 'active' = '7d' and pr.last_active_at >= now() - interval '7 days')
        or (p ->> 'active' = '30d' and pr.last_active_at >= now() - interval '30 days')
        or (p ->> 'active' = 'inactive_30d' and (pr.last_active_at is null or pr.last_active_at < now() - interval '30 days'))
        or (p ->> 'active' = 'never' and pr.last_active_at is null))
  ),
  filtered as (
    select b.*, public.user_streak(b.id) as streak
    from base b
    where p ->> 'age_group' is null or b.age_group = p ->> 'age_group'
  ),
  final as (
    select * from filtered
    where (p ->> 'streak_min' is null or streak >= (p ->> 'streak_min')::int)
      and (p ->> 'streak_max' is null or streak <= (p ->> 'streak_max')::int)
  ),
  page as (
    select * from final
    order by
      case when v_sort = 'created_asc' then created_at end asc,
      case when v_sort = 'last_active_desc' then last_active_at end desc nulls last,
      case when v_sort = 'name_asc' then lower(name) end asc,
      case when v_sort = 'streak_desc' then streak end desc,
      created_at desc
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from final),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'email', email, 'phone', phone, 'gender', gender,
      'age', age, 'age_group', age_group, 'goal', goal, 'activity_level', activity_level,
      'train_location', train_location, 'timeline_months', timeline_months,
      'created_at', created_at, 'last_active_at', last_active_at,
      'onboarding_done', onboarding_done_at is not null, 'streak', streak
    )) from page), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- Everything about one person for the dashboard, except body photos and
-- the photo estimate (never shown to the admin).
create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_prof public.profiles;
  v_email text;
  v_out jsonb;
begin
  select * into v_prof from public.profiles where id = p_user;
  if v_prof.id is null then
    return null;
  end if;
  select email::text into v_email from auth.users where id = p_user;

  select jsonb_build_object(
    'profile', (to_jsonb(v_prof) - 'reminder_prefs' - 'health_sync') || jsonb_build_object(
      'email', v_email,
      'age', coalesce(public.age_on(v_prof.birth_date, current_date), v_prof.age),
      'age_group', public.age_group(v_prof.birth_date, v_prof.age)
    ),
    'stats', jsonb_build_object(
      'streak', public.user_streak(p_user),
      'workouts_done', (select count(*) from public.plan_days where user_id = p_user and workout_done),
      'meals_done', (select coalesce(sum(jsonb_array_length(meals_done)), 0) from public.plan_days where user_id = p_user),
      'food_logs', (select count(*) from public.food_logs where user_id = p_user),
      'activities', (select count(*) from public.activities where user_id = p_user),
      'activity_kcal_30d', (select coalesce(sum(kcal), 0) from public.activities where user_id = p_user and day >= current_date - 30),
      'checkins', (select count(*) from public.checkins where user_id = p_user),
      'coach_messages', (select count(*) from public.coach_messages where user_id = p_user and role = 'user'),
      'checkins_due', public.checkins_due(p_user)
    ),
    'plan', (select jsonb_build_object('kcal_target', kcal_target, 'water_target', water_target,
      'updated_at', updated_at, 'version', coalesce((plan ->> 'version')::int, 1),
      'recent_changes', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
        select e from jsonb_array_elements(change_log) e limit 5) c))
      from public.ai_plans where user_id = p_user),
    'weights', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'kg', kg) order by day)
      from public.weights where user_id = p_user and day >= current_date - 365), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(a order by a.day desc, a.created_at desc) from (
      select id, day, kind, label, minutes, effort, kcal, source, created_at
      from public.activities where user_id = p_user order by day desc, created_at desc limit 50) a), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(c order by c.day desc) from (
      select id, kind, day, weight_kg, measurements, answers, ai_summary, plan_changes, created_at
      from public.checkins where user_id = p_user order by day desc limit 50) c), '[]'::jsonb),
    'reports', coalesce((select jsonb_agg(r order by r.created_at desc) from (
      select id, category, status, left(message, 200) as message, created_at, last_message_at
      from public.problem_reports where user_id = p_user order by created_at desc limit 50) r), '[]'::jsonb),
    'timeline', coalesce((select jsonb_agg(t order by t.at desc) from (
      select * from (
        select 'signup' as kind, v_prof.created_at as at, 'Signed up' as label
        union all
        select 'onboarding', v_prof.onboarding_done_at, 'Finished the questionnaire' where v_prof.onboarding_done_at is not null
        union all
        select 'workout', (day::timestamp + time '12:00') at time zone 'Asia/Beirut', 'Workout done'
        from public.plan_days where user_id = p_user and workout_done
        union all
        select 'meal', created_at, label || ' (' || kcal || ' kcal)' from public.food_logs where user_id = p_user
        union all
        select 'activity', created_at, initcap(kind) || ', ' || minutes || ' min' from public.activities where user_id = p_user
        union all
        select 'weight', (day::timestamp + time '08:00') at time zone 'Asia/Beirut', kg || ' kg' from public.weights where user_id = p_user
        union all
        select 'checkin', created_at, initcap(kind) || ' check-in' from public.checkins where user_id = p_user
        union all
        select 'report', created_at, 'Reported a problem (' || category || ')' from public.problem_reports where user_id = p_user
        union all
        select 'coach', created_at, 'Messaged the coach' from public.coach_messages where user_id = p_user and role = 'user'
      ) all_events
      order by at desc
      limit 100) t), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- Reports inbox. p: status ('new' | 'in_progress' | 'fixed' | 'open'),
-- q (text in the message, name or email), limit (1..200, default 50), offset.
create or replace function public.admin_reports(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_status text := p ->> 'status';
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 200);
  v_offset int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_out jsonb;
begin
  with f as (
    select r.*, pr.name as user_name, u.email::text as user_email,
      (select count(*) from public.report_messages m where m.report_id = r.id) as message_count,
      (r.admin_last_read_at is null or exists (select 1 from public.report_messages m
        where m.report_id = r.id and m.author = 'user' and m.created_at > r.admin_last_read_at)) as unread
    from public.problem_reports r
    join public.profiles pr on pr.id = r.user_id
    join auth.users u on u.id = r.user_id
    where (v_status is null or (v_status = 'open' and r.status <> 'fixed') or r.status = v_status)
      and (v_q is null or r.message ilike '%' || v_q || '%' or pr.name ilike '%' || v_q || '%' or u.email ilike '%' || v_q || '%')
  ),
  page as (
    select * from f order by last_message_at desc limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'limit', v_limit,
    'offset', v_offset,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'user_id', user_id, 'user_name', user_name, 'user_email', user_email,
      'category', category, 'status', status, 'message', left(message, 300),
      'has_screenshot', screenshot_path is not null, 'platform', platform, 'app_version', app_version,
      'message_count', message_count, 'unread', unread,
      'created_at', created_at, 'last_message_at', last_message_at
    ) order by last_message_at desc) from page), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- One report with its thread. Marks it read for the admin.
create or replace function public.admin_report_detail(p_report uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_out jsonb;
begin
  update public.problem_reports set admin_last_read_at = now() where id = p_report;
  select jsonb_build_object(
    'report', to_jsonb(r) - 'admin_last_read_at' - 'user_last_read_at',
    'user', jsonb_build_object('id', pr.id, 'name', pr.name, 'email', u.email::text, 'phone', pr.phone),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'body', m.body, 'created_at', m.created_at) order by m.created_at)
      from public.report_messages m where m.report_id = r.id), '[]'::jsonb)
  ) into v_out
  from public.problem_reports r
  join public.profiles pr on pr.id = r.user_id
  join auth.users u on u.id = r.user_id
  where r.id = p_report;
  return v_out;
end;
$$;

-- Admin reply: adds the message, optionally sets the status. Returns the
-- report's owner (for the push notification) or null when not found.
create or replace function public.admin_report_reply(p_report uuid, p_body text, p_status text default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
  v_msg public.report_messages;
begin
  select user_id into v_user from public.problem_reports where id = p_report;
  if v_user is null then
    return null;
  end if;
  insert into public.report_messages (report_id, user_id, author, body)
  values (p_report, v_user, 'admin', btrim(p_body))
  returning * into v_msg;
  update public.problem_reports
  set status = coalesce(p_status, status), admin_last_read_at = now(), updated_at = now()
  where id = p_report;
  return jsonb_build_object('user_id', v_user, 'message', to_jsonb(v_msg),
    'status', (select status from public.problem_reports where id = p_report));
end;
$$;

create or replace function public.admin_report_set_status(p_report uuid, p_status text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.problem_reports;
begin
  update public.problem_reports set status = p_status, updated_at = now()
  where id = p_report
  returning * into v_row;
  if v_row.id is null then
    return null;
  end if;
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'user_id', v_row.user_id);
end;
$$;

do $admin_fns$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_set_credentials(text, text)',
    'public.admin_login(text, text, text)',
    'public.admin_session_check(text)',
    'public.admin_logout(text)',
    'public.user_streak(uuid, date)',
    'public.checkins_due(uuid)',
    'public.admin_overview()',
    'public.admin_users(jsonb)',
    'public.admin_user_detail(uuid)',
    'public.admin_reports(jsonb)',
    'public.admin_report_detail(uuid)',
    'public.admin_report_reply(uuid, text, text)',
    'public.admin_report_set_status(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$admin_fns$;

-- Trigger functions run from their triggers only; nobody calls them directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.report_message_added() from public, anon, authenticated;
revoke execute on function public.touch_last_active() from public, anon, authenticated;
revoke execute on function public.profiles_guard() from public, anon, authenticated;

-- ═══════════════════════════════ storage ═══════════════════════════════
-- Two private buckets, one folder per person (<user id>/…):
--   body-photos         progress photos (face blurred on the phone). Add,
--                       read and delete your own files; nobody else's.
--   report-screenshots  screenshots attached to a problem report. Add and
--                       read your own; the admin reads them with the
--                       service role (short-lived signed links).
-- If this block can't run (a project where the SQL editor can't manage
-- storage), it says so in the output and the rest of the script still
-- applies; create the buckets by hand as supabase/README.md describes.
do $storage$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('body-photos', 'body-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('report-screenshots', 'report-screenshots', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'built: add own body photos') then
    create policy "built: add own body photos" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'built: read own body photos') then
    create policy "built: read own body photos" on storage.objects
      for select to authenticated
      using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'built: delete own body photos') then
    create policy "built: delete own body photos" on storage.objects
      for delete to authenticated
      using (bucket_id = 'body-photos' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'built: add own report screenshots') then
    create policy "built: add own report screenshots" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'report-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'built: read own report screenshots') then
    create policy "built: read own report screenshots" on storage.objects
      for select to authenticated
      using (bucket_id = 'report-screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
exception when insufficient_privilege or undefined_table or undefined_function or undefined_column or invalid_schema_name then
  raise warning 'Storage setup skipped (%). Create the buckets by hand: see supabase/README.md, "Storage".', sqlerrm;
end;
$storage$;

-- ═══════════════════════════════ privileges ═══════════════════════════════
-- RLS decides which ROWS a role reaches; GRANTs decide which TABLES it can
-- touch at all. Supabase grants everything to anon by default on new
-- tables, so revoke that explicitly.

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.profiles, public.plan_days, public.water, public.weights,
  public.coach_messages, public.ai_plans, public.plan_overrides, public.food_logs,
  public.activities, public.health_daily, public.body_photos, public.body_analyses,
  public.checkins, public.coach_memory, public.problem_reports, public.report_messages,
  public.push_tokens, public.ai_usage, public.contact_messages, public.app_config,
  public.admin_credentials, public.admin_sessions, public.admin_login_attempts,
  public.admin_lockouts
  from anon, authenticated;

-- Trim what `authenticated` could keep from default grants or older runs of
-- this script. These come before the column grants below, so those still apply.
revoke update, delete, truncate, references, trigger on public.problem_reports, public.report_messages from authenticated;
revoke update, truncate, references, trigger on public.body_photos, public.body_analyses, public.coach_memory from authenticated;
revoke insert, update on public.push_tokens from authenticated;

grant select, insert, update, delete on public.profiles, public.plan_days,
  public.water, public.weights, public.ai_plans, public.plan_overrides,
  public.food_logs, public.activities, public.health_daily, public.checkins
  to authenticated;

grant select, insert on public.coach_messages to authenticated;
grant select, insert, delete on public.body_photos, public.body_analyses to authenticated;
grant select, insert, delete on public.coach_memory to authenticated;
grant select on public.problem_reports to authenticated;
grant insert (id, user_id, category, message, screenshot_path, platform, app_version) on public.problem_reports to authenticated;
grant update (user_last_read_at) on public.problem_reports to authenticated;
grant select on public.report_messages to authenticated;
grant insert (id, report_id, user_id, body) on public.report_messages to authenticated;
grant select, delete on public.push_tokens to authenticated;
grant select on public.ai_usage to authenticated;

grant insert (name, email, topic, message, source) on public.contact_messages to anon, authenticated;

grant all on public.profiles, public.plan_days, public.water, public.weights,
  public.coach_messages, public.ai_plans, public.plan_overrides, public.food_logs,
  public.activities, public.health_daily, public.body_photos, public.body_analyses,
  public.checkins, public.coach_memory, public.problem_reports, public.report_messages,
  public.push_tokens, public.ai_usage, public.contact_messages, public.app_config,
  public.admin_credentials, public.admin_sessions, public.admin_login_attempts,
  public.admin_lockouts
  to service_role;

-- ═══════════════════════════════ ERP ═══════════════════════════════
-- BUILT ERP: customers (CRM) and finance, for the admin dashboard
-- (admin/, "Customers" and "Finance"). Payments are not live yet, so
-- everything here is what the admin enters, plus the app's own users.
--
-- Run it in: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- The same text is the "ERP" section at the end of supabase/schema.sql, so a
-- full schema run includes it. Safe to run again at any time:
--   * tables, columns, indexes, constraints and the sequence are created only
--     when missing; functions and triggers are replaced in place;
--   * it never drops or deletes anything. Customers are archived
--     (archived_at), transactions voided (void_at), invoices set to 'void'.
--
-- Security: every erp_* table has row-level security on and no policies, and
-- `anon` / `authenticated` hold no privileges on them, so only the service
-- role (the `admin` Edge Function) can reach them. Every admin_crm_* /
-- admin_fin_* / admin_finance_* function is SECURITY DEFINER and executable
-- by the service role only.
--
-- Money is integer cents, USD. Days are Beirut days.

-- Re-runnable CHECK constraints (same helper as the top of schema.sql; it
-- lives only for this session).
create or replace function pg_temp.add_check(tbl regclass, cname text, expr text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = tbl and conname = cname) then
    execute format('alter table %s add constraint %I check (%s) not valid', tbl, cname, expr);
  end if;
end;
$$;

-- ─────────────────────────────── tables ───────────────────────────────

-- One row per customer or lead. user_id links an app account (at most one
-- CRM row per account); the CRM keeps its own copy of name, email and phone
-- so the record survives if the person deletes their account.
create table if not exists public.erp_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  stage text not null default 'lead',
  plan text,
  price_cents int,
  started_on date,
  renews_on date,
  cancelled_on date,
  source text not null default '',
  tags text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select pg_temp.add_check('public.erp_customers', 'erp_customers_stage_values',
  $c$stage in ('lead', 'trial', 'active', 'paused', 'cancelled')$c$);
select pg_temp.add_check('public.erp_customers', 'erp_customers_plan_values',
  $c$plan is null or plan in ('monthly', 'quarterly', 'yearly')$c$);
select pg_temp.add_check('public.erp_customers', 'erp_customers_price_range',
  'price_cents is null or price_cents between 0 and 100000000');
select pg_temp.add_check('public.erp_customers', 'erp_customers_text_lengths',
  'char_length(name) <= 120 and char_length(email) <= 254 and char_length(phone) <= 32 and char_length(source) <= 60');
select pg_temp.add_check('public.erp_customers', 'erp_customers_tags_count',
  'cardinality(tags) <= 12');
select pg_temp.add_check('public.erp_customers', 'erp_customers_date_order',
  'renews_on is null or started_on is null or renews_on >= started_on');

create index if not exists erp_customers_stage_idx on public.erp_customers (stage) where archived_at is null;
create index if not exists erp_customers_created_idx on public.erp_customers (created_at desc);

-- Notes on a customer's timeline. kind: 'note' (written by the admin),
-- 'stage' and 'system' (written by the functions below).
create table if not exists public.erp_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.erp_customers (id),
  kind text not null default 'note',
  body text not null,
  created_at timestamptz not null default now()
);
select pg_temp.add_check('public.erp_notes', 'erp_notes_body_length', 'char_length(body) between 1 and 4000');
select pg_temp.add_check('public.erp_notes', 'erp_notes_kind_values', $c$kind in ('note', 'stage', 'system')$c$);
create index if not exists erp_notes_customer_idx on public.erp_notes (customer_id, created_at desc);

-- To-dos, optionally about one customer. Done = done_at set.
create table if not exists public.erp_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.erp_customers (id),
  title text not null,
  due_on date,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select pg_temp.add_check('public.erp_tasks', 'erp_tasks_title_length', 'char_length(title) between 1 and 200');
create index if not exists erp_tasks_customer_idx on public.erp_tasks (customer_id, created_at desc);
create index if not exists erp_tasks_open_due_idx on public.erp_tasks (due_on) where done_at is null;

-- Invoice numbers: INV-<year of issue>-<4+ digits from this sequence>.
create sequence if not exists public.erp_invoice_seq;

-- Invoices. lines: [{description, qty, unit_cents, amount_cents}]; the
-- total is always computed by admin_fin_invoice_save, never sent in.
create table if not exists public.erp_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references public.erp_customers (id),
  issued_on date not null default current_date,
  due_on date,
  status text not null default 'draft',
  lines jsonb not null default '[]'::jsonb,
  total_cents int not null default 0,
  currency text not null default 'USD',
  paid_on date,
  sent_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_status_values',
  $c$status in ('draft', 'sent', 'paid', 'void')$c$);
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_number_format', $c$number ~ '^INV-[0-9]{4}-[0-9]{4,}$'$c$);
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_lines_array', $c$jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 50$c$);
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_total_range', 'total_cents between 0 and 2000000000');
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_currency_code', $c$currency ~ '^[A-Z]{3}$'$c$);
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_notes_length', 'char_length(notes) <= 2000');
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_date_order', 'due_on is null or due_on >= issued_on');
select pg_temp.add_check('public.erp_invoices', 'erp_invoices_paid_has_date', $c$status <> 'paid' or paid_on is not null$c$);
create index if not exists erp_invoices_customer_idx on public.erp_invoices (customer_id, issued_on desc);
create index if not exists erp_invoices_status_idx on public.erp_invoices (status, due_on);

-- Money in and out. Never deleted: a mistake is voided (void_at).
-- invoice_id is set on the income row created when an invoice is marked
-- paid; at most one live (not void) row per invoice.
create table if not exists public.erp_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  category text not null,
  amount_cents int not null,
  currency text not null default 'USD',
  occurred_on date not null default current_date,
  customer_id uuid references public.erp_customers (id),
  invoice_id uuid references public.erp_invoices (id),
  description text not null default '',
  void_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
select pg_temp.add_check('public.erp_transactions', 'erp_transactions_kind_values', $c$kind in ('income', 'expense')$c$);
select pg_temp.add_check('public.erp_transactions', 'erp_transactions_category_values', $c$
  (kind = 'income' and category in ('subscription', 'other'))
  or (kind = 'expense' and category in ('ai', 'hosting', 'app_store', 'marketing', 'salaries', 'equipment', 'other'))$c$);
select pg_temp.add_check('public.erp_transactions', 'erp_transactions_amount_range', 'amount_cents between 1 and 100000000');
select pg_temp.add_check('public.erp_transactions', 'erp_transactions_currency_code', $c$currency ~ '^[A-Z]{3}$'$c$);
select pg_temp.add_check('public.erp_transactions', 'erp_transactions_description_length', 'char_length(description) <= 300');
create index if not exists erp_transactions_occurred_idx on public.erp_transactions (occurred_on desc, created_at desc);
create index if not exists erp_transactions_customer_idx on public.erp_transactions (customer_id);
create unique index if not exists erp_transactions_invoice_live_uniq on public.erp_transactions (invoice_id)
  where invoice_id is not null and void_at is null;

-- ─────────────────────────────── triggers ───────────────────────────────

create or replace function public.erp_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace trigger erp_customers_touch before update on public.erp_customers
  for each row execute function public.erp_touch();
create or replace trigger erp_tasks_touch before update on public.erp_tasks
  for each row execute function public.erp_touch();
create or replace trigger erp_invoices_touch before update on public.erp_invoices
  for each row execute function public.erp_touch();
create or replace trigger erp_transactions_touch before update on public.erp_transactions
  for each row execute function public.erp_touch();

-- Plan and stage bookkeeping on customers:
--   * a plan without a price gets the list price (monthly $30, 3 months $81,
--     yearly $300);
--   * moving to 'active' fills started_on (today) and renews_on (one plan
--     period later) when they are empty;
--   * moving to 'cancelled' stamps cancelled_on (today), for the churn count;
--     moving away clears it.
create or replace function public.erp_customers_stage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_moved boolean;
begin
  if tg_op = 'INSERT' then
    v_moved := true;
  else
    v_moved := new.stage is distinct from old.stage;
  end if;
  if new.plan is not null and new.price_cents is null then
    new.price_cents := case new.plan when 'monthly' then 3000 when 'quarterly' then 8100 when 'yearly' then 30000 end;
  end if;
  if v_moved then
    if new.stage = 'active' then
      new.started_on := coalesce(new.started_on, v_today);
      if new.renews_on is null and new.plan is not null then
        new.renews_on := (new.started_on + case new.plan
          when 'monthly' then interval '1 month'
          when 'quarterly' then interval '3 months'
          else interval '1 year' end)::date;
      end if;
    end if;
    if new.stage = 'cancelled' then
      new.cancelled_on := v_today;
    else
      new.cancelled_on := null;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger erp_customers_stage before insert or update on public.erp_customers
  for each row execute function public.erp_customers_stage();

-- ─────────────────────────── row level security ───────────────────────────
-- On, with no policies: no client role can read or write a row.

alter table public.erp_customers    enable row level security;
alter table public.erp_notes        enable row level security;
alter table public.erp_tasks        enable row level security;
alter table public.erp_invoices     enable row level security;
alter table public.erp_transactions enable row level security;

revoke all on public.erp_customers, public.erp_notes, public.erp_tasks,
  public.erp_invoices, public.erp_transactions
  from anon, authenticated;
grant all on public.erp_customers, public.erp_notes, public.erp_tasks,
  public.erp_invoices, public.erp_transactions
  to service_role;
revoke all on sequence public.erp_invoice_seq from anon, authenticated;
grant usage, select on sequence public.erp_invoice_seq to service_role;

-- ─────────────────────────────── helpers ───────────────────────────────

-- One CRM customer as JSON; name, email and phone fall back to the linked
-- app account when the CRM copy is empty.
create or replace function public.erp_customer_json(p_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'user_id', c.user_id, 'in_crm', true,
    'name', coalesce(nullif(c.name, ''), pr.name, ''),
    'email', coalesce(nullif(c.email, ''), u.email::text, ''),
    'phone', coalesce(nullif(c.phone, ''), pr.phone, ''),
    'stage', c.stage, 'plan', c.plan, 'price_cents', c.price_cents,
    'started_on', c.started_on, 'renews_on', c.renews_on, 'cancelled_on', c.cancelled_on,
    'source', c.source, 'tags', to_jsonb(c.tags), 'archived_at', c.archived_at,
    'created_at', c.created_at, 'updated_at', c.updated_at,
    'last_active_at', pr.last_active_at
  )
  from public.erp_customers c
  left join public.profiles pr on pr.id = c.user_id
  left join auth.users u on u.id = c.user_id
  where c.id = p_id
$$;

-- An app account as the CRM sees it (never photos).
create or replace function public.erp_app_user_json(p_user uuid, p_streak boolean default true)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', pr.id, 'name', pr.name, 'email', u.email::text, 'phone', pr.phone, 'goal', pr.goal,
    'created_at', pr.created_at, 'last_active_at', pr.last_active_at,
    'onboarding_done', pr.onboarding_done_at is not null,
    'streak', case when p_streak then public.user_streak(pr.id) end
  )
  from public.profiles pr
  join auth.users u on u.id = pr.id
  where pr.id = p_user
$$;

-- One task as JSON, with its customer's name and whether it is overdue.
create or replace function public.erp_task_json(p_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select to_jsonb(t) || jsonb_build_object(
    'customer_name', coalesce(nullif(c.name, ''), pr.name, nullif(c.email, ''), u.email::text),
    'overdue', t.done_at is null and t.due_on < (now() at time zone 'Asia/Beirut')::date,
    'due_today', t.done_at is null and t.due_on = (now() at time zone 'Asia/Beirut')::date
  )
  from public.erp_tasks t
  left join public.erp_customers c on c.id = t.customer_id
  left join public.profiles pr on pr.id = c.user_id
  left join auth.users u on u.id = c.user_id
  where t.id = p_id
$$;

-- ─────────────────────────────── CRM ───────────────────────────────

-- Customers list: CRM customers plus app accounts that are not in the CRM
-- yet (in_crm false; stage 'trial' once the questionnaire is finished,
-- else 'lead'; id is the account id).
--   p_q      text in name, email or tags; digits match the phone
--   p_stage  lead | trial | active | paused | cancelled | archived | not_in_crm
--            (null: everything not archived)
--   p_plan   monthly | quarterly | yearly | none
--   p_sort   recent (default) | name_asc | last_active_desc | renews_asc | price_desc | stage
--   p_limit  1..5000 (default 50), p_offset
--   p_with_streak  include each linked account's workout streak (page rows only)
-- Returns {total, limit, offset, counts: {stage: n}, archived, not_in_crm, rows}.
create or replace function public.admin_crm_list(
  p_q text default null,
  p_stage text default null,
  p_plan text default null,
  p_limit int default 50,
  p_offset int default 0,
  p_sort text default 'recent',
  p_with_streak boolean default true
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_digits text := regexp_replace(coalesce(p_q, ''), '[^0-9]', '', 'g');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 5000);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_sort text := coalesce(p_sort, 'recent');
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_out jsonb;
begin
  with crm as (
    select c.id, c.user_id, true as in_crm,
      coalesce(nullif(c.name, ''), pr.name, '') as name,
      coalesce(nullif(c.email, ''), u.email::text, '') as email,
      coalesce(nullif(c.phone, ''), pr.phone, '') as phone,
      c.stage, c.plan, c.price_cents, c.started_on, c.renews_on, c.source, c.tags,
      c.archived_at, c.created_at, pr.last_active_at
    from public.erp_customers c
    left join public.profiles pr on pr.id = c.user_id
    left join auth.users u on u.id = c.user_id
  ),
  app as (
    select pr.id, pr.id as user_id, false as in_crm, pr.name, u.email::text as email, pr.phone,
      case when pr.onboarding_done_at is not null then 'trial' else 'lead' end as stage,
      null::text as plan, null::int as price_cents, null::date as started_on, null::date as renews_on,
      'app'::text as source, '{}'::text[] as tags, null::timestamptz as archived_at,
      pr.created_at, pr.last_active_at
    from public.profiles pr
    join auth.users u on u.id = pr.id
    where not exists (select 1 from public.erp_customers c where c.user_id = pr.id)
  ),
  searched as (
    select a.* from (select * from crm union all select * from app) a
    where (v_q is null
        or a.name ilike '%' || v_q || '%'
        or a.email ilike '%' || v_q || '%'
        or (v_digits <> '' and regexp_replace(a.phone, '[^0-9]', '', 'g') like '%' || v_digits || '%')
        or exists (select 1 from unnest(a.tags) t where t ilike v_q))
      and (p_plan is null or (p_plan = 'none' and a.plan is null) or a.plan = p_plan)
  ),
  f as (
    select * from searched s
    where case
      when p_stage = 'archived' then s.archived_at is not null
      when p_stage = 'not_in_crm' then not s.in_crm
      else s.archived_at is null and (p_stage is null or s.stage = p_stage)
    end
  ),
  page as (
    select f.*, row_number() over (order by
      case when v_sort = 'name_asc' then lower(nullif(f.name, '')) end asc nulls last,
      case when v_sort = 'last_active_desc' then f.last_active_at end desc nulls last,
      case when v_sort = 'renews_asc' then f.renews_on end asc nulls last,
      case when v_sort = 'price_desc' then f.price_cents end desc nulls last,
      case when v_sort = 'stage' then array_position(array['lead', 'trial', 'active', 'paused', 'cancelled'], f.stage) end asc,
      f.created_at desc, f.id) as rn
    from f
    order by rn
    limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'limit', v_limit,
    'offset', v_offset,
    'counts', (select jsonb_build_object(
        'lead', count(*) filter (where stage = 'lead'),
        'trial', count(*) filter (where stage = 'trial'),
        'active', count(*) filter (where stage = 'active'),
        'paused', count(*) filter (where stage = 'paused'),
        'cancelled', count(*) filter (where stage = 'cancelled'))
      from searched where archived_at is null),
    'archived', (select count(*) from searched where archived_at is not null),
    'not_in_crm', (select count(*) from searched where not in_crm),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'user_id', p.user_id, 'in_crm', p.in_crm,
      'name', p.name, 'email', p.email, 'phone', p.phone,
      'stage', p.stage, 'plan', p.plan, 'price_cents', p.price_cents,
      'started_on', p.started_on, 'renews_on', p.renews_on, 'source', p.source, 'tags', to_jsonb(p.tags),
      'archived_at', p.archived_at, 'created_at', p.created_at, 'last_active_at', p.last_active_at,
      'streak', case when p_with_streak and p.user_id is not null then public.user_streak(p.user_id) end,
      'open_tasks', case when p.in_crm then (select count(*) from public.erp_tasks t where t.customer_id = p.id and t.done_at is null) else 0 end,
      'overdue_tasks', case when p.in_crm then (select count(*) from public.erp_tasks t where t.customer_id = p.id and t.done_at is null and t.due_on < v_today) else 0 end
    ) order by p.rn) from page p), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- One customer with notes, tasks, invoices and payments. p_id may be a CRM
-- id or an app account id (a linked account opens its CRM record; an account
-- not in the CRM comes back with in_crm false). Null when unknown.
create or replace function public.admin_crm_detail(p_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_id uuid;
  v_user uuid;
  v_app jsonb;
  v_today date := (now() at time zone 'Asia/Beirut')::date;
begin
  select id, user_id into v_id, v_user from public.erp_customers where id = p_id;
  if v_id is null then
    select id, user_id into v_id, v_user from public.erp_customers where user_id = p_id;
  end if;

  if v_id is null then
    v_app := public.erp_app_user_json(p_id);
    if v_app is null then
      return null;
    end if;
    return jsonb_build_object(
      'in_crm', false,
      'customer', jsonb_build_object(
        'id', p_id, 'user_id', p_id, 'in_crm', false,
        'name', v_app ->> 'name', 'email', v_app ->> 'email', 'phone', v_app ->> 'phone',
        'stage', case when (v_app ->> 'onboarding_done')::boolean then 'trial' else 'lead' end,
        'plan', null, 'price_cents', null, 'started_on', null, 'renews_on', null, 'cancelled_on', null,
        'source', 'app', 'tags', '[]'::jsonb, 'archived_at', null,
        'created_at', v_app -> 'created_at', 'last_active_at', v_app -> 'last_active_at'),
      'app_user', v_app,
      'notes', '[]'::jsonb, 'tasks', '[]'::jsonb, 'invoices', '[]'::jsonb, 'transactions', '[]'::jsonb,
      'totals', jsonb_build_object('paid_cents', 0, 'outstanding_cents', 0));
  end if;

  return jsonb_build_object(
    'in_crm', true,
    'customer', public.erp_customer_json(v_id),
    'app_user', case when v_user is not null then public.erp_app_user_json(v_user) end,
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'body', n.body, 'created_at', n.created_at)
        order by n.created_at desc)
      from (select * from public.erp_notes where customer_id = v_id order by created_at desc limit 200) n), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) || jsonb_build_object(
        'overdue', t.done_at is null and t.due_on < v_today,
        'due_today', t.done_at is null and t.due_on = v_today)
        order by (t.done_at is not null), case when t.done_at is null then t.due_on end nulls last, t.done_at desc, t.created_at)
      from (select * from public.erp_tasks where customer_id = v_id order by created_at desc limit 200) t), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'status', i.status, 'issued_on', i.issued_on, 'due_on', i.due_on,
        'paid_on', i.paid_on, 'total_cents', i.total_cents,
        'overdue', i.status = 'sent' and i.due_on < v_today)
        order by i.issued_on desc, i.created_at desc)
      from public.erp_invoices i where i.customer_id = v_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'kind', x.kind, 'category', x.category, 'amount_cents', x.amount_cents,
        'occurred_on', x.occurred_on, 'description', x.description, 'invoice_id', x.invoice_id, 'void_at', x.void_at)
        order by x.occurred_on desc, x.created_at desc)
      from (select * from public.erp_transactions where customer_id = v_id order by occurred_on desc limit 100) x), '[]'::jsonb),
    'totals', jsonb_build_object(
      'paid_cents', (select coalesce(sum(amount_cents), 0) from public.erp_transactions
        where customer_id = v_id and kind = 'income' and void_at is null),
      'outstanding_cents', (select coalesce(sum(total_cents), 0) from public.erp_invoices
        where customer_id = v_id and status = 'sent'))
  );
end;
$$;

-- Create (p_id null) or update a customer. p is JSON; on update only the keys
-- present change: name, email, phone, stage, plan, price_cents, started_on,
-- renews_on, source, tags. On create, user_id adopts an app account (name,
-- email and phone are copied from it when not given; stage defaults to
-- 'trial' once the questionnaire is finished, else 'lead').
-- Returns the detail, or {"error": "not_found" | "already_in_crm" (with id) | "no_user"}.
create or replace function public.admin_crm_save(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_c public.erp_customers;
  v_old_stage text;
  v_user uuid;
  v_names constant jsonb := '{"lead":"Lead","trial":"Trial","active":"Active","paused":"Paused","cancelled":"Cancelled"}';
begin
  p := coalesce(p, '{}'::jsonb);
  if p_id is null then
    v_user := nullif(p ->> 'user_id', '')::uuid;
    if v_user is not null then
      select * into v_c from public.erp_customers where user_id = v_user;
      if v_c.id is not null then
        return jsonb_build_object('error', 'already_in_crm', 'id', v_c.id);
      end if;
      if not exists (select 1 from public.profiles where id = v_user) then
        return jsonb_build_object('error', 'no_user');
      end if;
    end if;
    insert into public.erp_customers (user_id, name, email, phone, stage, plan, price_cents, started_on, renews_on, source, tags)
    select v_user,
      coalesce(nullif(btrim(p ->> 'name'), ''), pr.name, ''),
      coalesce(nullif(btrim(p ->> 'email'), ''), u.email::text, ''),
      coalesce(nullif(btrim(p ->> 'phone'), ''), pr.phone, ''),
      coalesce(nullif(p ->> 'stage', ''),
        case when v_user is null then 'lead' when pr.onboarding_done_at is not null then 'trial' else 'lead' end),
      nullif(p ->> 'plan', ''),
      (p ->> 'price_cents')::int,
      nullif(p ->> 'started_on', '')::date,
      nullif(p ->> 'renews_on', '')::date,
      coalesce(nullif(btrim(p ->> 'source'), ''), case when v_user is not null then 'app' else '' end),
      coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(p -> 'tags') = 'array' then p -> 'tags' else '[]'::jsonb end)), '{}')
    from (select 1) one
    left join public.profiles pr on pr.id = v_user
    left join auth.users u on u.id = v_user
    returning * into v_c;
    insert into public.erp_notes (customer_id, kind, body)
    values (v_c.id, 'system', case when v_user is not null
      then 'Added to customers from the app, as ' || (v_names ->> v_c.stage) || '.'
      else 'Added to customers as ' || (v_names ->> v_c.stage) || '.' end);
    return public.admin_crm_detail(v_c.id);
  end if;

  select * into v_c from public.erp_customers where id = p_id for update;
  if v_c.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  v_old_stage := v_c.stage;
  update public.erp_customers set
    name = case when p ? 'name' then btrim(coalesce(p ->> 'name', '')) else name end,
    email = case when p ? 'email' then btrim(coalesce(p ->> 'email', '')) else email end,
    phone = case when p ? 'phone' then btrim(coalesce(p ->> 'phone', '')) else phone end,
    stage = case when p ? 'stage' and nullif(p ->> 'stage', '') is not null then p ->> 'stage' else stage end,
    plan = case when p ? 'plan' then nullif(p ->> 'plan', '') else plan end,
    price_cents = case when p ? 'price_cents' then (p ->> 'price_cents')::int else price_cents end,
    started_on = case when p ? 'started_on' then nullif(p ->> 'started_on', '')::date else started_on end,
    renews_on = case when p ? 'renews_on' then nullif(p ->> 'renews_on', '')::date else renews_on end,
    source = case when p ? 'source' then btrim(coalesce(p ->> 'source', '')) else source end,
    tags = case when p ? 'tags' and jsonb_typeof(p -> 'tags') = 'array'
      then array(select jsonb_array_elements_text(p -> 'tags')) else tags end
  where id = p_id
  returning * into v_c;
  if v_c.stage is distinct from v_old_stage then
    insert into public.erp_notes (customer_id, kind, body)
    values (v_c.id, 'stage', 'Moved from ' || (v_names ->> v_old_stage) || ' to ' || (v_names ->> v_c.stage) || '.');
  end if;
  return public.admin_crm_detail(v_c.id);
end;
$$;

-- Archive (p_archived true) or restore a customer. Nothing is deleted.
create or replace function public.admin_crm_archive(p_id uuid, p_archived boolean default true)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_c public.erp_customers;
  v_was timestamptz;
begin
  select archived_at into v_was from public.erp_customers where id = p_id;
  update public.erp_customers
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_id
  returning * into v_c;
  if v_c.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if (v_was is null) = p_archived then
    insert into public.erp_notes (customer_id, kind, body)
    values (v_c.id, 'system', case when p_archived then 'Archived.' else 'Restored from the archive.' end);
  end if;
  return jsonb_build_object('id', v_c.id, 'archived_at', v_c.archived_at);
end;
$$;

-- Add a note. Returns the note, or {"error": "not_found"}.
create or replace function public.admin_crm_note_add(p_customer uuid, p_body text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_n public.erp_notes;
begin
  if not exists (select 1 from public.erp_customers where id = p_customer) then
    return jsonb_build_object('error', 'not_found');
  end if;
  insert into public.erp_notes (customer_id, kind, body)
  values (p_customer, 'note', btrim(p_body))
  returning * into v_n;
  return jsonb_build_object('id', v_n.id, 'kind', v_n.kind, 'body', v_n.body, 'created_at', v_n.created_at);
end;
$$;

-- Tasks list. p: open (true: only not done), customer_id, limit (1..500,
-- default 200). Open tasks by due date (no date last), then done ones.
-- Returns {total, overdue, due_today, rows}.
create or replace function public.admin_crm_tasks(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_open boolean := coalesce((p ->> 'open')::boolean, false);
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 200), 1), 500);
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_out jsonb;
begin
  with f as (
    select t.* from public.erp_tasks t
    left join public.erp_customers c on c.id = t.customer_id
    where (not v_open or t.done_at is null)
      and (v_customer is null or t.customer_id = v_customer)
      and (c.id is null or c.archived_at is null)
  ),
  page as (
    select f.id, row_number() over (order by (f.done_at is not null),
      case when f.done_at is null then f.due_on end asc nulls last, f.done_at desc, f.created_at) as rn
    from f order by rn limit v_limit
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'overdue', (select count(*) from f where done_at is null and due_on < v_today),
    'due_today', (select count(*) from f where done_at is null and due_on = v_today),
    'rows', coalesce((select jsonb_agg(public.erp_task_json(page.id) order by page.rn) from page), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- Create (p_id null) or update a task. p: title, due_on, customer_id, done
-- (true/false). Returns the task, or {"error": "not_found" | "no_customer"}.
create or replace function public.admin_crm_task_save(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_t public.erp_tasks;
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
begin
  p := coalesce(p, '{}'::jsonb);
  if v_customer is not null and not exists (select 1 from public.erp_customers where id = v_customer) then
    return jsonb_build_object('error', 'no_customer');
  end if;
  if p_id is null then
    insert into public.erp_tasks (customer_id, title, due_on, done_at)
    values (v_customer, btrim(p ->> 'title'), nullif(p ->> 'due_on', '')::date,
      case when coalesce((p ->> 'done')::boolean, false) then now() end)
    returning * into v_t;
  else
    update public.erp_tasks set
      title = case when p ? 'title' then btrim(p ->> 'title') else title end,
      due_on = case when p ? 'due_on' then nullif(p ->> 'due_on', '')::date else due_on end,
      customer_id = case when p ? 'customer_id' then v_customer else customer_id end,
      done_at = case when p ? 'done' then
        case when (p ->> 'done')::boolean then coalesce(done_at, now()) else null end
        else done_at end
    where id = p_id
    returning * into v_t;
    if v_t.id is null then
      return jsonb_build_object('error', 'not_found');
    end if;
  end if;
  return public.erp_task_json(v_t.id);
end;
$$;

-- ─────────────────────────────── finance ───────────────────────────────

-- Money summary for a period (inclusive Beirut days; default this month).
-- Voided transactions never count. MRR: every active, not archived
-- customer's price per month (3 months / 3, yearly / 12; no plan counts as
-- monthly). months: the 12 calendar months ending with p_to's month.
create or replace function public.admin_finance_summary(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_from date := coalesce(p_from, date_trunc('month', v_today)::date);
  v_to date := coalesce(p_to, (date_trunc('month', v_today) + interval '1 month - 1 day')::date);
  v_m0 date;
  v_m1 date;
  v_income bigint;
  v_expense bigint;
  v_swap date;
begin
  if v_to < v_from then
    v_swap := v_from; v_from := v_to; v_to := v_swap;
  end if;
  v_m0 := (date_trunc('month', v_to) - interval '11 months')::date;
  v_m1 := (date_trunc('month', v_to) + interval '1 month')::date;

  select coalesce(sum(amount_cents) filter (where kind = 'income'), 0),
         coalesce(sum(amount_cents) filter (where kind = 'expense'), 0)
  into v_income, v_expense
  from public.erp_transactions
  where void_at is null and currency = 'USD' and occurred_on between v_from and v_to;

  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'currency', 'USD',
    'income_cents', v_income,
    'expense_cents', v_expense,
    'profit_cents', v_income - v_expense,
    'mrr_cents', (select coalesce(round(sum(case plan
        when 'quarterly' then price_cents / 3.0
        when 'yearly' then price_cents / 12.0
        else price_cents end)), 0)::bigint
      from public.erp_customers
      where archived_at is null and stage = 'active' and price_cents is not null),
    'active_by_plan', (select jsonb_build_object(
        'monthly', count(*) filter (where plan = 'monthly'),
        'quarterly', count(*) filter (where plan = 'quarterly'),
        'yearly', count(*) filter (where plan = 'yearly'),
        'none', count(*) filter (where plan is null))
      from public.erp_customers where archived_at is null and stage = 'active'),
    'months', (select jsonb_agg(jsonb_build_object(
        'month', to_char(gs, 'YYYY-MM'),
        'income_cents', coalesce(m.inc, 0),
        'expense_cents', coalesce(m.exp, 0)) order by gs)
      from generate_series(v_m0::timestamp, (v_m1 - 1)::timestamp, interval '1 month') gs
      left join (
        select date_trunc('month', occurred_on)::date as mm,
          sum(amount_cents) filter (where kind = 'income') as inc,
          sum(amount_cents) filter (where kind = 'expense') as exp
        from public.erp_transactions
        where void_at is null and currency = 'USD' and occurred_on >= v_m0 and occurred_on < v_m1
        group by 1
      ) m on m.mm = gs::date),
    'expenses_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'cents', s, 'count', n) order by s desc)
      from (select category, sum(amount_cents) as s, count(*) as n from public.erp_transactions
        where kind = 'expense' and void_at is null and currency = 'USD' and occurred_on between v_from and v_to
        group by category) x), '[]'::jsonb),
    'income_by_category', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'cents', s, 'count', n) order by s desc)
      from (select category, sum(amount_cents) as s, count(*) as n from public.erp_transactions
        where kind = 'income' and void_at is null and currency = 'USD' and occurred_on between v_from and v_to
        group by category) x), '[]'::jsonb),
    'outstanding', (select jsonb_build_object(
        'count', count(*), 'cents', coalesce(sum(total_cents), 0),
        'overdue_count', count(*) filter (where due_on < v_today),
        'overdue_cents', coalesce(sum(total_cents) filter (where due_on < v_today), 0))
      from public.erp_invoices where status = 'sent'),
    'churned', (select count(*) from public.erp_customers
      where archived_at is null and cancelled_on between v_from and v_to),
    'new_active', (select count(*) from public.erp_customers
      where archived_at is null and stage = 'active' and started_on between v_from and v_to),
    'tasks', (select jsonb_build_object(
        'open', count(*),
        'due_today', count(*) filter (where t.due_on = v_today),
        'overdue', count(*) filter (where t.due_on < v_today))
      from public.erp_tasks t
      left join public.erp_customers c on c.id = t.customer_id
      where t.done_at is null and (c.id is null or c.archived_at is null)),
    'generated_at', now()
  );
end;
$$;

-- Transactions list. p: kind, category, from, to (yyyy-mm-dd, inclusive),
-- q (text in the description, customer or invoice number), customer_id,
-- include_void (default true), limit (1..5000, default 50), offset.
-- Newest first. income_cents / expense_cents: sums of the matching rows that
-- are not void.
create or replace function public.admin_fin_transactions(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_void boolean := coalesce((p ->> 'include_void')::boolean, true);
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 5000);
  v_offset int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_out jsonb;
begin
  with f as (
    select x.*, coalesce(nullif(c.name, ''), pr.name, nullif(c.email, '')) as customer_name, i.number as invoice_number
    from public.erp_transactions x
    left join public.erp_customers c on c.id = x.customer_id
    left join public.profiles pr on pr.id = c.user_id
    left join public.erp_invoices i on i.id = x.invoice_id
    where (p ->> 'kind' is null or x.kind = p ->> 'kind')
      and (p ->> 'category' is null or x.category = p ->> 'category')
      and (p ->> 'from' is null or x.occurred_on >= (p ->> 'from')::date)
      and (p ->> 'to' is null or x.occurred_on <= (p ->> 'to')::date)
      and (v_customer is null or x.customer_id = v_customer)
      and (v_void or x.void_at is null)
      and (v_q is null or x.description ilike '%' || v_q || '%' or c.name ilike '%' || v_q || '%'
        or pr.name ilike '%' || v_q || '%' or i.number ilike '%' || v_q || '%')
  ),
  page as (
    select * from f order by occurred_on desc, created_at desc, id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'limit', v_limit,
    'offset', v_offset,
    'income_cents', (select coalesce(sum(amount_cents), 0) from f where kind = 'income' and void_at is null),
    'expense_cents', (select coalesce(sum(amount_cents), 0) from f where kind = 'expense' and void_at is null),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'category', category, 'amount_cents', amount_cents, 'currency', currency,
      'occurred_on', occurred_on, 'customer_id', customer_id, 'customer_name', customer_name,
      'invoice_id', invoice_id, 'invoice_number', invoice_number, 'description', description,
      'void_at', void_at, 'created_at', created_at, 'updated_at', updated_at
    ) order by occurred_on desc, created_at desc, id) from page), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- One transaction as JSON (with customer name and invoice number).
create or replace function public.erp_transaction_json(p_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select to_jsonb(x) || jsonb_build_object(
    'customer_name', coalesce(nullif(c.name, ''), pr.name, nullif(c.email, '')),
    'invoice_number', i.number)
  from public.erp_transactions x
  left join public.erp_customers c on c.id = x.customer_id
  left join public.profiles pr on pr.id = c.user_id
  left join public.erp_invoices i on i.id = x.invoice_id
  where x.id = p_id
$$;

-- Create (p_id null) or update a transaction. p: kind, category,
-- amount_cents, occurred_on, customer_id, description (on update only the
-- keys present change). A void row can't change; a row created by a paid
-- invoice keeps its kind, amount and customer.
-- Returns the row, or {"error": "not_found" | "void" | "linked" | "no_customer"}.
create or replace function public.admin_fin_tx_save(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_t public.erp_transactions;
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
begin
  p := coalesce(p, '{}'::jsonb);
  if v_customer is not null and not exists (select 1 from public.erp_customers where id = v_customer) then
    return jsonb_build_object('error', 'no_customer');
  end if;
  if p_id is null then
    insert into public.erp_transactions (kind, category, amount_cents, currency, occurred_on, customer_id, description)
    values (p ->> 'kind', p ->> 'category', (p ->> 'amount_cents')::int, 'USD',
      coalesce(nullif(p ->> 'occurred_on', '')::date, (now() at time zone 'Asia/Beirut')::date),
      v_customer, btrim(coalesce(p ->> 'description', '')))
    returning * into v_t;
    return public.erp_transaction_json(v_t.id);
  end if;

  select * into v_t from public.erp_transactions where id = p_id for update;
  if v_t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_t.void_at is not null then
    return jsonb_build_object('error', 'void');
  end if;
  if v_t.invoice_id is not null and (
       (p ? 'kind' and p ->> 'kind' is distinct from v_t.kind)
    or (p ? 'amount_cents' and (p ->> 'amount_cents')::int is distinct from v_t.amount_cents)
    or (p ? 'customer_id' and v_customer is distinct from v_t.customer_id)) then
    return jsonb_build_object('error', 'linked');
  end if;
  update public.erp_transactions set
    kind = case when p ? 'kind' then p ->> 'kind' else kind end,
    category = case when p ? 'category' then p ->> 'category' else category end,
    amount_cents = case when p ? 'amount_cents' then (p ->> 'amount_cents')::int else amount_cents end,
    occurred_on = case when p ? 'occurred_on' and nullif(p ->> 'occurred_on', '') is not null then (p ->> 'occurred_on')::date else occurred_on end,
    customer_id = case when p ? 'customer_id' then v_customer else customer_id end,
    description = case when p ? 'description' then btrim(coalesce(p ->> 'description', '')) else description end
  where id = p_id;
  return public.erp_transaction_json(p_id);
end;
$$;

-- Void a transaction (idempotent). Voiding an invoice's payment puts the
-- invoice back to 'sent'. Returns the row, or {"error": "not_found"}.
create or replace function public.admin_fin_tx_void(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_t public.erp_transactions;
begin
  update public.erp_transactions set void_at = coalesce(void_at, now())
  where id = p_id
  returning * into v_t;
  if v_t.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_t.invoice_id is not null then
    update public.erp_invoices set status = 'sent', paid_on = null
    where id = v_t.invoice_id and status = 'paid';
  end if;
  return public.erp_transaction_json(p_id);
end;
$$;

-- Invoices list. p: status (draft | sent | paid | void | overdue),
-- customer_id, q (number or customer), limit (1..500, default 50), offset.
-- Newest first. by_status: {status: {count, cents}} for the whole book.
create or replace function public.admin_fin_invoices(p jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_status text := nullif(p ->> 'status', '');
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 500);
  v_offset int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_out jsonb;
begin
  with base as (
    select i.*, coalesce(nullif(c.name, ''), pr.name, nullif(c.email, ''), u.email::text) as customer_name
    from public.erp_invoices i
    join public.erp_customers c on c.id = i.customer_id
    left join public.profiles pr on pr.id = c.user_id
    left join auth.users u on u.id = c.user_id
    where (v_customer is null or i.customer_id = v_customer)
      and (v_q is null or i.number ilike '%' || v_q || '%' or c.name ilike '%' || v_q || '%' or pr.name ilike '%' || v_q || '%')
  ),
  f as (
    select * from base
    where v_status is null
      or (v_status = 'overdue' and status = 'sent' and due_on < v_today)
      or status = v_status
  ),
  page as (
    select * from f order by issued_on desc, created_at desc, id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'limit', v_limit,
    'offset', v_offset,
    'by_status', (select jsonb_build_object(
        'draft', jsonb_build_object('count', count(*) filter (where status = 'draft'), 'cents', coalesce(sum(total_cents) filter (where status = 'draft'), 0)),
        'sent', jsonb_build_object('count', count(*) filter (where status = 'sent'), 'cents', coalesce(sum(total_cents) filter (where status = 'sent'), 0)),
        'paid', jsonb_build_object('count', count(*) filter (where status = 'paid'), 'cents', coalesce(sum(total_cents) filter (where status = 'paid'), 0)),
        'void', jsonb_build_object('count', count(*) filter (where status = 'void'), 'cents', coalesce(sum(total_cents) filter (where status = 'void'), 0)),
        'overdue', jsonb_build_object('count', count(*) filter (where status = 'sent' and due_on < v_today), 'cents', coalesce(sum(total_cents) filter (where status = 'sent' and due_on < v_today), 0)))
      from base),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'number', number, 'customer_id', customer_id, 'customer_name', customer_name,
      'status', status, 'issued_on', issued_on, 'due_on', due_on, 'paid_on', paid_on,
      'total_cents', total_cents, 'currency', currency, 'lines_count', jsonb_array_length(lines),
      'overdue', status = 'sent' and due_on < v_today, 'created_at', created_at
    ) order by issued_on desc, created_at desc, id) from page), '[]'::jsonb)
  ) into v_out;
  return v_out;
end;
$$;

-- One invoice with its customer and its payment (the live income row).
-- Null when unknown.
create or replace function public.admin_fin_invoice_detail(p_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'invoice', to_jsonb(i) || jsonb_build_object(
      'overdue', i.status = 'sent' and i.due_on < (now() at time zone 'Asia/Beirut')::date),
    'customer', public.erp_customer_json(i.customer_id),
    'payment', (select public.erp_transaction_json(x.id) from public.erp_transactions x
      where x.invoice_id = i.id and x.void_at is null limit 1)
  )
  from public.erp_invoices i
  where i.id = p_id
$$;

-- Create (p_id null) or update a draft invoice. p: customer_id, issued_on,
-- due_on, notes, lines [{description, qty, unit_cents}]. The total is
-- computed here from the lines. New invoices are drafts and get the next
-- number. Due date defaults to 14 days after issue.
-- Returns the detail, or {"error": "not_found" | "not_draft" | "no_customer" | "too_large"}.
create or replace function public.admin_fin_invoice_save(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_i public.erp_invoices;
  v_customer uuid;
  v_issued date;
  v_lines jsonb;
  v_total bigint;
begin
  p := coalesce(p, '{}'::jsonb);
  if p_id is not null then
    select * into v_i from public.erp_invoices where id = p_id for update;
    if v_i.id is null then
      return jsonb_build_object('error', 'not_found');
    end if;
    if v_i.status <> 'draft' then
      return jsonb_build_object('error', 'not_draft');
    end if;
  end if;

  v_customer := case when p ? 'customer_id' then nullif(p ->> 'customer_id', '')::uuid else v_i.customer_id end;
  if v_customer is null or not exists (select 1 from public.erp_customers where id = v_customer and archived_at is null) then
    return jsonb_build_object('error', 'no_customer');
  end if;

  if p ? 'lines' then
    select coalesce(jsonb_agg(jsonb_build_object(
        'description', left(btrim(coalesce(e ->> 'description', '')), 200),
        'qty', (e ->> 'qty')::int,
        'unit_cents', (e ->> 'unit_cents')::int,
        'amount_cents', (e ->> 'qty')::bigint * (e ->> 'unit_cents')::bigint) order by o), '[]'::jsonb)
    into v_lines
    from jsonb_array_elements(case when jsonb_typeof(p -> 'lines') = 'array' then p -> 'lines' else '[]'::jsonb end) with ordinality as l(e, o);
  else
    v_lines := coalesce(v_i.lines, '[]'::jsonb);
  end if;
  select coalesce(sum((e ->> 'amount_cents')::bigint), 0) into v_total from jsonb_array_elements(v_lines) e;
  if v_total > 2000000000 then
    return jsonb_build_object('error', 'too_large');
  end if;

  v_issued := coalesce(case when p ? 'issued_on' then nullif(p ->> 'issued_on', '')::date end, v_i.issued_on,
    (now() at time zone 'Asia/Beirut')::date);

  if p_id is null then
    insert into public.erp_invoices (number, customer_id, issued_on, due_on, status, lines, total_cents, notes)
    values ('INV-' || to_char(v_issued, 'YYYY') || '-' || lpad(nextval('public.erp_invoice_seq')::text, 4, '0'),
      v_customer, v_issued,
      coalesce(nullif(p ->> 'due_on', '')::date, v_issued + 14),
      'draft', v_lines, v_total, btrim(coalesce(p ->> 'notes', '')))
    returning * into v_i;
  else
    update public.erp_invoices set
      customer_id = v_customer,
      issued_on = v_issued,
      due_on = case when p ? 'due_on' then nullif(p ->> 'due_on', '')::date else due_on end,
      lines = v_lines,
      total_cents = v_total,
      notes = case when p ? 'notes' then btrim(coalesce(p ->> 'notes', '')) else notes end
    where id = p_id
    returning * into v_i;
  end if;
  return public.admin_fin_invoice_detail(v_i.id);
end;
$$;

-- Move an invoice: draft → sent | paid | void; sent → paid | void;
-- paid → sent (payment undone) | void; void is final. Marking paid creates
-- the income transaction once (same status again changes nothing); undoing
-- or voiding a paid invoice voids that transaction. Each move is noted on
-- the customer's timeline.
-- Returns the detail, or {"error": "not_found" | "bad_status" | "is_void" | "empty" | "bad_move"}.
create or replace function public.admin_fin_invoice_status(p_id uuid, p_status text, p_paid_on date default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_i public.erp_invoices;
  v_today date := (now() at time zone 'Asia/Beirut')::date;
  v_category text;
begin
  if p_status is null or p_status not in ('sent', 'paid', 'void') then
    return jsonb_build_object('error', 'bad_status');
  end if;
  select * into v_i from public.erp_invoices where id = p_id for update;
  if v_i.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_i.status = p_status then
    return public.admin_fin_invoice_detail(p_id) || jsonb_build_object('unchanged', true);
  end if;
  if v_i.status = 'void' then
    return jsonb_build_object('error', 'is_void');
  end if;
  if p_status in ('sent', 'paid') and (v_i.total_cents <= 0 or jsonb_array_length(v_i.lines) = 0) then
    return jsonb_build_object('error', 'empty');
  end if;

  if p_status = 'paid' then
    update public.erp_invoices
    set status = 'paid', paid_on = coalesce(p_paid_on, v_today), sent_at = coalesce(sent_at, now())
    where id = p_id;
    if not exists (select 1 from public.erp_transactions where invoice_id = p_id and void_at is null) then
      select case when c.plan is not null then 'subscription' else 'other' end into v_category
      from public.erp_customers c where c.id = v_i.customer_id;
      insert into public.erp_transactions (kind, category, amount_cents, currency, occurred_on, customer_id, invoice_id, description)
      values ('income', coalesce(v_category, 'other'), v_i.total_cents, v_i.currency, coalesce(p_paid_on, v_today),
        v_i.customer_id, p_id, 'Invoice ' || v_i.number)
      on conflict (invoice_id) where invoice_id is not null and void_at is null do nothing;
    end if;
  elsif p_status = 'sent' then
    update public.erp_invoices set status = 'sent', paid_on = null, sent_at = coalesce(sent_at, now()) where id = p_id;
    update public.erp_transactions set void_at = now() where invoice_id = p_id and void_at is null;
  else
    update public.erp_invoices set status = 'void', paid_on = null where id = p_id;
    update public.erp_transactions set void_at = now() where invoice_id = p_id and void_at is null;
  end if;

  insert into public.erp_notes (customer_id, kind, body)
  values (v_i.customer_id, 'system', 'Invoice ' || v_i.number || case p_status
    when 'paid' then ' marked paid.'
    when 'sent' then case when v_i.status = 'paid' then ' set back to unpaid.' else ' marked sent.' end
    else ' voided.' end);

  return public.admin_fin_invoice_detail(p_id);
end;
$$;

-- ─────────────────────────────── grants ───────────────────────────────

do $erp_fns$
declare
  f text;
begin
  foreach f in array array[
    'public.erp_customer_json(uuid)',
    'public.erp_app_user_json(uuid, boolean)',
    'public.erp_task_json(uuid)',
    'public.erp_transaction_json(uuid)',
    'public.admin_crm_list(text, text, text, int, int, text, boolean)',
    'public.admin_crm_detail(uuid)',
    'public.admin_crm_save(uuid, jsonb)',
    'public.admin_crm_archive(uuid, boolean)',
    'public.admin_crm_note_add(uuid, text)',
    'public.admin_crm_tasks(jsonb)',
    'public.admin_crm_task_save(uuid, jsonb)',
    'public.admin_finance_summary(date, date)',
    'public.admin_fin_transactions(jsonb)',
    'public.admin_fin_tx_save(uuid, jsonb)',
    'public.admin_fin_tx_void(uuid)',
    'public.admin_fin_invoices(jsonb)',
    'public.admin_fin_invoice_detail(uuid)',
    'public.admin_fin_invoice_save(uuid, jsonb)',
    'public.admin_fin_invoice_status(uuid, text, date)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$erp_fns$;

-- Trigger functions run from their triggers only.
revoke execute on function public.erp_touch() from public, anon, authenticated;
revoke execute on function public.erp_customers_stage() from public, anon, authenticated;

-- ═════════════════════════════ end of ERP ═════════════════════════════
