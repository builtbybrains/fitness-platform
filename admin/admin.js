'use strict';
// BUILT admin dashboard. Plain JS, no build step. It talks to one thing: the
// `admin` Edge Function (docs/API.md, section 11). No Supabase keys, no direct
// database access, never body photos.

// Where the admin API lives. If the database moves to another Supabase project
// (or off Supabase), change this one line. If the new host is not on
// *.supabase.co, also update connect-src in the Content-Security-Policy meta tag
// in admin/index.html.
const API_BASE = 'https://kpsoovvsdunbohezbwnc.supabase.co/functions/v1/admin';

const TOKEN_KEY = 'built-admin-token';
const EXPIRES_KEY = 'built-admin-expires';
const PAGE_SIZE = 25;
const TZ = 'Asia/Beirut';

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

const L = {
  goal: { lose_fat: 'Lose fat', build_muscle: 'Build muscle', tone_up: 'Tone up', stay_fit: 'Stay fit', sports_performance: 'Sports performance', unknown: 'Not chosen yet' },
  activity_level: { sedentary: 'Sedentary', light: 'Lightly active', moderate: 'Moderately active', very: 'Very active', athlete: 'Athlete' },
  train_location: { home_none: 'Home, no equipment', home_equipment: 'Home with equipment', gym: 'Gym' },
  train_short: { home_none: 'Home', home_equipment: 'Home, equipped', gym: 'Gym' },
  age_group: { under_18: 'Under 18', '18_24': '18 to 24', '25_34': '25 to 34', '35_44': '35 to 44', '45_54': '45 to 54', '55_plus': '55 and over', unknown: 'Not given' },
  active: { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', inactive_30d: 'Away 30+ days', never: 'Never opened' },
  onboarding: { done: 'Finished', incomplete: 'Not finished' },
  sort: { created_desc: 'Newest sign-ups', created_asc: 'Oldest sign-ups', last_active_desc: 'Recently active', name_asc: 'Name, A to Z', streak_desc: 'Longest streak' },
  category: { bug: 'Bug', plan: 'Plan', food: 'Food', account: 'Account', other: 'Other' },
  status: { new: 'New', in_progress: 'In progress', fixed: 'Fixed' },
  reportFilter: { open: 'Open', new: 'New', in_progress: 'In progress', fixed: 'Fixed', all: 'All' },
  job: { desk: 'Desk job', on_feet: 'On their feet', physical: 'Physical work' },
  time: { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon', evening: 'Evening' },
  diet: { none: 'No restriction', halal: 'Halal', vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian', lactose_free: 'Lactose-free', gluten_free: 'Gluten-free' },
  gender: { female: 'Female', male: 'Male' },
  platform: { ios: 'iPhone', android: 'Android', web: 'Web' },
};
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FILTER_KEYS = ['active', 'goal', 'activity_level', 'train_location', 'age_group', 'onboarding', 'streak_min', 'streak_max', 'signed_from', 'signed_to'];
const FILTER_NAMES = { q: 'Search', active: 'Last active', goal: 'Goal', activity_level: 'Activity', train_location: 'Trains at', age_group: 'Age', onboarding: 'Questionnaire', streak_min: 'Streak from', streak_max: 'Streak up to', signed_from: 'Joined from', signed_to: 'Joined up to' };

function humanize(v) {
  const s = String(v ?? '').replace(/_/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}
function label(map, v) {
  if (v == null || v === '') return '';
  return (L[map] && L[map][v]) || humanize(v);
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const icon = (id, cls = 'ico') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const nf = new Intl.NumberFormat('en-US');
const n = (v) => (v == null ? '0' : nf.format(v));
const plural = (k, one, many) => `${n(k)} ${k === 1 ? one : many}`;
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'them';

const fmt = {
  date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }),
  short: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ }),
  dayShort: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  dayLong: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
  time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }),
  ymd: new Intl.DateTimeFormat('en-CA', { timeZone: TZ }),
};
const toDate = (v) => (v instanceof Date ? v : new Date(v));
const valid = (v) => v != null && v !== '' && !Number.isNaN(toDate(v).getTime());
const fDate = (v) => (valid(v) ? fmt.date.format(toDate(v)) : '');
const fShort = (v) => (valid(v) ? fmt.short.format(toDate(v)) : '');
const fTime = (v) => (valid(v) ? fmt.time.format(toDate(v)) : '');
const fDateTime = (v) => (valid(v) ? `${fShort(v)}, ${fTime(v)}` : '');
const fDay = (d) => (d ? fmt.dayShort.format(new Date(`${d}T12:00:00Z`)) : '');
const fDayLong = (d) => (d ? fmt.dayLong.format(new Date(`${d}T12:00:00Z`)) : '');
const todayYmd = () => fmt.ymd.format(new Date());
function ago(v) {
  if (!valid(v)) return '';
  const s = (Date.now() - toDate(v).getTime()) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400 && fmt.ymd.format(toDate(v)) === todayYmd()) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.round((Date.parse(`${todayYmd()}T12:00:00Z`) - Date.parse(`${fmt.ymd.format(toDate(v))}T12:00:00Z`)) / 86400000);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fShort(v);
}
function phone(p) {
  const s = String(p || '');
  const m = s.match(/^\+961(\d{1,2})(\d{3})(\d{3})$/);
  return m ? `+961 ${m[1]} ${m[2]} ${m[3]}` : s;
}
function safeHref(u) {
  try {
    const url = new URL(u);
    if (url.protocol === 'https:') return url.href;
    if (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return url.href;
  } catch { /* not a url */ }
  return '';
}
function kg(v) { return v == null || v === '' ? '' : `${Math.round(Number(v) * 10) / 10} kg`; }

/* ------------------------------------------------------------------ */
/* Session and API                                                     */
/* ------------------------------------------------------------------ */

const store = {
  get token() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  get expires() { try { return sessionStorage.getItem(EXPIRES_KEY) || ''; } catch { return ''; } },
  set(token, expires) { try { sessionStorage.setItem(TOKEN_KEY, token); sessionStorage.setItem(EXPIRES_KEY, expires || ''); } catch { /* private mode */ } },
  clear() { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(EXPIRES_KEY); } catch { /* ignore */ } },
};

class ApiError extends Error {
  constructor(message, status, code, data) { super(message); this.status = status; this.code = code; this.data = data || {}; }
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (path !== '/login') headers['x-admin-token'] = store.token;
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, 'offline');
  }
  if (res.status === 401 && path !== '/login') {
    endSession('Your session has ended. Sign in again.');
    throw new ApiError('Your session has ended. Sign in again.', 401, 'session_expired');
  }
  if (raw && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw new ApiError((data && data.error) || 'Something went wrong on the server. Try again.', res.status, (data && data.code) || 'server_error', data);
  return data;
}

let expiryTimer = 0;
function startSession(token, expiresAt) {
  store.set(token, expiresAt);
  armExpiry();
}
function armExpiry() {
  clearTimeout(expiryTimer);
  const ms = Date.parse(store.expires) - Date.now();
  if (Number.isFinite(ms)) expiryTimer = setTimeout(() => endSession('Your session has ended. Sign in again.'), Math.min(Math.max(ms, 0), 2147483000));
  $('#session-note').textContent = valid(store.expires) ? `Signed in until ${fTime(store.expires)}` : '';
}
function endSession(message) {
  clearTimeout(expiryTimer);
  const wasIn = !!store.token;
  store.clear();
  closeSheet();
  closeDrawer(false);
  if (wasIn || message) showLogin(message);
}
function sessionValid() {
  if (!store.token) return false;
  const exp = Date.parse(store.expires);
  if (Number.isFinite(exp) && exp <= Date.now()) { store.clear(); return false; }
  return true;
}

/* ------------------------------------------------------------------ */
/* Feedback: toasts, busy buttons, states                              */
/* ------------------------------------------------------------------ */

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast${kind === 'error' ? ' toast--error' : ''}`;
  if (kind === 'error') el.setAttribute('role', 'alert');
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span></span>`;
  el.querySelector('span').textContent = message;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 220); }, kind === 'error' ? 7000 : 4500);
}
function busy(btn, on, text) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true; btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    if (text) btn.textContent = text;
  } else {
    if (btn.dataset.label != null) btn.innerHTML = btn.dataset.label;
    btn.disabled = false; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
  }
}
function errorBlock(e, retryLabel = 'Try again') {
  return `<div class="state state--error" role="alert">
    <span class="state__icon">${icon('alert')}</span>
    <h2>That didn't load</h2>
    <p>${esc(e && e.message ? e.message : 'Something went wrong. Try again.')}</p>
    <button type="button" class="btn btn-secondary btn-sm js-retry">${icon('refresh')}${esc(retryLabel)}</button>
  </div>`;
}
function showError(el, e, retry) {
  if (e && e.code === 'session_expired') return;
  el.innerHTML = errorBlock(e);
  $('.js-retry', el).addEventListener('click', retry);
}
function emptyBlock(title, text, actionHtml = '') {
  return `<div class="state state--center"><span class="state__icon">${icon('check')}</span><h2>${esc(title)}</h2><p>${esc(text)}</p>${actionHtml}</div>`;
}
function skLines(count, cls = '') {
  return Array.from({ length: count }, () => `<div class="sk sk-row ${cls}"></div>`).join('');
}
/** Sizes set through the CSSOM (the CSP has no 'unsafe-inline' for styles). */
function applySizes(root) {
  $$('[data-h]', root).forEach((el) => { el.style.height = `${el.dataset.h}%`; });
  $$('[data-b]', root).forEach((el) => { el.style.bottom = `calc(${el.dataset.b}% + 4px)`; });
  $$('[data-x]', root).forEach((el) => { el.style.left = `${el.dataset.x}%`; el.style.top = `${el.dataset.y}%`; });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('[data-w]', root).forEach((el) => { el.style.transform = `scaleX(${Math.max(0, Math.min(1, el.dataset.w / 100))})`; });
  }));
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

let lockTimer = 0;

function showLogin(message) {
  $('#app').hidden = true;
  $('#login').hidden = false;
  document.title = 'Sign in | BUILT Admin';
  const note = $('#login-notice');
  note.hidden = !message;
  note.textContent = message || '';
  $('#login-error').hidden = true;
  $('#login-pass').value = '';
  const user = $('#login-user');
  setTimeout(() => (user.value ? $('#login-pass') : user).focus(), 0);
}

function showLoginError(text, kind = 'error') {
  const box = $('#login-error');
  box.className = `alert${kind === 'warn' ? ' alert--warn' : ''}`;
  box.innerHTML = `${icon('alert')}<span></span>`;
  box.querySelector('span').textContent = text;
  box.hidden = false;
}

function lockText(until) {
  const left = Date.parse(until) - Date.now();
  const mins = Math.max(1, Math.ceil(left / 60000));
  return `Too many attempts. Sign-in is paused for ${mins} ${mins === 1 ? 'minute' : 'minutes'}, until ${fTime(until)}. Waiting it out is the only way in; a correct password won't work before then.`;
}

function startLock(until) {
  clearInterval(lockTimer);
  const btn = $('#login-submit');
  const tick = () => {
    if (Date.parse(until) <= Date.now()) {
      clearInterval(lockTimer);
      btn.disabled = false;
      btn.textContent = 'Sign in';
      showLoginError('You can try again now.', 'warn');
      return;
    }
    btn.disabled = true;
    btn.textContent = `Paused until ${fTime(until)}`;
    $('#login-error span').textContent = lockText(until);
  };
  showLoginError(lockText(until), 'warn');
  tick();
  lockTimer = setInterval(tick, 15000);
}

