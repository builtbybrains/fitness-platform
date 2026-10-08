-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  SAMPLE DATA for the ERP (Customers and Finance). NOT REAL.       ║
-- ║  Never applied automatically. Run it by hand only on a test or    ║
-- ║  demo project, after supabase/erp.sql:                            ║
-- ║    Dashboard → SQL Editor → New query → paste → Run.              ║
-- ╚══════════════════════════════════════════════════════════════════╝
--
-- What it adds: 12 made-up customers across every stage (tag "sample",
-- emails @example.com), a year of made-up income and expenses (descriptions
-- start with "Sample:"), four invoices, a few tasks and notes. Dates are
-- relative to the day you run it.
--
-- Safe to run twice: every row has a fixed id and is skipped when present.
--
-- To retire it later (nothing is deleted; it stops counting anywhere):
--   update public.erp_transactions set void_at = now()
--     where description like 'Sample:%' and void_at is null;
--   update public.erp_invoices set status = 'void' where notes = 'Sample invoice.';
--   update public.erp_tasks set done_at = now() where title like 'Sample:%' and done_at is null;
--   update public.erp_customers set archived_at = now()
--     where 'sample' = any (tags) and archived_at is null;

insert into public.erp_customers (id, name, email, phone, stage, plan, price_cents, started_on, renews_on, source, tags, created_at)
values
  ('5a000000-0000-4000-8000-000000000001', 'Karim Haddad',   'karim.haddad@example.com', '+96171123401', 'active',    'monthly',   3000,  current_date - 190, current_date + 12,  'Instagram', '{sample,gym}',            now() - interval '200 days'),
  ('5a000000-0000-4000-8000-000000000002', 'Maya Khoury',    'maya.khoury@example.com',  '+96170123402', 'active',    'yearly',    30000, current_date - 120, current_date + 245, 'Referral',  '{sample,referral}',       now() - interval '130 days'),
  ('5a000000-0000-4000-8000-000000000003', 'Rami Nassar',    'rami.nassar@example.com',  '+96176123403', 'active',    'quarterly', 8100,  current_date - 75,  current_date + 15,  'Gym flyer', '{sample}',                now() - interval '80 days'),
  ('5a000000-0000-4000-8000-000000000004', 'Lea Saad',       'lea.saad@example.com',     '+96103123404', 'active',    'monthly',   3000,  current_date - 40,  current_date - 2,   'Instagram', '{sample,home}',           now() - interval '45 days'),
  ('5a000000-0000-4000-8000-000000000005', 'Jad Aoun',       'jad.aoun@example.com',     '+96171123405', 'active',    'quarterly', 8100,  current_date - 20,  current_date + 70,  'Referral',  '{sample}',                now() - interval '25 days'),
  ('5a000000-0000-4000-8000-000000000006', 'Nour Frem',      'nour.frem@example.com',    '+96170123406', 'trial',     null,        null,  null,               null,               'App Store', '{sample}',                now() - interval '6 days'),
  ('5a000000-0000-4000-8000-000000000007', 'Tarek Mansour',  'tarek.m@example.com',      '+96181123407', 'trial',     'monthly',   3000,  null,               null,               'TikTok',    '{sample,student}',        now() - interval '3 days'),
  ('5a000000-0000-4000-8000-000000000008', 'Hiba Salameh',   'hiba.s@example.com',       '',             'lead',      null,        null,  null,               null,               'Website',   '{sample}',                now() - interval '2 days'),
  ('5a000000-0000-4000-8000-000000000009', 'Fadi Karam',     'fadi.karam@example.com',   '+96171123409', 'lead',      null,        null,  null,               null,               'Gym flyer', '{sample,corporate}',      now() - interval '9 days'),
  ('5a000000-0000-4000-8000-00000000000a', 'Rita Gemayel',   'rita.g@example.com',       '+96170123410', 'paused',    'monthly',   3000,  current_date - 160, null,               'Instagram', '{sample,injury}',         now() - interval '170 days'),
  ('5a000000-0000-4000-8000-00000000000b', 'Ziad Chamoun',   'ziad.c@example.com',       '+96176123411', 'cancelled', 'monthly',   3000,  current_date - 140, null,               'Referral',  '{sample}',                now() - interval '150 days'),
  ('5a000000-0000-4000-8000-00000000000c', 'Yara Bou Khalil','yara.bk@example.com',      '+96103123412', 'cancelled', 'quarterly', 8100,  current_date - 200, null,               'Website',   '{sample}',                now() - interval '210 days')
on conflict (id) do nothing;

