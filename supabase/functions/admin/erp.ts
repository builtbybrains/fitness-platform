// ERP routes for the admin API: customers (CRM) and finance. Mounted by
// ./index.ts after the session check, so every route here already has a
// live admin session. Request and response examples: docs/API.md, "11. Admin
// API", "Customers" and "Finance".
//
// Every input is checked here (lengths, enums, integer cents, real
// yyyy-mm-dd dates, uuids) before it reaches the database, and the database
// checks again (supabase/erp.sql). Money is integer cents, USD only.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { setting } from '../_shared/env.ts';
import { type InvoiceDetail, invoiceHtml } from './invoice.ts';

export type ErpTools = {
  headers: Record<string, string>;
  send: (status: number, payload: unknown) => Response;
  err: (status: number, code: string, message: string, extra?: Record<string, unknown>) => Response;
  readJson: () => Promise<Record<string, unknown>>;
  csvCell: (v: unknown) => string;
};

type Body = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const STAGES = ['lead', 'trial', 'active', 'paused', 'cancelled'] as const;
export const PLANS = ['monthly', 'quarterly', 'yearly'] as const;
const LIST_STAGES = [...STAGES, 'archived', 'not_in_crm'];
const LIST_PLANS = [...PLANS, 'none'];
const CRM_SORTS = ['recent', 'name_asc', 'last_active_desc', 'renews_asc', 'price_desc', 'stage'];
export const CATEGORIES: Record<string, string[]> = {
  income: ['subscription', 'other'],
  expense: ['ai', 'hosting', 'app_store', 'marketing', 'salaries', 'equipment', 'other'],
};
const ALL_CATEGORIES = [...new Set([...CATEGORIES.income, ...CATEGORIES.expense])];
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'];
const MAX_AMOUNT = 100_000_000; // $1,000,000.00 per transaction or price
const MAX_UNIT = 100_000_000;
const MAX_QTY = 10_000;
const MAX_INVOICE_TOTAL = 2_000_000_000;

/** A bad input; the message is shown to the admin as is. */
class Invalid extends Error {}

// ─────────────────────────── validators ───────────────────────────

function has(b: Body, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(b, k);
}

/** Optional text: undefined when absent; '' when null. Trimmed. */
function text(b: Body, k: string, label: string, max: number, required = false): string | undefined {
  if (!has(b, k) || b[k] === undefined) {
    if (required) throw new Invalid(`Enter ${label}.`);
    return undefined;
  }
  const v = b[k];
  if (v !== null && typeof v !== 'string') throw new Invalid(`${cap(label)} must be text.`);
  const s = (v ?? '').trim();
  if (required && !s) throw new Invalid(`Enter ${label}.`);
  if ([...s].length > max) throw new Invalid(`${cap(label)} can be ${max} characters at most.`);
  return s;
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function realDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && s >= '2000-01-01' && s <= '2100-12-31';
}

/** Optional date: undefined when absent, '' when null/empty (clears it). */
function date(b: Body, k: string, label: string, required = false): string | undefined {
  if (!has(b, k) || b[k] === undefined) {
    if (required) throw new Invalid(`Pick ${label}.`);
    return undefined;
  }
  const v = b[k];
  if (v === null || v === '') {
    if (required) throw new Invalid(`Pick ${label}.`);
    return '';
  }
  if (typeof v !== 'string' || !realDate(v)) throw new Invalid(`${cap(label)} must be a real date, written yyyy-mm-dd.`);
  return v;
}

function oneOf<T extends string>(v: unknown, list: readonly T[], label: string): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) throw new Invalid(`Unknown ${label}.`);
  return v as T;
}

function intIn(v: unknown, label: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Invalid(`${cap(label)} must be a whole number.`);
  if (v < min || v > max) throw new Invalid(`${cap(label)} must be between ${min} and ${max}.`);
  return v;
}