function initLogin() {
  const form = $('#login-form');
  const reveal = $('#login-reveal');
  reveal.addEventListener('click', () => {
    const pass = $('#login-pass');
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show));
    reveal.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    reveal.innerHTML = icon(show ? 'eye-off' : 'eye');
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $('#login-submit');
    if (btn.disabled) return;
    const username = $('#login-user').value.trim();
    const password = $('#login-pass').value;
    $('#login-notice').hidden = true;
    if (!username || !password) {
      showLoginError('Enter the username and password.');
      (username ? $('#login-pass') : $('#login-user')).focus();
      return;
    }
    $('#login-error').hidden = true;
    busy(btn, true, 'Signing in');
    try {
      const d = await api('/login', { method: 'POST', body: { username, password } });
      busy(btn, false);
      $('#login-pass').value = '';
      startSession(d.token, d.expires_at);
      $('#login').hidden = true;
      route(true);
      refreshBadge();
    } catch (e) {
      busy(btn, false);
      $('#login-pass').value = '';
      if (e.status === 423 || e.code === 'locked') {
        startLock(e.data.locked_until || new Date(Date.now() + 15 * 60000).toISOString());
      } else if (e.status === 503 || e.code === 'not_configured') {
        showLoginError("The admin login isn't set up on the server yet, so nobody can sign in. Ask the developer to set the admin username and password.");
      } else if (e.status === 401) {
        showLoginError('Wrong username or password.');
        $('#login-pass').focus();
      } else {
        showLoginError(e.message);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* Shell and router                                                    */
/* ------------------------------------------------------------------ */

const main = () => $('#main');
let seq = 0;
let current = { view: '' };
let lastUsersHash = '#/users';
const TITLES = { overview: 'Overview', users: 'Users', customers: 'Customers', finance: 'Finance', reports: 'Reports' };

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
}
function setNav(view) {
  $$('.nav__link').forEach((a) => {
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#topbar-title').textContent = TITLES[view] || '';
}
function setTitle(t) { document.title = `${t} | BUILT Admin`; }
function focusHeading() {
  const h = $('#main h1, #main [data-focus]');
  if (h) h.focus({ preventScroll: true });
}
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params: new URLSearchParams(qs) };
}

function route(fromLogin = false) {
  if (!sessionValid()) { showLogin(); return; }
  showApp();
  armExpiry();
  const { parts, params } = parseHash();
  const view = TITLES[parts[0]] ? parts[0] : 'overview';
  setNav(view);
  if ((view === 'reports' || view === 'customers') && current.view === view && current.ctl && document.body.contains(current.ctl.root)) {
    current.ctl.update(params, parts[1] || '');
    return;
  }
  closeSheet();
  closeDrawer(false);
  const s = ++seq;
  current = { view, ctl: null };
  if (view === 'users' && parts[1]) renderUser(parts[1], s);
  else if (view === 'users') current.ctl = renderUsers(params, s);
  else if (view === 'reports') current.ctl = renderReports(params, parts[1] || '', s);
  else if (view === 'customers') current.ctl = renderCustomers(params, parts[1] || '', s);
  else if (view === 'finance') current.ctl = renderFinance(parts, params, s);
  else renderOverview(s);
  if (view === 'users' && parts[1]) current.view = 'user';
  window.scrollTo(0, 0);
  // Move focus to the new page's heading so keyboard and screen reader users land on it.
  if (!fromLogin || $('#main h1')) focusHeading();
}

async function refreshBadge() {
  try {
    const d = await api('/reports?status=new&limit=1');
    const b = $('#nav-badge');
    b.hidden = !d.total;
    b.innerHTML = `${esc(n(d.total))}<span class="sr"> new</span>`;
  } catch { /* the badge is a nicety; the inbox shows real errors */ }
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function renderOverview(s) {
  setTitle('Overview');
  const el = main();
  el.innerHTML = `
    <div class="head">
      <div><h1 tabindex="-1">Overview</h1><p class="head__meta" id="ov-meta">Days are Beirut days.</p></div>
      <div class="head__actions"><button type="button" class="btn btn-secondary btn-sm" id="ov-refresh">${icon('refresh')}Refresh</button></div>
    </div>
    <section class="biz" id="ov-biz" aria-labelledby="ov-biz-t" aria-busy="true"><h2 class="sec-title biz__title" id="ov-biz-t">Business</h2>${'<div class="sk sk-line biz__sk"></div>'.repeat(3)}</section>
    <div id="ov-body">
      <div class="ov" aria-busy="true">
        <div class="ov__members"><div class="sk sk--dark" data-sk="hero"></div><div class="sk sk--dark" data-sk="bars"></div></div>
        <div class="ov__needs">${skLines(4)}</div>
      </div>
    </div>`;
  $$('[data-sk="hero"]', el).forEach((x) => { x.style.height = '96px'; x.style.width = '60%'; });
  $$('[data-sk="bars"]', el).forEach((x) => { x.style.height = '160px'; });
  $('#ov-refresh').addEventListener('click', () => { loadOverview(s, true); loadBusiness(s); });
  loadOverview(s, false);
  loadBusiness(s);
}

async function loadOverview(s, manual) {
  const body = $('#ov-body');
  const btn = $('#ov-refresh');
  if (manual) busy(btn, true, 'Refreshing');
  try {
    const d = await api('/overview');
    if (s !== seq) return;
    body.innerHTML = overviewHtml(d);
    applySizes(body);
    $('#ov-meta').textContent = `Days are Beirut days. Updated ${fTime(d.generated_at || new Date())}.`;
    if (manual) toast('Overview updated.');
    refreshBadge();
  } catch (e) {
    if (s !== seq) return;
    showError(body, e, () => loadOverview(s, false));
  } finally {
    if (manual) busy(btn, false);
  }
}

function overviewHtml(d) {
  const total = d.total_users || 0;
  const days = Array.isArray(d.signups_14d) ? d.signups_14d.filter((x) => x && x.day) : [];
  const max = Math.max(1, ...days.map((x) => x.count || 0));
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  const bars = days.map((x, i) => {
    const h = Math.round(((x.count || 0) / max) * 100);
    const week = i >= days.length - 7;
    return `<div class="bars__col">${x.count ? `<span class="bars__val" data-b="${h}">${n(x.count)}</span>` : ''}<div class="bars__bar${week ? ' is-week' : ''}" data-h="${h}"></div></div>`;
  }).join('');
  const barsLabel = days.map((x) => `${fDay(x.day)}: ${x.count}`).join(', ');
  const rs = d.reports_by_status || {};
  const due = d.checkins_due || {};
  const goals = Object.entries(d.users_by_goal || {}).sort((a, b) => (a[0] === 'unknown') - (b[0] === 'unknown') || b[1] - a[1]);
  const gmax = Math.max(1, ...goals.map((g) => g[1]));
  const chev = icon('right', 'ico need__go');
  const need = (num, title, sub, href, hot) => {
    const inner = `<span class="need__num num${hot ? ' is-hot' : ''}">${n(num)}</span><span class="need__text"><span class="need__label">${esc(title)}</span><span class="need__sub">${esc(sub)}</span></span>`;
    return href ? `<a class="need" href="${href}">${inner}${chev}</a>` : `<div class="need">${inner}<span></span></div>`;
  };
  const openSub = d.open_reports ? `${n(rs.new || 0)} new, ${n(rs.in_progress || 0)} in progress` : 'Inbox is clear';

  return `<div class="ov">
    <section class="ov__members" aria-labelledby="ov-total">
      <div class="hero-num">
        <span class="hero-num__value num">${n(total)}</span>
        <p class="hero-num__label" id="ov-total">${total === 1 ? 'person has' : 'people have'} signed up</p>
        <span class="pill">+${n(d.new_this_week || 0)} this week</span>
      </div>
      ${days.length ? `<div class="bars">
        <div class="bars__head"><h2 class="sec-title">Sign-ups, last 14 days</h2>
          <div class="legend" aria-hidden="true"><span><i class="is-week"></i>Last 7 days</span><span><i></i>The 7 before</span></div></div>
        <div class="bars__plot" role="img" aria-label="${esc(`Sign-ups per day. ${barsLabel}`)}">${bars}</div>
        <div class="bars__axis" aria-hidden="true"><span>${esc(fDay(days[0].day))}</span><span>Today</span></div>
      </div>` : ''}
    </section>

    <section class="ov__needs needs" aria-labelledby="ov-needs">
      <h2 class="sec-title needs__title" id="ov-needs">Needs you</h2>
      ${need(d.open_reports || 0, 'Open reports', openSub, '#/reports?status=open', (rs.new || 0) > 0)}
      ${need(due.weekly || 0, 'Weekly weigh-ins due', 'No weight logged for 7 days or more', '', false)}
      ${need(due.monthly || 0, 'Monthly check-ins due', '30 days or more since the last one', '', false)}
      ${need(d.onboarding_incomplete || 0, 'Questionnaire not finished', 'Signed up, stopped partway', '#/users?onboarding=incomplete', false)}
    </section>

    <section class="ov__activity" aria-labelledby="ov-act">
      <div class="block__head"><h2 class="sec-title" id="ov-act">Activity</h2><p class="sec-sub">Share of all ${n(total)} members</p></div>
      <div class="act">
        <div class="act__item">
          <div class="act__top"><span class="act__value num">${n(d.active_today || 0)}</span><span class="act__of">active today, ${pct(d.active_today || 0)}%</span></div>
          <div class="meter" aria-hidden="true"><div class="meter__fill" data-w="${pct(d.active_today || 0)}"></div></div>
          <a class="act__link" href="#/users?active=today">See who${icon('right')}</a>
        </div>
        <div class="act__item">
          <div class="act__top"><span class="act__value num">${n(d.active_7d || 0)}</span><span class="act__of">active in the last 7 days, ${pct(d.active_7d || 0)}%</span></div>
          <div class="meter" aria-hidden="true"><div class="meter__fill" data-w="${pct(d.active_7d || 0)}"></div></div>
          <a class="act__link" href="#/users?active=7d">See who${icon('right')}</a>
        </div>
        <div class="act__item act__streak">
          <div class="act__top"><span class="act__value num">${esc(String(d.avg_streak ?? 0))}<span class="act__unit">days</span></span><span class="act__of">Average workout streak</span></div>
          <a class="act__link" href="#/users?sort=streak_desc">Longest streaks${icon('right')}</a>
        </div>
      </div>
    </section>

    <section class="ov__goals" aria-labelledby="ov-goals">
      <div class="block__head"><h2 class="sec-title" id="ov-goals">Goals</h2><p class="sec-sub">What people signed up for</p></div>
      <div class="goals">
        ${goals.length ? goals.map(([g, c]) => {
          const inner = `<span class="goal__name">${esc(label('goal', g))}</span><span class="goal__count">${n(c)}</span><div class="meter" aria-hidden="true"><div class="meter__fill" data-w="${Math.round((c / gmax) * 100)}"></div></div>`;
          return g === 'unknown' || !L.goal[g] ? `<div class="goal">${inner}</div>` : `<a class="goal" href="#/users?goal=${encodeURIComponent(g)}">${inner}</a>`;
        }).join('') : '<p class="sec-sub">No goals yet.</p>'}
      </div>
    </section>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

let sheetOpen = null;
const isPhone = () => window.matchMedia('(max-width: 900px)').matches;

function openSheet() {
  const sheet = $('#u-filters'); const scrim = $('#u-scrim'); const btn = $('#u-filters-btn');
  if (!sheet || !isPhone()) return;
  sheet.classList.add('is-open'); scrim.classList.add('is-open');
  sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
  btn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  sheetOpen = { btn };
  setTimeout(() => { const f = $('#u-filters-close'); if (f) f.focus(); }, 50);
}
function closeSheet() {
  const sheet = $('#u-filters');
  if (!sheetOpen || !sheet) { sheetOpen = null; document.body.style.overflow = ''; return; }
  sheet.classList.remove('is-open'); $('#u-scrim').classList.remove('is-open');
  sheet.removeAttribute('role'); sheet.removeAttribute('aria-modal');
  sheetOpen.btn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  const back = sheetOpen.btn; sheetOpen = null;
  back.focus();
}
document.addEventListener('keydown', (ev) => {
  if (!sheetOpen) return;
  if (ev.key === 'Escape') { ev.preventDefault(); closeSheet(); return; }
  if (ev.key === 'Tab') {
    const items = $$('#u-filters button, #u-filters input, #u-filters select').filter((x) => !x.disabled && x.offsetParent !== null);
    const firstEl = items[0]; const lastEl = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === firstEl) { ev.preventDefault(); lastEl.focus(); }
    else if (!ev.shiftKey && document.activeElement === lastEl) { ev.preventDefault(); firstEl.focus(); }
  }
});
window.addEventListener('resize', () => { if (sheetOpen && !isPhone()) closeSheet(); });

function chipGroup(key, title, options) {
  const opts = [['', 'Any'], ...Object.entries(options)];
  return `<fieldset class="group"><legend class="group__label">${esc(title)}</legend><div class="chips">${opts.map(([v, t]) =>
    `<label class="chip"><input type="radio" name="${key}" value="${esc(v)}"><span>${esc(t)}</span></label>`).join('')}</div></fieldset>`;
}

function renderUsers(params, s) {
  setTitle('Users');
  const st = { q: params.get('q') || '', sort: L.sort[params.get('sort')] ? params.get('sort') : 'created_desc', page: Math.max(1, parseInt(params.get('page') || '1', 10) || 1), f: {}, total: null };
  for (const k of FILTER_KEYS) { const v = params.get(k); if (v) st.f[k] = v; }

  const el = main();
  el.innerHTML = `
    <div class="head">
      <div><h1 tabindex="-1">Users</h1><p class="head__meta" id="u-count" aria-live="polite">Loading people</p></div>
      <div class="head__actions"><button type="button" class="btn btn-secondary btn-sm" id="u-export">${icon('download')}<span>Export CSV</span></button></div>
    </div>
    <div class="users">
      <form class="filters" id="u-filters" aria-label="Filters" novalidate>
        <div class="filters__head"><h2 class="sec-title" id="u-filters-title">Filters</h2>
          <div><button type="button" class="clear-all" id="u-clear">Clear all</button>
          <button type="button" class="icon-btn filters-btn" id="u-filters-close" aria-label="Close filters">${icon('close')}</button></div></div>
        ${chipGroup('active', 'Last active', L.active)}
        ${chipGroup('goal', 'Goal', { lose_fat: L.goal.lose_fat, build_muscle: L.goal.build_muscle, tone_up: L.goal.tone_up, stay_fit: L.goal.stay_fit, sports_performance: L.goal.sports_performance })}
        ${chipGroup('activity_level', 'Activity level', L.activity_level)}
        ${chipGroup('train_location', 'Trains at', L.train_location)}
        ${chipGroup('age_group', 'Age', L.age_group)}
        ${chipGroup('onboarding', 'Questionnaire', L.onboarding)}
        <fieldset class="group"><legend class="group__label">Streak, in days</legend>
          <div class="pair">
            <div class="field"><label for="u-smin">From</label><input id="u-smin" name="streak_min" type="number" inputmode="numeric" min="0" step="1" placeholder="0"></div>
            <div class="field"><label for="u-smax">Up to</label><input id="u-smax" name="streak_max" type="number" inputmode="numeric" min="0" step="1" placeholder="Any"></div>
          </div></fieldset>
        <fieldset class="group"><legend class="group__label">Signed up between</legend>
          <div class="pair">
            <div class="field"><label for="u-from">From</label><input id="u-from" name="signed_from" type="date"></div>
            <div class="field"><label for="u-to">To</label><input id="u-to" name="signed_to" type="date"></div>
          </div></fieldset>
        <div class="filters__foot"><button type="button" class="btn btn-primary btn-block" id="u-apply">Show results</button></div>
      </form>
      <div class="scrim" id="u-scrim"></div>
      <div class="users__results">
        <div class="toolbar">
          <div class="search"><label class="sr" for="u-q">Search by name, email or phone</label>${icon('search')}<input class="input" id="u-q" type="search" placeholder="Search name, email or phone" autocomplete="off" spellcheck="false" maxlength="120"></div>
          <div class="field sort"><label class="sr" for="u-sort">Sort by</label><select id="u-sort">${Object.entries(L.sort).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
          <button type="button" class="btn btn-secondary btn-sm filters-btn" id="u-filters-btn" aria-expanded="false" aria-controls="u-filters">${icon('filter')}Filters<span class="filters-btn__count" id="u-fcount" hidden></span></button>
        </div>
        <div class="active-filters" id="u-tags" hidden></div>
        <div id="u-list" aria-live="polite"></div>
      </div>
    </div>`;

  const form = $('#u-filters');
  const sync = () => {
    $('#u-q').value = st.q;
    $('#u-sort').value = st.sort;
    $$('input[type="radio"]', form).forEach((r) => { r.checked = (st.f[r.name] || '') === r.value; });
    for (const k of ['streak_min', 'streak_max', 'signed_from', 'signed_to']) form.elements[k].value = st.f[k] || '';
  };
  sync();

  const query = (extra = {}) => {
    const p = new URLSearchParams();
    if (st.q) p.set('q', st.q);
    for (const k of FILTER_KEYS) if (st.f[k]) p.set(k, st.f[k]);
    if (st.sort !== 'created_desc') p.set('sort', st.sort);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  };
  const writeHash = () => {
    const p = query(st.page > 1 ? { page: st.page } : {});
    const h = `#/users${p.toString() ? `?${p}` : ''}`;
    lastUsersHash = h;
    if (location.hash !== h) history.replaceState(null, '', h);
  };

  const drawTags = () => {
    const tags = [];
    if (st.q) tags.push(['q', `${FILTER_NAMES.q}: ${st.q}`]);
    for (const k of FILTER_KEYS) {
      const v = st.f[k]; if (!v) continue;
      const shown = L[k] ? label(k, v) : (k.startsWith('signed') ? fDayLong(v) : v);
      tags.push([k, `${FILTER_NAMES[k]}: ${shown}`]);
    }
    const box = $('#u-tags');
    box.hidden = !tags.length;
    box.innerHTML = tags.map(([k, t]) => `<button type="button" class="tag" data-k="${k}" aria-label="Remove filter ${esc(t)}">${esc(t)}${icon('close')}</button>`).join('') +
      (tags.length > 1 ? '<button type="button" class="clear-all" data-k="*">Clear all</button>' : '');
    const nf2 = Object.keys(st.f).length;
    const c = $('#u-fcount'); c.hidden = !nf2; c.textContent = String(nf2);
    $('#u-clear').hidden = !nf2 && !st.q;
  };

  let reqId = 0;
  async function load() {
    writeHash(); drawTags();
    const my = ++reqId;
    const list = $('#u-list');
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = `<div class="list">${skLines(8)}</div>`;
    $('#u-apply').textContent = 'Show results';
    try {
      const d = await api(`/users?${query({ limit: PAGE_SIZE, offset: (st.page - 1) * PAGE_SIZE })}`);
      if (s !== seq || my !== reqId) return;
      list.removeAttribute('aria-busy');
      st.total = d.total;
      const filtered = !!st.q || Object.keys(st.f).length > 0;
      $('#u-count').textContent = filtered ? `${plural(d.total, 'person matches', 'people match')}` : `${plural(d.total, 'person', 'people')} in total`;
      $('#u-export span').textContent = d.total ? `Export ${plural(d.total, 'contact', 'contacts')}` : 'Export CSV';
      $('#u-export').disabled = !d.total;
      $('#u-apply').textContent = d.total ? `Show ${plural(d.total, 'person', 'people')}` : 'No matches';
      if (!d.rows.length && st.page > 1 && d.total) { st.page = 1; load(); return; }
      if (!d.rows.length) {
        list.innerHTML = filtered
          ? emptyBlock('No one matches these filters.', 'Try fewer filters or a shorter search.', '<button type="button" class="btn btn-secondary btn-sm" data-clear>Clear filters</button>')
          : emptyBlock('No sign-ups yet.', 'People show up here once they create an account in the app.');
        const c = $('[data-clear]', list); if (c) c.addEventListener('click', clearAll);
        return;
      }
      list.innerHTML = usersListHtml(d.rows) + pagerHtml(d.total, st.page);
      bindPager(list);
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      list.removeAttribute('aria-busy');
      $('#u-count').textContent = '';
      showError(list, e, load);
    }
  }
  function bindPager(list) {
    $$('[data-page]', list).forEach((b) => b.addEventListener('click', () => {
      st.page = Number(b.dataset.page); load();
      $('#u-list').scrollIntoView({ block: 'start' });
      main().focus({ preventScroll: true });
    }));
  }
  function clearAll() { st.q = ''; st.f = {}; st.page = 1; sync(); load(); }

  form.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!t.name) return;
    let v = t.value.trim();
    if (t.type === 'number' && v !== '') v = String(Math.max(0, parseInt(v, 10) || 0));
    if (v) st.f[t.name] = v; else delete st.f[t.name];
    st.page = 1; load();
  });
  form.addEventListener('submit', (ev) => ev.preventDefault());
  let deb = 0;
  $('#u-q').addEventListener('input', (ev) => {
    clearTimeout(deb);
    deb = setTimeout(() => { st.q = ev.target.value.trim(); st.page = 1; load(); }, 300);
  });
  $('#u-sort').addEventListener('change', (ev) => { st.sort = ev.target.value; st.page = 1; load(); });
  $('#u-tags').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k;
    if (k === '*') { clearAll(); return; }
    if (k === 'q') st.q = ''; else delete st.f[k];
    st.page = 1; sync(); load();
    const next = $('#u-tags .tag') || $('#u-q'); next.focus();
  });
  $('#u-clear').addEventListener('click', clearAll);
  $('#u-filters-btn').addEventListener('click', openSheet);
  $('#u-filters-close').addEventListener('click', closeSheet);
  $('#u-apply').addEventListener('click', closeSheet);
  $('#u-scrim').addEventListener('click', closeSheet);
  $('#u-export').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    busy(btn, true, 'Preparing file');
    try {
      const res = await api(`/users.csv?${query()}`, { raw: true });
      const blob = await res.blob();
      const filtered = !!st.q || Object.keys(st.f).length > 0;
      const name = `built-users-${todayYmd()}${filtered ? '-filtered' : ''}.csv`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast(`Downloaded ${name} with ${plural(st.total || 0, 'contact', 'contacts')}.`);
    } catch (e) {
      if (e.code !== 'session_expired') toast(`The export didn't download. ${e.message}`, 'error');
    } finally {
      busy(btn, false);
    }
  });

  load();
  return { root: el.firstElementChild };
}

function usersListHtml(rows) {
  const head = `<div class="list__head" aria-hidden="true"><span>Person</span><span>Phone</span><span>Goal</span><span class="urow__hide-md">Trains at</span><span class="r">Streak</span><span>Last active</span><span class="urow__hide-md">Joined</span></div>`;
  return `<div class="list">${head}${rows.map((u) => {
    const flags = [];
    if (!u.onboarding_done) flags.push('<span class="flag flag--warn">Questionnaire not finished</span>');
    if (u.age_group === 'under_18') flags.push('<span class="flag">Under 18</span>');
    const active = u.last_active_at ? ago(u.last_active_at) : 'Never';
    const goal = label('goal', u.goal) || 'No goal yet';
    return `<a class="urow" href="#/users/${encodeURIComponent(u.id)}">
      <span class="urow__who"><span class="urow__name">${esc(u.name || 'No name yet')}</span><span class="urow__email">${esc(u.email)}</span>${flags.length ? `<span class="urow__flags">${flags.join('')}</span>` : ''}</span>
      <span class="urow__mobile is-side"><span class="urow__side-num${u.streak > 0 ? ' is-on' : ''}">${n(u.streak || 0)}</span><span class="urow__dim">streak</span></span>
      <span class="urow__cell">${esc(phone(u.phone)) || '<span class="urow__dim">No phone</span>'}</span>
      <span class="urow__cell" title="${esc(goal)}">${esc(goal)}</span>
      <span class="urow__cell urow__hide-md" title="${esc(label('train_location', u.train_location))}">${esc(label('train_short', u.train_location) || 'Not set')}</span>
      <span class="urow__streak${u.streak > 0 ? ' is-on' : ''}">${n(u.streak || 0)}</span>
      <span class="urow__cell">${esc(active)}</span>
      <span class="urow__cell urow__hide-md">${esc(fShort(u.created_at))}</span>
      <span class="urow__mobile"><span class="flag">${esc(goal)}</span><span class="flag">Active: ${esc(active)}</span></span>
    </a>`;
  }).join('')}</div>`;
}

function pagerHtml(total, page) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (page - 1) * PAGE_SIZE + 1; const to = Math.min(total, page * PAGE_SIZE);
  return `<nav class="pager" aria-label="Pages">
    <p class="pager__info">${n(from)} to ${n(to)} of ${n(total)}</p>
    ${pages > 1 ? `<div class="pager__btns">
      <button type="button" class="btn btn-secondary btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('left')}Previous</button>
      <button type="button" class="btn btn-secondary btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next${icon('right')}</button>
    </div>` : ''}
  </nav>`;
}

/* ------------------------------------------------------------------ */
/* User detail                                                         */
/* ------------------------------------------------------------------ */

function renderUser(id, s) {
  setTitle('User');
  const el = main();
  el.innerHTML = `<a class="back" href="${esc(lastUsersHash)}">${icon('left')}Users</a>
    <div id="ud-body" aria-busy="true">
      <div class="person"><div><div class="sk" data-sk="t"></div><div class="sk sk-line" data-sk="m"></div></div></div>
      ${skLines(6)}
    </div>`;
  $$('[data-sk="t"]', el).forEach((x) => { x.style.height = '40px'; x.style.width = 'min(320px, 80%)'; x.style.marginBottom = '12px'; });
  $$('[data-sk="m"]', el).forEach((x) => { x.style.width = 'min(240px, 60%)'; });
  loadUser(id, s);
}

async function loadUser(id, s) {
  const body = $('#ud-body');
  try {
    const d = await api(`/users/${encodeURIComponent(id)}`);
    if (s !== seq) return;
    body.removeAttribute('aria-busy');
    setTitle(d.profile.name || 'User');
    body.innerHTML = userHtml(d);
    applySizes(body);
    const more = $('#tl-more', body);
    if (more) more.addEventListener('click', () => {
      $$('.tl[hidden]', body).forEach((x) => { x.hidden = false; });
      more.remove();
    });
    const amore = $('#act-more', body);
    if (amore) amore.addEventListener('click', () => {
      $$('#act-rows [hidden]', body).forEach((x) => { x.hidden = false; });
      amore.remove();
    });
    const h = $('h1', body); if (h) h.focus({ preventScroll: true });
  } catch (e) {
    if (s !== seq) return;
    body.removeAttribute('aria-busy');
    if (e.status === 404 || e.status === 400) {
      body.innerHTML = emptyBlock('No user with that id.', 'They may have deleted their account.', `<a class="btn btn-secondary btn-sm" href="${esc(lastUsersHash)}">Back to users</a>`);
      return;
    }
    showError(body, e, () => loadUser(id, s));
  }
}

function userHtml(d) {
  const p = d.profile || {}; const st = d.stats || {}; const due = st.checkins_due || {};
  const meta = [];
  meta.push(p.age != null ? `${p.age}${p.gender ? `, ${label('gender', p.gender).toLowerCase()}` : ''}` : (p.gender ? label('gender', p.gender) : 'Age not given'));
  meta.push(`Joined ${fDate(p.created_at)}`);
  meta.push(p.last_active_at ? `Last active ${ago(p.last_active_at).toLowerCase()}` : 'Never opened the app');
  const flags = [];
  if (p.onboarding_step && p.onboarding_step !== 'done') flags.push(`<span class="flag flag--warn">Questionnaire stopped at: ${esc(humanize(p.onboarding_step))}</span>`);
  if (p.age_group === 'under_18') flags.push(`<span class="flag">Under 18${p.guardian_name ? `, guardian ${esc(p.guardian_name)}` : ''}</span>`);
  if (due.weekly) flags.push('<span class="flag">Weigh-in due</span>');
  if (due.monthly) flags.push('<span class="flag">Monthly check-in due</span>');

  const counts = [['Workouts done', st.workouts_done], ['Meals done', st.meals_done], ['Activities', st.activities], ['Check-ins', st.checkins], ['Coach messages', st.coach_messages]];
  const streak = st.streak || 0;

  return `
    <section class="person" aria-labelledby="ud-name">
      <div>
        <h1 id="ud-name" tabindex="-1">${esc(p.name || 'No name yet')}</h1>
        <p class="person__meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}</p>
        <div class="person__contact">
          ${p.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${esc(p.email)}">${icon('mail')}<span>${esc(p.email)}</span></a>` : ''}
          ${p.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${esc(String(p.phone).replace(/[^\d+]/g, ''))}">${icon('phone')}<span>${esc(phone(p.phone))}</span></a>` : '<span class="flag">No phone on file</span>'}
          <a class="btn btn-secondary btn-sm" href="#/customers/${encodeURIComponent(p.id)}">${icon('customers')}<span>Customer record</span></a>
        </div>
        ${flags.length ? `<div class="person__flags">${flags.join('')}</div>` : ''}
      </div>
      <div class="streak"><span class="streak__num num${streak > 0 ? ' is-on' : ''}">${n(streak)}</span><p class="streak__label">day streak</p></div>
    </section>

    <div class="counts">${counts.map(([t, v]) => `<div class="count"><div class="count__num num">${n(v || 0)}</div><div class="count__label">${esc(t)}</div></div>`).join('')}</div>

    <div class="detail">
      <div class="detail__col">
        <section class="block" aria-labelledby="ud-w"><div class="block__head"><h2 class="sec-title" id="ud-w">Weight trend</h2>${p.target_weight_kg ? `<p class="sec-sub">Target ${esc(kg(p.target_weight_kg))}</p>` : ''}</div>
          <div class="card">${weightChart(d.weights || [], p.target_weight_kg)}</div></section>
        ${checkinsHtml(d.checkins || [])}
        ${activitiesHtml(d.activities || [], st.activity_kcal_30d)}
        ${planHtml(d.plan)}
        ${timelineHtml(d.timeline || [])}
      </div>
      <div class="detail__col">
        ${userReportsHtml(d.reports || [])}
        ${questionnaireHtml(p)}
      </div>
    </div>`;
}

function weightChart(ws, target) {
  const pts = ws.filter((w) => w && w.day && w.kg != null).map((w) => ({ t: Date.parse(`${w.day}T12:00:00Z`), kg: Number(w.kg), day: w.day }));
  if (pts.length < 2) {
    return `<div class="state"><h2>${pts.length ? 'One weigh-in so far' : 'No weigh-ins yet'}</h2><p>${pts.length ? `${esc(kg(pts[0].kg))} on ${esc(fDayLong(pts[0].day))}. The trend shows after the second one.` : 'The trend shows once they log their weight twice.'}</p></div>`;
  }
  const firstP = pts[0]; const lastP = pts[pts.length - 1];
  const vals = pts.map((x) => x.kg).concat(target ? [Number(target)] : []);
  let lo = Math.min(...vals); let hi = Math.max(...vals);
  const pad = Math.max(0.5, (hi - lo) * 0.12); lo -= pad; hi += pad;
  const t0 = firstP.t; const t1 = Math.max(lastP.t, t0 + 1);
  const X = (t) => ((t - t0) / (t1 - t0)) * 100;
  const Y = (v) => ((hi - v) / (hi - lo)) * 40;
  const path = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(2)} ${Y(x.kg).toFixed(2)}`).join(' ');
  const diff = Math.round((lastP.kg - firstP.kg) * 10) / 10;
  const diffText = diff === 0 ? 'No change' : `${diff > 0 ? '+' : ''}${diff} kg`;
  const aria = `Weight from ${kg(firstP.kg)} on ${fDayLong(firstP.day)} to ${kg(lastP.kg)} on ${fDayLong(lastP.day)}, ${pts.length} weigh-ins${target ? `. Target ${kg(target)}` : ''}.`;
  const mid = (hi + lo) / 2;
  return `<div class="chart">
    <div class="chart__nums">
      <div><b>${esc(kg(lastP.kg))}</b><span>Latest, ${esc(fDay(lastP.day))}</span></div>
      <div><b>${esc(diffText)}</b><span>Since ${esc(fDay(firstP.day))}</span></div>
      <div><b>${n(pts.length)}</b><span>Weigh-ins</span></div>
    </div>
    <div class="chart__plot" role="img" aria-label="${esc(aria)}">
      <div class="chart__y" aria-hidden="true"><span>${hi.toFixed(1)}</span><span>${mid.toFixed(1)}</span><span>${lo.toFixed(1)}</span></div>
      <div class="chart__area">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <line class="chart__grid" x1="0" y1="0.2" x2="100" y2="0.2"/><line class="chart__grid" x1="0" y1="20" x2="100" y2="20"/><line class="chart__grid" x1="0" y1="39.8" x2="100" y2="39.8"/>
          ${target ? `<line class="chart__target" x1="0" y1="${Y(Number(target)).toFixed(2)}" x2="100" y2="${Y(Number(target)).toFixed(2)}"/>` : ''}
          <path class="chart__line" d="${path}"/>
        </svg>
        <span class="chart__dot" data-x="${X(lastP.t).toFixed(2)}" data-y="${((Y(lastP.kg) / 40) * 100).toFixed(2)}"></span>
      </div>
    </div>
    <div class="chart__x" aria-hidden="true"><span>${esc(fDay(firstP.day))}</span><span>${esc(fDay(lastP.day))}</span></div>
    ${target ? '<p class="sec-sub">Dashed line: their target weight.</p>' : ''}
  </div>`;
}

