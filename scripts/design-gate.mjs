#!/usr/bin/env node
// BuiltByBrains design gate. Exits non-zero on any failure. Grows every wave, never weakens.
//
//   node scripts/design-gate.mjs                 # detector + build + serve + browser sweep
//   node scripts/design-gate.mjs --url http://localhost:3000   # sweep a running server
//   node scripts/design-gate.mjs --shots-only --url <url>       # screenshots only, no failures
//   node scripts/design-gate.mjs --routes /,/orders,/ar         # routes to sweep (default: /)
//   node scripts/design-gate.mjs --lang ar,en                   # sweep each language (adds ?lang=)
//
// Checks: (1) anti-slop detector over source, (2) forbidden strings in shipped bytes,
// (3) at 360/375/390/430/1440: no page overflow, no text cut mid-word, body contrast,
// touch targets, console errors, (4) directional-element presence on RTL routes.
// Screenshots land in shots/gate/ so a reviewer sees what the gate saw.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = process.cwd();
const WIDTHS = [360, 375, 390, 430, 1440];
const ROUTES = opt('--routes', '/').split(',').filter(Boolean);
const LANGS = opt('--lang', '').split(',').filter(Boolean);
const SHOTS_ONLY = flag('--shots-only');
const OUT = join(ROOT, 'shots', 'gate');
mkdirSync(OUT, { recursive: true });

const failures = [];
const ok = (m) => console.log(`  ok   ${m}`);
const fail = (m) => { failures.push(m); console.log(`  FAIL ${m}`); };
const warn = (m) => console.log(`  warn ${m}`);

// ---------- 1. anti-slop detector over source ----------
const here = dirname(fileURLToPath(import.meta.url));
const detectorCandidates = [
  join(ROOT, '.claude/skills/impeccable/scripts/detect.mjs'),
  join(ROOT, 'plugins/brains-design/skills/impeccable/scripts/detect.mjs'),
  join(here, '../plugins/brains-design/skills/impeccable/scripts/detect.mjs'),
];
const detector = detectorCandidates.find(existsSync);
const srcDirs = ['app', 'src', 'components', 'pages'].filter((d) => existsSync(join(ROOT, d)));
if (!detector) warn('impeccable detector not found; install the brains-design skills');
else if (srcDirs.length === 0) warn('no app/ src/ components/ dir to scan');
else {
  const r = spawnSync('node', [detector, '--json', ...srcDirs], { cwd: ROOT, encoding: 'utf8' });
  let findings = [];
  try { findings = JSON.parse(r.stdout || '[]'); } catch { warn('detector output unreadable'); }
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity !== 'error');
  for (const f of errors) fail(`detector ${f.antipattern} ${f.file}:${f.line} (${f.snippet || ''})`);
  for (const f of warnings) warn(`detector ${f.antipattern} ${f.file}:${f.line} (${f.snippet || ''})`);
  if (warnings.length > 5) fail(`detector: ${warnings.length} slop warnings in source (limit 5). Fix them or record a reviewed exception with /impeccable hooks ignore-value`);
  if (errors.length === 0 && warnings.length <= 5) ok(`detector clean enough: ${errors.length} errors, ${warnings.length} warnings`);
  writeFileSync(join(OUT, 'detector.json'), JSON.stringify(findings, null, 2));
}

// ---------- 2. forbidden strings in shipped bytes ----------
const FORBIDDEN = [
  'Claude', 'claude', 'Anthropic', 'anthropic', 'ChatGPT', 'OpenAI',
  'Hage Consulting', 'lorem', 'Lorem', 'John Doe', 'Company Name', 'Client name', 'CLIENT LOGO', 'placeholder text', '—',
];
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== 'cache') walk(p, out); }
    else out.push(p);
  }
  return out;
}
const distDir = ['out', 'dist', '.next/server/app'].map((d) => join(ROOT, d)).find(existsSync);
if (distDir) {
  const files = walk(distDir).filter((f) => /\.(html|js|css|json|txt|svg|rsc)$/.test(f));
  let hits = 0;
  for (const f of files) {
    const c = readFileSync(f, 'utf8');
    for (const bad of FORBIDDEN) if (c.includes(bad)) { hits++; fail(`forbidden "${bad}" in ${f.replace(ROOT + '/', '')}`); }
  }
  if (!hits) ok(`forbidden-string scan clean across ${files.length} shipped files`);
} else warn('no out/ dist/ or .next build found; forbidden-string scan skipped (build first)');

// ---------- 3. browser sweep ----------
let base = opt('--url', '');
let server = null;
if (!base) {
  const port = 3199;
  if (existsSync(join(ROOT, 'out'))) server = spawn('npx', ['serve', 'out', '-l', String(port)], { stdio: 'ignore' });
  else if (existsSync(join(ROOT, '.next'))) server = spawn('npx', ['next', 'start', '-p', String(port)], { stdio: 'ignore' });
  else { fail('nothing to serve: build first (next build) or pass --url'); finish(); }
  base = `http://localhost:${port}`;
  await new Promise((r) => setTimeout(r, 2500));
}

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  try { ({ chromium } = await import('playwright-core')); }
  catch { fail('playwright not installed (npm i -D playwright)'); finish(); }
}
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

const targets = [];
for (const route of ROUTES) {
  if (LANGS.length === 0) targets.push({ route, url: base + route, lang: '' });
  for (const lang of LANGS) targets.push({ route, url: base + route + (route.includes('?') ? '&' : '?') + 'lang=' + lang, lang });
}