function cents(v: unknown, label: string, min: number, max = MAX_AMOUNT): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Invalid(`${cap(label)} must be a whole number of cents.`);
  if (v < min) throw new Invalid(min > 0 ? `${cap(label)} must be more than zero.` : `${cap(label)} can't be negative.`);
  if (v > max) throw new Invalid(`${cap(label)} is too large.`);
  return v;
}

function uuidOrNull(v: unknown, label: string): string | null {
  if (v === null || v === '' || v === undefined) return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new Invalid(`Unknown ${label}.`);
  return v.toLowerCase();
}

function email(b: Body): string | undefined {
  const s = text(b, 'email', 'the email', 254);
  if (s && !EMAIL_RE.test(s)) throw new Invalid('Enter a real email address, like name@example.com.');
  return s === undefined ? undefined : s.toLowerCase();
}

function phone(b: Body): string | undefined {
  const s = text(b, 'phone', 'the phone number', 32);
  if (!s) return s;
  if (!/^\+?[0-9 ()./-]{6,32}$/.test(s)) throw new Invalid('Enter the phone number with digits only, like +961 70 123 456.');
  const digits = s.replace(/[^\d]/g, '');
  if (digits.length < 6 || digits.length > 15) throw new Invalid('Enter the phone number with digits only, like +961 70 123 456.');
  return (s.startsWith('+') ? '+' : '') + digits;
}

