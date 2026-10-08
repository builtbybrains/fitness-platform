-- ═══════════════════════════ coach threads ═══════════════════════════
-- BUILT coach chat history: one row per conversation, so the app can list,
-- rename, pin and archive chats without reading every message.
--
-- Run it in: Dashboard → SQL Editor → New query → paste this whole file → Run.
-- The same text is the "coach threads" section at the end of
-- supabase/schema.sql, so a full schema run includes it. Needs the main
-- schema first (it reads public.coach_messages). Safe to run again at any
-- time: the table, columns, index, constraints and policies are created only
-- when missing, functions and the trigger are replaced in place, and the
-- backfill only adds threads that are missing. It never drops or deletes.
--
-- Security:
--   * RLS on; a signed-in person reads, adds and updates their own threads
--     only. No delete: a chat is archived (archived_at), never removed.
--   * A plain UPDATE (or INSERT) from the app can set title, pinned and
--     archived_at only. The counters (message_count, last_preview,
--     last_role) and the times are kept by the guard trigger, and only
--     change through public.coach_thread_touch(), which the coach function
--     calls after each saved exchange.
--   * `anon` gets nothing.

-- Re-runnable helpers (same as the top of schema.sql; they live only for
-- this session).
create or replace function pg_temp.add_check(tbl regclass, cname text, expr text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = tbl and conname = cname) then
    execute format('alter table %s add constraint %I check (%s) not valid', tbl, cname, expr);
  end if;
end;
$$;

create or replace function pg_temp.put_policy(p_schema text, p_table text, p_name text, p_create text, p_alter text)
returns void language plpgsql as $$
begin
  if exists (select 1 from pg_policies where schemaname = p_schema and tablename = p_table and policyname = p_name) then
    if p_alter is not null then execute p_alter; end if;
  else
    execute p_create;
  end if;
end; $$;

-- ─────────────────────────────── table ───────────────────────────────

