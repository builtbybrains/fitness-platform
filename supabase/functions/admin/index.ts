// BUILT admin API for the dashboard at https://builtbybrains.github.io/fitness-platform/admin/
// Deploy WITHOUT the Supabase JWT check (the admin is not a Supabase user):
//   supabase functions deploy admin --no-verify-jwt --project-ref <ref>
// (supabase/config.toml sets verify_jwt = false for it too.)
//
// One admin, a fixed hidden username and password checked in the database
// (bcrypt), sessions of 12 hours, lockout after repeated failures. Set the
// login with:  select public.admin_set_credentials('username', 'password');
//
// Routes (base: https://<ref>.supabase.co/functions/v1/admin). Every route
// except /login needs the header  x-admin-token: <token from /login>.
//   POST /login                {username, password} → {token, expires_at}
//   POST /logout
//   GET  /overview
//   GET  /users                ?q&goal&activity_level&train_location&age_group&active&signed_from&signed_to&streak_min&streak_max&onboarding&sort&limit&offset
//   GET  /users.csv            same filters, CSV download (contact details)
//   GET  /users/<id>           questionnaire, stats, weights, activities, check-ins, reports, timeline. Never photos.
//   GET  /reports              ?status=new|in_progress|fixed|open&q&limit&offset
//   GET  /reports/<id>         report, thread, user; screenshot as a 10-minute signed link
//   POST /reports/<id>/reply   {body, status?} → adds the reply, notifies the person by push
//   POST /reports/<id>/status  {status}
//
// Customers (CRM) and finance (./erp.ts; tables and functions in
// supabase/erp.sql). Money is integer cents, USD; dates are yyyy-mm-dd.
//   GET  /crm/customers             ?q&stage&plan&sort&limit&offset&streak  CRM customers plus app accounts not in the CRM yet
//   GET  /crm/customers.csv         same filters, CSV download
//   POST /crm/customers             {name, email, phone, stage, plan, price_cents, started_on, renews_on, source, tags} or {user_id} to adopt an app account
//   GET  /crm/customers/<id>        customer, linked account, notes, tasks, invoices, payments (id may be an app account id)
//   POST /crm/customers/<id>        any of the create fields; only the keys sent change
//   POST /crm/customers/<id>/archive  {archived?: false to restore}
//   POST /crm/customers/<id>/notes  {body}
//   GET  /crm/tasks                 ?open=1&customer_id&limit
//   POST /crm/tasks                 {title, due_on?, customer_id?}
//   POST /crm/tasks/<id>            {title?, due_on?, customer_id?, done?}
//   GET  /finance/summary           ?from&to  totals, MRR, subscriptions by plan, 12 months, categories, outstanding, churn, tasks
//   GET  /finance/transactions      ?kind&category&from&to&q&customer_id&include_void&limit&offset
//   GET  /finance/transactions.csv  same filters, CSV download
//   POST /finance/transactions      {kind, category, amount_cents, occurred_on?, customer_id?, description?}
//   POST /finance/transactions/<id>       any of those; only the keys sent change
//   POST /finance/transactions/<id>/void
//   GET  /finance/invoices          ?status&customer_id&q&limit&offset
//   POST /finance/invoices          {customer_id, issued_on?, due_on?, notes?, lines: [{description, qty, unit_cents}]} → a draft; total computed here
//   GET  /finance/invoices/<id>
//   GET  /finance/invoices/<id>.html   printable page (self-contained HTML)
//   POST /finance/invoices/<id>     edit a draft (same fields)
//   POST /finance/invoices/<id>/status  {status: sent|paid|void, paid_on?}; paid creates the income transaction once
// Full request and response examples: docs/API.md, "admin".
//
// CORS: only https://builtbybrains.github.io, the Vercel site
// https://fitness-platform-blue.vercel.app, this project's Vercel preview
// deployments (https://fitness-platform-<hash or branch>-brains-ai.vercel.app,
// the brains-ai team only) and http://localhost:<any> /
// http://127.0.0.1:<any> (for testing). Everything runs with the service
// role inside this function; nothing about it reaches a browser except the
// JSON answers below.

import { serviceClient } from '../_shared/env.ts';
import { GENERIC_ERROR } from '../_shared/http.ts';
import { sendPush } from '../_shared/push.ts';
import { erpRoute } from './erp.ts';

