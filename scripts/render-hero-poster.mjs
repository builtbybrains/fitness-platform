#!/usr/bin/env node
/* Renders the still posters of every 3D slot from the live scenes, so each poster and the
 * live drawing are the same picture. The posters are what shows without WebGL, with Save-Data
 * or with reduced motion, and what the live canvas fades in over.
 *
 *   assets/img/dumbbell-hero.webp       1200x1200  transparent, hero poster and LCP image
 *   assets/img/dumbbell-hero-640.webp    640x640   transparent, phones and the app tile
 *   assets/img/3d/<slot>.webp           small, transparent, one per [data-3d] slot, at a
 *                                       representative scroll pose (see POSTERS below)
 *
 * Uses the built bundle (assets/js/site-3d.min.js), so run scripts/build-site-3d.mjs first.
 * Headless Chromium draws WebGL with SwiftShader; no GPU needed.
 *
 * Needs (not a repo dependency): playwright-core, found via BUILT_TOOLS_DIR, the repo, or
 * the global npm root; a Chromium under $PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH.
 *   BUILT_TOOLS_DIR=/tmp/built-tools node scripts/render-hero-poster.mjs
 *
 * Optional: --out <dir> writes there instead of assets/img (for previews).
 *           --only <name,name>  render just these slots (hero, how-phone, final, ...)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : join(ROOT, 'assets', 'img');
const argOnly = process.argv.indexOf('--only');
const ONLY = argOnly > 0 ? process.argv[argOnly + 1].split(',') : null;
mkdirSync(join(OUT, '3d'), { recursive: true });

// file, slot, width, height, scroll progress of the pose. Rendered at 2x, then downsampled.
const POSTERS = [
  ['dumbbell-hero.webp', 'hero', 1200, 1200, 0],
  ['dumbbell-hero-640.webp', 'hero', 640, 640, 0],
  ['3d/how-phone.webp', 'how-phone', 256, 256, 0.5],
  ['3d/how-tape.webp', 'how-tape', 256, 256, 0.5],
  ['3d/how-pair.webp', 'how-pair', 256, 256, 0.5],
  ['3d/how-ring.webp', 'how-ring', 256, 256, 0.5],
  ['3d/features.webp', 'features', 600, 600, 0.5],
  ['3d/diet.webp', 'diet', 330, 600, 0.75],
  ['3d/training.webp', 'training', 310, 500, 0.75],
  ['3d/accountability.webp', 'accountability', 300, 500, 0.75],
  ['3d/accountability-wide.webp', 'accountability', 756, 360, 0.75], // the row, for slots wider than tall (up to 1099px)
  ['3d/progress.webp', 'progress', 575, 500, 0.7],
  ['3d/pricing.webp', 'pricing', 440, 440, 0.6],
  ['3d/final.webp', 'final', 1520, 800, 0.5],
  ['3d/final-sm.webp', 'final', 720, 400, 0.5],
];

function loadPlaywright() {
  let globalRoot = '';
  try { globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim(); } catch { /* none */ }
  const dirs = [
    process.env.BUILT_TOOLS_DIR, ROOT, join(ROOT, 'mobile'),
    globalRoot && join(globalRoot, 'playwright'), globalRoot,
  ].filter(Boolean);
  for (const d of dirs) {
    for (const name of ['playwright-core', 'playwright']) {
      try { return createRequire(join(d, 'noop.js'))(name); } catch { /* next */ }
    }
  }
  console.error('playwright-core not found. Install it outside the repo and set BUILT_TOOLS_DIR.');
  process.exit(1);
}
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const b of readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse()) {
    for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const p = join(base, b, sub);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const BUNDLE = join(ROOT, 'assets', 'js', 'site-3d.min.js');
if (!existsSync(BUNDLE)) { console.error('Build first: node scripts/build-site-3d.mjs'); process.exit(1); }

const ORIGIN = 'http://poster.local';
const MIME = { '.js': 'text/javascript', '.html': 'text/html' };
const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body style="margin:0;background:transparent"><div id="h" style="width:10px;height:10px"></div></body></html>' });
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ contentType: MIME[extname(file)] || 'application/octet-stream', body: readFileSync(file) });
  });
  await page.goto(`${ORIGIN}/`);

  for (const [file, name, w, h, p] of POSTERS) {
    if (ONLY && !ONLY.includes(name)) continue;
    // render at 2x and let the browser downsample: smoother edges on the bar and the B
    const b64 = await page.evaluate(async ({ name, w, h, p }) => {
      const { still } = await import('/assets/js/site-3d.min.js');
      const shot = still({ name, width: w, height: h, dpr: 2, p });
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(shot.canvas, 0, 0, w, h);
      shot.destroy();
      return out.toDataURL('image/webp', 0.86).split(',')[1];
    }, { name, w, h, p });
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(join(OUT, file), buf);
    console.log(`${join(OUT, file).replace(ROOT + '/', '')}  ${w}x${h}  ${(buf.length / 1024).toFixed(1)} KB`);
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
}