function checkinsHtml(list) {
  const rows = list.map((c) => {
    const bits = [];
    if (c.weight_kg != null) bits.push(kg(c.weight_kg));
    const m = c.measurements || {};
    for (const [k, v] of Object.entries(m)) if (v != null && v !== '') bits.push(`${humanize(k.replace(/_cm$/, ''))} ${v}${/_cm$/.test(k) ? ' cm' : ''}`);
    const a = c.answers || {};
    for (const [k, v] of Object.entries(a)) if (typeof v === 'number' || (typeof v === 'string' && v.length < 30)) bits.push(`${humanize(k)} ${v}`);
    return `<div class="row"><span class="row__date">${esc(fDay(c.day) || fShort(c.created_at))}</span>
      <span class="row__main"><span class="row__title">${esc(c.kind === 'weekly' ? 'Weekly weigh-in' : 'Monthly check-in')}</span><span class="row__sub">${esc(bits.join(' · '))}</span></span><span></span>
      ${c.ai_summary ? `<p class="checkin__summary">${esc(c.ai_summary)}</p>` : ''}</div>`;
  }).join('');
  return `<section class="block" aria-labelledby="ud-c"><div class="block__head"><h2 class="sec-title" id="ud-c">Check-ins</h2><p class="sec-sub">${plural(list.length, 'check-in', 'check-ins')}</p></div>
    ${list.length ? `<div class="rows">${rows}</div>` : '<p class="sec-sub">No monthly check-ins yet.</p>'}</section>`;
}

function activitiesHtml(list, kcal30) {
  const rows = list.map((a, i) => `<div class="row"${i >= 6 ? ' hidden' : ''}><span class="row__date">${esc(fDay(a.day))}</span>
    <span class="row__main"><span class="row__title">${esc(a.label || humanize(a.kind))}</span><span class="row__sub">${esc([a.minutes ? `${a.minutes} min` : '', a.effort ? `${humanize(a.effort)} effort` : '', a.source === 'health' ? 'From the health app' : ''].filter(Boolean).join(' · '))}</span></span>
    <span class="row__side">${a.kcal != null ? `${n(a.kcal)} kcal` : ''}</span></div>`).join('');
  return `<section class="block" aria-labelledby="ud-a"><div class="block__head"><h2 class="sec-title" id="ud-a">Activities</h2><p class="sec-sub">${n(kcal30 || 0)} kcal in the last 30 days</p></div>
    ${list.length ? `<div class="rows" id="act-rows">${rows}</div>${list.length > 6 ? `<button type="button" class="btn btn-ghost btn-sm more" id="act-more">Show all ${n(list.length)}</button>` : ''}` : '<p class="sec-sub">No activities logged yet.</p>'}</section>`;
}

function planHtml(plan) {
  if (!plan) return `<section class="block" aria-labelledby="ud-p"><h2 class="sec-title" id="ud-p">Plan</h2><p class="sec-sub">No plan yet. One is built when they finish the questionnaire.</p></section>`;
  const ch = Array.isArray(plan.recent_changes) ? plan.recent_changes : [];
  return `<section class="block" aria-labelledby="ud-p"><div class="block__head"><h2 class="sec-title" id="ud-p">Plan</h2><p class="sec-sub">Updated ${esc(fDate(plan.updated_at))}</p></div>
    <p class="sec-sub">${plan.kcal_target ? `${n(plan.kcal_target)} kcal a day` : 'No calorie target'}${plan.water_target ? `, ${n(plan.water_target)} glasses of water` : ''}.</p>
    ${ch.length ? `<div class="rows">${ch.map((c) => `<div class="row"><span class="row__date">${esc(fShort(c.at))}</span><span class="row__main"><span class="row__title">${esc(c.instruction ? `They asked: "${c.instruction}"` : 'Plan changed')}</span><span class="row__sub">${esc(c.changes || '')}</span></span><span></span></div>`).join('')}</div>` : ''}
  </section>`;
}

function questionnaireHtml(p) {
  const list = (arr, other) => [...(Array.isArray(arr) ? arr.map(humanize) : []), ...(other ? [other] : [])].join(', ');
  const days = Array.isArray(p.training_days) ? p.training_days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((dd) => DAYS[dd] || dd).join(', ') : '';
  const hm = (t) => String(t || '').slice(0, 5);
  const groups = [
    ['About them', [
      ['Name', p.name], ['Gender', label('gender', p.gender)], ['Date of birth', p.birth_date ? `${fDayLong(p.birth_date)}${p.age != null ? `, age ${p.age}` : ''}` : ''],
      ['Height', p.height_cm ? `${p.height_cm} cm` : ''], ['Weight at sign-up', kg(p.weight_kg)],
    ]],
    ['Goal', [
      ['Goal', label('goal', p.goal)], ['Timeline', p.timeline_months ? `${p.timeline_months} ${p.timeline_months === 1 ? 'month' : 'months'}` : ''],
      ['Target weight', kg(p.target_weight_kg)], ['Activity level', label('activity_level', p.activity_level)],
      ['Job', label('job', p.job_activity)], ['Sleep', p.sleep_hours ? `${p.sleep_hours} hours a night` : ''],
    ]],
    ['Training', [
      ['Trains at', label('train_location', p.train_location)], ['Equipment', list(p.equipment, p.equipment_other)],
      ['Training days', days], ['Preferred time', label('time', p.training_time)],
    ]],
    ['Food', [
      ['Diet', label('diet', p.diet_type)], ['Allergies', list(p.allergies, p.allergies_other) || 'None'], ['Dislikes', p.dislikes],
    ]],
    ['Health and safety', [
      ['Injuries', [p.injuries, list(p.injury_areas)].filter(Boolean).join('. ')], ['Conditions', list(p.conditions)],
      ['Waiver', p.waiver_accepted_at ? `Accepted ${fDate(p.waiver_accepted_at)} (version ${p.waiver_version || 'unknown'})` : 'Not accepted yet'],
      ...(p.age_group === 'under_18' || p.guardian_name ? [['Guardian', p.guardian_name ? `${p.guardian_name}${p.guardian_consent_at ? `, consented ${fDate(p.guardian_consent_at)}` : ', consent not given yet'}` : 'Not given']] : []),
    ]],
    ['App settings', [
      ['Calorie target', p.kcal_target ? `${n(p.kcal_target)} kcal` : ''], ['Water target', p.water_target ? `${p.water_target} glasses` : ''],
      ['Quiet hours', p.quiet_hours_start ? `${hm(p.quiet_hours_start)} to ${hm(p.quiet_hours_end)}` : ''],
      ['Questionnaire', p.onboarding_done_at ? `Finished ${fDate(p.onboarding_done_at)}` : `Not finished${p.onboarding_step ? `, stopped at ${humanize(p.onboarding_step).toLowerCase()}` : ''}`],
    ]],
  ];
  return `<section class="block" aria-labelledby="ud-q"><h2 class="sec-title" id="ud-q">Questionnaire</h2>
    <div class="card qa">${groups.map(([title, rows]) => `<div class="qa__group"><h3>${esc(title)}</h3><dl>${rows.map(([k, v]) =>
      `<div class="qa__row"><dt>${esc(k)}</dt><dd${v ? '' : ' class="is-empty"'}>${esc(v || 'Not answered')}</dd></div>`).join('')}</dl></div>`).join('')}</div>
  </section>`;
}

function userReportsHtml(list) {
  return `<section class="block" aria-labelledby="ud-r"><div class="block__head"><h2 class="sec-title" id="ud-r">Their reports</h2><p class="sec-sub">${plural(list.length, 'report', 'reports')}</p></div>
    ${list.length ? `<div class="rows">${list.map((r) => `<a class="row" href="#/reports/${encodeURIComponent(r.id)}?status=all">
      <span class="status status--${esc(r.status)}">${esc(label('status', r.status))}</span>
      <span class="row__main"><span class="row__title">${esc(r.message)}</span><span class="row__sub">${esc(label('category', r.category))}, ${esc(fDate(r.created_at))}</span></span>${icon('right', 'ico need__go')}</a>`).join('')}</div>` : '<p class="sec-sub">They have not reported a problem.</p>'}
  </section>`;
}

function timelineHtml(list) {
  const SHOW = 12;
  return `<section class="block" aria-labelledby="ud-t"><div class="block__head"><h2 class="sec-title" id="ud-t">Activity timeline</h2><p class="sec-sub">Newest first</p></div>
    ${list.length ? `<ol class="timeline">${list.map((e, i) => `<li class="tl tl--${esc(e.kind)}"${i >= SHOW ? ' hidden' : ''}><span class="tl__dot" aria-hidden="true"></span><div><p class="tl__label">${esc(e.label || humanize(e.kind))}</p><p class="tl__at">${esc(fDateTime(e.at))}</p></div></li>`).join('')}</ol>
    ${list.length > SHOW ? `<button type="button" class="btn btn-ghost btn-sm more" id="tl-more">Show all ${n(list.length)} events</button>` : ''}` : '<p class="sec-sub">Nothing yet.</p>'}
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Reports                                                             */
/* ------------------------------------------------------------------ */

function renderReports(params, openId, s) {
  setTitle('Reports');
  const st = { status: L.reportFilter[params.get('status')] ? params.get('status') : 'open', offset: 0, rows: [], total: 0, open: '' };
  const el = main();
  el.innerHTML = `
    <div class="head">
      <div><h1 tabindex="-1">Reports</h1><p class="head__meta" id="r-meta">Problems people sent from the app.</p></div>
      <div class="head__actions"><button type="button" class="btn btn-secondary btn-sm" id="r-refresh">${icon('refresh')}Refresh</button></div>
    </div>
    <div class="inbox" id="inbox">
      <div class="inbox__list">
        <fieldset class="seg" id="r-seg" aria-label="Show reports">
          ${Object.entries(L.reportFilter).map(([v, t]) => `<label><input type="radio" name="r-status" value="${v}"><span>${esc(t)}</span></label>`).join('')}
        </fieldset>
        <div id="r-list" aria-live="polite"></div>
      </div>
      <div class="pane" id="r-pane"></div>
    </div>`;
  const root = el.firstElementChild;
  const statusQ = () => (st.status === 'all' ? '' : st.status);
  const hrefFor = (id) => `#/reports${id ? `/${encodeURIComponent(id)}` : ''}${st.status !== 'open' ? `?status=${st.status}` : ''}`;

  const syncSeg = () => { $$('#r-seg input').forEach((r) => { r.checked = r.value === st.status; }); };
  syncSeg();

  let listReq = 0;
  async function loadList(quiet = false, append = false) {
    const my = ++listReq;
    const list = $('#r-list');
    if (!append) st.offset = 0;
    if (!quiet && !append) { list.setAttribute('aria-busy', 'true'); list.innerHTML = `<div class="rlist">${skLines(6)}</div>`; }
    try {
      const q = new URLSearchParams({ limit: '50', offset: String(st.offset) });
      if (statusQ()) q.set('status', statusQ());
      const d = await api(`/reports?${q}`);
      if (s !== seq || my !== listReq) return;
      list.removeAttribute('aria-busy');
      st.rows = append ? st.rows.concat(d.rows) : d.rows;
      st.total = d.total;
      drawList();
    } catch (e) {
      if (s !== seq || my !== listReq) return;
      list.removeAttribute('aria-busy');
      if (quiet) { if (e.code !== 'session_expired') toast(`The list didn't refresh. ${e.message}`, 'error'); return; }
      showError(list, e, () => loadList());
    }
  }

  function drawList() {
    const list = $('#r-list');
    const name = L.reportFilter[st.status].toLowerCase();
    $('#r-meta').textContent = st.status === 'all' ? `${plural(st.total, 'report', 'reports')} in total.` : `${plural(st.total, `${name} report`, `${name} reports`)}.`;
    if (!st.rows.length) {
      list.innerHTML = emptyBlock(st.status === 'open' || st.status === 'new' ? 'Inbox is clear.' : `No ${name} reports.`, st.status === 'open' ? 'Nothing waiting on you. New reports from the app land here.' : 'Pick another status above to see the rest.');
      return;
    }
    list.innerHTML = `<div class="rlist">${st.rows.map((r) => `<a class="rrow" href="${hrefFor(r.id)}" data-id="${esc(r.id)}"${r.id === st.open ? ' aria-current="true"' : ''}>
      ${r.unread ? '<span class="rrow__unread"></span><span class="sr">Unread. </span>' : ''}
      <span class="rrow__who">${esc(r.user_name || r.user_email || 'Someone')}</span><span class="rrow__when">${esc(ago(r.last_message_at || r.created_at))}</span>
      <span class="rrow__msg">${esc(r.message)}</span>
      <span class="rrow__meta"><span class="status status--${esc(r.status)}">${esc(label('status', r.status))}</span><span class="flag">${esc(label('category', r.category))}</span>
        ${r.message_count > 1 ? `<span class="flag">${plural(r.message_count, 'message', 'messages')}</span>` : ''}${r.has_screenshot ? `<span class="flag">${icon('image')}Screenshot</span>` : ''}</span>
    </a>`).join('')}</div>
    ${st.rows.length < st.total ? `<button type="button" class="btn btn-secondary btn-sm more" id="r-more">Show more (${n(st.total - st.rows.length)} left)</button>` : ''}`;
    const more = $('#r-more');
    if (more) more.addEventListener('click', () => { st.offset = st.rows.length; busy(more, true, 'Loading'); loadList(true, true); });
  }

  let detReq = 0;
  async function openReport(id, focus = true) {
    st.open = id;
    $('#inbox').classList.toggle('has-open', !!id);
    $$('#r-list .rrow').forEach((a) => { if (a.dataset.id === id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    const pane = $('#r-pane');
    if (!id) {
      pane.innerHTML = `<div class="pane__empty"><span class="state__icon">${icon('inbox')}</span><p>Pick a report to read it and reply.</p></div>`;
      setTitle('Reports');
      return;
    }
    const my = ++detReq;
    pane.setAttribute('aria-busy', 'true');
    pane.innerHTML = `<div class="rd"><div class="sk sk--dark sk-line"></div><div class="sk sk--dark" data-sk="b"></div><div class="sk sk--dark" data-sk="b"></div></div>`;
    $$('[data-sk="b"]', pane).forEach((x) => { x.style.height = '88px'; });
    try {
      const d = await api(`/reports/${encodeURIComponent(id)}`);
      if (s !== seq || my !== detReq) return;
      pane.removeAttribute('aria-busy');
      drawDetail(d);
      const row = st.rows.find((r) => r.id === id);
      if (row && row.unread) { row.unread = false; const a = $(`#r-list .rrow[data-id="${CSS.escape(id)}"]`); if (a) $$('.rrow__unread, .sr', a).forEach((x) => x.remove()); }
      if (focus) { const t = $('#rd-title'); if (t) t.focus({ preventScroll: !isPhone() }); }
      if (isPhone()) window.scrollTo(0, 0);
    } catch (e) {
      if (s !== seq || my !== detReq) return;
      pane.removeAttribute('aria-busy');
      if (e.status === 404 || e.status === 400) {
        pane.innerHTML = `<div class="rd">${backLink()}${emptyBlock('No report with that id.', 'It may have been removed.')}</div>`;
        return;
      }
      pane.innerHTML = `<div class="rd">${backLink()}<div id="rd-err-slot"></div></div>`;
      showError($('#rd-err-slot'), e, () => openReport(id));
    }
  }
  const backLink = () => `<a class="back rd__back" href="${hrefFor('')}">${icon('left')}All reports</a>`;

  function drawDetail(d) {
    const r = d.report; const u = d.user || {};
    const who = u.name || u.email || 'Someone';
    setTitle(`Report from ${who}`);
    const shot = safeHref(d.screenshot_url);
    const msgs = [{ author: 'user', body: r.message, created_at: r.created_at }, ...(d.messages || [])];
    const pane = $('#r-pane');
    pane.innerHTML = `<article class="rd" aria-labelledby="rd-title">
      ${backLink()}
      <header class="rd__head">
        <div class="rrow__meta"><span class="flag">${esc(label('category', r.category))}</span>${r.platform ? `<span class="flag">${esc(label('platform', r.platform))}</span>` : ''}${r.app_version ? `<span class="flag">App ${esc(r.app_version)}</span>` : ''}</div>
        <h2 class="rd__title" id="rd-title" tabindex="-1">Report from ${esc(who)}</h2>
        <p class="rd__who">
          ${u.id ? `<a class="link" href="#/users/${encodeURIComponent(u.id)}">${esc(who)}</a>` : `<span>${esc(who)}</span>`}
          ${u.email ? `<a class="link" href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : ''}
          ${u.phone ? `<a class="link" href="tel:${esc(String(u.phone).replace(/[^\d+]/g, ''))}">${esc(phone(u.phone))}</a>` : ''}
          <span>Sent ${esc(fDateTime(r.created_at))}</span>
        </p>
        ${shot ? `<a class="shot" href="${esc(shot)}" target="_blank" rel="noopener noreferrer">${icon('image')}Open their screenshot <small>(link works for 10 minutes)</small>${icon('external')}</a>` : ''}
      </header>
      <fieldset class="rd__status" id="rd-status"><legend class="group__label">Status</legend>
        <div class="seg">${Object.entries(L.status).map(([v, t]) => `<label><input type="radio" name="rd-status" value="${v}"${r.status === v ? ' checked' : ''}><span class="is-${v}">${esc(t)}</span></label>`).join('')}</div>
      </fieldset>
      <div class="thread" id="rd-thread" role="log" aria-label="Conversation">${msgs.map((m) => msgHtml(m, who)).join('')}</div>
      <form class="composer" id="rd-form" novalidate>
        <div class="field"><label for="rd-reply">Reply to ${esc(first(who))}</label>
          <textarea id="rd-reply" maxlength="4000" placeholder="${esc(`Write your reply. ${first(who)} gets a notification on their phone.`)}"></textarea></div>
        <div class="alert" id="rd-err" role="alert" hidden></div>
        <div class="composer__actions">
          <span class="field__hint">Ctrl + Enter sends</span>
          <div class="composer__btns">
            ${r.status !== 'fixed' ? '<button type="button" class="btn btn-secondary" id="rd-send-fixed">Send and mark fixed</button>' : ''}
            <button type="submit" class="btn btn-primary" id="rd-send">${icon('send')}Send reply</button>
          </div>
        </div>
      </form>
    </article>`;

    let status = r.status;
    $('#rd-status').addEventListener('change', async (ev) => {
      const next = ev.target.value; const prev = status;
      const inputs = $$('#rd-status input');
      inputs.forEach((x) => { x.disabled = true; });
      try {
        const res = await api(`/reports/${encodeURIComponent(r.id)}/status`, { method: 'POST', body: { status: next } });
        status = res.status || next;
        toast(`Marked as ${label('status', status).toLowerCase()}.`);
        afterChange(r.id, { status });
      } catch (e) {
        $$('#rd-status input').forEach((x) => { x.checked = x.value === prev; });
        if (e.code !== 'session_expired') toast(`The status didn't change. ${e.message}`, 'error');
      } finally {
        inputs.forEach((x) => { x.disabled = false; });
      }
    });

    const form = $('#rd-form'); const ta = $('#rd-reply');
    const send = async (markFixed, btn) => {
      const text = ta.value.trim();
      const err = $('#rd-err');
      if (!text) {
        err.innerHTML = `${icon('alert')}<span>Write a reply first.</span>`; err.hidden = false; ta.focus(); return;
      }
      err.hidden = true;
      const btns = $$('#rd-form button');
      btns.forEach((b) => { b.disabled = true; });
      busy(btn, true, 'Sending');
      try {
        const res = await api(`/reports/${encodeURIComponent(r.id)}/reply`, { method: 'POST', body: markFixed ? { body: text, status: 'fixed' } : { body: text } });
        ta.value = '';
        const m = res.message || { author: 'admin', body: text, created_at: new Date().toISOString() };
        $('#rd-thread').insertAdjacentHTML('beforeend', msgHtml(m, who, true));
        if (res.status) { status = res.status; $$('#rd-status input').forEach((x) => { x.checked = x.value === status; }); }
        const nm = first(who);
        toast(res.pushed > 0 ? `Reply sent. ${nm} got a notification${status === 'fixed' && markFixed ? ', and the report is marked fixed' : ''}.` : `Reply sent. ${nm} will see it in the app; their phone isn't set up for notifications.`);
        if (markFixed) { const fb = $('#rd-send-fixed'); if (fb) fb.remove(); }
        afterChange(r.id, { status, last_message_at: m.created_at, bump: true });
      } catch (e) {
        if (e.code !== 'session_expired') { err.innerHTML = `${icon('alert')}<span></span>`; err.querySelector('span').textContent = `Not sent. ${e.message}`; err.hidden = false; }
      } finally {
        busy(btn, false);
        btns.forEach((b) => { if (document.body.contains(b)) b.disabled = false; });
      }
    };
    form.addEventListener('submit', (ev) => { ev.preventDefault(); send(false, $('#rd-send')); });
    const fixedBtn = $('#rd-send-fixed');
    if (fixedBtn) fixedBtn.addEventListener('click', () => send(true, fixedBtn));
    ta.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(false, $('#rd-send')); } });
    ta.addEventListener('input', () => { $('#rd-err').hidden = true; });
  }

  function afterChange(id, patch) {
    const row = st.rows.find((x) => x.id === id);
    if (row) {
      if (patch.status) row.status = patch.status;
      if (patch.last_message_at) row.last_message_at = patch.last_message_at;
      if (patch.bump) row.message_count = (row.message_count || 1) + 1;
    }
    drawList();
    refreshBadge();
  }

  $('#r-seg').addEventListener('change', (ev) => {
    st.status = ev.target.value;
    history.replaceState(null, '', hrefFor(st.open));
    loadList();
  });
  $('#r-refresh').addEventListener('click', async (ev) => {
    const b = ev.currentTarget; busy(b, true, 'Refreshing');
    await loadList(true);
    if (st.open) await openReport(st.open, false);
    busy(b, false);
    refreshBadge();
  });

  loadList();
  openReport(openId, false);

  return {
    root,
    update(params2, id) {
      const want = L.reportFilter[params2.get('status')] ? params2.get('status') : 'open';
      if (want !== st.status) { st.status = want; syncSeg(); loadList(); }
      if (id !== st.open) openReport(id, true);
      else if (!id) $('#inbox').classList.remove('has-open');
      if (!id) { const h = $('#main h1'); if (h && isPhone()) h.focus({ preventScroll: true }); }
    },
  };
}

