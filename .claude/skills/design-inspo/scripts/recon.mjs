#!/usr/bin/env node
// design-inspo recon: photograph a reference site and read its code.
//   node recon.mjs <url> [<url> ...]   → research/inspo/<host>-390.png, -1440.png, recon.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Behind the cloud proxy, fetch() only honours HTTPS_PROXY when NODE_USE_ENV_PROXY=1 is set
// before Node starts. Re-run ourselves with it so the static read works without ceremony.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
  process.exit(r.status ?? 1);
}

const urls = process.argv.slice(2).filter((a) => /^https?:/.test(a));
if (!urls.length) { console.error('usage: node recon.mjs <url> [<url> ...]'); process.exit(2); }
const OUT = join(process.cwd(), 'research', 'inspo');
mkdirSync(OUT, { recursive: true });
const jsonPath = join(OUT, 'recon.json');
const all = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : {};

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { try { ({ chromium } = await import('playwright-core')); } catch { console.error('install playwright or playwright-core'); process.exit(2); } }
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'].find(existsSync);
// Cloud containers reach the web through HTTPS_PROXY; Chromium ignores that env, so pass it.
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), ...(proxy ? { proxy: { server: proxy } } : {}) });

const LIBS = { 'framer-motion': /framer-motion|motion\/react|__framer/i, gsap: /gsap|greensock/i, lenis: /lenis/i, three: /three\.module|THREE\./, lottie: /lottie/i, tailwind: /--tw-|tailwind/i, radix: /radix-ui|data-radix/i, 'base-ui': /base-ui|data-base-ui/i, 'react-spring': /react-spring/i, swiper: /swiper/i, splide: /splide/i, spline: /spline/i, webgl: /webgl|shader/i };

// Static read for hosts the container's browser cannot tunnel to (the cloud proxy closes
// Chromium's TLS tunnels; plain fetch through it works). No screenshot, but fonts, palette,
// radii, shadows and libraries still come out of the CSS and JS.
async function staticRecon(url) {
  const html = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36' } })).text();
  const base = new URL(url);
  const links = [...html.matchAll(/<link[^>]+href=["']([^"']+\.css[^"']*)["']/gi)].map((m) => m[1]);
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 12);
  const grab = async (u) => { try { return await (await fetch(new URL(u, base).href)).text(); } catch { return ''; } };
  const css = (await Promise.all(links.map(grab))).join('\n') + [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const js = (await Promise.all(scripts.map(grab))).join('\n');
  const count = (re, text) => { const o = {}; for (const m of text.matchAll(re)) { const k = m[1].trim(); o[k] = (o[k] || 0) + 1; } return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k]) => k); };
  const fonts = [...new Set([...count(/font-family:\s*([^;}{]+)/gi, css).map((f) => f.split(',')[0].replace(/["']/g, '').trim()), ...count(/@font-face[^}]*font-family:\s*["']?([^;"'}]+)/gi, css)])].filter((f) => !/^(inherit|initial|var\()/.test(f)).slice(0, 8);
  const palette = count(/(#[0-9a-f]{6}\b|oklch\([^)]+\)|rgb\([^)]+\))/gi, css).slice(0, 10);
  const radii = count(/border-radius:\s*([^;}]+)/gi, css).slice(0, 5);
  const shadows = count(/box-shadow:\s*([^;}]{0,80})/gi, css).slice(0, 3);
  const scale = count(/font-size:\s*([^;}]+)/gi, css).slice(0, 8);
  const blob = html + css + js;
  const libs = Object.entries(LIBS).filter(([, re]) => re.test(blob)).map(([k]) => k);
  return { mode: 'static', fonts, palette, radii, shadows, fontSizesSeen: scale, libs, title: (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '', cssFiles: links.length, scripts: scripts.length };
}

