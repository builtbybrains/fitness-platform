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
const TITLES = { overview: 'Overview', users: 'Users', reports: 'Reports' };

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
  if (view === 'reports' && current.view === 'reports' && current.ctl && document.body.contains(current.ctl.root)) {
    current.ctl.update(params, parts[1] || '');
    return;
  }
  closeSheet();
  const s = ++seq;
  current = { view, ctl: null };
  if (view === 'users' && parts[1]) renderUser(parts[1], s);
  else if (view === 'users') current.ctl = renderUsers(params, s);
  else if (view === 'reports') current.ctl = renderReports(params, parts[1] || '', s);
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
    <div id="ov-body">
      <div class="ov" aria-busy="true">
        <div class="ov__members"><div class="sk sk--dark" data-sk="hero"></div><div class="sk sk--dark" data-sk="bars"></div></div>
        <div class="ov__needs">${skLines(4)}</div>
      </div>
    </div>`;
  $$('[data-sk="hero"]', el).forEach((x) => { x.style.height = '96px'; x.style.width = '60%'; });
  $$('[data-sk="bars"]', el).forEach((x) => { x.style.height = '160px'; });
  $('#ov-refresh').addEventListener('click', () => loadOverview(s, true));
  loadOverview(s, false);
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