const ALLOWED_ORIGIN = /^(https:\/\/builtbybrains\.github\.io|https:\/\/fitness-platform-blue\.vercel\.app|https:\/\/fitness-platform-[a-z0-9-]+-brains-ai\.vercel\.app|http:\/\/localhost(:\d+)?|http:\/\/127\.0\.0\.1(:\d+)?)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['new', 'in_progress', 'fixed'];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  return {
    ...(ALLOWED_ORIGIN.test(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-admin-token, authorization, apikey, x-client-info',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };
}

type Ctx = { req: Request; headers: Record<string, string> };

function send(ctx: Ctx, status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { ...ctx.headers, 'content-type': 'application/json' } });
}

function err(ctx: Ctx, status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return send(ctx, status, { error: message, code, ...extra });
}

function tokenOf(req: Request): string {
  const t = req.headers.get('x-admin-token') ?? '';
  if (t) return t.trim();
  const a = req.headers.get('authorization') ?? '';
  return a.startsWith('Bearer ') ? a.slice(7).trim() : '';
}

function ipOf(req: Request): string {
  return (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? '').trim().slice(0, 100);
}

/** Route path after ".../admin". */
function routeOf(url: URL): string[] {
  const parts = url.pathname.split('/').filter(Boolean);
  const i = parts.lastIndexOf('admin');
  return i >= 0 ? parts.slice(i + 1) : parts;
}

const USER_FILTERS = ['q', 'goal', 'activity_level', 'train_location', 'age_group', 'active', 'signed_from', 'signed_to', 'streak_min', 'streak_max', 'onboarding', 'sort', 'limit', 'offset'];

function filtersFrom(url: URL, keys: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of keys) {
    const v = url.searchParams.get(k);
    if (v == null || v === '') continue;
    if (['limit', 'offset', 'streak_min', 'streak_max'].includes(k)) {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n)) out[k] = n;
    } else if ((k === 'signed_from' || k === 'signed_to') && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      continue;
    } else {
      out[k] = v.slice(0, 120);
    }
  }
  return out;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    return j && typeof j === 'object' ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  // Formula injection guard; a strict phone number (+961…) is left as is.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[0-9]{7,15}$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

