#!/usr/bin/env node
/* Renders the still poster of the hero dumbbell from the live scene, so the poster and
 * the first animated frame are the same picture.
 *
 *   assets/img/dumbbell-hero.webp       1200x1200  transparent, hero poster and LCP image
 *   assets/img/dumbbell-hero-640.webp    640x640   transparent, phones and the app tile
 *
 * Uses the built bundle (assets/js/hero-3d.min.js), so run scripts/build-hero-3d.mjs first.
 * Headless Chromium draws WebGL with SwiftShader; no GPU needed.
 *
 * Needs (not a repo dependency): playwright-core, found via BUILT_TOOLS_DIR, the repo, or
 * the global npm root; a Chromium under $PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH.
 *   BUILT_TOOLS_DIR=/tmp/built-tools node scripts/render-hero-poster.mjs
 *
 * Optional: --out <dir> writes there instead of assets/img (for previews).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argOut = process.argv.indexOf('--out');
const OUT = argOut > 0 ? process.argv[argOut + 1] : join(ROOT, 'assets', 'img');
mkdirSync(OUT, { recursive: true });

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

const BUNDLE = join(ROOT, 'assets', 'js', 'hero-3d.min.js');
if (!existsSync(BUNDLE)) { console.error('Build first: node scripts/build-hero-3d.mjs'); process.exit(1); }

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

  for (const [name, size] of [['dumbbell-hero.webp', 1200], ['dumbbell-hero-640.webp', 640]]) {
    // render at 2x and let the browser downsample: smoother edges on the bar and the B
    const b64 = await page.evaluate(async ({ size }) => {
      const { mount } = await import('/assets/js/hero-3d.min.js');
      const host = document.getElementById('h');
      host.style.setProperty('--ax', '0.5');
      host.style.setProperty('--ay', '0.5');
      const scene = mount(host, { still: true, size: { w: size, h: size }, dpr: 2 });
      const out = document.createElement('canvas');
      out.width = out.height = size;
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(scene.canvas, 0, 0, size, size);
      scene.destroy();
      scene.canvas.remove();
      return out.toDataURL('image/webp', 0.86).split(',')[1];
    }, { size });
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(join(OUT, name), buf);
    console.log(`${join(OUT, name).replace(ROOT + '/', '')}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
}