-- id is the conversation_id used in coach_messages. updated_at is the time
-- of the last message (renaming, pinning or archiving does not move it), so
-- "order by updated_at desc" lists the most recent chats first.
create table if not exists public.coach_threads (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null default '',
  pinned boolean not null default false,
  archived_at timestamptz,
  message_count int not null default 0,
  last_preview text not null default '',
  last_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
select pg_temp.add_check('public.coach_threads', 'coach_threads_id_len', 'char_length(id) between 1 and 60');
select pg_temp.add_check('public.coach_threads', 'coach_threads_title_len', 'char_length(title) <= 80');
select pg_temp.add_check('public.coach_threads', 'coach_threads_preview_len', 'char_length(last_preview) <= 160');
select pg_temp.add_check('public.coach_threads', 'coach_threads_last_role_values', $c$last_role is null or last_role in ('user', 'coach')$c$);
select pg_temp.add_check('public.coach_threads', 'coach_threads_count_range', 'message_count >= 0');
create index if not exists coach_threads_list_idx
  on public.coach_threads (user_id, archived_at, updated_at desc);

-- ─────────────────────────── guard trigger ───────────────────────────

-- The app (role `authenticated`) may only choose title, pinned and
-- archived_at. Everything else is kept as it was (UPDATE) or starts empty
-- (INSERT), silently, so a client sending a whole row back never fails.
-- coach_thread_touch() runs as the table owner, so its writes pass through
-- and bump updated_at whenever the message counters change.
create or replace function public.coach_threads_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.title := left(btrim(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g')), 80);
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.message_count := 0;
      new.last_preview := '';
      new.last_role := null;
      new.created_at := now();
      new.updated_at := now();
    else
      new.user_id := old.user_id;
      new.id := old.id;
      new.message_count := old.message_count;
      new.last_preview := old.last_preview;
      new.last_role := old.last_role;
      new.created_at := old.created_at;
      new.updated_at := old.updated_at;
    end if;
  elsif tg_op = 'UPDATE'
    and (new.message_count is distinct from old.message_count
      or new.last_preview is distinct from old.last_preview
      or new.last_role is distinct from old.last_role) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger coach_threads_guard
  before insert or update on public.coach_threads
  for each row execute function public.coach_threads_guard();

-- ───────────────────────────── touch ─────────────────────────────

-- Record new messages in a thread of the signed-in person (creating the
-- thread when missing). p_added messages were just saved; p_preview is the
-- last one (cut to 160 characters), written by p_role ('user' or 'coach').
-- p_title, when given and not blank, replaces the title (the coach function
-- only sends one for a new chat). A new message brings an archived chat
-- back to the list. Returns the thread row.
create or replace function public.coach_thread_touch(p_id text, p_preview text, p_role text, p_added int, p_title text default null)
returns public.coach_threads
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_preview text := btrim(regexp_replace(coalesce(p_preview, ''), '\s+', ' ', 'g'));
  v_title text := left(btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g')), 80);
  v_added int := greatest(0, least(coalesce(p_added, 0), 20));
  v_row public.coach_threads;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 60 then
    raise exception 'bad conversation id' using errcode = '22023';
  end if;
  if p_role is not null and p_role not in ('user', 'coach') then
    raise exception 'bad role' using errcode = '22023';
  end if;
  if char_length(v_preview) > 160 then
    v_preview := rtrim(left(v_preview, 159)) || '…';
  end if;

  insert into public.coach_threads as t (user_id, id, title, message_count, last_preview, last_role, created_at, updated_at)
  values (uid, p_id, v_title, v_added, v_preview, p_role, now(), now())
  on conflict (user_id, id) do update set
    message_count = t.message_count + v_added,
    last_preview = case when v_added > 0 then v_preview else t.last_preview end,
    last_role = case when v_added > 0 then coalesce(p_role, t.last_role) else t.last_role end,
    title = case when v_title <> '' then v_title else t.title end,
    archived_at = case when v_added > 0 then null else t.archived_at end
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.coach_thread_touch(text, text, text, int, text) from public, anon;
grant execute on function public.coach_thread_touch(text, text, text, int, text) to authenticated, service_role;
revoke execute on function public.coach_threads_guard() from public, anon, authenticated;

-- ─────────────────────────────── RLS ───────────────────────────────

alter table public.coach_threads enable row level security;

select pg_temp.put_policy('public', 'coach_threads', 'read own coach threads',
  $p$create policy "read own coach threads" on public.coach_threads for select to authenticated using (auth.uid() = user_id)$p$,
  $p$alter policy "read own coach threads" on public.coach_threads to authenticated using (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'coach_threads', 'add own coach threads',
  $p$create policy "add own coach threads" on public.coach_threads for insert to authenticated with check (auth.uid() = user_id)$p$,
  $p$alter policy "add own coach threads" on public.coach_threads to authenticated with check (auth.uid() = user_id)$p$);
select pg_temp.put_policy('public', 'coach_threads', 'change own coach threads',
  $p$create policy "change own coach threads" on public.coach_threads for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$,
  $p$alter policy "change own coach threads" on public.coach_threads to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$);

revoke all on public.coach_threads from anon, authenticated;
grant select, insert, update on public.coach_threads to authenticated;
grant all on public.coach_threads to service_role;

-- ───────────────────────────── backfill ─────────────────────────────

-- One thread for every conversation already in coach_messages. Threads that
-- exist are left alone, so this only does work the first time.
-- Title: the first thing the person said, cut to 48 characters (… when
-- cut), or 'First chat'. Preview: the last message, cut to 160.
insert into public.coach_threads as t (user_id, id, title, message_count, last_preview, last_role, created_at, updated_at)
select
  s.user_id,
  s.conversation_id,
  case
    when s.first_user is null or s.first_user = '' then 'First chat'
    when char_length(s.first_user) > 48 then rtrim(left(s.first_user, 47)) || '…'
    else s.first_user
  end,
  s.n,
  case when char_length(s.last_body) > 160 then rtrim(left(s.last_body, 159)) || '…' else s.last_body end,
  s.last_role,
  s.first_at,
  s.last_at
from (
  select
    m.user_id,
    m.conversation_id,
    count(*)::int as n,
    min(m.created_at) as first_at,
    max(m.created_at) as last_at,
    (array_agg(btrim(regexp_replace(m.body, '\s+', ' ', 'g')) order by m.created_at, m.id) filter (where m.role = 'user'))[1] as first_user,
    (array_agg(btrim(regexp_replace(m.body, '\s+', ' ', 'g')) order by m.created_at desc, (m.role = 'coach') desc, m.id desc))[1] as last_body,
    (array_agg(m.role order by m.created_at desc, (m.role = 'coach') desc, m.id desc))[1] as last_role
  from public.coach_messages m
  group by m.user_id, m.conversation_id
) s
where char_length(s.conversation_id) between 1 and 60
on conflict (user_id, id) do nothing;

-- ═════════════════════════ end of coach threads ═════════════════════════