function msgHtml(m, who, fresh = false) {
  const admin = m.author === 'admin';
  return `<div class="msg${admin ? ' msg--admin' : ''}${fresh ? ' is-new' : ''}">
    <p class="msg__by"><b>${admin ? 'BUILT support' : esc(first(who))}</b><span>${esc(fDateTime(m.created_at))}</span></p>
    <p class="msg__body">${esc(m.body)}</p>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* ERP shared: labels, money, periods, drawer                          */
/* ------------------------------------------------------------------ */

Object.assign(L, {
  stage: { lead: 'Lead', trial: 'Trial', active: 'Active', paused: 'Paused', cancelled: 'Cancelled' },
  plan: { monthly: 'Monthly', quarterly: '3 months', yearly: 'Yearly' },
  crmSort: { recent: 'Newest first', name_asc: 'Name, A to Z', last_active_desc: 'Recently active', renews_asc: 'Renews soonest', price_desc: 'Highest price', stage: 'Pipeline order' },
  crmView: { board: 'Board', table: 'Table', tasks: 'Tasks' },
  txKind: { income: 'Income', expense: 'Expense' },
  txCat: { subscription: 'Subscriptions', other: 'Other', ai: 'AI', hosting: 'Hosting', app_store: 'App stores', marketing: 'Marketing', salaries: 'Salaries', equipment: 'Equipment' },
  invStatus: { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' },
  invFilter: { all: 'All', draft: 'Draft', sent: 'Unpaid', overdue: 'Overdue', paid: 'Paid', void: 'Void' },
  period: { this_month: 'This month', last_month: 'Last month', this_quarter: 'This quarter', this_year: 'This year', custom: 'Custom' },
});
const STAGE_KEYS = ['lead', 'trial', 'active', 'paused', 'cancelled'];
const PLAN_PRICE = { monthly: 3000, quarterly: 8100, yearly: 30000 };
const TX_CATS = { income: ['subscription', 'other'], expense: ['ai', 'hosting', 'app_store', 'marketing', 'salaries', 'equipment', 'other'] };

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (c) => usd.format((Number(c) || 0) / 100);
/** Signed money with a real minus sign. */
const moneySigned = (c) => (Number(c) < 0 ? `−${money(-c)}` : money(c));
function moneyCompact(c) {
  const d = (Number(c) || 0) / 100;
  if (Math.abs(d) >= 1e6) return `$${Math.round(d / 1e5) / 10}m`;
  if (Math.abs(d) >= 1e3) return `$${Math.round(d / 100) / 10}k`;
  return `$${Math.round(d)}`;
}
/** Dollars typed by the admin ("30", "1,250.5", "$81") to integer cents. null when empty, NaN when not money. */
function parseMoney(v) {
  const s = String(v ?? '').trim().replace(/[$,\s]/g, '');
  if (!s) return null;
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(s)) return NaN;
  const [w, f = ''] = s.split('.');
  return Number(w) * 100 + Number(`${f}00`.slice(0, 2));
}
const dollarsField = (c) => (c == null ? '' : (Number(c) / 100).toFixed(2));
const priceLine = (r) => (r.plan ? `${label('plan', r.plan)}, ${money(r.price_cents)}` : r.price_cents != null ? money(r.price_cents) : 'No plan yet');
const customerName = (r) => (r && (r.name || r.email)) || 'No name yet';
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ymdOf(y, m, d) { return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
function lastDay(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
const realYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
function addDays(ymd, days) { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }

/** Period key (+ custom from/to) to an inclusive day range. */
function periodRange(key, from, to) {
  const [y, m] = todayYmd().split('-').map(Number);
  if (key === 'last_month') { const yy = m === 1 ? y - 1 : y; const mm = m === 1 ? 12 : m - 1; return { key, from: ymdOf(yy, mm, 1), to: ymdOf(yy, mm, lastDay(yy, mm)) }; }
  if (key === 'this_quarter') { const q = Math.floor((m - 1) / 3) * 3 + 1; return { key, from: ymdOf(y, q, 1), to: ymdOf(y, q + 2, lastDay(y, q + 2)) }; }
  if (key === 'this_year') return { key, from: ymdOf(y, 1, 1), to: ymdOf(y, 12, 31) };
  if (key === 'custom' && realYmd(from) && realYmd(to)) return from <= to ? { key, from, to } : { key, from: to, to: from };
  return { key: key === 'custom' ? 'custom' : 'this_month', from: ymdOf(y, m, 1), to: ymdOf(y, m, lastDay(y, m)) };
}
function periodFrom(params) {
  const key = L.period[params.get('period')] ? params.get('period') : 'this_month';
  return periodRange(key, params.get('from'), params.get('to'));
}
function rangeLabel(from, to) {
  if (!from || !to) return '';
  if (from.slice(0, 4) === to.slice(0, 4)) return `${fDay(from)} to ${fDayLong(to)}`;
  return `${fDayLong(from)} to ${fDayLong(to)}`;
}
function periodParams(per) {
  const p = new URLSearchParams();
  if (per.key !== 'this_month') p.set('period', per.key);
  if (per.key === 'custom') { p.set('from', per.from); p.set('to', per.to); }
  return p;
}

/** Status chip: the dot carries the colour, the text stays neutral. */
const stageChip = (s) => `<span class="status chip-${esc(s)}">${esc(label('stage', s))}</span>`;
const invChip = (inv) => `<span class="status chip-inv-${esc(inv.overdue ? 'overdue' : inv.status)}">${esc(inv.overdue ? 'Overdue' : label('invStatus', inv.status))}</span>`;

async function downloadCsv(btn, path, name, okText) {
  busy(btn, true, 'Preparing file');
  try {
    const res = await api(path, { raw: true });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(okText || `Downloaded ${name}.`);
  } catch (e) {
    if (e.code !== 'session_expired') toast(`The export didn't download. ${e.message}`, 'error');
  } finally {
    busy(btn, false);
  }
}

/** CRM customers for pickers (not archived, in the CRM), cached a minute. */
let custCache = { at: 0, rows: null, p: null };
function customerOptions(force = false) {
  if (!force && custCache.rows && Date.now() - custCache.at < 60000) return Promise.resolve(custCache.rows);
  if (!force && custCache.p) return custCache.p;
  const p = api('/crm/customers?limit=500&streak=0&sort=name_asc').then((d) => {
    custCache = { at: Date.now(), rows: (d.rows || []).filter((r) => r.in_crm), p: null };
    return custCache.rows;
  }, (e) => { custCache.p = null; throw e; });
  custCache.p = p;
  return p;
}
const invalidateCustomers = () => { custCache = { at: 0, rows: null, p: null }; };
function customerSelect(id, rows, value, emptyLabel = 'No customer') {
  const has = !value || rows.some((r) => r.id === value);
  const seen = {};
  rows.forEach((r) => { const k = customerName(r).toLowerCase(); seen[k] = (seen[k] || 0) + 1; });
  return `<select id="${id}">${emptyLabel ? `<option value="">${esc(emptyLabel)}</option>` : ''}${has ? '' : `<option value="${esc(value)}" selected>Archived customer</option>`}${rows.map((r) =>
    `<option value="${esc(r.id)}"${r.id === value ? ' selected' : ''}>${esc(customerName(r))}${r.email && r.name && seen[customerName(r).toLowerCase()] > 1 ? ` (${esc(r.email)})` : ''}</option>`).join('')}</select>`;
}

function fieldError(form, input, message) {
  const box = $('.alert', form);
  $$('[aria-invalid]', form).forEach((x) => x.removeAttribute('aria-invalid'));
  if (!message) { if (box) box.hidden = true; return; }
  box.innerHTML = `${icon('alert')}<span></span>`;
  box.querySelector('span').textContent = message;
  box.hidden = false;
  if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
}

/* Drawer: a side panel on wide screens, a sheet from the bottom on phones. */
let drawer = null;
function ensureDrawer() {
  if (!$('#drawer')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="dscrim" id="dscrim"></div><div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1" hidden><div class="drawer__in" id="drawer-in"></div></div>');
    $('#dscrim').addEventListener('click', () => requestCloseDrawer());
    $('#drawer').addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) requestCloseDrawer(); });
  }
  return $('#drawer');
}
function openDrawer(html, { onClose, focus = true } = {}) {
  const el = ensureDrawer();
  const back = drawer ? drawer.back : document.activeElement;
  drawer = { onClose, back };
  $('#drawer-in').innerHTML = html;
  el.hidden = false;
  el.scrollTop = 0;
  requestAnimationFrame(() => { el.classList.add('is-open'); $('#dscrim').classList.add('is-open'); });
  document.body.classList.add('has-drawer');
  $('#app').inert = true;
  if (focus) setTimeout(() => { const f = $('[data-autofocus]', el) || $('#drawer-title', el) || el; f.focus({ preventScroll: true }); }, 60);
}
function fillDrawer(html, focusTitle = false) {
  if (!drawer) return;
  $('#drawer-in').innerHTML = html;
  if (focusTitle) { const t = $('#drawer-title'); if (t) t.focus({ preventScroll: true }); }
}
function closeDrawer(restore = true) {
  if (!drawer) return;
  const el = $('#drawer');
  el.classList.remove('is-open'); $('#dscrim').classList.remove('is-open');
  document.body.classList.remove('has-drawer');
  $('#app').inert = false;
  const back = drawer.back; drawer = null;
  setTimeout(() => { if (!drawer) { el.hidden = true; $('#drawer-in').innerHTML = ''; } }, 260);
  if (restore && back && document.body.contains(back) && back.offsetParent !== null) back.focus({ preventScroll: true });
}
function requestCloseDrawer() {
  if (!drawer) return;
  if (drawer.onClose) drawer.onClose(); else closeDrawer();
}
document.addEventListener('keydown', (ev) => {
  if (!drawer) return;
  if (ev.key === 'Escape') { ev.preventDefault(); requestCloseDrawer(); return; }
  if (ev.key === 'Tab') {
    const items = $$('#drawer a[href], #drawer button, #drawer input, #drawer select, #drawer textarea').filter((x) => !x.disabled && x.offsetParent !== null);
    if (!items.length) return;
    const firstEl = items[0]; const lastEl = items[items.length - 1];
    if (ev.shiftKey && (document.activeElement === firstEl || document.activeElement === $('#drawer'))) { ev.preventDefault(); lastEl.focus(); }
    else if (!ev.shiftKey && document.activeElement === lastEl) { ev.preventDefault(); firstEl.focus(); }
  }
});
const drawerHead = (title, meta = '', chip = '') => `<header class="dhead">
  <div class="dhead__top">${chip ? `<div class="dhead__chips">${chip}</div>` : '<span></span>'}<button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button></div>
  <h2 class="dhead__title" id="drawer-title" tabindex="-1">${esc(title)}</h2>
  ${meta ? `<p class="dhead__meta">${meta}</p>` : ''}
</header>`;
const drawerSkeleton = (title) => `${drawerHead(title)}<div class="dbody" aria-busy="true"><div class="sk sk--dark sk-line" data-sk="w60"></div>${skLines(5, 'sk--dark')}</div>`;

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

let lastCustomersHash = '#/customers';
const COL_EMPTY = { lead: 'No leads yet.', trial: 'No one on trial.', active: 'No active customers yet.', paused: 'No one paused.', cancelled: 'No cancellations.' };