for (const t of targets) for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 1000 ? 900 : 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const label = `${t.route.replace(/[^a-z0-9]+/gi, '_') || 'root'}${t.lang ? '-' + t.lang : ''}-${width}`;
  try {
    await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: true });
    if (SHOTS_ONLY) { await ctx.close(); continue; }

    const r = await page.evaluate(() => {
      const out = { overflow: [], cut: [], contrast: [], targets: [], dir: document.documentElement.dir, directional: 0, mirrored: 0 };
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) out.overflow.push(`PAGE ${de.scrollWidth}>${de.clientWidth}`);
      // Computed colors arrive as lab()/oklch() on Tailwind v4 apps, and a canvas fillStyle
      // keeps that notation. Paint one pixel and read the bytes back: that works for any
      // color the browser can paint, and the luminance math below only understands rgb.
      const cvs = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const toRgb = (c) => {
        if (/^rgb/.test(c)) return c;
        cvs.clearRect(0, 0, 1, 1); cvs.fillStyle = c; cvs.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = cvs.getImageData(0, 0, 1, 1).data;
        return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
      };
      const parse = (c) => { const m = toRgb(c).match(/[\d.]+/g); if (!m) return null; const [r, g, b, a] = m.map(Number); return { r, g, b, a: a === undefined ? 1 : a }; };
      const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      const lumOf = ({ r, g, b }) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      // Composite translucent backgrounds (bg-white/10 and friends) over their ancestors
      // until the stack is opaque; a 10% white chip on black is near-black, not white.
      const bgColorOf = (el) => {
        let acc = null;
        while (el) {
          const c = parse(getComputedStyle(el).backgroundColor);
          if (c && c.a > 0) { acc = acc ? over(acc, c) : c; if (acc.a >= 0.999) return acc; }
          el = el.parentElement;
        }
        const white = { r: 255, g: 255, b: 255, a: 1 };
        return acc ? over(acc, white) : white;
      };
      for (const el of document.querySelectorAll('body *')) {
        if (el instanceof SVGElement || el.tagName === 'OPTION') continue;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
        const srOnly = el.clientWidth <= 1 && el.clientHeight <= 1; // screen-reader-only labels
        if (own && !srOnly) {
          if (!/auto|scroll/.test(st.overflowX) && st.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
            out.cut.push(`<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
          const fs = parseFloat(st.fontSize); const bold = parseInt(st.fontWeight) >= 700;
          const large = fs >= 24 || (fs >= 18.66 && bold);
          const bg = bgColorOf(el); const fg = parse(st.color);
          if (fg && fg.a > 0 && el.textContent.trim().length > 2) {
            const l1 = lumOf(fg.a < 1 ? over(fg, bg) : fg); const l2 = lumOf(bg);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            const need = large ? 3 : 4.5;
            if (ratio < need && ratio > 1.05) out.contrast.push(`<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}:1 < ${need}`);
          }
        }
        if (/^(BUTTON|A)$/.test(el.tagName) || el.getAttribute('role') === 'button') {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && b.height > 0 && (b.height < 40 || b.width < 40) && b.width < 200)
            out.targets.push(`<${el.tagName.toLowerCase()}> "${el.textContent.trim().slice(0, 20) || el.getAttribute('aria-label') || ''}" ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
        if (el.classList.contains('mirror-rtl') || /chevron|arrow/i.test(el.getAttribute('data-icon') || el.getAttribute('aria-label') || '')) {
          out.directional++;
          if (st.transform && st.transform !== 'none') out.mirrored++;
        }
      }
      return out;
    });
    const tag = `${t.route}${t.lang ? ' [' + t.lang + ']' : ''} @${width}`;
    if (r.overflow.length) fail(`${tag} horizontal page scroll: ${r.overflow[0]}`);
    for (const c of r.cut.slice(0, 5)) fail(`${tag} text cut: ${c}`);
    for (const c of r.contrast.slice(0, 5)) fail(`${tag} contrast: ${c}`);
    if (r.targets.length && width < 1000) for (const c of r.targets.slice(0, 3)) fail(`${tag} touch target under 40px: ${c}`);
    for (const e of errors.slice(0, 3)) fail(`${tag} console error: ${e.slice(0, 120)}`);
    if (t.lang === 'ar' && r.dir !== 'rtl') fail(`${tag} document dir is "${r.dir}", expected rtl`);
    if (t.lang === 'ar' && r.directional && r.mirrored < r.directional) fail(`${tag} ${r.directional - r.mirrored} directional icon(s) not mirrored (add .mirror-rtl)`);
    if (!r.overflow.length && !r.cut.length && !r.contrast.length && !errors.length) ok(`${tag} clean`);
  } catch (e) {
    fail(`${t.url} @${width} did not load: ${String(e).slice(0, 120)}`);
  }
  await ctx.close();
}
await browser.close();
finish();

function finish() {
  if (server) server.kill();
  const summary = { date: new Date().toISOString(), failures, widths: WIDTHS, routes: ROUTES, langs: LANGS };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  if (SHOTS_ONLY) { console.log(`\nshots written to shots/gate/`); process.exit(0); }
  console.log(failures.length ? `\nDESIGN GATE FAILED: ${failures.length} failure(s)` : '\nDESIGN GATE PASSED');
  process.exit(failures.length ? 1 : 0);
}