function tags(b: Body): string[] | undefined {
  if (!has(b, 'tags') || b.tags === undefined) return undefined;
  if (b.tags === null) return [];
  if (!Array.isArray(b.tags)) throw new Invalid('Tags must be a list.');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of b.tags) {
    if (typeof t !== 'string') throw new Invalid('Each tag must be text.');
    const s = t.trim().replace(/\s+/g, ' ');
    if (!s) continue;
    if ([...s].length > 32) throw new Invalid('Each tag can be 32 characters at most.');
    if (seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  if (out.length > 12) throw new Invalid('Use 12 tags at most.');
  return out;
}

/** The customer fields shared by create and update. */
function customerFields(b: Body, creating: boolean): Body {
  const p: Body = {};
  const name = text(b, 'name', 'a name', 120, creating && !b.user_id);
  if (name !== undefined) p.name = name;
  const e = email(b);
  if (e !== undefined) p.email = e;
  const ph = phone(b);
  if (ph !== undefined) p.phone = ph;
  if (has(b, 'stage') && b.stage !== undefined) p.stage = oneOf(b.stage, STAGES, 'stage');
  if (has(b, 'plan') && b.plan !== undefined) p.plan = b.plan === null || b.plan === '' ? '' : oneOf(b.plan, PLANS, 'plan');
  if (has(b, 'price_cents') && b.price_cents !== undefined) p.price_cents = b.price_cents === null ? null : cents(b.price_cents, 'the price', 0);
  const s = date(b, 'started_on', 'the start date');
  if (s !== undefined) p.started_on = s;
  const r = date(b, 'renews_on', 'the renewal date');
  if (r !== undefined) p.renews_on = r;
  if (s && r && r < s) throw new Invalid('The renewal date must be on or after the start date.');
  const src = text(b, 'source', 'the source', 60);
  if (src !== undefined) p.source = src;
  const t = tags(b);
  if (t !== undefined) p.tags = t;
  return p;
}

function txFields(b: Body, creating: boolean): Body {
  const p: Body = {};
  if (creating || (has(b, 'kind') && b.kind !== undefined)) p.kind = oneOf(b.kind, ['income', 'expense'] as const, 'kind; use income or expense');
  if (creating || (has(b, 'category') && b.category !== undefined)) {
    p.category = oneOf(b.category, p.kind ? CATEGORIES[p.kind as string] : ALL_CATEGORIES, `category${p.kind ? ` for ${p.kind}` : ''}`);
  }
  if (creating || (has(b, 'amount_cents') && b.amount_cents !== undefined)) p.amount_cents = cents(b.amount_cents, 'the amount', 1);
  if (has(b, 'currency') && b.currency !== undefined && b.currency !== 'USD') throw new Invalid('Only USD for now.');
  const d = date(b, 'occurred_on', 'the date');
  if (d) p.occurred_on = d;
  if (has(b, 'customer_id') && b.customer_id !== undefined) p.customer_id = uuidOrNull(b.customer_id, 'customer');
  const desc = text(b, 'description', 'the description', 300);
  if (desc !== undefined) p.description = desc;
  return p;
}

function invoiceFields(b: Body, creating: boolean): Body {
  const p: Body = {};
  if (creating || (has(b, 'customer_id') && b.customer_id !== undefined)) {
    const c = uuidOrNull(b.customer_id, 'customer');
    if (!c) throw new Invalid('Pick a customer.');
    p.customer_id = c;
  }
  const issued = date(b, 'issued_on', 'the issue date');
  if (issued) p.issued_on = issued;
  const due = date(b, 'due_on', 'the due date');
  if (due !== undefined) p.due_on = due;
  if (issued && due && due < issued) throw new Invalid('The due date must be on or after the issue date.');
  const notes = text(b, 'notes', 'the notes', 2000);
  if (notes !== undefined) p.notes = notes;
  if (has(b, 'lines') && b.lines !== undefined) {
    if (!Array.isArray(b.lines)) throw new Invalid('Lines must be a list.');
    if (b.lines.length > 50) throw new Invalid('Use 50 lines at most.');
    let total = 0;
    p.lines = b.lines.map((raw, i) => {
      if (!raw || typeof raw !== 'object') throw new Invalid(`Line ${i + 1} is empty.`);
      const l = raw as Body;
      const description = text(l, 'description', `a description on line ${i + 1}`, 200, true) as string;
      const qty = intIn(l.qty, `the quantity on line ${i + 1}`, 1, MAX_QTY);
      const unit = cents(l.unit_cents, `the unit price on line ${i + 1}`, 0, MAX_UNIT);
      total += qty * unit;
      return { description, qty, unit_cents: unit };
    });
    if (total > MAX_INVOICE_TOTAL) throw new Invalid('The invoice total is too large.');
  }
  return p;
}

/** Shared list parameters. */
function limitOf(url: URL, def: number, max: number): number {
  const v = url.searchParams.get('limit');
  if (v == null || v === '') return def;
  if (!/^\d{1,5}$/.test(v)) throw new Invalid('limit must be a whole number.');
  return Math.min(Math.max(Number(v), 1), max);
}
function offsetOf(url: URL): number {
  const v = url.searchParams.get('offset');
  if (v == null || v === '') return 0;
  if (!/^\d{1,7}$/.test(v)) throw new Invalid('offset must be a whole number.');
  return Number(v);
}
function qOf(url: URL): string | null {
  const v = (url.searchParams.get('q') ?? '').trim();
  if ([...v].length > 120) throw new Invalid('Search can be 120 characters at most.');
  return v || null;
}
function enumParam(url: URL, k: string, list: readonly string[], label: string): string | null {
  const v = url.searchParams.get(k);
  if (v == null || v === '') return null;
  return oneOf(v, list, label);
}
function dateParam(url: URL, k: string, label: string): string | null {
  const v = url.searchParams.get(k);
  if (v == null || v === '') return null;
  if (!realDate(v)) throw new Invalid(`${cap(label)} must be a real date, written yyyy-mm-dd.`);
  return v;
}
function boolParam(url: URL, k: string, def: boolean): boolean {
  const v = url.searchParams.get(k);
  if (v == null || v === '') return def;
  if (['1', 'true', 'yes'].includes(v)) return true;
  if (['0', 'false', 'no'].includes(v)) return false;
  throw new Invalid(`${k} must be 1 or 0.`);
}

function crmListArgs(url: URL, limit: number) {
  return {
    p_q: qOf(url),
    p_stage: enumParam(url, 'stage', LIST_STAGES, 'stage'),
    p_plan: enumParam(url, 'plan', LIST_PLANS, 'plan'),
    p_limit: limit,
    p_offset: offsetOf(url),
    p_sort: enumParam(url, 'sort', CRM_SORTS, 'sort') ?? 'recent',
    p_with_streak: boolParam(url, 'streak', true),
  };
}

function txListArgs(url: URL, limit: number) {
  const kind = enumParam(url, 'kind', ['income', 'expense'], 'kind');
  const p: Body = { limit, offset: offsetOf(url), include_void: boolParam(url, 'include_void', true) };
  if (kind) p.kind = kind;
  const category = enumParam(url, 'category', kind ? CATEGORIES[kind] : ALL_CATEGORIES, 'category');
  if (category) p.category = category;
  const from = dateParam(url, 'from', 'from');
  const to = dateParam(url, 'to', 'to');
  if (from && to && to < from) throw new Invalid('The end date must be on or after the start date.');
  if (from) p.from = from;
  if (to) p.to = to;
  const q = qOf(url);
  if (q) p.q = q;
  const customer = url.searchParams.get('customer_id');
  if (customer) p.customer_id = uuidOrNull(customer, 'customer');
  return p;
}

// ─────────────────────────── database answers ───────────────────────────

const RESULT_ERRORS: Record<string, [number, string, string]> = {
  already_in_crm: [409, 'conflict', 'This person is already in your customers.'],
  no_user: [404, 'not_found', 'No app account with that id.'],
  no_customer: [400, 'bad_request', 'Pick a customer from your list. Archived customers can\'t be used.'],
  not_draft: [409, 'conflict', 'Only draft invoices can be edited. Void it and create a new one to change it.'],
  void: [409, 'conflict', 'This transaction is void, so it can\'t change.'],
  linked: [409, 'conflict', 'This payment came from an invoice, so its kind, amount and customer follow the invoice. Only the date, category and description can change here.'],
  too_large: [400, 'bad_request', 'The invoice total is too large.'],
  is_void: [409, 'conflict', 'This invoice is void. Create a new one instead.'],
  empty: [400, 'bad_request', 'Add at least one line with an amount first.'],
  bad_status: [400, 'bad_request', 'Unknown status.'],
};

type RpcError = { message: string; code?: string };

/** A database error that is the admin's input, as a 400; anything else throws. */
function dbFail(t: ErpTools, error: RpcError, where: string): Response {
  if (['23514', '22P02', '22007', '22008', '22003', '23502'].includes(error.code ?? '')) {
    console.warn(`[admin] ${where}: ${error.message}`);
    return t.err(400, 'bad_request', 'Some of those values are not allowed. Check them and try again.');
  }
  if (error.code === '23503') return t.err(400, 'bad_request', 'That customer or invoice no longer exists.');
  if (error.code === '23505') return t.err(409, 'conflict', 'That already exists.');
  throw new Error(`${where}: ${error.message}`);
}

async function call(db: SupabaseClient, t: ErpTools, fn: string, args: Body, notFound: string, okStatus = 200): Promise<Response> {
  const { data, error } = await db.rpc(fn, args);
  if (error) return dbFail(t, error as RpcError, fn);
  if (data == null) return t.err(404, 'not_found', notFound);
  const d = data as Body;
  if (typeof d.error === 'string') {
    if (d.error === 'not_found') return t.err(404, 'not_found', notFound);
    const [status, code, message] = RESULT_ERRORS[d.error] ?? [500, 'server_error', 'Something went wrong. Try again.'];
    const extra: Body = {};
    if (d.id) extra.id = d.id;
    return t.err(status, code, message, extra);
  }
  return t.send(okStatus, data);
}

function csvResponse(t: ErpTools, name: string, cols: string[], rows: Body[]): Response {
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => t.csvCell(r[c])).join(','))].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${csv}\r\n`, {
    status: 200,
    headers: { ...t.headers, 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="built-${name}-${stamp}.csv"` },
  });
}