function renderCustomers(params, openId, s) {
  setTitle('Customers');
  const st = { rows: [], counts: {}, total: 0, notIn: 0, lane: 'lead', dragId: '', open: '', stale: false, warned: false };
  readCrmParams(st, params);
  const el = main();
  el.innerHTML = `
    <div class="head">
      <div><h1 tabindex="-1">Customers</h1><p class="head__meta" id="c-meta" aria-live="polite">Loading customers</p></div>
      <div class="head__actions">
        <button type="button" class="btn btn-secondary btn-sm" id="c-export">${icon('download')}<span>Export CSV</span></button>
        <a class="btn btn-primary btn-sm" id="c-new">${icon('plus')}New customer</a>
      </div>
    </div>
    <div class="toolbar ctools">
      <fieldset class="seg" id="c-view" aria-label="View">${Object.entries(L.crmView).map(([v, t]) => `<label><input type="radio" name="c-view" value="${v}"><span>${esc(t)}</span></label>`).join('')}</fieldset>
      <div class="search" data-for="board table"><label class="sr" for="c-q">Search customers by name, email, phone or tag</label>${icon('search')}<input class="input" id="c-q" type="search" placeholder="Search name, email, phone or tag" autocomplete="off" spellcheck="false" maxlength="120"></div>
      <div class="field sort" data-for="board table"><label class="sr" for="c-plan">Plan</label><select id="c-plan"><option value="">Any plan</option>${Object.entries(L.plan).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}<option value="none">No plan</option></select></div>
      <div class="field sort" data-for="table"><label class="sr" for="c-stage">Stage</label><select id="c-stage"><option value="">All stages</option>${STAGE_KEYS.map((k) => `<option value="${k}">${esc(L.stage[k])}</option>`).join('')}<option value="not_in_crm">App accounts not added</option><option value="archived">Archived</option></select></div>
      <div class="field sort" data-for="table"><label class="sr" for="c-sort">Sort by</label><select id="c-sort">${Object.entries(L.crmSort).map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select></div>
      <label class="chip" data-for="tasks"><input type="checkbox" id="c-done"><span>Show done tasks</span></label>
    </div>
    <div id="c-body"></div>`;
  const root = el.firstElementChild;

  const listQuery = (extra = {}) => {
    const p = new URLSearchParams();
    if (st.view !== 'board') p.set('view', st.view);
    if (st.view !== 'tasks') {
      if (st.q) p.set('q', st.q);
      if (st.plan) p.set('plan', st.plan);
    }
    if (st.view === 'table') {
      if (st.stage) p.set('stage', st.stage);
      if (st.sort !== 'recent') p.set('sort', st.sort);
      if (st.page > 1) p.set('page', String(st.page));
    }
    if (st.view === 'tasks' && st.done) p.set('done', '1');
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };
  const hrefFor = (id) => { const q = listQuery(); return `#/customers${id ? `/${encodeURIComponent(id)}` : ''}${q ? `?${q}` : ''}`; };
  const writeHash = () => {
    const h = hrefFor(st.open);
    lastCustomersHash = hrefFor('');
    if (location.hash !== h) history.replaceState(null, '', h);
    $('#c-new').href = hrefFor('new');
  };
  const sync = () => {
    $$('#c-view input').forEach((r) => { r.checked = r.value === st.view; });
    $('#c-q').value = st.q; $('#c-plan').value = st.plan; $('#c-stage').value = st.stage; $('#c-sort').value = st.sort; $('#c-done').checked = st.done;
    $$('[data-for]', root.parentNode).forEach((x) => { x.hidden = !x.dataset.for.split(' ').includes(st.view); });
    $('#c-export').hidden = st.view === 'tasks';
  };
  sync();

  let reqId = 0;
  function load(quiet = false) {
    writeHash();
    if (st.view === 'table') return loadTable(quiet);
    if (st.view === 'tasks') return loadTasksView(quiet);
    return loadBoard(quiet);
  }

  /* ---- board ---- */
  async function loadBoard(quiet) {
    const my = ++reqId;
    const body = $('#c-body');
    if (!quiet) {
      body.setAttribute('aria-busy', 'true');
      body.innerHTML = `<div class="board"><div class="board__cols">${STAGE_KEYS.map(() => `<div class="col"><div class="sk sk-line" data-sk="w40"></div>${'<div class="sk sk--card"></div>'.repeat(2)}</div>`).join('')}</div></div>`;
      sizeSkeletons(body);
    }
    try {
      const p = new URLSearchParams({ limit: '500', streak: '0', sort: 'recent' });
      if (st.q) p.set('q', st.q);
      if (st.plan) p.set('plan', st.plan);
      const d = await api(`/crm/customers?${p}`);
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      st.rows = d.rows || []; st.counts = d.counts || {}; st.total = d.total || 0; st.notIn = d.not_in_crm || 0;
      writeMeta();
      drawBoard();
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      if (quiet) { if (e.code !== 'session_expired') toast(`The board didn't refresh. ${e.message}`, 'error'); return; }
      $('#c-meta').textContent = '';
      showError(body, e, () => load());
    }
  }
  function writeMeta() {
    const inCrm = Math.max(0, st.total - st.notIn);
    const filtered = !!(st.q || st.plan);
    $('#c-meta').textContent = filtered
      ? `${plural(st.total, 'match', 'matches')} for these filters.`
      : `${plural(inCrm, 'customer', 'customers')}${st.notIn ? `, and ${plural(st.notIn, 'app account', 'app accounts')} not added yet` : ''}.`;
  }
  function drawBoard(focusId, focusWhat = 'select') {
    const body = $('#c-body');
    const by = Object.fromEntries(STAGE_KEYS.map((k) => [k, []]));
    st.rows.forEach((r) => (by[r.stage] || by.lead).push(r));
    if (!st.rows.length && !st.q && !st.plan) {
      body.innerHTML = emptyBlock('No customers yet.', 'Add your first customer, or wait for sign-ups from the app. They show up here as leads.', `<a class="btn btn-primary btn-sm" href="${esc(hrefFor('new'))}">${icon('plus')}New customer</a>`);
      return;
    }
    if (!st.rows.length) {
      body.innerHTML = emptyBlock('No one matches.', 'Try a shorter search or another plan.', '<button type="button" class="btn btn-secondary btn-sm" data-clear>Clear search</button>');
      $('[data-clear]', body).addEventListener('click', () => { st.q = ''; st.plan = ''; sync(); load(); });
      return;
    }
    body.innerHTML = `<div class="board">
      <fieldset class="seg board__lanes" id="c-lanes" aria-label="Stage to show">${STAGE_KEYS.map((k) => `<label><input type="radio" name="c-lane" value="${k}"${k === st.lane ? ' checked' : ''}><span>${esc(L.stage[k])}<span class="seg__n">${n(st.counts[k] ?? by[k].length)}</span></span></label>`).join('')}</fieldset>
      <div class="board__cols">${STAGE_KEYS.map((k) => `<section class="col${k === st.lane ? ' is-shown' : ''}" data-stage="${k}" aria-labelledby="col-${k}">
        <header class="col__head"><h2 class="col__title" id="col-${k}">${esc(L.stage[k])}</h2><span class="col__n">${n(st.counts[k] ?? by[k].length)}</span></header>
        <ul class="col__list" role="list">${by[k].map(cardHtml).join('') || `<li class="col__empty">${esc(COL_EMPTY[k])}</li>`}</ul>
      </section>`).join('')}</div>
      ${st.total > st.rows.length ? `<p class="sec-sub board__more">Showing the newest ${n(st.rows.length)} of ${n(st.total)}. Search, or switch to the table, to reach the rest.</p>` : ''}
    </div>`;
    if (focusId) {
      const card = $(`.ccard[data-id="${CSS.escape(focusId)}"]`, body);
      const target = card && (focusWhat === 'name' ? $('.ccard__name', card) : $('.ccard__stage', card));
      if (target) target.focus({ preventScroll: true });
    }
  }
  function cardHtml(r) {
    const name = customerName(r);
    const flags = [];
    if (!r.in_crm) flags.push('<span class="flag flag--app">Not added yet</span>');
    if (r.stage === 'active' && r.renews_on) flags.push(`<span class="flag${r.renews_on < todayYmd() ? ' flag--warn' : ''}">Renews ${esc(fDay(r.renews_on))}</span>`);
    if (r.overdue_tasks) flags.push(`<span class="flag flag--warn">${plural(r.overdue_tasks, 'task overdue', 'tasks overdue')}</span>`);
    else if (r.open_tasks) flags.push(`<span class="flag">${plural(r.open_tasks, 'open task', 'open tasks')}</span>`);
    (r.tags || []).slice(0, 2).forEach((t) => flags.push(`<span class="flag">${esc(t)}</span>`));
    const sub = r.in_crm ? priceLine(r) : (r.stage === 'trial' ? 'App account, questionnaire done' : 'App account, just signed up');
    const sid = `cs-${r.id}`;
    return `<li class="ccard${r.in_crm ? '' : ' is-app'}" draggable="true" data-id="${esc(r.id)}">
      <a class="ccard__name" href="${esc(hrefFor(r.id))}" draggable="false">${esc(name)}</a>
      <p class="ccard__sub">${esc(sub)}</p>
      ${flags.length ? `<div class="ccard__flags">${flags.join('')}</div>` : ''}
      <div class="ccard__foot">
        <label class="sr" for="${esc(sid)}">${esc(`Stage for ${name}${r.in_crm ? '' : '. Picking one adds them to customers'}`)}</label>
        <select class="ccard__stage" id="${esc(sid)}" data-id="${esc(r.id)}">${STAGE_KEYS.map((k) => `<option value="${k}"${k === r.stage ? ' selected' : ''}>${esc(L.stage[k])}</option>`).join('')}</select>
        ${r.in_crm ? '' : `<button type="button" class="btn btn-secondary btn-sm ccard__add" data-adopt="${esc(r.id)}" aria-label="${esc(`Add ${name} to customers`)}">${icon('plus')}Add</button>`}
      </div>
    </li>`;
  }

  async function moveTo(id, stage, focusWhat = 'select') {
    const row = st.rows.find((r) => r.id === id);
    if (!row || (row.in_crm && row.stage === stage)) { drawBoard(id, focusWhat); return; }
    const prev = { ...row };
    const name = customerName(row);
    if (row.stage !== stage) {
      st.counts[row.stage] = Math.max(0, (st.counts[row.stage] || 1) - 1);
      st.counts[stage] = (st.counts[stage] || 0) + 1;
    }
    row.stage = stage;
    drawBoard(id, focusWhat);
    try {
      if (prev.in_crm) {
        const d = await api(`/crm/customers/${encodeURIComponent(id)}`, { method: 'POST', body: { stage } });
        Object.assign(row, d.customer);
        toast(`${name} moved to ${L.stage[stage]}.`);
      } else {
        const d = await api('/crm/customers', { method: 'POST', body: { user_id: id, stage } });
        Object.assign(row, d.customer, { in_crm: true, open_tasks: 0, overdue_tasks: 0 });
        st.notIn = Math.max(0, st.notIn - 1);
        writeMeta();
        toast(`${name} added to customers as ${L.stage[stage]}.`);
      }
      invalidateCustomers();
      if (s === seq && st.view === 'board') drawBoard(row.id, focusWhat);
    } catch (e) {
      if (prev.stage !== stage) {
        st.counts[stage] = Math.max(0, (st.counts[stage] || 1) - 1);
        st.counts[prev.stage] = (st.counts[prev.stage] || 0) + 1;
      }
      Object.keys(row).forEach((k) => delete row[k]); Object.assign(row, prev);
      if (s === seq && st.view === 'board') drawBoard(id, focusWhat);
      if (e.code === 'session_expired') return;
      if (e.status === 409) { toast(`${name} is already in your customers.`); load(true); return; }
      toast(`${name} didn't move. ${e.message}`, 'error');
    }
  }

  /* ---- table ---- */
  async function loadTable(quiet) {
    const my = ++reqId;
    const body = $('#c-body');
    if (!quiet) { body.setAttribute('aria-busy', 'true'); body.innerHTML = `<div class="list">${skLines(8)}</div>`; }
    try {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((st.page - 1) * PAGE_SIZE), sort: st.sort, streak: '0' });
      if (st.q) p.set('q', st.q);
      if (st.plan) p.set('plan', st.plan);
      if (st.stage) p.set('stage', st.stage);
      const d = await api(`/crm/customers?${p}`);
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      st.total = d.total || 0; st.notIn = d.not_in_crm || 0;
      const filtered = !!(st.q || st.plan || st.stage);
      $('#c-meta').textContent = filtered ? `${plural(st.total, 'match', 'matches')} for these filters.` : `${plural(st.total, 'person', 'people')}, customers and app accounts.`;
      if (!d.rows.length && st.page > 1 && st.total) { st.page = 1; load(); return; }
      if (!d.rows.length) {
        body.innerHTML = filtered
          ? emptyBlock('No one matches.', 'Try fewer filters or a shorter search.', '<button type="button" class="btn btn-secondary btn-sm" data-clear>Clear filters</button>')
          : emptyBlock('No customers yet.', 'Add your first customer, or wait for sign-ups from the app.', `<a class="btn btn-primary btn-sm" href="${esc(hrefFor('new'))}">${icon('plus')}New customer</a>`);
        const c = $('[data-clear]', body);
        if (c) c.addEventListener('click', () => { st.q = ''; st.plan = ''; st.stage = ''; st.page = 1; sync(); load(); });
        return;
      }
      body.innerHTML = `<div class="list clist">
        <div class="list__head crow" aria-hidden="true"><span>Customer</span><span>Stage</span><span>Plan</span><span class="crow__hide">Renews</span><span>Last active</span><span class="r">Tasks</span></div>
        ${d.rows.map((r) => `<a class="crow" href="${esc(hrefFor(r.id))}">
          <span class="urow__who"><span class="urow__name">${esc(customerName(r))}</span><span class="urow__email">${esc(r.email || phone(r.phone) || 'No contact details')}</span></span>
          <span class="crow__stage">${stageChip(r.stage)}${r.in_crm ? '' : '<span class="flag flag--app">Not added</span>'}${r.archived_at ? '<span class="flag">Archived</span>' : ''}</span>
          <span class="urow__cell">${esc(r.in_crm ? priceLine(r) : 'App account')}</span>
          <span class="urow__cell crow__hide">${esc(r.renews_on ? fDayLong(r.renews_on) : '')}</span>
          <span class="urow__cell">${esc(r.last_active_at ? ago(r.last_active_at) : (r.user_id ? 'Never' : 'No app account'))}</span>
          <span class="urow__cell r${r.overdue_tasks ? ' is-warn' : ''}">${r.open_tasks ? esc(r.overdue_tasks ? `${r.open_tasks}, ${r.overdue_tasks} late` : String(r.open_tasks)) : ''}</span>
        </a>`).join('')}
      </div>${pagerHtml(st.total, st.page)}`;
      $$('[data-page]', body).forEach((b) => b.addEventListener('click', () => { st.page = Number(b.dataset.page); load(); body.scrollIntoView({ block: 'start' }); main().focus({ preventScroll: true }); }));
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      if (quiet) { if (e.code !== 'session_expired') toast(`The list didn't refresh. ${e.message}`, 'error'); return; }
      $('#c-meta').textContent = '';
      showError(body, e, () => load());
    }
  }

  /* ---- tasks ---- */
  async function loadTasksView(quiet) {
    const my = ++reqId;
    const body = $('#c-body');
    if (!quiet) { body.setAttribute('aria-busy', 'true'); body.innerHTML = `<div class="card">${skLines(5, 'sk--dark')}</div>`; }
    try {
      const [d, custs] = await Promise.all([api(`/crm/tasks?${st.done ? '' : 'open=1&'}limit=500`), customerOptions().catch(() => [])]);
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      $('#c-meta').textContent = d.total ? `${plural(d.overdue, 'task', 'tasks')} overdue, ${n(d.due_today)} due today.` : 'Nothing on your list.';
      drawTasks(d, custs, quiet);
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      if (quiet) { if (e.code !== 'session_expired') toast(`Tasks didn't refresh. ${e.message}`, 'error'); return; }
      $('#c-meta').textContent = '';
      showError(body, e, () => load());
    }
  }
  function drawTasks(d, custs, keepForm) {
    const body = $('#c-body');
    const prevTitle = keepForm && $('#tk-title') ? $('#tk-title').value : '';
    const groups = [['Overdue', (t) => t.overdue], ['Today', (t) => t.due_today], ['Coming up', (t) => !t.done_at && t.due_on && !t.overdue && !t.due_today], ['No due date', (t) => !t.done_at && !t.due_on], ['Done', (t) => !!t.done_at]];
    const rows = d.rows || [];
    body.innerHTML = `<div class="tasks-page">
      <form class="card addtask addtask--wide" id="tk-form" novalidate>
        <h2 class="sec-title">Add a task</h2>
        <div class="addtask__row">
          <div class="field addtask__title"><label for="tk-title">What needs doing</label><input id="tk-title" maxlength="200" autocomplete="off" placeholder="Call about the renewal"></div>
          <div class="field"><label for="tk-due">Due</label><input id="tk-due" type="date"></div>
          <div class="field"><label for="tk-cust">Customer</label>${customerSelect('tk-cust', custs, '', 'Not about a customer')}</div>
          <button type="submit" class="btn btn-secondary btn-sm" id="tk-add">${icon('plus')}Add task</button>
        </div>
        <div class="alert" role="alert" hidden></div>
      </form>
      ${rows.length ? groups.map(([title, test]) => {
        const list = rows.filter(test);
        if (!list.length) return '';
        return `<section class="tgroup" aria-label="${esc(title)}"><h2 class="sec-title${title === 'Overdue' ? ' is-warn' : ''}">${esc(title)} <span class="sec-sub">${n(list.length)}</span></h2><ul class="tasks" role="list">${list.map((t) => taskHtml(t, true)).join('')}</ul></section>`;
      }).join('') : emptyBlock('Nothing to do.', st.done ? 'No tasks yet. Add one above.' : 'Every task is done. Add one above, or show done tasks.')}
    </div>`;
    $('#tk-title').value = prevTitle;
    bindTaskChecks(body, () => load(true));
    $('#tk-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget; const title = $('#tk-title').value.trim(); const due = $('#tk-due').value; const cust = $('#tk-cust').value;
      if (!title) { fieldError(form, $('#tk-title'), 'Write what needs doing first.'); return; }
      fieldError(form, null, '');
      const btn = $('#tk-add'); busy(btn, true, 'Adding');
      try {
        await api('/crm/tasks', { method: 'POST', body: { title, due_on: due || null, customer_id: cust || null } });
        $('#tk-title').value = '';
        toast('Task added.');
        await loadTasksView(true);
        const f = $('#tk-title'); if (f) f.focus();
      } catch (e) {
        if (e.code !== 'session_expired') fieldError(form, null, `Not added. ${e.message}`);
      } finally { busy(btn, false); }
    });
  }

  /* ---- drawer: one customer, or the new-customer form ---- */
  let detReq = 0;
  const closeToList = () => {
    const form = $('#cd-form');
    if (form && form.dataset.dirty === '1' && !st.warned) {
      st.warned = true;
      toast('You have unsaved changes. Save them, or close again to drop them.', 'error');
      return;
    }
    location.hash = hrefFor('');
  };
  async function openCustomer(id) {
    st.open = id; st.warned = false;
    writeHash();
    if (id === 'new') { drawNewCustomer(); return; }
    const my = ++detReq;
    if (!drawer) openDrawer(drawerSkeleton('Loading customer'), { onClose: closeToList, focus: false });
    else fillDrawer(drawerSkeleton('Loading customer'));
    sizeSkeletons($('#drawer'));
    try {
      const d = await api(`/crm/customers/${encodeURIComponent(id)}`);
      if (s !== seq || my !== detReq || st.open !== id) return;
      drawCustomer(d);
    } catch (e) {
      if (s !== seq || my !== detReq) return;
      if (e.code === 'session_expired') return;
      const notFound = e.status === 404 || e.status === 400;
      fillDrawer(`${drawerHead(notFound ? 'Not found' : 'That didn\'t load')}<div class="dbody" id="cd-err-slot"></div>`);
      if (notFound) $('#cd-err-slot').innerHTML = emptyBlock('No customer with that id.', 'They may have been archived, or the link is old.');
      else showError($('#cd-err-slot'), e, () => openCustomer(id));
    }
    setTimeout(() => { const t = $('#drawer-title'); if (t && drawer) t.focus({ preventScroll: true }); }, 60);
  }

  function drawNewCustomer() {
    const html = `${drawerHead('New customer', 'Add someone by hand. App sign-ups show up on their own.')}
      <form class="dbody dform" id="nc-form" novalidate>
        ${customerFieldsHtml('nc', { stage: 'lead' })}
        <div class="alert" role="alert" hidden></div>
        <div class="dform__foot"><button type="button" class="btn btn-secondary btn-sm" data-close>Cancel</button><button type="submit" class="btn btn-primary btn-sm" id="nc-save">${icon('plus')}Add customer</button></div>
      </form>`;
    if (!drawer) openDrawer(html, { onClose: closeToList, focus: false }); else fillDrawer(html);
    setTimeout(() => { const f = $('#nc-name'); if (f) f.focus(); }, 80);
    bindPlanPrice('nc');
    $('#nc-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const body = readCustomerFields('nc', form, true);
      if (!body) return;
      const btn = $('#nc-save'); busy(btn, true, 'Adding');
      try {
        const d = await api('/crm/customers', { method: 'POST', body });
        invalidateCustomers();
        toast(`${customerName(d.customer)} added to customers.`);
        st.open = d.customer.id;
        history.replaceState(null, '', hrefFor(d.customer.id));
        drawCustomer(d);
        setTimeout(() => { const t = $('#drawer-title'); if (t) t.focus({ preventScroll: true }); }, 30);
        load(true);
      } catch (e) {
        busy(btn, false);
        if (e.code !== 'session_expired') fieldError(form, null, `Not added. ${e.message}`);
      }
    });
  }

  function drawCustomer(d) {
    const c = d.customer || {}; const app = d.app_user; const name = customerName(c);
    setTitle(name);
    const contact = `<div class="person__contact">
      ${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${esc(c.email)}">${icon('mail')}<span>${esc(c.email)}</span></a>` : ''}
      ${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}">${icon('phone')}<span>${esc(phone(c.phone))}</span></a>` : ''}
      ${app ? `<a class="btn btn-secondary btn-sm" href="#/users/${encodeURIComponent(app.id)}">${icon('users')}<span>App profile</span></a>` : ''}
    </div>`;
    const appLine = app ? `<p class="dnote">${esc([
      app.onboarding_done ? 'Finished the questionnaire' : 'Questionnaire not finished',
      app.last_active_at ? `last active ${ago(app.last_active_at).toLowerCase()}` : 'never opened the app',
      app.streak != null ? `${plural(app.streak, 'day', 'days')} streak` : '',
    ].filter(Boolean).join(', '))}.</p>` : '';

    if (!d.in_crm) {
      fillDrawer(`${drawerHead(name, `App account, signed up ${esc(fDate(c.created_at))}. Not in your customers yet.`, stageChip(c.stage))}
        <div class="dbody">
          ${contact}${appLine}
          <form class="adopt card" id="ad-form" novalidate>
            <h3 class="dsec__title">Add to customers</h3>
            <p class="sec-sub">They keep their app account. You get a record for notes, tasks, plan and invoices.</p>
            <div class="adopt__row"><div class="field"><label for="ad-stage">Stage</label><select id="ad-stage">${STAGE_KEYS.map((k) => `<option value="${k}"${k === c.stage ? ' selected' : ''}>${esc(L.stage[k])}</option>`).join('')}</select></div>
            <button type="submit" class="btn btn-primary" id="ad-go">${icon('plus')}Add to customers</button></div>
            <div class="alert" role="alert" hidden></div>
          </form>
        </div>`);
      $('#ad-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const btn = $('#ad-go'); busy(btn, true, 'Adding');
        try {
          const r = await api('/crm/customers', { method: 'POST', body: { user_id: c.user_id || c.id, stage: $('#ad-stage').value } });
          invalidateCustomers();
          toast(`${name} added to customers.`);
          st.open = r.customer.id;
          history.replaceState(null, '', hrefFor(r.customer.id));
          drawCustomer(r);
          setTimeout(() => { const t = $('#drawer-title'); if (t) t.focus({ preventScroll: true }); }, 30);
          load(true);
        } catch (e) {
          busy(btn, false);
          if (e.code === 'session_expired') return;
          if (e.status === 409 && e.data.id) { toast(`${name} is already in your customers.`); location.hash = hrefFor(e.data.id); return; }
          fieldError($('#ad-form'), null, `Not added. ${e.message}`);
        }
      });
      return;
    }

    const t = d.totals || {};
    const openTasks = (d.tasks || []).filter((x) => !x.done_at).length;
    fillDrawer(`${drawerHead(name, `${c.archived_at ? `Archived ${esc(fDate(c.archived_at))}. ` : ''}Customer since ${esc(fDate(c.created_at))}${c.source ? `, from ${esc(c.source)}` : ''}.`, `${stageChip(c.stage)}${c.archived_at ? '<span class="flag">Archived</span>' : ''}`)}
      <div class="dbody">
        ${contact}${appLine}
        <div class="dmoney">
          <div><span class="dmoney__v num">${esc(money(t.paid_cents))}</span><span class="dmoney__l">Paid in total</span></div>
          <div><span class="dmoney__v num${t.outstanding_cents ? ' is-warn' : ''}">${esc(money(t.outstanding_cents))}</span><span class="dmoney__l">Waiting on invoices</span></div>
          <div><span class="dmoney__v num">${esc(c.price_cents != null ? money(c.price_cents) : 'None')}</span><span class="dmoney__l">${esc(c.plan ? `${label('plan', c.plan)} price` : 'Price')}</span></div>
        </div>

        <form class="dsec dform" id="cd-form" novalidate aria-labelledby="cd-form-t">
          <h3 class="dsec__title" id="cd-form-t">Details</h3>
          ${customerFieldsHtml('cd', c)}
          <div class="alert" role="alert" hidden></div>
          <div class="dform__foot"><span class="field__hint" id="cd-state" aria-live="polite">Everything is saved.</span><button type="submit" class="btn btn-primary btn-sm" id="cd-save" disabled>Save changes</button></div>
        </form>

        <section class="dsec" aria-labelledby="cd-tasks-t">
          <div class="block__head"><h3 class="dsec__title" id="cd-tasks-t">Tasks</h3><p class="sec-sub" id="cd-tasks-n">${openTasks ? plural(openTasks, 'open task', 'open tasks') : 'Nothing open'}</p></div>
          ${(d.tasks || []).length ? `<ul class="tasks" role="list" id="cd-tasks">${d.tasks.map((x) => taskHtml(x, false)).join('')}</ul>` : ''}
          <form class="addtask" id="cd-task-form" novalidate>
            <div class="field addtask__title"><label for="cd-task-title">New task</label><input id="cd-task-title" maxlength="200" autocomplete="off" placeholder="Call about the renewal"></div>
            <div class="field"><label for="cd-task-due">Due</label><input id="cd-task-due" type="date"></div>
            <button type="submit" class="btn btn-secondary btn-sm" id="cd-task-add">${icon('plus')}Add</button>
            <div class="alert" role="alert" hidden></div>
          </form>
        </section>

        <section class="dsec" aria-labelledby="cd-notes-t">
          <h3 class="dsec__title" id="cd-notes-t">Notes</h3>
          <form class="composer composer--flat" id="cd-note-form" novalidate>
            <div class="field"><label class="sr" for="cd-note">Add a note</label><textarea id="cd-note" maxlength="4000" placeholder="What did you talk about? What do they want?"></textarea></div>
            <div class="alert" role="alert" hidden></div>
            <div class="composer__actions"><span class="field__hint">Ctrl + Enter adds it</span><button type="submit" class="btn btn-secondary btn-sm" id="cd-note-add">Add note</button></div>
          </form>
          <ol class="timeline" id="cd-notes">${(d.notes || []).map(noteHtml).join('')}</ol>
        </section>

        <section class="dsec" aria-labelledby="cd-money-t">
          <div class="block__head"><h3 class="dsec__title" id="cd-money-t">Invoices and payments</h3>${c.archived_at ? '' : `<a class="btn btn-secondary btn-sm" href="#/finance/invoices/new?customer=${encodeURIComponent(c.id)}">${icon('file')}New invoice</a>`}</div>
          ${(d.invoices || []).length ? `<div class="rows">${d.invoices.map((i) => `<a class="row" href="#/finance/invoices/${encodeURIComponent(i.id)}">${invChip(i)}<span class="row__main"><span class="row__title">${esc(i.number)}</span><span class="row__sub">${esc(i.status === 'paid' ? `Paid ${fDayLong(i.paid_on)}` : `Issued ${fDay(i.issued_on)}${i.due_on ? `, due ${fDay(i.due_on)}` : ''}`)}</span></span><span class="row__side">${esc(money(i.total_cents))}</span></a>`).join('')}</div>` : '<p class="sec-sub">No invoices yet.</p>'}
          ${(d.transactions || []).length ? `<h4 class="dsub">Payments and other entries</h4><div class="rows">${d.transactions.map((x) => `<div class="row${x.void_at ? ' is-void' : ''}"><span class="row__date">${esc(fDay(x.occurred_on))}</span><span class="row__main"><span class="row__title">${esc(x.description || label('txCat', x.category))}</span><span class="row__sub">${esc(`${label('txKind', x.kind)}, ${label('txCat', x.category)}${x.void_at ? ', void' : ''}`)}</span></span><span class="row__side">${esc(x.kind === 'expense' ? moneySigned(-x.amount_cents) : money(x.amount_cents))}</span></div>`).join('')}</div>` : ''}
        </section>

        <div class="dfoot">
          <button type="button" class="btn btn-ghost btn-sm" id="cd-archive">${icon('archive')}${c.archived_at ? 'Restore customer' : 'Archive customer'}</button>
          <p class="field__hint">${c.archived_at ? 'Restoring puts them back on the board.' : 'Archiving takes them off the board and lists. Nothing is deleted; you can restore them.'}</p>
        </div>
      </div>`);

    // details form
    const form = $('#cd-form');
    const markDirty = () => { form.dataset.dirty = '1'; $('#cd-save').disabled = false; $('#cd-state').textContent = 'Unsaved changes.'; };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    bindPlanPrice('cd');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = readCustomerFields('cd', form, false);
      if (!body) return;
      const btn = $('#cd-save'); busy(btn, true, 'Saving');
      try {
        const r = await api(`/crm/customers/${encodeURIComponent(c.id)}`, { method: 'POST', body });
        invalidateCustomers();
        toast('Changes saved.');
        drawCustomer(r);
        $('#cd-state').textContent = 'Everything is saved.';
        const sv = $('#cd-save'); if (sv) sv.focus({ preventScroll: true });
        load(true);
      } catch (e) {
        busy(btn, false);
        if (e.code !== 'session_expired') fieldError(form, null, `Not saved. ${e.message}`);
      }
    });

    // tasks
    bindTaskChecks($('#drawer'), () => load(true));
    $('#cd-task-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.currentTarget; const title = $('#cd-task-title').value.trim(); const due = $('#cd-task-due').value;
      if (!title) { fieldError(f, $('#cd-task-title'), 'Write what needs doing first.'); return; }
      fieldError(f, null, '');
      const btn = $('#cd-task-add'); busy(btn, true, 'Adding');
      try {
        const task = await api('/crm/tasks', { method: 'POST', body: { title, due_on: due || null, customer_id: c.id } });
        let list = $('#cd-tasks');
        if (!list) { f.insertAdjacentHTML('beforebegin', '<ul class="tasks" role="list" id="cd-tasks"></ul>'); list = $('#cd-tasks'); }
        list.insertAdjacentHTML('afterbegin', taskHtml(task, false));
        bindTaskChecks(list, () => load(true));
        $('#cd-task-title').value = ''; $('#cd-task-due').value = '';
        const open = $$('#cd-tasks .task:not(.is-done)').length;
        $('#cd-tasks-n').textContent = plural(open, 'open task', 'open tasks');
        toast('Task added.');
        $('#cd-task-title').focus();
        load(true);
      } catch (e) {
        if (e.code !== 'session_expired') fieldError(f, null, `Not added. ${e.message}`);
      } finally { busy(btn, false); }
    });

    // notes
    const noteForm = $('#cd-note-form');
    const addNote = async () => {
      const ta = $('#cd-note'); const text = ta.value.trim();
      if (!text) { fieldError(noteForm, ta, 'Write the note first.'); return; }
      fieldError(noteForm, null, '');
      const btn = $('#cd-note-add'); busy(btn, true, 'Adding');
      try {
        const note = await api(`/crm/customers/${encodeURIComponent(c.id)}/notes`, { method: 'POST', body: { body: text } });
        ta.value = '';
        $('#cd-notes').insertAdjacentHTML('afterbegin', noteHtml(note, true));
        toast('Note added.');
      } catch (e) {
        if (e.code !== 'session_expired') fieldError(noteForm, null, `Not added. ${e.message}`);
      } finally { busy(btn, false); }
    };
    noteForm.addEventListener('submit', (ev) => { ev.preventDefault(); addNote(); });
    $('#cd-note').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); addNote(); } });

    // archive / restore
    $('#cd-archive').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; const archiving = !c.archived_at;
      if (archiving && btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1'; btn.classList.add('is-confirm');
        btn.innerHTML = `${icon('archive')}Yes, archive ${esc(first(name))}`;
        setTimeout(() => { if (document.body.contains(btn) && btn.dataset.confirm === '1') { btn.dataset.confirm = ''; btn.classList.remove('is-confirm'); btn.innerHTML = `${icon('archive')}Archive customer`; } }, 5000);
        return;
      }
      busy(btn, true, archiving ? 'Archiving' : 'Restoring');
      try {
        await api(`/crm/customers/${encodeURIComponent(c.id)}/archive`, { method: 'POST', body: { archived: archiving } });
        invalidateCustomers();
        toast(archiving ? `${name} archived. Find them under Table, Archived.` : `${name} restored.`);
        if (archiving) { st.warned = true; location.hash = hrefFor(''); load(true); }
        else { busy(btn, false); openCustomer(c.id); load(true); }
      } catch (e) {
        busy(btn, false);
        if (e.code !== 'session_expired') toast(`That didn't work. ${e.message}`, 'error');
      }
    });
  }

  /* ---- events ---- */
  $('#c-view').addEventListener('change', (ev) => { st.view = ev.target.value; st.page = 1; sync(); load(); });
  let deb = 0;
  $('#c-q').addEventListener('input', (ev) => { clearTimeout(deb); deb = setTimeout(() => { st.q = ev.target.value.trim(); st.page = 1; load(); }, 300); });
  $('#c-plan').addEventListener('change', (ev) => { st.plan = ev.target.value; st.page = 1; load(); });
  $('#c-stage').addEventListener('change', (ev) => { st.stage = ev.target.value; st.page = 1; load(); });
  $('#c-sort').addEventListener('change', (ev) => { st.sort = ev.target.value; st.page = 1; load(); });
  $('#c-done').addEventListener('change', (ev) => { st.done = ev.target.checked; load(); });
  $('#c-export').addEventListener('click', (ev) => {
    const p = new URLSearchParams();
    if (st.q) p.set('q', st.q);
    if (st.plan) p.set('plan', st.plan);
    if (st.view === 'table' && st.stage) p.set('stage', st.stage);
    if (st.view === 'table') p.set('sort', st.sort);
    const filtered = !!(st.q || st.plan || (st.view === 'table' && st.stage));
    downloadCsv(ev.currentTarget, `/crm/customers.csv?${p}`, `built-customers-${todayYmd()}${filtered ? '-filtered' : ''}.csv`);
  });
  const body = $('#c-body');
  body.addEventListener('change', (ev) => {
    const sel = ev.target.closest('.ccard__stage');
    if (sel) { moveTo(sel.dataset.id, sel.value); return; }
    if (ev.target.name === 'c-lane') {
      st.lane = ev.target.value;
      $$('.col', body).forEach((c) => c.classList.toggle('is-shown', c.dataset.stage === st.lane));
    }
  });
  body.addEventListener('click', (ev) => {
    const add = ev.target.closest('[data-adopt]');
    if (!add) return;
    const row = st.rows.find((r) => r.id === add.dataset.adopt);
    if (row) moveTo(row.id, row.stage === 'lead' || row.stage === 'trial' ? row.stage : 'lead', 'name');
  });
  body.addEventListener('dragstart', (ev) => {
    const card = ev.target.closest && ev.target.closest('.ccard');
    if (!card) return;
    st.dragId = card.dataset.id;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', card.dataset.id);
    requestAnimationFrame(() => card.classList.add('is-dragging'));
  });
  body.addEventListener('dragend', () => { st.dragId = ''; $$('.is-dragging, .is-over', body).forEach((x) => x.classList.remove('is-dragging', 'is-over')); });
  body.addEventListener('dragover', (ev) => {
    const col = ev.target.closest && ev.target.closest('.col');
    if (!col || !st.dragId) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    $$('.col.is-over', body).forEach((x) => { if (x !== col) x.classList.remove('is-over'); });
    col.classList.add('is-over');
  });
  body.addEventListener('dragleave', (ev) => {
    const col = ev.target.closest && ev.target.closest('.col');
    if (col && !col.contains(ev.relatedTarget)) col.classList.remove('is-over');
  });
  body.addEventListener('drop', (ev) => {
    const col = ev.target.closest && ev.target.closest('.col');
    if (!col || !st.dragId) return;
    ev.preventDefault();
    const id = st.dragId; st.dragId = '';
    col.classList.remove('is-over');
    moveTo(id, col.dataset.stage, 'name');
  });

  load();
  if (openId) openCustomer(openId);

  return {
    root,
    update(params2, id) {
      const before = listQuery();
      readCrmParams(st, params2);
      if (listQuery() !== before) { sync(); load(); }
      if (id) { if (id !== st.open) openCustomer(id); }
      else if (drawer) { st.open = ''; closeDrawer(); setTitle('Customers'); writeHash(); }
    },
  };
}

