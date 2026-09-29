-- BUILT schema for Supabase (Postgres).
--
-- Run it in: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- It is safe to run again at any time (on a new project or an existing one):
-- every table, column, index, constraint, policy, function and trigger is
-- created only if missing or replaced in place. It never deletes data.
--
-- Security model:
--   * Every user table has row-level security (RLS): a signed-in person can
--     only reach their own rows, enforced by the database.
--   * `authenticated` (signed-in people) gets select/insert/update/delete on
--     the user tables; RLS narrows that to their own rows.
--   * `anon` (not signed in) gets nothing, except INSERT on contact_messages
--     (the website contact form). Nobody can read contact messages through
--     the API; you read them in Table Editor → contact_messages.

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

-- ═══════════════════════════════ tables ═══════════════════════════════

-- profiles: one row per account. Name, personal stats, daily targets.
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

-- plan_days: what was checked off on a day (workout, each set, each meal).
create table if not exists public.plan_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  workout_done boolean not null default false,
  exercises_done jsonb not null default '[]'::jsonb, -- [[setIdx,...], ...] per exercise
  meals_done jsonb not null default '[]'::jsonb,     -- ["Breakfast", ...]
  primary key (user_id, day)
);

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
create table if not exists public.ai_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan jsonb not null,
  kcal_target int,
  water_target int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- food_logs: meals logged from a photo (calorie estimate the person confirmed).
-- The app creates the id on the device so a retried upload never duplicates.
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
select pg_temp.add_check('public.food_logs', 'food_logs_label_len', 'char_length(label) <= 120');
select pg_temp.add_check('public.food_logs', 'food_logs_kcal_range', 'kcal between 0 and 5000');
select pg_temp.add_check('public.food_logs', 'food_logs_protein_range', 'protein between 0 and 300');
select pg_temp.add_check('public.food_logs', 'food_logs_confidence_values', $c$confidence in ('low', 'medium', 'high')$c$);
create index if not exists food_logs_user_day_idx
  on public.food_logs (user_id, day, created_at);

-- ai_usage: how many paid AI calls each person made per day, per kind.
-- Written only by public.bump_ai_usage (below), called from the Edge
-- Functions; people can read their own counts but never change them.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  kind text not null check (kind in ('plan', 'meal_photo', 'coach')),
  count int not null default 0 check (count >= 0),
  primary key (user_id, day, kind)
);

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

-- ═══════════════════════════ row level security ═══════════════════════════

alter table public.profiles         enable row level security;
alter table public.plan_days        enable row level security;
alter table public.water            enable row level security;
alter table public.weights          enable row level security;
alter table public.coach_messages   enable row level security;
alter table public.ai_plans         enable row level security;
alter table public.food_logs        enable row level security;
alter table public.ai_usage         enable row level security;
alter table public.contact_messages enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own plan days" on public.plan_days;
create policy "own plan days" on public.plan_days
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own water" on public.water;
create policy "own water" on public.water
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own weights" on public.weights;
create policy "own weights" on public.weights
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Coach history: read and add your own messages. No update or delete, so
-- the daily message limit (counted from this table) can't be reset.
drop policy if exists "own coach messages" on public.coach_messages;
drop policy if exists "read own coach messages" on public.coach_messages;
drop policy if exists "add own coach messages" on public.coach_messages;
create policy "read own coach messages" on public.coach_messages
  for select to authenticated using (auth.uid() = user_id);
create policy "add own coach messages" on public.coach_messages
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own ai plan" on public.ai_plans;
create policy "own ai plan" on public.ai_plans
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own food logs" on public.food_logs;
create policy "own food logs" on public.food_logs
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read own ai usage" on public.ai_usage;
create policy "read own ai usage" on public.ai_usage
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "anyone can send a contact message" on public.contact_messages;
create policy "anyone can send a contact message" on public.contact_messages
  for insert to anon, authenticated with check (true);

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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

-- ═══════════════════════════════ privileges ═══════════════════════════════
-- RLS decides which ROWS a role reaches; GRANTs decide which TABLES it can
-- touch at all. Supabase grants everything to anon by default on new
-- tables, so revoke that explicitly.

grant usage on schema public to anon, authenticated, service_role;

revoke all on public.profiles, public.plan_days, public.water, public.weights,
  public.coach_messages, public.ai_plans, public.food_logs, public.ai_usage,
  public.contact_messages
  from anon;

revoke all on public.profiles, public.plan_days, public.water, public.weights,
  public.coach_messages, public.ai_plans, public.food_logs, public.ai_usage,
  public.contact_messages
  from authenticated;

grant select, insert, update, delete on public.profiles, public.plan_days,
  public.water, public.weights, public.coach_messages, public.ai_plans,
  public.food_logs
  to authenticated;

grant select on public.ai_usage to authenticated;

grant insert (name, email, topic, message, source) on public.contact_messages to anon, authenticated;

grant all on public.profiles, public.plan_days, public.water, public.weights,
  public.coach_messages, public.ai_plans, public.food_logs, public.ai_usage,
  public.contact_messages
  to service_role;