for (const url of urls) {
  const host = new URL(url).host.replace(/^www\./, '');
  const rec = { url, date: new Date().toISOString().slice(0, 10), libs: [], shots: {} };
  const bundles = [];
  for (const width of [1440, 390]) {
    if (rec.static) break; // the browser cannot reach this host; the static read stands
    const ctx = await browser.newContext({ ignoreHTTPSErrors: !!proxy, viewport: { width, height: width > 1000 ? 900 : 844 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36' });
    const page = await ctx.newPage();
    page.on('response', async (r) => { try { const t = r.headers()['content-type'] || ''; if (/javascript|css/.test(t) && bundles.length < 40) bundles.push(await r.text()); } catch {} });
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1200);
      // scroll once so lazy sections and scroll-triggered motion mount
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } window.scrollTo(0, 0); });
      await page.waitForTimeout(600);
      const shot = join(OUT, `${host}-${width}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      rec.shots[width] = shot.replace(process.cwd() + '/', '');
      const r = await page.evaluate(() => {
        const cvs = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
        const rgb = (c) => { if (!c || c === 'transparent') return null; cvs.clearRect(0, 0, 1, 1); cvs.fillStyle = c; cvs.fillRect(0, 0, 1, 1); const [r, g, b, a] = cvs.getImageData(0, 0, 1, 1).data; if (a < 40) return null; return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''); };
        const fonts = {}, colors = {}, radii = {}, shadows = {};
        const els = [...document.querySelectorAll('body *')].filter((e) => !(e instanceof SVGElement));
        for (const el of els) {
          const st = getComputedStyle(el); const b = el.getBoundingClientRect(); const area = Math.max(1, b.width * b.height);
          if (st.display === 'none' || st.visibility === 'hidden' || !b.width) continue;
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (own) { const f = st.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const k = `${f}|${st.fontWeight}`; fonts[k] = (fonts[k] || 0) + el.textContent.trim().length; }
          const bg = rgb(st.backgroundColor); if (bg) colors[bg] = (colors[bg] || 0) + area;
          if (own) { const fg = rgb(st.color); if (fg) colors[fg] = (colors[fg] || 0) + area * 0.05; }
          if (st.borderRadius && st.borderRadius !== '0px' && b.width > 40) radii[st.borderRadius] = (radii[st.borderRadius] || 0) + 1;
          if (st.boxShadow && st.boxShadow !== 'none') shadows[st.boxShadow.slice(0, 80)] = (shadows[st.boxShadow.slice(0, 80)] || 0) + 1;
        }
        const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
        const size = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontSize : null; };
        return {
          fonts: top(fonts, 6), palette: top(colors, 8), radii: top(radii, 4), shadows: top(shadows, 3),
          typeScale: { h1: size('h1'), h2: size('h2'), h3: size('h3'), body: getComputedStyle(document.body).fontSize },
          sections: document.querySelectorAll('section, main > *').length,
          firstViewportHeight: (document.querySelector('header + *, main > *:first-child') || document.body).getBoundingClientRect().height | 0,
          pageHeight: document.body.scrollHeight, dir: document.documentElement.dir || 'ltr',
        };
      });
      rec[width] = r;
      console.log(`ok   ${host} @${width}: ${r.fonts.slice(0, 3).join(', ')} | ${r.palette.slice(0, 4).join(' ')}`);
    } catch (e) {
      rec[width] = { error: String(e).slice(0, 160) };
      console.log(`fail ${host} @${width}: ${String(e).slice(0, 120)}`);
      if (!rec.static) { try { rec.static = await staticRecon(url); console.log(`     static read: ${rec.static.fonts.slice(0, 3).join(', ')} | ${rec.static.palette.slice(0, 4).join(' ')} | libs ${rec.static.libs.join(', ') || 'none'}`); } catch (e2) { rec.static = { error: String(e2).slice(0, 160) }; console.log(`     static read failed: ${String(e2).slice(0, 100)}`); } }
    }
    await ctx.close();
  }
  const blob = bundles.join('\n');
  rec.libs = [...new Set([...Object.entries(LIBS).filter(([, re]) => re.test(blob)).map(([k]) => k), ...((rec.static && rec.static.libs) || [])])];
  all[host] = rec;
  writeFileSync(jsonPath, JSON.stringify(all, null, 2));
  console.log(`     libs: ${rec.libs.join(', ') || 'none detected'}`);
}
await browser.close();
console.log(`written: ${jsonPath.replace(process.cwd() + '/', '')}`);