const dollars = (c: unknown) => (typeof c === 'number' ? (c / 100).toFixed(2) : '');

// ─────────────────────────── routes ───────────────────────────

/**
 * Handles /crm/* and /finance/*. Returns null for any other path so the
 * caller can answer 404.
 */
export async function erpRoute(db: SupabaseClient, route: string[], url: URL, method: string, t: ErpTools): Promise<Response | null> {
  if (route[0] !== 'crm' && route[0] !== 'finance') return null;
  try {
    return route[0] === 'crm' ? await crm(db, route, url, method, t) : await finance(db, route, url, method, t);
  } catch (e) {
    if (e instanceof Invalid) return t.err(400, 'bad_request', e.message);
    throw e;
  }
}

async function crm(db: SupabaseClient, route: string[], url: URL, method: string, t: ErpTools): Promise<Response | null> {
  const [, section, id, action] = route;

  if (section === 'customers.csv' && route.length === 2 && method === 'GET') {
    const { data, error } = await db.rpc('admin_crm_list', crmListArgs(url, 5000));
    if (error) return dbFail(t, error as RpcError, 'admin_crm_list csv');
    const rows = ((data as { rows?: Body[] })?.rows ?? []).map((r) => ({
      ...r,
      price_usd: dollars(r.price_cents),
      tags: Array.isArray(r.tags) ? (r.tags as string[]).join('; ') : '',
      in_crm: r.in_crm ? 'yes' : 'no',
    }));
    return csvResponse(t, 'customers', ['name', 'email', 'phone', 'stage', 'plan', 'price_usd', 'started_on', 'renews_on', 'source', 'tags', 'in_crm', 'open_tasks', 'streak', 'last_active_at', 'created_at'], rows);
  }

  if (section === 'customers' && route.length === 2) {
    if (method === 'GET') {
      const { data, error } = await db.rpc('admin_crm_list', crmListArgs(url, limitOf(url, 50, 500)));
      if (error) return dbFail(t, error as RpcError, 'admin_crm_list');
      return t.send(200, data);
    }
    if (method === 'POST') {
      const b = await t.readJson();
      const userId = uuidOrNull(b.user_id, 'app account');
      const p = customerFields(b, true);
      if (userId) p.user_id = userId;
      return call(db, t, 'admin_crm_save', { p_id: null, p }, 'No app account with that id.', 201);
    }
  }

  if (section === 'customers' && id) {
    if (!UUID_RE.test(id)) return t.err(400, 'bad_request', 'Unknown customer.');
    if (route.length === 3 && method === 'GET') {
      return call(db, t, 'admin_crm_detail', { p_id: id }, 'No customer with that id.');
    }
    if (route.length === 3 && method === 'POST') {
      const b = await t.readJson();
      const p = customerFields(b, false);
      if (!Object.keys(p).length) return t.err(400, 'bad_request', 'Nothing to change.');
      return call(db, t, 'admin_crm_save', { p_id: id, p }, 'No customer with that id.');
    }
    if (route.length === 4 && action === 'archive' && method === 'POST') {
      const b = await t.readJson();
      if (has(b, 'archived') && typeof b.archived !== 'boolean') return t.err(400, 'bad_request', 'archived must be true or false.');
      return call(db, t, 'admin_crm_archive', { p_id: id, p_archived: b.archived !== false }, 'No customer with that id.');
    }
    if (route.length === 4 && action === 'notes' && method === 'POST') {
      const b = await t.readJson();
      const body = text(b, 'body', 'a note', 4000, true) as string;
      return call(db, t, 'admin_crm_note_add', { p_customer: id, p_body: body }, 'No customer with that id.', 201);
    }
  }

  if (section === 'tasks' && route.length === 2) {
    if (method === 'GET') {
      const p: Body = { open: boolParam(url, 'open', false), limit: limitOf(url, 200, 500) };
      const customer = url.searchParams.get('customer_id');
      if (customer) p.customer_id = uuidOrNull(customer, 'customer');
      const { data, error } = await db.rpc('admin_crm_tasks', { p });
      if (error) return dbFail(t, error as RpcError, 'admin_crm_tasks');
      return t.send(200, data);
    }
    if (method === 'POST') {
      const b = await t.readJson();
      const p: Body = { title: text(b, 'title', 'what needs doing', 200, true) };
      const due = date(b, 'due_on', 'the due date');
      if (due) p.due_on = due;
      const customer = uuidOrNull(b.customer_id, 'customer');
      if (customer) p.customer_id = customer;
      return call(db, t, 'admin_crm_task_save', { p_id: null, p }, 'No task with that id.', 201);
    }
  }

  if (section === 'tasks' && id && route.length === 3 && method === 'POST') {
    if (!UUID_RE.test(id)) return t.err(400, 'bad_request', 'Unknown task.');
    const b = await t.readJson();
    const p: Body = {};
    const title = text(b, 'title', 'what needs doing', 200);
    if (title !== undefined) {
      if (!title) return t.err(400, 'bad_request', 'Enter what needs doing.');
      p.title = title;
    }
    const due = date(b, 'due_on', 'the due date');
    if (due !== undefined) p.due_on = due;
    if (has(b, 'customer_id') && b.customer_id !== undefined) p.customer_id = uuidOrNull(b.customer_id, 'customer');
    if (has(b, 'done') && b.done !== undefined) {
      if (typeof b.done !== 'boolean') return t.err(400, 'bad_request', 'done must be true or false.');
      p.done = b.done;
    }
    if (!Object.keys(p).length) return t.err(400, 'bad_request', 'Nothing to change.');
    return call(db, t, 'admin_crm_task_save', { p_id: id, p }, 'No task with that id.');
  }

  return null;
}

