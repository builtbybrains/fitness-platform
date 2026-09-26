-- VITAL schema for Supabase (Postgres).
-- Run once: Dashboard → SQL Editor → New query → paste → Run.
-- Creates tables, locks them with row-level security, and auto-creates a
-- profile row (with the signup name) for every new user.

-- ─────────────────────────── tables ───────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  kcal_target int not null default 2200,
  water_target int not null default 8,
  height_cm real,
  age int,
  gender text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.plan_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  workout_done boolean not null default false,
  exercises_done jsonb not null default '[]'::jsonb, -- [[setIdx,...], ...] per exercise
  meals_done jsonb not null default '[]'::jsonb,     -- ["Breakfast", ...]
  primary key (user_id, day)
);

create table if not exists public.water (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0 check (count between 0 and 50),
  primary key (user_id, day)
);

create table if not exists public.weights (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  kg real not null check (kg between 30 and 300),
  primary key (user_id, day)
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_messages_user_idx
  on public.coach_messages (user_id, created_at desc);

-- Upgrades for projects created before Step 4: add the personal-stats columns
-- if they're missing (no-ops when they already exist).
alter table public.profiles add column if not exists height_cm real;
alter table public.profiles add column if not exists age int;
alter table public.profiles add column if not exists gender text not null default '';

-- Weight history index for the Progress tab's chart.
create index if not exists weights_user_day_idx
  on public.weights (user_id, day desc);

-- ─────────────────────── row level security ───────────────────────

alter table public.profiles enable row level security;
alter table public.plan_days enable row level security;
alter table public.water enable row level security;
alter table public.weights enable row level security;
alter table public.coach_messages enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own plan days" on public.plan_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own water" on public.water
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own weights" on public.weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own coach messages" on public.coach_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────── triggers ───────────────────────
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

-- ─────────────────────── privileges ───────────────────────
-- RLS restricts which ROWS each role can touch; these GRANTs let the API
-- reach the TABLES at all. Some newer projects don't grant these when tables
-- are created via the SQL Editor, which shows up as HTTP 403 /
-- "permission denied for table ..." on every request.
grant usage on schema public to anon, authenticated;
grant all on public.profiles       to anon, authenticated;
grant all on public.plan_days      to anon, authenticated;
grant all on public.water          to anon, authenticated;
grant all on public.weights        to anon, authenticated;
grant all on public.coach_messages to anon, authenticated;
