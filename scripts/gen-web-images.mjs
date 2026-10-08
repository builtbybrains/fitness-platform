#!/usr/bin/env node
/* Rasterises the BUILT brand images from the vector sources in assets/img/.
 *
 *   assets/img/icon-180.png    180x180   apple-touch-icon (green B on Deep Black, opaque)
 *   assets/img/og-cover.png   1200x630   social share card (og:image / twitter:image)
 *
 * With --mobile it also writes the Expo app icons into mobile/assets/:
 *   icon.png 1024 (opaque), adaptive-icon.png + android-icon-foreground.png 1024
 *   (transparent, B inside the 66dp safe zone), android-icon-background.png 1024
 *   (solid), android-icon-monochrome.png 1024 (white B, transparent),
 *   splash-icon.png 1024 (transparent), favicon.png 48.
 *
 * Sources: assets/img/mark.svg (the B path), assets/img/logo-tagline.svg,
 * assets/img/favicon.svg, assets/img/dumbbell-hero.webp (the 3D hero still, rendered by
 * scripts/render-hero-poster.mjs; run that first when the scene changes), and Inter Regular from
 * mobile/node_modules/@expo-google-fonts/inter for the og-cover sentence.
 *
 * Needs (not a repo dependency; install it anywhere outside the repo):
 *   playwright-core   e.g.  npm i --prefix /tmp/built-tools playwright-core
 *                     then  BUILT_TOOLS_DIR=/tmp/built-tools node scripts/gen-web-images.mjs
 *   a Chromium build  found under $PLAYWRIGHT_BROWSERS_PATH (chromium-*), or set
 *                     CHROMIUM_PATH to the chrome binary. Never runs `playwright install`.
 *
 * Pixels are read back from a canvas and PNG-encoded here, so opaque images
 * are written as true RGB (no alpha channel; App Store icons must not carry one).
 *
 * Run: node scripts/gen-web-images.mjs [--mobile]
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = join(ROOT, 'assets', 'img');
const MOBILE = join(ROOT, 'mobile', 'assets');
const GREEN = '#A3FF3D';
const BLACK = '#080808';

/* ---------------- tooling lookup ---------------- */
function loadPlaywright() {
  const dirs = [process.env.BUILT_TOOLS_DIR, ROOT, join(ROOT, 'mobile')].filter(Boolean);
  for (const d of dirs) {
    try {
      return createRequire(join(d, 'noop.js'))('playwright-core');
    } catch { /* try the next one */ }
  }
  console.error('playwright-core not found. Install it outside the repo and point BUILT_TOOLS_DIR at it:\n' +
    '  npm i --prefix /tmp/built-tools playwright-core\n' +
    '  BUILT_TOOLS_DIR=/tmp/built-tools node scripts/gen-web-images.mjs');
  process.exit(1);
}
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !existsSync(base)) return undefined;
  const builds = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse();
  for (const b of builds) {
    for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(base, b, sub);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}
function findFont(rel) {
  const dirs = [join(ROOT, 'mobile', 'node_modules'), process.env.BUILT_TOOLS_DIR && join(process.env.BUILT_TOOLS_DIR, 'node_modules')].filter(Boolean);
  for (const d of dirs) if (existsSync(join(d, rel))) return join(d, rel);
  throw new Error(`font not found: ${rel} (run npm install in mobile/)`);
}

/* ---------------- PNG encoder (RGB or RGBA, filter 0) ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function pngEncode(w, h, rgba, { opaque }) {
  const ch = opaque ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  const row = w * ch;
  const px = Buffer.alloc(row * h);
  for (let i = 0, d = 0; i < w * h; i++, d += ch) {
    px[d] = rgba[i * 4]; px[d + 1] = rgba[i * 4 + 1]; px[d + 2] = rgba[i * 4 + 2];
    if (!opaque) px[d + 3] = rgba[i * 4 + 3];
  }
  // per-row adaptive filter (None, Sub, Up, Paeth), smallest sum of |bytes| wins
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raw = Buffer.alloc((row + 1) * h);
  const cand = [0, 1, 2, 4].map(() => Buffer.alloc(row));
  for (let y = 0; y < h; y++) {
    const cur = px.subarray(y * row, (y + 1) * row);
    const up = y ? px.subarray((y - 1) * row, y * row) : Buffer.alloc(row);
    for (let x = 0; x < row; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = up[x], c = x >= ch ? up[x - ch] : 0;
      cand[0][x] = cur[x];
      cand[1][x] = (cur[x] - a) & 0xff;
      cand[2][x] = (cur[x] - b) & 0xff;
      cand[3][x] = (cur[x] - paeth(a, b, c)) & 0xff;
    }
    let best = 0, bestSum = Infinity;
    cand.forEach((buf, k) => {
      let s = 0;
      for (let x = 0; x < row; x++) s += buf[x] < 128 ? buf[x] : 256 - buf[x];
      if (s < bestSum) { bestSum = s; best = k; }
    });
    raw[y * (row + 1)] = [0, 1, 2, 4][best];
    cand[best].copy(raw, y * (row + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- sources ---------------- */
const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(file).toString('base64')}`;
const markSvg = readFileSync(join(IMG, 'mark.svg'), 'utf8');
const MARK_D = markSvg.match(/<path[^>]*\sd="([^"]+)"/)[1];
const MARK_W = 127.5, MARK_H = 100; // mark.svg viewBox
const markUri = (fill) => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_W} ${MARK_H}" width="${MARK_W * 8}" height="${MARK_H * 8}"><path fill="${fill}" d="${MARK_D}"/></svg>`,
).toString('base64');