async function finance(db: SupabaseClient, route: string[], url: URL, method: string, t: ErpTools): Promise<Response | null> {
  const [, section, id, action] = route;

  if (section === 'summary' && route.length === 2 && method === 'GET') {
    const from = dateParam(url, 'from', 'from');
    const to = dateParam(url, 'to', 'to');
    if (from && to && to < from) return t.err(400, 'bad_request', 'The end date must be on or after the start date.');
    const { data, error } = await db.rpc('admin_finance_summary', { p_from: from, p_to: to });
    if (error) return dbFail(t, error as RpcError, 'admin_finance_summary');
    return t.send(200, data);
  }

  if (section === 'transactions.csv' && route.length === 2 && method === 'GET') {
    const { data, error } = await db.rpc('admin_fin_transactions', { p: txListArgs(url, 5000) });
    if (error) return dbFail(t, error as RpcError, 'admin_fin_transactions csv');
    const rows = ((data as { rows?: Body[] })?.rows ?? []).map((r) => ({
      ...r,
      amount_usd: dollars(r.amount_cents),
      customer: r.customer_name ?? '',
      invoice: r.invoice_number ?? '',
      void: r.void_at ? 'yes' : 'no',
    }));
    return csvResponse(t, 'transactions', ['occurred_on', 'kind', 'category', 'amount_usd', 'currency', 'description', 'customer', 'invoice', 'void', 'created_at'], rows);
  }

  if (section === 'transactions' && route.length === 2) {
    if (method === 'GET') {
      const { data, error } = await db.rpc('admin_fin_transactions', { p: txListArgs(url, limitOf(url, 50, 500)) });
      if (error) return dbFail(t, error as RpcError, 'admin_fin_transactions');
      return t.send(200, data);
    }
    if (method === 'POST') {
      const b = await t.readJson();
      return call(db, t, 'admin_fin_tx_save', { p_id: null, p: txFields(b, true) }, 'No transaction with that id.', 201);
    }
  }

  if (section === 'transactions' && id) {
    if (!UUID_RE.test(id)) return t.err(400, 'bad_request', 'Unknown transaction.');
    if (route.length === 3 && method === 'POST') {
      const b = await t.readJson();
      // A category without a kind keeps the stored kind; the database
      // checks the pair.
      const p = txFields(b, false);
      if (!Object.keys(p).length) return t.err(400, 'bad_request', 'Nothing to change.');
      return call(db, t, 'admin_fin_tx_save', { p_id: id, p }, 'No transaction with that id.');
    }
    if (route.length === 4 && action === 'void' && method === 'POST') {
      return call(db, t, 'admin_fin_tx_void', { p_id: id }, 'No transaction with that id.');
    }
  }

  if (section === 'invoices' && route.length === 2) {
    if (method === 'GET') {
      const p: Body = { limit: limitOf(url, 50, 500), offset: offsetOf(url) };
      const status = enumParam(url, 'status', [...INVOICE_STATUSES, 'overdue'], 'status');
      if (status) p.status = status;
      const q = qOf(url);
      if (q) p.q = q;
      const customer = url.searchParams.get('customer_id');
      if (customer) p.customer_id = uuidOrNull(customer, 'customer');
      const { data, error } = await db.rpc('admin_fin_invoices', { p });
      if (error) return dbFail(t, error as RpcError, 'admin_fin_invoices');
      return t.send(200, data);
    }
    if (method === 'POST') {
      const b = await t.readJson();
      return call(db, t, 'admin_fin_invoice_save', { p_id: null, p: invoiceFields(b, true) }, 'No invoice with that id.', 201);
    }
  }

  if (section === 'invoices' && id && route.length === 3 && method === 'GET' && id.endsWith('.html')) {
    const invId = id.slice(0, -5);
    if (!UUID_RE.test(invId)) return t.err(400, 'bad_request', 'Unknown invoice.');
    const { data, error } = await db.rpc('admin_fin_invoice_detail', { p_id: invId });
    if (error) return dbFail(t, error as RpcError, 'admin_fin_invoice_detail html');
    if (!data) return t.err(404, 'not_found', 'No invoice with that id.');
    const [from, footer] = await Promise.all([setting('INVOICE_FROM'), setting('INVOICE_FOOTER')]);
    const html = invoiceHtml(data as InvoiceDetail, { from: from.replace(/\\n/g, '\n'), footer: footer.replace(/\\n/g, '\n') });
    return new Response(html, {
      status: 200,
      headers: {
        ...t.headers,
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'",
      },
    });
  }

  if (section === 'invoices' && id) {
    if (!UUID_RE.test(id)) return t.err(400, 'bad_request', 'Unknown invoice.');
    if (route.length === 3 && method === 'GET') {
      return call(db, t, 'admin_fin_invoice_detail', { p_id: id }, 'No invoice with that id.');
    }
    if (route.length === 3 && method === 'POST') {
      const b = await t.readJson();
      const p = invoiceFields(b, false);
      if (!Object.keys(p).length) return t.err(400, 'bad_request', 'Nothing to change.');
      return call(db, t, 'admin_fin_invoice_save', { p_id: id, p }, 'No invoice with that id.');
    }
    if (route.length === 4 && action === 'status' && method === 'POST') {
      const b = await t.readJson();
      const status = oneOf(b.status, ['sent', 'paid', 'void'] as const, 'status; use sent, paid or void');
      const paidOn = date(b, 'paid_on', 'the payment date');
      if (paidOn && status !== 'paid') return t.err(400, 'bad_request', 'A payment date only goes with status paid.');
      return call(db, t, 'admin_fin_invoice_status', { p_id: id, p_status: status, p_paid_on: paidOn || null }, 'No invoice with that id.');
    }
  }

  return null;
}