function readCrmParams(st, params) {
  st.view = L.crmView[params.get('view')] ? params.get('view') : 'board';
  st.q = (params.get('q') || '').slice(0, 120);
  st.plan = L.plan[params.get('plan')] || params.get('plan') === 'none' ? params.get('plan') : '';
  st.stage = L.stage[params.get('stage')] || ['archived', 'not_in_crm'].includes(params.get('stage')) ? params.get('stage') : '';
  st.sort = L.crmSort[params.get('sort')] ? params.get('sort') : 'recent';
  st.page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  st.done = params.get('done') === '1';
}

function sizeSkeletons(root) {
  $$('[data-sk="w40"]', root).forEach((x) => { x.style.width = '40%'; x.style.marginBottom = '14px'; });
  $$('[data-sk="w60"]', root).forEach((x) => { x.style.width = '60%'; x.style.marginBottom = '18px'; });
}

function customerFieldsHtml(pfx, c) {
  const tags = Array.isArray(c.tags) ? c.tags.join(', ') : '';
  return `<div class="fgrid">
    <div class="field fgrid__full"><label for="${pfx}-name">Name</label><input id="${pfx}-name" maxlength="120" autocomplete="off" value="${esc(c.name || '')}" required></div>
    <div class="field"><label for="${pfx}-email">Email</label><input id="${pfx}-email" type="email" maxlength="254" autocomplete="off" spellcheck="false" value="${esc(c.email || '')}"></div>
    <div class="field"><label for="${pfx}-phone">Phone</label><input id="${pfx}-phone" type="tel" maxlength="32" autocomplete="off" placeholder="+961 70 123 456" value="${esc(c.phone || '')}"></div>
    <div class="field"><label for="${pfx}-stage">Stage</label><select id="${pfx}-stage">${STAGE_KEYS.map((k) => `<option value="${k}"${k === (c.stage || 'lead') ? ' selected' : ''}>${esc(L.stage[k])}</option>`).join('')}</select></div>
    <div class="field"><label for="${pfx}-plan">Plan</label><select id="${pfx}-plan"><option value="">No plan</option>${Object.entries(L.plan).map(([v, t]) => `<option value="${v}"${v === c.plan ? ' selected' : ''}>${esc(`${t}, ${money(PLAN_PRICE[v])}`)}</option>`).join('')}</select></div>
    <div class="field"><label for="${pfx}-price">Price in USD</label><div class="money-in"><span aria-hidden="true">$</span><input id="${pfx}-price" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(dollarsField(c.price_cents))}"></div></div>
    <div class="field"><label for="${pfx}-source">Source</label><input id="${pfx}-source" maxlength="60" autocomplete="off" placeholder="Instagram, a friend, the gym" value="${esc(c.source || '')}"></div>
    <div class="field"><label for="${pfx}-start">Started on</label><input id="${pfx}-start" type="date" value="${esc(c.started_on || '')}"></div>
    <div class="field"><label for="${pfx}-renew">Renews on</label><input id="${pfx}-renew" type="date" value="${esc(c.renews_on || '')}"></div>
    <div class="field fgrid__full"><label for="${pfx}-tags">Tags</label><input id="${pfx}-tags" maxlength="400" autocomplete="off" placeholder="gym, referral" value="${esc(tags)}" aria-describedby="${pfx}-tags-hint"><span class="field__hint" id="${pfx}-tags-hint">Separate tags with commas. Up to 12.</span></div>
  </div>`;
}
/** Picking a plan fills its list price when the price is empty or still another plan's list price. */
function bindPlanPrice(pfx) {
  const plan = $(`#${pfx}-plan`); const price = $(`#${pfx}-price`);
  if (!plan || !price) return;
  plan.addEventListener('change', () => {
    const cur = parseMoney(price.value);
    if (plan.value && (cur == null || Object.values(PLAN_PRICE).includes(cur))) price.value = dollarsField(PLAN_PRICE[plan.value]);
  });
}
function readCustomerFields(pfx, form, creating) {
  const v = (k) => $(`#${pfx}-${k}`).value.trim();
  const name = v('name'); const email = v('email'); const ph = v('phone');
  if (!name) { fieldError(form, $(`#${pfx}-name`), 'Enter a name.'); return null; }
  if (email && !EMAIL_OK.test(email)) { fieldError(form, $(`#${pfx}-email`), 'Enter a real email address, like name@example.com.'); return null; }
  if (ph && (!/^\+?[0-9 ()./-]{6,32}$/.test(ph) || ph.replace(/\D/g, '').length < 6)) { fieldError(form, $(`#${pfx}-phone`), 'Enter the phone number with digits only, like +961 70 123 456.'); return null; }
  const price = parseMoney(v('price'));
  if (Number.isNaN(price)) { fieldError(form, $(`#${pfx}-price`), 'Enter the price in dollars, like 30 or 81.50.'); return null; }
  const start = v('start'); const renew = v('renew');
  if (start && renew && renew < start) { fieldError(form, $(`#${pfx}-renew`), 'The renewal date must be on or after the start date.'); return null; }
  const tags = v('tags').split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length > 12) { fieldError(form, $(`#${pfx}-tags`), 'Use 12 tags at most.'); return null; }
  if (tags.some((t) => t.length > 32)) { fieldError(form, $(`#${pfx}-tags`), 'Each tag can be 32 characters at most.'); return null; }
  fieldError(form, null, '');
  const body = { name, email, phone: ph, stage: v('stage'), plan: v('plan') || null, price_cents: price, source: v('source'), tags };
  if (creating) { if (start) body.started_on = start; if (renew) body.renews_on = renew; }
  else { body.started_on = start || null; body.renews_on = renew || null; }
  return body;
}