/* ---------------- in-page canvas renderer ---------------- */
// `job` is serialisable: { w, h, bg, layers:[{img, x, y, w, h, fadeLeft?}], text?:{...} }
async function renderJob(page, job) {
  const b64 = await page.evaluate(async (job) => {
    const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const c = document.createElement('canvas');
    c.width = job.w; c.height = job.h;
    const ctx = c.getContext('2d');
    if (job.bg) { ctx.fillStyle = job.bg; ctx.fillRect(0, 0, job.w, job.h); }
    for (const L of job.layers) {
      const img = await load(L.img);
      ctx.drawImage(img, L.x, L.y, L.w, L.h);
      if (L.fadeLeft) {
        // solid Deep Black at the photo's left edge, easing to clear over fadeLeft px
        const g = ctx.createLinearGradient(L.x, 0, L.x + L.fadeLeft, 0);
        g.addColorStop(0, 'rgba(8,8,8,1)');
        g.addColorStop(0.45, 'rgba(8,8,8,0.55)');
        g.addColorStop(1, 'rgba(8,8,8,0)');
        ctx.fillStyle = g;
        ctx.fillRect(L.x, L.y, L.fadeLeft, L.h);
      }
    }
    if (job.text) {
      const t = job.text;
      const face = new FontFace('BuiltInter', `url(${t.font})`);
      await face.load();
      document.fonts.add(face);
      ctx.font = `${t.size}px BuiltInter`;
      ctx.fillStyle = t.color;
      ctx.textBaseline = 'alphabetic';
      const words = t.body.split(' ');
      let line = '', y = t.y;
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > t.maxWidth && line) { ctx.fillText(line, t.x, y); line = w; y += t.lineHeight; }
        else line = test;
      }
      if (line) ctx.fillText(line, t.x, y);
    }
    const px = ctx.getImageData(0, 0, job.w, job.h).data;
    let s = '';
    for (let i = 0; i < px.length; i += 0x8000) s += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
    return btoa(s);
  }, job);
  return Buffer.from(b64, 'base64');
}

async function write(page, file, job, opaque) {
  const rgba = await renderJob(page, job);
  writeFileSync(file, pngEncode(job.w, job.h, rgba, { opaque }));
  console.log(`${file.replace(ROOT + '/', '')}  ${job.w}x${job.h}${opaque ? '' : '  (transparent)'}`);
}

// the B centred in a square tile, `frac` of the tile width
const markLayer = (size, frac, fill) => {
  const w = size * frac, h = (w * MARK_H) / MARK_W;
  return { img: markUri(fill), x: (size - w) / 2, y: (size - h) / 2, w, h };
};

/* ---------------- jobs ---------------- */
async function webImages(page) {
  await write(page, join(IMG, 'icon-180.png'), { w: 180, h: 180, bg: BLACK, layers: [markLayer(180, 0.6, GREEN)] }, true);

  // og-cover: lockup + brand sentence left, the 3D dumbbell right on Deep Black.
  // dumbbell-hero.webp is a transparent square; the bell sits in its middle band, so the
  // square bleeds past the top and bottom of the card and nothing visible is cropped.
  const W = 1200, H = 630;
  const bell = 760;
  const logoW = 470, logoH = (logoW * 140) / 482.4;           // logo-tagline.svg viewBox
  const top = 150;
  await write(page, join(IMG, 'og-cover.png'), {
    w: W, h: H, bg: BLACK,
    layers: [
      { img: dataUri(join(IMG, 'dumbbell-hero.webp'), 'image/webp'), x: W - bell + 2, y: Math.round((H - bell) / 2) + 46, w: bell, h: bell },
      { img: dataUri(join(IMG, 'logo-tagline.svg'), 'image/svg+xml'), x: 72, y: top, w: logoW, h: logoH },
    ],
    text: {
      font: dataUri(findFont('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'), 'font/ttf'),
      body: 'An all-in-one fitness and nutrition platform powered by AI coaching. Built to help you train, fuel, and become a stronger, healthier, better you.',
      x: 74, y: top + logoH + 64, size: 22, lineHeight: 34, maxWidth: 440, color: '#E9E9E9',
    },
  }, true);
}

async function mobileImages(page) {
  mkdirSync(MOBILE, { recursive: true });
  const S = 1024;
  // B diagonal must sit inside the 66dp-of-108dp safe circle (626px): width 480 gives a 610px diagonal
  const SAFE = 480 / S;
  await write(page, join(MOBILE, 'icon.png'), { w: S, h: S, bg: BLACK, layers: [markLayer(S, 0.6, GREEN)] }, true);
  await write(page, join(MOBILE, 'adaptive-icon.png'), { w: S, h: S, layers: [markLayer(S, SAFE, GREEN)] }, false);
  await write(page, join(MOBILE, 'android-icon-foreground.png'), { w: S, h: S, layers: [markLayer(S, SAFE, GREEN)] }, false);
  await write(page, join(MOBILE, 'android-icon-background.png'), { w: S, h: S, bg: BLACK, layers: [] }, true);
  await write(page, join(MOBILE, 'android-icon-monochrome.png'), { w: S, h: S, layers: [markLayer(S, SAFE, '#FFFFFF')] }, false);
  await write(page, join(MOBILE, 'splash-icon.png'), { w: S, h: S, layers: [markLayer(S, 0.4, GREEN)] }, false);
  await write(page, join(MOBILE, 'favicon.png'), {
    w: 48, h: 48, layers: [{ img: dataUri(join(IMG, 'favicon.svg'), 'image/svg+xml'), x: 0, y: 0, w: 48, h: 48 }],
  }, false);
}

/* ---------------- run ---------------- */
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  mkdirSync(IMG, { recursive: true });
  await webImages(page);
  if (process.argv.includes('--mobile')) await mobileImages(page);
} finally {
  await browser.close();
}
console.log('done.');