Deno.serve(async (req) => {
  const ctx: Ctx = { req, headers: cors(req) };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: ctx.headers });
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGIN.test(origin)) return err(ctx, 403, 'forbidden', 'Not allowed.');

  try {
    const db = serviceClient();
    const url = new URL(req.url);
    const route = routeOf(url);
    const method = req.method;

    // ── login (no session needed) ──
    if (route[0] === 'login') {
      if (method !== 'POST') return err(ctx, 405, 'method_not_allowed', 'Use POST.');
      const b = await readJson(req);
      const username = String(b.username ?? '').slice(0, 64);
      const password = String(b.password ?? '').slice(0, 200);
      if (!username || !password) return err(ctx, 400, 'bad_request', 'Enter the username and password.');
      const { data, error } = await db.rpc('admin_login', { p_username: username, p_password: password, p_ip: ipOf(req) });
      if (error) throw new Error(`admin_login: ${error.message}`);
      const r = data as { ok: boolean; token?: string; expires_at?: string; error?: string; locked_until?: string | null };
      if (r.ok) return send(ctx, 200, { token: r.token, expires_at: r.expires_at });
      if (r.error === 'locked') return err(ctx, 423, 'locked', 'Too many attempts. Try again in 15 minutes.', { locked_until: r.locked_until });
      if (r.error === 'not_configured') return err(ctx, 503, 'not_configured', "The admin login isn't set up yet.");
      return err(ctx, 401, 'unauthorized', 'Wrong username or password.');
    }

    // ── everything else needs a live session ──
    const token = tokenOf(req);
    const { data: valid, error: checkErr } = await db.rpc('admin_session_check', { p_token: token });
    if (checkErr) throw new Error(`admin_session_check: ${checkErr.message}`);
    if (!valid) return err(ctx, 401, 'session_expired', 'Your session has ended. Sign in again.');

    if (route[0] === 'logout' && method === 'POST') {
      await db.rpc('admin_logout', { p_token: token });
      return send(ctx, 200, { ok: true });
    }

    if (route[0] === 'overview' && method === 'GET') {
      const { data, error } = await db.rpc('admin_overview');
      if (error) throw new Error(`admin_overview: ${error.message}`);
      return send(ctx, 200, data);
    }

    if (route[0] === 'users.csv' && method === 'GET') {
      const filters = { ...filtersFrom(url, USER_FILTERS), limit: 5000, offset: 0 };
      const { data, error } = await db.rpc('admin_users', { p: filters });
      if (error) throw new Error(`admin_users csv: ${error.message}`);
      const rows = ((data as { rows?: Record<string, unknown>[] })?.rows ?? []);
      const cols = ['name', 'email', 'phone', 'gender', 'age', 'age_group', 'goal', 'activity_level', 'train_location', 'timeline_months', 'streak', 'onboarding_done', 'created_at', 'last_active_at'];
      const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\r\n');
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(`﻿${csv}\r\n`, {
        status: 200,
        headers: { ...ctx.headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="built-users-${stamp}.csv"` },
      });
    }

    if (route[0] === 'users' && route.length === 1 && method === 'GET') {
      const { data, error } = await db.rpc('admin_users', { p: filtersFrom(url, USER_FILTERS) });
      if (error) throw new Error(`admin_users: ${error.message}`);
      return send(ctx, 200, data);
    }

    if (route[0] === 'users' && route.length === 2 && method === 'GET') {
      if (!UUID_RE.test(route[1])) return err(ctx, 400, 'bad_request', 'Unknown user.');
      const { data, error } = await db.rpc('admin_user_detail', { p_user: route[1] });
      if (error) throw new Error(`admin_user_detail: ${error.message}`);
      if (!data) return err(ctx, 404, 'not_found', 'No user with that id.');
      return send(ctx, 200, data);
    }

    if (route[0] === 'reports' && route.length === 1 && method === 'GET') {
      const { data, error } = await db.rpc('admin_reports', { p: filtersFrom(url, ['status', 'q', 'limit', 'offset']) });
      if (error) throw new Error(`admin_reports: ${error.message}`);
      return send(ctx, 200, data);
    }

    if (route[0] === 'reports' && route.length >= 2) {
      const id = route[1];
      if (!UUID_RE.test(id)) return err(ctx, 400, 'bad_request', 'Unknown report.');

      if (route.length === 2 && method === 'GET') {
        const { data, error } = await db.rpc('admin_report_detail', { p_report: id });
        if (error) throw new Error(`admin_report_detail: ${error.message}`);
        if (!data) return err(ctx, 404, 'not_found', 'No report with that id.');
        const d = data as { report: { screenshot_path?: string | null } };
        let screenshot_url: string | null = null;
        if (d.report.screenshot_path) {
          const { data: signed } = await db.storage.from('report-screenshots').createSignedUrl(d.report.screenshot_path, 600);
          screenshot_url = signed?.signedUrl ?? null;
        }
        return send(ctx, 200, { ...d, screenshot_url });
      }

      if (route[2] === 'reply' && method === 'POST') {
        const b = await readJson(req);
        const text = String(b.body ?? '').trim().slice(0, 4000);
        const status = b.status == null || b.status === '' ? null : String(b.status);
        if (!text) return err(ctx, 400, 'bad_request', 'Write a reply first.');
        if (status && !STATUSES.includes(status)) return err(ctx, 400, 'bad_request', 'Unknown status.');
        const { data, error } = await db.rpc('admin_report_reply', { p_report: id, p_body: text, p_status: status });
        if (error) throw new Error(`admin_report_reply: ${error.message}`);
        if (!data) return err(ctx, 404, 'not_found', 'No report with that id.');
        const r = data as { user_id: string; message: unknown; status: string };
        const pushed = await sendPush(db, [r.user_id], { title: 'BUILT support replied', body: text.slice(0, 160), data: { type: 'report_reply', report_id: id } }, 'report_reply');
        return send(ctx, 200, { message: r.message, status: r.status, pushed });
      }

      if (route[2] === 'status' && method === 'POST') {
        const b = await readJson(req);
        const status = String(b.status ?? '');
        if (!STATUSES.includes(status)) return err(ctx, 400, 'bad_request', 'Unknown status.');
        const { data, error } = await db.rpc('admin_report_set_status', { p_report: id, p_status: status });
        if (error) throw new Error(`admin_report_set_status: ${error.message}`);
        if (!data) return err(ctx, 404, 'not_found', 'No report with that id.');
        return send(ctx, 200, data);
      }
    }

    const erp = await erpRoute(db, route, url, method, {
      headers: ctx.headers,
      send: (status, payload) => send(ctx, status, payload),
      err: (status, code, message, extra) => err(ctx, status, code, message, extra),
      readJson: () => readJson(req),
      csvCell,
    });
    if (erp) return erp;

    return err(ctx, 404, 'not_found', 'Unknown route.');
  } catch (e) {
    console.error('[admin]', e instanceof Error ? `${e.name}: ${e.message}` : e);
    return err(ctx, 500, 'server_error', GENERIC_ERROR);
  }
});