-- Twelve months of subscription income and running costs.
insert into public.erp_transactions (id, kind, category, amount_cents, occurred_on, customer_id, description)
select ('5b000000-0000-4000-8000-' || lpad(to_hex(m * 16 + k), 12, '0'))::uuid, kind, category, amount, day, customer, 'Sample: ' || label
from generate_series(0, 11) as m
cross join lateral (values
  (1, 'income',  'subscription', 3000 * (2 + (11 - m) / 3), (date_trunc('month', current_date) - (m || ' months')::interval)::date + 2, '5a000000-0000-4000-8000-000000000001'::uuid, 'monthly plans'),
  (2, 'income',  'subscription', case when m % 3 = 0 then 8100 * 2 else 0 end, (date_trunc('month', current_date) - (m || ' months')::interval)::date + 5, '5a000000-0000-4000-8000-000000000003'::uuid, '3-month plans'),
  (3, 'expense', 'ai',          1800 + (11 - m) * 220, (date_trunc('month', current_date) - (m || ' months')::interval)::date + 27, null::uuid, 'AI model usage'),
  (4, 'expense', 'hosting',     2500, (date_trunc('month', current_date) - (m || ' months')::interval)::date + 1, null::uuid, 'Database and hosting'),
  (5, 'expense', 'marketing',   case when m in (0, 2, 5, 8) then 15000 else 0 end, (date_trunc('month', current_date) - (m || ' months')::interval)::date + 10, null::uuid, 'Instagram ads'),
  (6, 'expense', 'app_store',   case when m = 7 then 9900 else 0 end, (date_trunc('month', current_date) - (m || ' months')::interval)::date + 3, null::uuid, 'Apple developer account')
) as v(k, kind, category, amount, day, customer, label)
where amount > 0 and day <= current_date
on conflict (id) do nothing;

insert into public.erp_transactions (id, kind, category, amount_cents, occurred_on, customer_id, description)
values
  ('5b000000-0000-4000-8000-0000000f0001', 'income', 'subscription', 30000, current_date - 120, '5a000000-0000-4000-8000-000000000002', 'Sample: yearly plan'),
  ('5b000000-0000-4000-8000-0000000f0002', 'expense', 'equipment', 12000, current_date - 33, null, 'Sample: resistance bands for the launch shoot')
on conflict (id) do nothing;

insert into public.erp_invoices (id, number, customer_id, issued_on, due_on, status, lines, total_cents, paid_on, notes)
values
  ('5c000000-0000-4000-8000-000000000001', 'INV-' || to_char(current_date, 'YYYY') || '-9001', '5a000000-0000-4000-8000-000000000005',
    current_date - 20, current_date - 6, 'paid', '[{"description":"BUILT 3 months plan","qty":1,"unit_cents":8100,"amount_cents":8100}]', 8100, current_date - 18, 'Sample invoice.'),
  ('5c000000-0000-4000-8000-000000000002', 'INV-' || to_char(current_date, 'YYYY') || '-9002', '5a000000-0000-4000-8000-000000000004',
    current_date - 16, current_date - 2, 'sent', '[{"description":"BUILT monthly plan","qty":1,"unit_cents":3000,"amount_cents":3000}]', 3000, null, 'Sample invoice.'),
  ('5c000000-0000-4000-8000-000000000003', 'INV-' || to_char(current_date, 'YYYY') || '-9003', '5a000000-0000-4000-8000-000000000001',
    current_date - 3, current_date + 11, 'sent', '[{"description":"BUILT monthly plan","qty":1,"unit_cents":3000,"amount_cents":3000},{"description":"Shaker bottle","qty":2,"unit_cents":1250,"amount_cents":2500}]', 5500, null, 'Sample invoice.'),
  ('5c000000-0000-4000-8000-000000000004', 'INV-' || to_char(current_date, 'YYYY') || '-9004', '5a000000-0000-4000-8000-000000000007',
    current_date, current_date + 14, 'draft', '[{"description":"BUILT monthly plan","qty":1,"unit_cents":3000,"amount_cents":3000}]', 3000, null, 'Sample invoice.')
on conflict (id) do nothing;

insert into public.erp_transactions (id, kind, category, amount_cents, occurred_on, customer_id, invoice_id, description)
values ('5b000000-0000-4000-8000-0000000f0003', 'income', 'subscription', 8100, current_date - 18,
  '5a000000-0000-4000-8000-000000000005', '5c000000-0000-4000-8000-000000000001', 'Sample: invoice payment')
on conflict do nothing;

insert into public.erp_tasks (id, customer_id, title, due_on, done_at)
values
  ('5d000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000004', 'Sample: chase the unpaid October invoice', current_date - 1, null),
  ('5d000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000008', 'Sample: call back about the yearly plan', current_date, null),
  ('5d000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-00000000000a', 'Sample: check how the knee is doing', current_date + 4, null),
  ('5d000000-0000-4000-8000-000000000004', null, 'Sample: renew the app store account', current_date + 30, null),
  ('5d000000-0000-4000-8000-000000000005', '5a000000-0000-4000-8000-000000000006', 'Sample: send the welcome message', current_date - 5, now() - interval '5 days')
on conflict (id) do nothing;

insert into public.erp_notes (id, customer_id, kind, body, created_at)
values
  ('5e000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'note', 'Sample: trains at the gym four times a week. Asked about a family discount.', now() - interval '30 days'),
  ('5e000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-00000000000a', 'note', 'Sample: paused for six weeks after a knee strain. Wants to restart in November.', now() - interval '12 days'),
  ('5e000000-0000-4000-8000-000000000003', '5a000000-0000-4000-8000-000000000008', 'note', 'Sample: came from the website form. Interested in the yearly plan.', now() - interval '2 days')
on conflict (id) do nothing;