function taskDue(t) {
  if (t.done_at) return `Done ${fShort(t.done_at)}`;
  if (!t.due_on) return 'No due date';
  if (t.overdue) return `Overdue, was due ${fDay(t.due_on)}`;
  if (t.due_today) return 'Due today';
  return `Due ${fDay(t.due_on)}`;
}
function taskHtml(t, withCustomer) {
  return `<li class="task${t.done_at ? ' is-done' : ''}${t.overdue ? ' is-overdue' : ''}" data-task-row="${esc(t.id)}">
    <label class="task__check"><input type="checkbox" data-task="${esc(t.id)}"${t.done_at ? ' checked' : ''}><span class="task__box" aria-hidden="true">${icon('check')}</span><span class="task__title">${esc(t.title)}</span></label>
    <span class="task__meta"><span class="task__due">${esc(taskDue(t))}</span>${withCustomer && t.customer_id ? `<a class="link" href="#/customers/${encodeURIComponent(t.customer_id)}?view=tasks">${esc(t.customer_name || 'Customer')}</a>` : ''}</span>
  </li>`;
}
function bindTaskChecks(root, after) {
  $$('input[data-task]', root).forEach((box) => {
    if (box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('change', async () => {
      const done = box.checked; const li = box.closest('.task');
      li.classList.toggle('is-done', done); box.disabled = true;
      try {
        const t = await api(`/crm/tasks/${encodeURIComponent(box.dataset.task)}`, { method: 'POST', body: { done } });
        li.classList.toggle('is-overdue', !!t.overdue);
        $('.task__due', li).textContent = taskDue(t);
        toast(done ? 'Task done.' : 'Task opened again.');
        const counter = $('#cd-tasks-n');
        if (counter) { const open = $$('#cd-tasks .task:not(.is-done)').length; counter.textContent = open ? plural(open, 'open task', 'open tasks') : 'Nothing open'; }
        if (after) after();
      } catch (e) {
        box.checked = !done; li.classList.toggle('is-done', !done);
        if (e.code !== 'session_expired') toast(`The task didn't change. ${e.message}`, 'error');
      } finally { box.disabled = false; }
    });
  });
}
function noteHtml(note, fresh = false) {
  return `<li class="tl tl--${esc(note.kind)}${fresh ? ' is-new' : ''}"><span class="tl__dot" aria-hidden="true"></span><div><p class="tl__label note__body">${esc(note.body)}</p><p class="tl__at">${esc(`${note.kind === 'note' ? 'Note' : 'Update'}, ${fDateTime(note.created_at)}`)}</p></div></li>`;
}

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

let lastFinanceQuery = '';

function renderFinance(parts, params, s) {
  const tab = parts[1] === 'transactions' ? 'transactions' : parts[1] === 'invoices' ? 'invoices' : 'summary';
  if (tab === 'invoices' && parts[2]) { renderInvoice(parts[2], params, s); return null; }
  setTitle(tab === 'summary' ? 'Finance' : `${humanize(tab)} | Finance`);
  const per = periodFrom(params);
  const st = { tab, per };
  const el = main();
  const tabHref = (t) => { const q = periodParams(st.per).toString(); return `#/finance${t === 'summary' ? '' : `/${t}`}${q && t !== 'invoices' ? `?${q}` : ''}`; };
  el.innerHTML = `
    <div class="head">
      <div><h1 tabindex="-1">Finance</h1><p class="head__meta">Money in and out, as you record it. Amounts in USD, days in Beirut.</p></div>
      <div class="head__actions">
        ${tab === 'invoices' ? `<a class="btn btn-primary btn-sm" href="#/finance/invoices/new">${icon('plus')}New invoice</a>` : `<a class="btn btn-secondary btn-sm" href="#/finance/invoices/new">${icon('file')}New invoice</a><button type="button" class="btn btn-primary btn-sm" id="f-add">${icon('plus')}Add transaction</button>`}
      </div>
    </div>
    <nav class="tabs" aria-label="Finance sections">${['summary', 'transactions', 'invoices'].map((t) => `<a class="tabs__a" data-tab="${t}" href="${tabHref(t)}"${t === tab ? ' aria-current="page"' : ''}>${esc(humanize(t))}</a>`).join('')}</nav>
    ${tab === 'invoices' ? '' : `<div class="period" id="f-period">
      <fieldset class="seg" id="f-seg" aria-label="Period">${Object.entries(L.period).map(([v, t]) => `<label><input type="radio" name="f-per" value="${v}"${v === per.key ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</fieldset>
      <div class="period__custom" id="f-custom"${per.key === 'custom' ? '' : ' hidden'}>
        <div class="field"><label for="f-from">From</label><input id="f-from" type="date" value="${esc(per.from)}"></div>
        <div class="field"><label for="f-to">To</label><input id="f-to" type="date" value="${esc(per.to)}"></div>
      </div>
      <p class="period__label" id="f-range" aria-live="polite">${esc(rangeLabel(per.from, per.to))}</p>
    </div>`}
    <div id="f-body"></div>`;
  const root = el.firstElementChild;

  let ctl = null;
  const setPeriod = (next) => {
    st.per = next;
    $('#f-range').textContent = rangeLabel(next.from, next.to);
    $('#f-custom').hidden = next.key !== 'custom';
    $$('#f-seg input').forEach((r) => { r.checked = r.value === next.key; });
    $$('.tabs__a').forEach((a) => { a.href = tabHref(a.dataset.tab); });
    if (ctl) ctl.period(next);
  };
  if (tab !== 'invoices') {
    $('#f-seg').addEventListener('change', (ev) => {
      const key = ev.target.value;
      if (key === 'custom') {
        const cur = st.per; setPeriod({ key: 'custom', from: cur.from, to: cur.to });
        $('#f-from').value = cur.from; $('#f-to').value = cur.to;
        $('#f-from').focus();
        return;
      }
      setPeriod(periodRange(key));
    });
    const onCustom = () => {
      const f = $('#f-from').value; const t = $('#f-to').value;
      if (!realYmd(f) || !realYmd(t)) return;
      setPeriod(periodRange('custom', f, t));
    };
    $('#f-from').addEventListener('change', onCustom);
    $('#f-to').addEventListener('change', onCustom);
    $('#f-add').addEventListener('click', () => openTxForm(null, () => ctl && ctl.reload()));
  }
  if (tab === 'summary') ctl = financeSummary(st, s);
  else if (tab === 'transactions') ctl = financeTransactions(st, params, s);
  else ctl = financeInvoices(params, s);
  return { root, tab };
}

function financeSummary(st, s) {
  let reqId = 0; let ro = null;
  const body = $('#f-body');
  async function load(quiet = false) {
    const my = ++reqId;
    const q = periodParams(st.per).toString();
    const h = `#/finance${q ? `?${q}` : ''}`;
    lastFinanceQuery = q;
    if (location.hash !== h) history.replaceState(null, '', h);
    if (!quiet) {
      body.setAttribute('aria-busy', 'true');
      body.innerHTML = `<div class="fin"><div class="fin__main card"><div class="sk sk--dark" data-sk="hero"></div><div class="sk sk--dark" data-sk="chart"></div></div><div class="fin__side">${skLines(4)}</div></div>`;
      $$('[data-sk="hero"]', body).forEach((x) => { x.style.height = '88px'; x.style.width = '55%'; x.style.marginBottom = '24px'; });
      $$('[data-sk="chart"]', body).forEach((x) => { x.style.height = '220px'; });
    }
    try {
      const d = await api(`/finance/summary?from=${st.per.from}&to=${st.per.to}`);
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      draw(d);
      if (quiet) toast('Summary updated.');
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      body.removeAttribute('aria-busy');
      showError(body, e, () => load());
    }
  }
  function draw(d) {
    const months = d.months || [];
    const profit = d.profit_cents || 0;
    const ab = d.active_by_plan || {};
    const activeN = (ab.monthly || 0) + (ab.quarterly || 0) + (ab.yearly || 0) + (ab.none || 0);
    const pmax = Math.max(1, ab.monthly || 0, ab.quarterly || 0, ab.yearly || 0, ab.none || 0);
    const out = d.outstanding || {};
    const tk = d.tasks || {};
    const exp = d.expenses_by_category || []; const inc = d.income_by_category || [];
    const emax = Math.max(1, ...exp.map((x) => x.cents)); const imax = Math.max(1, ...inc.map((x) => x.cents));
    const anyMonth = months.some((m) => m.income_cents || m.expense_cents);
    const per = rangeLabel(d.from, d.to);
    const chev = icon('right', 'ico need__go');
    const catRows = (list, max, kind) => list.map((x) => `<a class="cat" href="#/finance/transactions?${new URLSearchParams({ ...Object.fromEntries(periodParams(st.per)), kind, category: x.category })}">
      <span class="cat__name">${esc(label('txCat', x.category))}</span><span class="cat__v num">${esc(money(x.cents))}</span>
      <div class="meter" aria-hidden="true"><div class="meter__fill${kind === 'income' ? ' is-green' : ''}" data-w="${Math.round((x.cents / max) * 100)}"></div></div>
      <span class="cat__n">${plural(x.count, 'entry', 'entries')}</span></a>`).join('');
    body.innerHTML = `<div class="fin">
      <section class="fin__main card" aria-labelledby="fin-profit">
        <div class="hero-num fin__hero">
          <span class="hero-num__value num${profit < 0 ? ' is-neg' : ''}">${esc(moneySigned(profit))}</span>
          <p class="hero-num__label" id="fin-profit">profit, ${esc(per)}</p>
        </div>
        <div class="fin__io">
          <div><span class="fin__io-v num">${esc(money(d.income_cents))}</span><span class="fin__io-l"><i class="dot dot--in" aria-hidden="true"></i>Income</span></div>
          <div><span class="fin__io-v num">${esc(money(d.expense_cents))}</span><span class="fin__io-l"><i class="dot dot--out" aria-hidden="true"></i>Expenses</span></div>
        </div>
        <div class="fchart">
          <div class="bars__head"><h2 class="sec-title" id="fin-chart-t">Income and expenses, last 12 months</h2>
            <div class="legend" aria-hidden="true"><span><i class="is-week"></i>Income</span><span><i class="is-out"></i>Expenses</span></div></div>
          ${anyMonth ? `<div class="fchart__plot" id="fchart" role="img" aria-labelledby="fin-chart-t" aria-describedby="fin-chart-sum"></div>
          <p class="sr" id="fin-chart-sum">${esc(months.map((m) => `${monthName(m.month)}: income ${money(m.income_cents)}, expenses ${money(m.expense_cents)}`).join('. '))}</p>
          <details class="fchart__table"><summary>Show as a table</summary>
            <div class="tscroll"><table><caption class="sr">Income and expenses by month</caption><thead><tr><th scope="col">Month</th><th scope="col" class="r">Income</th><th scope="col" class="r">Expenses</th><th scope="col" class="r">Profit</th></tr></thead>
            <tbody>${months.map((m) => `<tr><th scope="row">${esc(monthName(m.month, true))}</th><td class="r">${esc(money(m.income_cents))}</td><td class="r">${esc(money(m.expense_cents))}</td><td class="r">${esc(moneySigned(m.income_cents - m.expense_cents))}</td></tr>`).join('')}</tbody></table></div>
          </details>` : `<div class="state"><h2>Nothing recorded in these 12 months</h2><p>Add income and expenses as they happen, and this chart fills in.</p></div>`}
        </div>
      </section>

      <aside class="fin__side">
        <section class="mrr" aria-labelledby="fin-mrr">
          <h2 class="sec-title" id="fin-mrr">Monthly recurring revenue</h2>
          <p class="mrr__v num">${esc(money(d.mrr_cents))}</p>
          <p class="sec-sub">${activeN ? `From ${plural(activeN, 'active customer', 'active customers')}. 3-month and yearly plans count per month.` : 'No active customers yet. Set a customer to Active with a plan to count them.'}</p>
          <div class="plans">${[['monthly', 'Monthly'], ['quarterly', '3 months'], ['yearly', 'Yearly'], ['none', 'No plan set']].filter(([k]) => k !== 'none' || ab.none).map(([k, t]) => `<div class="plan">
            <span class="plan__name">${esc(t)}</span><span class="plan__n num">${n(ab[k] || 0)}</span>
            <div class="meter" aria-hidden="true"><div class="meter__fill" data-w="${Math.round(((ab[k] || 0) / pmax) * 100)}"></div></div></div>`).join('')}</div>
        </section>
        <section class="needs" aria-labelledby="fin-needs">
          <h2 class="sec-title needs__title" id="fin-needs">Keep an eye on</h2>
          <a class="need" href="#/finance/invoices?status=sent"><span class="need__num num${out.overdue_count ? ' is-warn' : ''}">${n(out.count || 0)}</span><span class="need__text"><span class="need__label">Unpaid invoices, ${esc(money(out.cents))}</span><span class="need__sub">${out.overdue_count ? `${n(out.overdue_count)} past the due date, ${esc(money(out.overdue_cents))}` : 'None past the due date'}</span></span>${chev}</a>
          <a class="need" href="#/customers?view=table&amp;stage=cancelled"><span class="need__num num">${n(d.churned || 0)}</span><span class="need__text"><span class="need__label">Cancelled in this period</span><span class="need__sub">${n(d.new_active || 0)} became active</span></span>${chev}</a>
          <a class="need" href="#/customers?view=tasks"><span class="need__num num${tk.overdue ? ' is-warn' : ''}">${n(tk.due_today || 0)}</span><span class="need__text"><span class="need__label">Tasks due today</span><span class="need__sub">${tk.overdue ? `${n(tk.overdue)} overdue, ` : ''}${n(tk.open || 0)} open in total</span></span>${chev}</a>
        </section>
      </aside>

      <section class="fin__cats" aria-labelledby="fin-exp">
        <div class="block__head"><h2 class="sec-title" id="fin-exp">Expenses by category</h2><p class="sec-sub">${esc(per)}</p></div>
        <div class="cats">${exp.length ? catRows(exp, emax, 'expense') : '<p class="sec-sub">No expenses in this period.</p>'}</div>
      </section>
      <section class="fin__cats" aria-labelledby="fin-inc">
        <div class="block__head"><h2 class="sec-title" id="fin-inc">Income by category</h2><p class="sec-sub">${esc(per)}</p></div>
        <div class="cats">${inc.length ? catRows(inc, imax, 'income') : '<p class="sec-sub">No income in this period.</p>'}</div>
      </section>
    </div>`;
    applySizes(body);
    const plot = $('#fchart');
    if (plot) {
      const paint = () => { plot.innerHTML = chartSvg(months, plot.clientWidth); };
      paint();
      if (ro) ro.disconnect();
      if (window.ResizeObserver) {
        let w = plot.clientWidth;
        ro = new ResizeObserver(() => { if (!document.body.contains(plot)) { ro.disconnect(); return; } if (Math.abs(plot.clientWidth - w) > 4) { w = plot.clientWidth; paint(); } });
        ro.observe(plot);
      }
    }
  }
  load();
  return { period: () => load(), reload: () => load(true) };
}

function monthName(ym, long = false) {
  const d = new Date(`${ym}-15T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', { month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'UTC' }).format(d);
}
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
/** Grouped bars, drawn at the container's real width so text and corners stay crisp. */
function chartSvg(months, width) {
  const W = Math.max(280, Math.round(width || 600));
  const H = W < 560 ? 188 : 232;
  const padL = 50; const padR = 6; const padT = 10; const padB = 28;
  const pw = W - padL - padR; const ph = H - padT - padB;
  const top = niceMax(Math.max(100, ...months.map((m) => Math.max(m.income_cents || 0, m.expense_cents || 0))));
  const gw = pw / Math.max(1, months.length);
  const gap = Math.max(2, Math.min(4, gw * 0.06));
  const bw = Math.max(3, Math.min(20, (gw - 10 - gap) / 2));
  const y = (v) => padT + ph - (v / top) * ph;
  const grid = [0, 0.5, 1].map((f) => `<line class="fchart__grid" x1="${padL}" x2="${W - padR}" y1="${y(top * f).toFixed(1)}" y2="${y(top * f).toFixed(1)}"/><text class="fchart__y" x="${padL - 8}" y="${(y(top * f) + 4).toFixed(1)}" text-anchor="end">${esc(moneyCompact(top * f))}</text>`).join('');
  const every = gw < 30 ? 3 : gw < 44 ? 2 : 1;
  const bars = months.map((m, i) => {
    const cx = padL + i * gw + gw / 2;
    const x1 = cx - gap / 2 - bw; const x2 = cx + gap / 2;
    const hi = Math.max(0, padT + ph - y(m.income_cents || 0)); const he = Math.max(0, padT + ph - y(m.expense_cents || 0));
    const r = Math.min(3, bw / 2);
    const bar = (x, h, cls, t) => (h > 0.5 ? `<path class="${cls}" d="${barPath(x, padT + ph - h, bw, h, r)}"><title>${esc(t)}</title></path>` : '');
    const showLabel = (months.length - 1 - i) % every === 0;
    return `${bar(x1, hi, 'fchart__in', `${monthName(m.month, true)}: income ${money(m.income_cents)}`)}${bar(x2, he, 'fchart__out', `${monthName(m.month, true)}: expenses ${money(m.expense_cents)}`)}${showLabel ? `<text class="fchart__x" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(monthName(m.month))}</text>` : ''}`;
  }).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false">${grid}${bars}</svg>`;
}
function barPath(x, yTop, w, h, r) {
  const rr = Math.min(r, h);
  return `M${x.toFixed(1)} ${(yTop + h).toFixed(1)}V${(yTop + rr).toFixed(1)}Q${x.toFixed(1)} ${yTop.toFixed(1)} ${(x + rr).toFixed(1)} ${yTop.toFixed(1)}H${(x + w - rr).toFixed(1)}Q${(x + w).toFixed(1)} ${yTop.toFixed(1)} ${(x + w).toFixed(1)} ${(yTop + rr).toFixed(1)}V${(yTop + h).toFixed(1)}Z`;
}

function financeTransactions(st, params, s) {
  const f = {
    kind: ['income', 'expense'].includes(params.get('kind')) ? params.get('kind') : '',
    category: L.txCat[params.get('category')] ? params.get('category') : '',
    q: (params.get('q') || '').slice(0, 120),
    page: Math.max(1, parseInt(params.get('page') || '1', 10) || 1),
    voids: params.get('void') === '1',
    total: 0,
  };
  const body = $('#f-body');
  body.innerHTML = `<div class="toolbar">
      <fieldset class="seg" id="tx-kind" aria-label="Kind">${[['', 'All'], ['income', 'Income'], ['expense', 'Expenses']].map(([v, t]) => `<label><input type="radio" name="tx-kind" value="${v}"${v === f.kind ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('')}</fieldset>
      <div class="search"><label class="sr" for="tx-q">Search transactions</label>${icon('search')}<input class="input" id="tx-q" type="search" placeholder="Search description, customer or invoice" autocomplete="off" maxlength="120" value="${esc(f.q)}"></div>
      <div class="field sort"><label class="sr" for="tx-cat">Category</label><select id="tx-cat"></select></div>
      <label class="chip"><input type="checkbox" id="tx-void"${f.voids ? ' checked' : ''}><span>Show void</span></label>
      <button type="button" class="btn btn-secondary btn-sm" id="tx-export">${icon('download')}<span>Export CSV</span></button>
    </div>
    <p class="txsum" id="tx-sum" aria-live="polite"></p>
    <div id="tx-list"></div>`;
  const fillCats = () => {
    const cats = f.kind ? TX_CATS[f.kind] : [...new Set([...TX_CATS.income, ...TX_CATS.expense])];
    if (f.category && !cats.includes(f.category)) f.category = '';
    $('#tx-cat').innerHTML = `<option value="">All categories</option>${cats.map((c) => `<option value="${c}"${c === f.category ? ' selected' : ''}>${esc(label('txCat', c))}</option>`).join('')}`;
  };
  fillCats();
  const query = (extra = {}) => {
    const p = new URLSearchParams({ from: st.per.from, to: st.per.to, include_void: f.voids ? '1' : '0' });
    if (f.kind) p.set('kind', f.kind);
    if (f.category) p.set('category', f.category);
    if (f.q) p.set('q', f.q);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
  };
  const writeHash = () => {
    const p = periodParams(st.per);
    if (f.kind) p.set('kind', f.kind);
    if (f.category) p.set('category', f.category);
    if (f.q) p.set('q', f.q);
    if (f.voids) p.set('void', '1');
    if (f.page > 1) p.set('page', String(f.page));
    const h = `#/finance/transactions${p.toString() ? `?${p}` : ''}`;
    lastFinanceQuery = periodParams(st.per).toString();
    if (location.hash !== h) history.replaceState(null, '', h);
  };
  let reqId = 0;
  async function load(quiet = false) {
    writeHash();
    const my = ++reqId;
    const list = $('#tx-list');
    if (!quiet) { list.setAttribute('aria-busy', 'true'); list.innerHTML = `<div class="list">${skLines(6)}</div>`; }
    try {
      const d = await api(`/finance/transactions?${query({ limit: PAGE_SIZE, offset: (f.page - 1) * PAGE_SIZE })}`);
      if (s !== seq || my !== reqId) return;
      list.removeAttribute('aria-busy');
      f.total = d.total || 0;
      $('#tx-sum').innerHTML = f.total ? `<span>${plural(f.total, 'entry', 'entries')}</span><span>In <b class="num">${esc(money(d.income_cents))}</b></span><span>Out <b class="num">${esc(money(d.expense_cents))}</b></span><span>Net <b class="num">${esc(moneySigned((d.income_cents || 0) - (d.expense_cents || 0)))}</b></span>` : '';
      $('#tx-export').disabled = !f.total;
      if (!d.rows.length && f.page > 1 && f.total) { f.page = 1; load(); return; }
      if (!d.rows.length) {
        const filtered = !!(f.kind || f.category || f.q);
        list.innerHTML = filtered
          ? emptyBlock('Nothing matches.', 'Try another category, a shorter search, or a wider period.', '<button type="button" class="btn btn-secondary btn-sm" data-clear>Clear filters</button>')
          : emptyBlock('Nothing recorded in this period.', 'Add income and expenses as they happen: subscriptions, AI costs, hosting, app store fees.', `<button type="button" class="btn btn-primary btn-sm" data-add>${icon('plus')}Add transaction</button>`);
        const c = $('[data-clear]', list); if (c) c.addEventListener('click', () => { f.kind = ''; f.category = ''; f.q = ''; $('#tx-q').value = ''; $$('#tx-kind input').forEach((r) => { r.checked = r.value === ''; }); fillCats(); load(); });
        const a = $('[data-add]', list); if (a) a.addEventListener('click', () => openTxForm(null, () => load(true)));
        return;
      }
      list.innerHTML = `<div class="list tlist">
        <div class="list__head trow" aria-hidden="true"><span>Date</span><span>Description</span><span>Category</span><span class="r">Amount</span><span></span></div>
        ${d.rows.map((x) => `<div class="trow${x.void_at ? ' is-void' : ''}" data-id="${esc(x.id)}">
          <span class="trow__date">${esc(fDay(x.occurred_on))}</span>
          <span class="trow__main"><span class="trow__desc">${esc(x.description || label('txCat', x.category))}</span><span class="trow__sub">${[x.customer_id ? `<a class="link" href="#/customers/${encodeURIComponent(x.customer_id)}">${esc(x.customer_name || 'Customer')}</a>` : '', x.invoice_id ? `<a class="link" href="#/finance/invoices/${encodeURIComponent(x.invoice_id)}">${esc(x.invoice_number || 'Invoice')}</a>` : ''].filter(Boolean).join('<span aria-hidden="true">, </span>')}</span></span>
          <span class="trow__cat"><span class="flag">${esc(label('txCat', x.category))}</span></span>
          <span class="trow__amt num${x.kind === 'income' ? ' is-in' : ''}"><span class="sr">${esc(label('txKind', x.kind))} </span>${esc(x.kind === 'expense' ? moneySigned(-x.amount_cents) : `+${money(x.amount_cents)}`)}</span>
          <span class="trow__acts">${x.void_at ? '<span class="flag">Void</span>' : `<button type="button" class="icon-btn" data-edit="${esc(x.id)}" aria-label="${esc(`Edit ${x.description || label('txCat', x.category)}, ${money(x.amount_cents)}`)}">${icon('edit')}</button><button type="button" class="btn btn-ghost btn-sm" data-void="${esc(x.id)}" aria-label="${esc(`Void ${x.description || label('txCat', x.category)}, ${money(x.amount_cents)}`)}">Void</button>`}</span>
        </div>`).join('')}
      </div>${pagerHtml(f.total, f.page)}`;
      const rows = d.rows;
      $$('[data-page]', list).forEach((b) => b.addEventListener('click', () => { f.page = Number(b.dataset.page); load(); list.scrollIntoView({ block: 'start' }); }));
      $$('[data-edit]', list).forEach((b) => b.addEventListener('click', () => openTxForm(rows.find((x) => x.id === b.dataset.edit), () => load(true))));
      $$('[data-void]', list).forEach((b) => b.addEventListener('click', () => voidTx(b, rows.find((x) => x.id === b.dataset.void))));
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      list.removeAttribute('aria-busy');
      if (quiet) { if (e.code !== 'session_expired') toast(`The list didn't refresh. ${e.message}`, 'error'); return; }
      $('#tx-sum').textContent = '';
      showError(list, e, () => load());
    }
  }
  async function voidTx(btn, x) {
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1'; btn.classList.add('is-confirm'); btn.textContent = 'Confirm void';
      setTimeout(() => { if (document.body.contains(btn) && btn.dataset.confirm === '1') { btn.dataset.confirm = ''; btn.classList.remove('is-confirm'); btn.textContent = 'Void'; } }, 4000);
      return;
    }
    busy(btn, true, 'Voiding');
    try {
      await api(`/finance/transactions/${encodeURIComponent(x.id)}/void`, { method: 'POST' });
      toast(x.invoice_id ? `Voided. Invoice ${x.invoice_number || ''} is unpaid again.` : 'Voided. It no longer counts in any total.');
      load(true);
    } catch (e) {
      busy(btn, false);
      if (e.code !== 'session_expired') toast(`Not voided. ${e.message}`, 'error');
    }
  }
  $('#tx-kind').addEventListener('change', (ev) => { f.kind = ev.target.value; fillCats(); f.page = 1; load(); });
  $('#tx-cat').addEventListener('change', (ev) => { f.category = ev.target.value; f.page = 1; load(); });
  $('#tx-void').addEventListener('change', (ev) => { f.voids = ev.target.checked; f.page = 1; load(); });
  let deb = 0;
  $('#tx-q').addEventListener('input', (ev) => { clearTimeout(deb); deb = setTimeout(() => { f.q = ev.target.value.trim(); f.page = 1; load(); }, 300); });
  $('#tx-export').addEventListener('click', (ev) => downloadCsv(ev.currentTarget, `/finance/transactions.csv?${query()}`, `built-transactions-${st.per.from}-to-${st.per.to}.csv`, `Downloaded ${plural(f.total, 'entry', 'entries')}.`));
  load();
  return { period: () => { f.page = 1; load(); }, reload: () => load(true) };
}

/** Add (x null) or edit a transaction in the drawer. */
async function openTxForm(x, after) {
  const editing = !!x;
  const linked = editing && !!x.invoice_id;
  const kind0 = x ? x.kind : 'expense';
  openDrawer(drawerSkeleton(editing ? 'Edit transaction' : 'Add transaction'));
  let custs = [];
  try { custs = await customerOptions(); } catch { custs = []; }
  if (!drawer) return;
  fillDrawer(`${drawerHead(editing ? 'Edit transaction' : 'Add transaction', linked ? `Payment for invoice ${esc(x.invoice_number || '')}. Its kind, amount and customer follow the invoice.` : 'Record money in or out. Amounts in USD.')}
    <form class="dbody dform" id="tx-form" novalidate>
      <fieldset class="seg seg--block" id="txf-kind"${linked ? ' disabled' : ''}><legend class="sr">Kind</legend>${['expense', 'income'].map((k) => `<label><input type="radio" name="txf-kind" value="${k}"${k === kind0 ? ' checked' : ''}><span>${k === 'income' ? 'Money in' : 'Money out'}</span></label>`).join('')}</fieldset>
      <div class="fgrid">
        <div class="field"><label for="txf-amount">Amount in USD</label><div class="money-in"><span aria-hidden="true">$</span><input id="txf-amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(x ? dollarsField(x.amount_cents) : '')}"${linked ? ' disabled' : ''} data-autofocus></div></div>
        <div class="field"><label for="txf-date">Date</label><input id="txf-date" type="date" value="${esc(x ? x.occurred_on : todayYmd())}"></div>
        <div class="field"><label for="txf-cat">Category</label><select id="txf-cat"></select></div>
        <div class="field"><label for="txf-cust">Customer</label>${customerSelect('txf-cust', custs, x ? x.customer_id : '')}</div>
        <div class="field fgrid__full"><label for="txf-desc">Description</label><input id="txf-desc" maxlength="300" autocomplete="off" placeholder="What it was for" value="${esc(x ? x.description : '')}"></div>
      </div>
      <div class="alert" role="alert" hidden></div>
      <div class="dform__foot"><button type="button" class="btn btn-secondary btn-sm" data-close>Cancel</button><button type="submit" class="btn btn-primary btn-sm" id="txf-save">${editing ? 'Save changes' : `${icon('plus')}Add`}</button></div>
    </form>`);
  if (linked) $('#txf-cust').disabled = true;
  const kindNow = () => (($('#txf-kind input:checked') || {}).value) || kind0;
  const fill = () => {
    const k = kindNow(); const cur = $('#txf-cat').value || (x ? x.category : '');
    $('#txf-cat').innerHTML = TX_CATS[k].map((c) => `<option value="${c}"${c === cur ? ' selected' : ''}>${esc(label('txCat', c))}</option>`).join('');
  };
  fill();
  $('#txf-kind').addEventListener('change', fill);
  setTimeout(() => { const a = $(linked ? '#txf-date' : '#txf-amount'); if (a) a.focus(); }, 80);
  $('#tx-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget;
    const amount = parseMoney($('#txf-amount').value);
    if (!linked && (amount == null || Number.isNaN(amount) || amount <= 0)) { fieldError(form, $('#txf-amount'), 'Enter the amount in dollars, like 25 or 12.50.'); return; }
    const date = $('#txf-date').value;
    if (!realYmd(date)) { fieldError(form, $('#txf-date'), 'Pick the date it happened.'); return; }
    fieldError(form, null, '');
    const body = { category: $('#txf-cat').value, occurred_on: date, description: $('#txf-desc').value.trim() };
    if (!linked) Object.assign(body, { kind: kindNow(), amount_cents: amount, customer_id: $('#txf-cust').value || null });
    const btn = $('#txf-save'); busy(btn, true, 'Saving');
    try {
      await api(editing ? `/finance/transactions/${encodeURIComponent(x.id)}` : '/finance/transactions', { method: 'POST', body });
      toast(editing ? 'Changes saved.' : `${body.kind === 'income' ? 'Income' : 'Expense'} of ${money(amount)} added.`);
      closeDrawer();
      if (after) after();
    } catch (e) {
      busy(btn, false);
      if (e.code !== 'session_expired') fieldError(form, null, `Not saved. ${e.message}`);
    }
  });
}

