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
