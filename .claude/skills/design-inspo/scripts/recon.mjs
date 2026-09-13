#!/usr/bin/env node
// design-inspo recon: photograph a reference site and read its code.
//   node recon.mjs <url> [<url> ...]   → research/inspo/<host>-390.png, -1440.png, recon.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

for (const url of urls) {
  const host = new URL(url).host.replace(/^www\./, '');
  const rec = { url, date: new Date().toISOString().slice(0, 10), libs: [], shots: {} };
  const bundles = [];
  for (const width of [1440, 390]) {
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
    } catch (e) { rec[width] = { error: String(e).slice(0, 160) }; console.log(`fail ${host} @${width}: ${String(e).slice(0, 120)}`); }
    await ctx.close();
  }
  const blob = bundles.join('\n');
  rec.libs = Object.entries(LIBS).filter(([, re]) => re.test(blob)).map(([k]) => k);
  all[host] = rec;
  writeFileSync(jsonPath, JSON.stringify(all, null, 2));
  console.log(`     libs: ${rec.libs.join(', ') || 'none detected'}`);
}
await browser.close();
console.log(`written: ${jsonPath.replace(process.cwd() + '/', '')}`);