function financeInvoices(params, s) {
  const f = { status: L.invFilter[params.get('status')] ? params.get('status') : 'all', q: (params.get('q') || '').slice(0, 120), page: Math.max(1, parseInt(params.get('page') || '1', 10) || 1), total: 0 };
  const body = $('#f-body');
  body.innerHTML = `<div class="toolbar">
      <fieldset class="seg" id="iv-seg" aria-label="Show invoices">${Object.entries(L.invFilter).map(([v, t]) => `<label><input type="radio" name="iv-st" value="${v}"${v === f.status ? ' checked' : ''}><span>${esc(t)}<span class="seg__n" data-n="${v}"></span></span></label>`).join('')}</fieldset>
      <div class="search"><label class="sr" for="iv-q">Search invoices</label>${icon('search')}<input class="input" id="iv-q" type="search" placeholder="Search number or customer" autocomplete="off" maxlength="120" value="${esc(f.q)}"></div>
    </div>
    <div id="iv-list"></div>`;
  const writeHash = () => {
    const p = new URLSearchParams();
    if (f.status !== 'all') p.set('status', f.status);
    if (f.q) p.set('q', f.q);
    if (f.page > 1) p.set('page', String(f.page));
    const h = `#/finance/invoices${p.toString() ? `?${p}` : ''}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  };
  let reqId = 0;
  async function load() {
    writeHash();
    const my = ++reqId;
    const list = $('#iv-list');
    list.setAttribute('aria-busy', 'true'); list.innerHTML = `<div class="list">${skLines(6)}</div>`;
    try {
      const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((f.page - 1) * PAGE_SIZE) });
      if (f.status !== 'all') p.set('status', f.status);
      if (f.q) p.set('q', f.q);
      const d = await api(`/finance/invoices?${p}`);
      if (s !== seq || my !== reqId) return;
      list.removeAttribute('aria-busy');
      f.total = d.total || 0;
      const bs = d.by_status || {};
      $$('#iv-seg [data-n]').forEach((x) => {
        const k = x.dataset.n;
        const c = k === 'all' ? ['draft', 'sent', 'paid', 'void'].reduce((a, b) => a + ((bs[b] || {}).count || 0), 0) : ((bs[k] || {}).count || 0);
        x.textContent = c ? String(c) : '';
      });
      if (!d.rows.length) {
        list.innerHTML = f.status === 'all' && !f.q
          ? emptyBlock('No invoices yet.', 'Create one for a customer. When you mark it paid, the payment is added to income for you.', `<a class="btn btn-primary btn-sm" href="#/finance/invoices/new">${icon('plus')}New invoice</a>`)
          : emptyBlock('No invoices here.', f.q ? 'Try a shorter search.' : 'Pick another status above to see the rest.');
        return;
      }
      list.innerHTML = `<div class="list ilist">
        <div class="list__head irow" aria-hidden="true"><span>Invoice</span><span>Customer</span><span class="irow__hide">Issued</span><span>Due</span><span class="r">Total</span><span>Status</span></div>
        ${d.rows.map((i) => `<a class="irow" href="#/finance/invoices/${encodeURIComponent(i.id)}">
          <span class="irow__num num">${esc(i.number)}</span>
          <span class="urow__cell irow__cust">${esc(i.customer_name || 'Customer')}</span>
          <span class="urow__cell irow__hide">${esc(fDayLong(i.issued_on))}</span>
          <span class="urow__cell${i.overdue ? ' is-warn' : ''}">${esc(i.status === 'paid' ? `Paid ${fDay(i.paid_on)}` : i.status === 'void' ? '' : (i.due_on ? fDayLong(i.due_on) : 'On receipt'))}</span>
          <span class="irow__total num r">${esc(money(i.total_cents))}</span>
          <span>${invChip(i)}</span>
        </a>`).join('')}
      </div>${pagerHtml(f.total, f.page)}`;
      $$('[data-page]', list).forEach((b) => b.addEventListener('click', () => { f.page = Number(b.dataset.page); load(); }));
    } catch (e) {
      if (s !== seq || my !== reqId) return;
      list.removeAttribute('aria-busy');
      showError(list, e, load);
    }
  }
  $('#iv-seg').addEventListener('change', (ev) => { f.status = ev.target.value; f.page = 1; load(); });
  let deb = 0;
  $('#iv-q').addEventListener('input', (ev) => { clearTimeout(deb); deb = setTimeout(() => { f.q = ev.target.value.trim(); f.page = 1; load(); }, 300); });
  load();
  return { period() {}, reload: load };
}

/* Invoice editor: drafts are editable; sent, paid and void invoices are read-only. */
function renderInvoice(id, params, s) {
  const isNew = id === 'new';
  setTitle(isNew ? 'New invoice' : 'Invoice');
  const el = main();
  el.innerHTML = `<a class="back" href="#/finance/invoices">${icon('left')}Invoices</a>
    <div id="iv-body" aria-busy="true"><div class="head"><div><div class="sk" data-sk="t"></div></div></div><div class="inv"><div class="card">${skLines(5, 'sk--dark')}</div><div>${skLines(3)}</div></div></div>`;
  $$('[data-sk="t"]', el).forEach((x) => { x.style.height = '40px'; x.style.width = 'min(320px, 70vw)'; });
  load();

  async function load() {
    const body = $('#iv-body');
    try {
      const [d, custs] = await Promise.all([
        isNew ? Promise.resolve(null) : api(`/finance/invoices/${encodeURIComponent(id)}`),
        customerOptions(true),
      ]);
      if (s !== seq) return;
      body.removeAttribute('aria-busy');
      draw(d, custs);
    } catch (e) {
      if (s !== seq) return;
      body.removeAttribute('aria-busy');
      if (e.status === 404 || e.status === 400) { body.innerHTML = emptyBlock('No invoice with that id.', 'The link may be old.', '<a class="btn btn-secondary btn-sm" href="#/finance/invoices">All invoices</a>'); return; }
      showError(body, e, load);
    }
  }

  function draw(d, custs) {
    const inv = d ? d.invoice : { status: 'draft', lines: [], issued_on: todayYmd(), due_on: addDays(todayYmd(), 14), notes: '', customer_id: params.get('customer') || '' };
    const pre = !d && inv.customer_id ? custs.find((c) => c.id === inv.customer_id) : null;
    if (pre && pre.plan && pre.price_cents != null) inv.lines = [{ description: `BUILT ${label('plan', pre.plan).toLowerCase()} plan`, qty: 1, unit_cents: pre.price_cents }];
    if (!inv.lines.length) inv.lines = [{ description: '', qty: 1, unit_cents: null }];
    const draft = inv.status === 'draft';
    const dis = draft ? '' : ' disabled';
    const body = $('#iv-body');
    if (d) setTitle(inv.number);
    const pay = d && d.payment;
    body.innerHTML = `<div class="head">
        <div><h1 tabindex="-1">${esc(d ? inv.number : 'New invoice')}</h1>
          <p class="head__meta">${d ? `${invChip(inv)} <span>${esc(customerName(d.customer))}</span>` : 'Fill in the customer and the lines. The total is worked out for you.'}</p></div>
        ${d ? `<div class="head__actions"><button type="button" class="btn btn-secondary btn-sm" id="iv-print">${icon('print')}Open printable</button></div>` : ''}
      </div>
      <div class="inv">
        <form class="card inv__form" id="iv-form" novalidate>
          ${draft ? '' : `<p class="notice">${inv.status === 'void' ? 'This invoice is void. It stays on file and counts nowhere.' : 'Only drafts can be edited. To change this one, void it and create a new invoice.'}</p>`}
          <div class="fgrid fgrid--3">
            <div class="field fgrid__wide"><label for="iv-cust">Customer</label>${custs.length || inv.customer_id ? customerSelect('iv-cust', custs, inv.customer_id, 'Pick a customer') : '<p class="sec-sub">No customers yet. <a class="link" href="#/customers/new">Add one first</a>.</p>'}</div>
            <div class="field"><label for="iv-issued">Issued on</label><input id="iv-issued" type="date" value="${esc(inv.issued_on || '')}"${dis}></div>
            <div class="field"><label for="iv-due">Due on</label><input id="iv-due" type="date" value="${esc(inv.due_on || '')}"${dis}></div>
          </div>
          <fieldset class="lines">
            <legend class="sec-title">Lines</legend>
            <div class="line line--head" aria-hidden="true"><span>Description</span><span>Qty</span><span>Unit price</span><span class="r">Amount</span><span></span></div>
            <div id="iv-lines">${inv.lines.map((l, i) => lineHtml(l, i, draft)).join('')}</div>
            ${draft ? `<button type="button" class="btn btn-ghost btn-sm" id="iv-add">${icon('plus')}Add line</button>` : ''}
          </fieldset>
          <div class="inv__total"><span>Total</span><output class="num" id="iv-total" aria-live="polite">${esc(money(inv.total_cents || 0))}</output></div>
          <div class="field"><label for="iv-notes">Notes on the invoice</label><textarea id="iv-notes" maxlength="2000" placeholder="Payment details or a thank-you line"${dis}>${esc(inv.notes || '')}</textarea></div>
          <div class="alert" role="alert" hidden></div>
          ${draft ? `<div class="dform__foot"><span class="field__hint" id="iv-state" aria-live="polite">${d ? 'Everything is saved.' : 'Not saved yet.'}</span><button type="submit" class="btn btn-primary" id="iv-save">${d ? 'Save draft' : 'Create draft'}</button></div>` : ''}
        </form>
        ${d ? `<aside class="inv__side" aria-labelledby="iv-side-t">
          <h2 class="sec-title" id="iv-side-t">Status</h2>
          <ol class="steps">
            ${['draft', 'sent', 'paid'].map((k) => `<li class="steps__i${stepDone(inv.status, k) ? ' is-done' : ''}${inv.status === k ? ' is-now' : ''}"><span class="steps__dot" aria-hidden="true"></span><span>${esc(k === 'draft' ? 'Draft' : k === 'sent' ? 'Sent to the customer' : 'Paid')}</span>${inv.status === k ? '<span class="sr"> (current)</span>' : ''}</li>`).join('')}
          </ol>
          ${inv.status === 'void' ? '<p class="sec-sub">Void. Nothing more to do.</p>' : ''}
          ${inv.overdue ? `<p class="flag flag--warn">Past the due date, ${esc(fDayLong(inv.due_on))}</p>` : ''}
          ${pay ? `<p class="sec-sub">Payment of ${esc(money(pay.amount_cents))} recorded on ${esc(fDayLong(pay.occurred_on))}. <a class="link" href="#/finance/transactions?period=custom&amp;from=${esc(pay.occurred_on)}&amp;to=${esc(pay.occurred_on)}">See it</a></p>` : ''}
          <div class="inv__acts">
            ${inv.status === 'draft' ? `<button type="button" class="btn btn-secondary btn-block" data-st="sent">${icon('send')}Mark sent</button>` : ''}
            ${inv.status === 'draft' || inv.status === 'sent' ? `<div class="paybox" id="iv-paybox" hidden><div class="field"><label for="iv-paid-on">Paid on</label><input id="iv-paid-on" type="date" value="${esc(todayYmd())}"></div><button type="button" class="btn btn-primary btn-block" id="iv-pay-go">${icon('check')}Record payment of ${esc(money(inv.total_cents))}</button></div>
              <button type="button" class="btn btn-secondary btn-block" id="iv-pay" aria-expanded="false" aria-controls="iv-paybox">${icon('check')}Mark paid</button>` : ''}
            ${inv.status === 'paid' ? `<button type="button" class="btn btn-secondary btn-block" data-st="sent">Set back to unpaid</button>` : ''}
            ${inv.status !== 'void' ? `<button type="button" class="btn btn-ghost btn-block" data-st="void">Void invoice</button>` : ''}
          </div>
          <p class="field__hint">${inv.status === 'paid' ? 'Setting it back to unpaid, or voiding it, voids its payment too.' : 'Marking it paid adds the payment to income once.'}</p>
        </aside>` : ''}
      </div>`;
    const form = $('#iv-form');
    const recompute = () => {
      let total = 0; let bad = false;
      $$('.line[data-i]', form).forEach((row) => {
        const qty = Number($('[data-k="qty"]', row).value);
        const unit = parseMoney($('[data-k="unit"]', row).value);
        const ok = Number.isInteger(qty) && qty >= 1 && unit != null && !Number.isNaN(unit);
        $('.line__amt', row).textContent = ok ? money(qty * unit) : '';
        if (ok) total += qty * unit; else if ($('[data-k="desc"]', row).value.trim() || $('[data-k="unit"]', row).value.trim()) bad = true;
      });
      $('#iv-total').textContent = money(total);
      return { total, bad };
    };
    if (draft) recompute();
    const dirty = () => { form.dataset.dirty = '1'; const st2 = $('#iv-state'); if (st2) st2.textContent = 'Unsaved changes.'; };
    form.addEventListener('input', (ev) => { if (ev.target.closest('.line')) recompute(); dirty(); });
    form.addEventListener('change', dirty);
    form.addEventListener('click', (ev) => {
      const rm = ev.target.closest('[data-rm]');
      if (!rm) return;
      const rows = $$('.line[data-i]', form);
      const row = rm.closest('.line');
      if (rows.length === 1) { $$('input', row).forEach((x) => { x.value = x.dataset.k === 'qty' ? '1' : ''; }); }
      else { const idx = rows.indexOf(row); row.remove(); const next = $$('.line[data-i]', form)[Math.max(0, idx - 1)]; if (next) $('[data-k="desc"]', next).focus(); }
      renumber(); recompute(); dirty();
    });
    const renumber = () => $$('.line[data-i]', form).forEach((row, i) => {
      row.dataset.i = String(i);
      $$('label', row).forEach((lb) => { lb.htmlFor = lb.htmlFor.replace(/-\d+$/, `-${i}`); lb.textContent = lb.textContent.replace(/line \d+/, `line ${i + 1}`); });
      $$('input', row).forEach((x) => { x.id = x.id.replace(/-\d+$/, `-${i}`); });
      const b = $('[data-rm]', row); if (b) b.setAttribute('aria-label', `Remove line ${i + 1}`);
    });
    const add = $('#iv-add');
    if (add) add.addEventListener('click', () => {
      const i = $$('.line[data-i]', form).length;
      if (i >= 50) { toast('An invoice can have 50 lines at most.', 'error'); return; }
      $('#iv-lines').insertAdjacentHTML('beforeend', lineHtml({ description: '', qty: 1, unit_cents: null }, i, true));
      $(`#ivl-desc-${i}`).focus();
      dirty();
    });

    const collect = () => {
      const cust = $('#iv-cust') ? $('#iv-cust').value : '';
      if (!cust) { fieldError(form, $('#iv-cust'), 'Pick the customer this invoice is for.'); return null; }
      const issued = $('#iv-issued').value; const due = $('#iv-due').value;
      if (!realYmd(issued)) { fieldError(form, $('#iv-issued'), 'Pick the issue date.'); return null; }
      if (due && due < issued) { fieldError(form, $('#iv-due'), 'The due date must be on or after the issue date.'); return null; }
      const lines = [];
      for (const row of $$('.line[data-i]', form)) {
        const desc = $('[data-k="desc"]', row); const qty = $('[data-k="qty"]', row); const unit = $('[data-k="unit"]', row);
        const empty = !desc.value.trim() && !unit.value.trim();
        if (empty && $$('.line[data-i]', form).length > 1) continue;
        if (!desc.value.trim()) { fieldError(form, desc, 'Describe each line, like Monthly plan, October.'); return null; }
        const q = Number(qty.value);
        if (!Number.isInteger(q) || q < 1 || q > 10000) { fieldError(form, qty, 'The quantity must be a whole number from 1 to 10,000.'); return null; }
        const u = parseMoney(unit.value);
        if (u == null || Number.isNaN(u)) { fieldError(form, unit, 'Enter the unit price in dollars, like 30 or 12.50.'); return null; }
        lines.push({ description: desc.value.trim(), qty: q, unit_cents: u });
      }
      fieldError(form, null, '');
      return { customer_id: cust, issued_on: issued, due_on: due || null, notes: $('#iv-notes').value.trim(), lines };
    };
    const save = async (quietToast = false) => {
      const payload = collect();
      if (!payload) return null;
      const btn = $('#iv-save'); busy(btn, true, 'Saving');
      try {
        const r = await api(d ? `/finance/invoices/${encodeURIComponent(inv.id)}` : '/finance/invoices', { method: 'POST', body: payload });
        if (!quietToast) toast(d ? 'Draft saved.' : `Draft ${r.invoice.number} created.`);
        if (!d) { history.replaceState(null, '', `#/finance/invoices/${encodeURIComponent(r.invoice.id)}`); id = r.invoice.id; }
        return r;
      } catch (e) {
        busy(btn, false);
        if (e.code !== 'session_expired') fieldError(form, null, `Not saved. ${e.message}`);
        return null;
      }
    };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!draft) return;
      const r = await save();
      if (r) { draw(r, custs); const h = $('#iv-body h1'); if (h) h.focus({ preventScroll: true }); }
    });

    const setStatus = async (btn, status, paidOn) => {
      if (status === 'void' && btn.dataset.confirm !== '1') {
        btn.dataset.confirm = '1'; btn.classList.add('is-confirm'); btn.textContent = 'Yes, void it';
        setTimeout(() => { if (document.body.contains(btn) && btn.dataset.confirm === '1') { btn.dataset.confirm = ''; btn.classList.remove('is-confirm'); btn.textContent = 'Void invoice'; } }, 5000);
        return;
      }
      if (draft && form.dataset.dirty === '1') { const r = await save(true); if (!r) return; }
      busy(btn, true, 'Saving');
      try {
        const r = await api(`/finance/invoices/${encodeURIComponent(id)}/status`, { method: 'POST', body: paidOn ? { status, paid_on: paidOn } : { status } });
        toast(status === 'paid' ? `Marked paid. ${money(r.invoice.total_cents)} added to income.` : status === 'void' ? 'Invoice voided.' : inv.status === 'paid' ? 'Set back to unpaid. Its payment is void.' : 'Marked sent.');
        draw(r, custs);
        const h = $('#iv-body h1'); if (h) h.focus({ preventScroll: true });
      } catch (e) {
        busy(btn, false);
        if (e.code !== 'session_expired') toast(`The status didn't change. ${e.message}`, 'error');
      }
    };
    $$('[data-st]', body).forEach((b) => b.addEventListener('click', () => setStatus(b, b.dataset.st)));
    const payBtn = $('#iv-pay');
    if (payBtn) payBtn.addEventListener('click', () => {
      const box = $('#iv-paybox'); const open = box.hidden;
      box.hidden = !open; payBtn.setAttribute('aria-expanded', String(open));
      payBtn.hidden = open;
      if (open) $('#iv-paid-on').focus();
    });
    const payGo = $('#iv-pay-go');
    if (payGo) payGo.addEventListener('click', () => {
      const day = $('#iv-paid-on').value;
      if (!realYmd(day)) { toast('Pick the day it was paid.', 'error'); $('#iv-paid-on').focus(); return; }
      setStatus(payGo, 'paid', day);
    });
    const pr = $('#iv-print');
    if (pr) pr.addEventListener('click', () => openPrintable(id, pr));
  }
}
function stepDone(status, k) {
  const order = { draft: 0, sent: 1, paid: 2 };
  if (status === 'void') return k === 'draft';
  return order[k] <= order[status];
}
function lineHtml(l, i, editable) {
  const dis = editable ? '' : ' disabled';
  const amt = l.unit_cents != null && l.qty ? money(l.qty * l.unit_cents) : '';
  return `<div class="line" data-i="${i}">
    <div class="field line__desc"><label class="line__lab" for="ivl-desc-${i}">Description, line ${i + 1}</label><input id="ivl-desc-${i}" data-k="desc" maxlength="200" autocomplete="off" placeholder="Monthly plan, October" value="${esc(l.description || '')}"${dis}></div>
    <div class="field line__qty"><label class="line__lab" for="ivl-qty-${i}">Quantity, line ${i + 1}</label><input id="ivl-qty-${i}" data-k="qty" type="number" inputmode="numeric" min="1" max="10000" step="1" value="${esc(l.qty || 1)}"${dis}></div>
    <div class="field line__unit"><label class="line__lab" for="ivl-unit-${i}">Unit price, line ${i + 1}</label><div class="money-in"><span aria-hidden="true">$</span><input id="ivl-unit-${i}" data-k="unit" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(dollarsField(l.unit_cents))}"${dis}></div></div>
    <span class="line__amt num r">${esc(amt)}</span>
    ${editable ? `<button type="button" class="icon-btn line__rm" data-rm aria-label="Remove line ${i + 1}">${icon('close')}</button>` : '<span></span>'}
  </div>`;
}

/** Opens the printable invoice in a new tab (fetched with the session token, shown as a blob). */
async function openPrintable(id, btn) {
  const w = window.open('', '_blank');
  if (!w) { toast('Your browser blocked the new tab. Allow pop-ups for this page, then try again.', 'error'); return; }
  try { w.document.title = 'Preparing the invoice'; w.document.body.textContent = 'Preparing the invoice.'; } catch { /* not reachable */ }
  busy(btn, true, 'Opening');
  try {
    const res = await api(`/finance/invoices/${encodeURIComponent(id)}.html`, { raw: true });
    const html = await res.text();
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    w.location.replace(url);
    let tries = 0;
    const wire = setInterval(() => {
      tries += 1;
      try {
        const b = !w.closed && w.document.readyState === 'complete' && w.document.getElementById('print');
        if (b && !b.dataset.bound) { b.dataset.bound = '1'; b.hidden = false; b.addEventListener('click', () => w.print()); clearInterval(wire); }
      } catch { /* still loading */ }
      if (tries > 80 || w.closed) clearInterval(wire);
    }, 100);
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    try { w.close(); } catch { /* ignore */ }
    if (e.code !== 'session_expired') toast(`The invoice didn't open. ${e.message}`, 'error');
  } finally {
    busy(btn, false);
  }
}

/* ------------------------------------------------------------------ */
/* Overview: business row                                              */
/* ------------------------------------------------------------------ */

async function loadBusiness(s) {
  const box = $('#ov-biz');
  if (!box) return;
  try {
    const d = await api('/finance/summary');
    if (s !== seq || !document.body.contains(box)) return;
    const ab = d.active_by_plan || {};
    const active = (ab.monthly || 0) + (ab.quarterly || 0) + (ab.yearly || 0) + (ab.none || 0);
    const tk = d.tasks || {};
    const chev = icon('right', 'ico need__go');
    box.removeAttribute('aria-busy');
    box.innerHTML = `<h2 class="sec-title biz__title" id="ov-biz-t">Business</h2>
      <a class="biz__item biz__item--lead" href="#/finance"><span class="biz__label">Monthly recurring revenue</span><span class="biz__value num">${esc(money(d.mrr_cents))}</span><span class="biz__sub">${active ? `${plural(active, 'active customer', 'active customers')}` : 'No active customers yet'}</span>${chev}</a>
      <a class="biz__item" href="#/finance"><span class="biz__label">Profit this month</span><span class="biz__value num${(d.profit_cents || 0) < 0 ? ' is-neg' : ''}">${esc(moneySigned(d.profit_cents || 0))}</span><span class="biz__sub">${esc(money(d.income_cents))} in, ${esc(money(d.expense_cents))} out</span>${chev}</a>
      <a class="biz__item" href="#/customers?view=tasks"><span class="biz__label">Tasks due today</span><span class="biz__value num${tk.overdue ? ' is-warn' : ''}">${n(tk.due_today || 0)}</span><span class="biz__sub">${tk.overdue ? `${n(tk.overdue)} overdue` : 'Nothing overdue'}</span>${chev}</a>`;
  } catch (e) {
    if (s !== seq || !document.body.contains(box)) return;
    box.removeAttribute('aria-busy');
    if (e.code === 'session_expired') return;
    box.innerHTML = `<h2 class="sec-title biz__title" id="ov-biz-t">Business</h2><p class="biz__err">${icon('alert')}<span>Money and tasks didn't load. ${esc(e.message)}</span><button type="button" class="btn btn-secondary btn-sm" id="ov-biz-retry">${icon('refresh')}Try again</button></p>`;
    $('#ov-biz-retry').addEventListener('click', () => { box.setAttribute('aria-busy', 'true'); loadBusiness(s); });
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function boot() {
  initLogin();
  $$('.js-logout').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api('/logout', { method: 'POST' }); } catch { /* sign out locally either way */ }
    b.disabled = false;
    store.clear();
    clearTimeout(expiryTimer);
    showLogin('You signed out.');
  }));
  window.addEventListener('hashchange', () => route());
  if (sessionValid()) { route(true); refreshBadge(); } else showLogin();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
