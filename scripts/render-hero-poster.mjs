#!/usr/bin/env node
/* Renders BUILT's objects to transparent WebP images from the 3D scenes in
 * assets/js/src/site-3d.js. This is the offline image generator: the website shows these images
 * and moves them with CSS transforms (DESIGN.md, "Objects (2D renders)"); no visitor ever
 * downloads three.js or opens a WebGL context. Run it here, commit the images.
 *
 * Website (default):
 *   assets/img/story/badge-480|960.webp   the logo badge face-on (chapter 1 and pricing); the
 *                                         page turns it like a coin, with
 *   assets/img/story/badge-edge.webp      the badge edge-on, cropped to its strip
 *   assets/img/story/shadow.webp          the soft contact shadow under the chapter 1 badge
 *   assets/img/story/parts/{wide,narrow}/*.webp
 *                                         the exploded dumbbell, one layer per part, one camera
 *                                         (--layers; numbers in scripts/exploded-parts.json, which
 *                                         index.html carries inline)
 *   assets/img/story/plate-face(-480).webp, plate-edge(-480).webp
 *                                         chapter 3's plate face-on and at its edge-on start
 *   assets/img/3d/<slot>.webp             one still per section object (features, diet, ...),
 *                                         the how-* steps also at 640 for the step stage
 *   assets/img/dumbbell-hero*.webp        the dumbbell still in the phone mockup's workout tile
 *
 * App (--app): mobile/assets/images/objects/<name>.webp, @2x and @3x (React Native density
 * names), sized for a 200px box at 1x. See that folder's README.md.
 *
 * Uses the built bundle (assets/js/site-3d.min.js), so run scripts/build-site-3d.mjs after
 * editing site-3d.js. Headless Chromium draws WebGL with SwiftShader; no GPU needed.
 *
 * Needs (not a repo dependency): playwright-core, found via BUILT_TOOLS_DIR, the repo, or
 * the global npm root; a Chromium under $PLAYWRIGHT_BROWSERS_PATH or CHROMIUM_PATH.
 *   BUILT_TOOLS_DIR=/tmp/built-tools node scripts/render-hero-poster.mjs
 *
 * Options: --out <dir>          write there instead of assets/img (for previews)
 *          --only <name,name>   render just these scenes (badge, story-plate, features, ...)
 *          --layers             render only the exploded layers and their numbers
 *          --app                render only the app set
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
const APP = process.argv.includes('--app');
const LAYERS = process.argv.includes('--layers');
const APP_OUT = join(ROOT, 'mobile', 'assets', 'images', 'objects');
for (const d of ['3d', 'story', 'story/parts/wide', 'story/parts/narrow']) mkdirSync(join(OUT, d), { recursive: true });

// file, scene, width, height, progress of the pose, and optionally the viewport width the image
// stands for (a scene with a phone composition renders it when that width is 620 or less) and
// { crop: true } to trim the image to its pixels, { light: false } to keep the key light still.
// Rendered at 2x, then downsampled.
const POSTERS = [
  ['dumbbell-hero.webp', 'hero', 1200, 1200, 0],
  ['dumbbell-hero-640.webp', 'hero', 640, 640, 0],
  ['3d/how-phone.webp', 'how-phone', 256, 256, 0.5],
  ['3d/how-tape.webp', 'how-tape', 256, 256, 0.5],
  ['3d/how-pair.webp', 'how-pair', 256, 256, 0.5],
  ['3d/how-ring.webp', 'how-ring', 256, 256, 0.5],
  // the same four at stage size, for the pinned step sequence
  ['3d/how-phone-640.webp', 'how-phone', 640, 640, 0.5],
  ['3d/how-tape-640.webp', 'how-tape', 640, 640, 0.5],
  ['3d/how-pair-640.webp', 'how-pair', 640, 640, 0.5],
  ['3d/how-ring-640.webp', 'how-ring', 640, 640, 0.5],
  ['3d/features.webp', 'features', 600, 600, 0.5],
  ['3d/diet.webp', 'diet', 330, 600, 0.75],
  ['3d/training.webp', 'training', 310, 500, 0.75],
  ['3d/accountability.webp', 'accountability', 300, 500, 0.75],
  ['3d/accountability-wide.webp', 'accountability', 756, 360, 0.75], // the row, for slots wider than tall (up to 1099px)
  ['3d/progress.webp', 'progress', 575, 500, 0.7],
  ['3d/final.webp', 'final', 1520, 800, 0.5],
  ['3d/final-sm.webp', 'final', 720, 400, 0.5],
  // the logo badge: chapter 1's first paint (and LCP image) and the pricing badge
  ['story/badge-960.webp', 'badge', 960, 960, 0],
  ['story/badge-480.webp', 'badge', 480, 480, 0],
  ['story/badge-edge.webp', 'badge', 960, 960, 1, 0, { crop: true }],
  // chapter 3: the plate face-on, and at its first pose (just off edge-on); the page sweeps the light
  ['story/plate-face.webp', 'story-plate', 800, 800, 0.47, 0, { light: false }],
  ['story/plate-face-480.webp', 'story-plate', 480, 480, 0.47, 0, { light: false }],
  ['story/plate-edge.webp', 'story-plate', 800, 800, 0, 0, { light: false }],
  ['story/plate-edge-480.webp', 'story-plate', 480, 480, 0, 0, { light: false }],
];

// the app set: name, scene, width, height (at 1x), progress
const APP_SET = [
  ['dumbbell-float', 'app-dumbbell-float', 200, 200, 0],
  ['dumbbell-rest', 'app-dumbbell-rest', 200, 200, 0],
  ['medal-face', 'app-medal', 200, 200, 0],
  ['medal-edge', 'app-medal', 200, 200, 1],
  ['kettlebell', 'app-kettlebell', 200, 200, 0],
  ['shaker', 'app-shaker', 200, 200, 0],
  ['plate', 'app-plate', 200, 200, 0],
  ['shelf', 'app-shelf', 300, 120, 0],
  ['badge', 'badge', 200, 200, 0],
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

  const render = (args) => page.evaluate(async ({ name, w, h, p, vw, crop, light, q }) => {
    const { still } = await import('/assets/js/site-3d.min.js');
    // render at 2x and let the browser downsample: smoother edges on the bar and the B
    const shot = still({ name, width: w, height: h, dpr: 2, p, vw: vw || w, light });
    let out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(shot.canvas, 0, 0, w, h);
    const info = shot.info;
    shot.destroy();
    let box = null;
    if (crop) {
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 2) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      box = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
      const c = document.createElement('canvas');
      c.width = box[2]; c.height = box[3];
      c.getContext('2d').drawImage(out, -x0, -y0);
      out = c;
    }
    return { b64: out.toDataURL('image/webp', q).split(',')[1], info, box };
  }, args);
  const save = (path, b64, note = '') => {
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(path, buf);
    console.log(`${path.replace(ROOT + '/', '')}  ${(buf.length / 1024).toFixed(1)} KB ${note}`);
  };

  if (APP) {
    mkdirSync(APP_OUT, { recursive: true });
    for (const [file, name, w, h, p] of APP_SET) {
      if (ONLY && !ONLY.includes(file)) continue;
      for (const k of [1, 2, 3]) {
        const r = await render({ name, w: w * k, h: h * k, p, q: 0.9 });
        save(join(APP_OUT, `${file}${k > 1 ? `@${k}x` : ''}.webp`), r.b64, k === 1 && r.info ? JSON.stringify(r.info) : '');
      }
    }
  } else if (LAYERS) {
    // the exploded dumbbell: one layer per part, far to near; the numbers go to scripts/exploded-parts.json
    const manifest = {};
    for (const [mode, w, h] of [['wide', 1920, 1080], ['narrow', 900, 900]]) {
      const res = await page.evaluate(async ({ mode, w, h }) => {
        const { explodedLayers } = await import('/assets/js/site-3d.min.js');
        const r = explodedLayers({ mode, width: w, height: h, dpr: 2 });
        return { anchors: r.anchors, layers: r.layers.map((l) => ({ ...l, canvas: undefined, b64: l.canvas.toDataURL('image/webp', 0.86).split(',')[1] })) };
      }, { mode, w, h });
      for (const l of res.layers) { save(join(OUT, 'story', 'parts', mode, `${l.name}.webp`), l.b64); delete l.b64; }
      manifest[mode] = res;
    }
    writeFileSync(join(ROOT, 'scripts', 'exploded-parts.json'), JSON.stringify(manifest, null, 1) + '\n');
    console.log('scripts/exploded-parts.json');
  } else {
    for (const [file, name, w, h, p, vw, o = {}] of POSTERS) {
      if (ONLY && !ONLY.includes(name)) continue;
      const r = await render({ name, w, h, p, vw, crop: !!o.crop, light: o.light !== false, q: 0.86 });
      save(join(OUT, file), r.b64, `${w}x${h}${r.box ? ` crop ${r.box.join(',')}` : ''}`);
    }
    if (!ONLY || ONLY.includes('shadow')) {
      // the soft contact shadow under the chapter 1 badge: the engine's blurred ellipse, on its own
      const b64 = await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 480; c.height = 96;
        const g = c.getContext('2d');
        g.setTransform(1, 0, 0, 96 / 480, 0, 0);
        const r = g.createRadialGradient(240, 240, 0, 240, 240, 240);
        r.addColorStop(0, 'rgba(0,0,0,0.85)');
        r.addColorStop(0.45, 'rgba(0,0,0,0.38)');
        r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 480, 480);
        return c.toDataURL('image/webp', 0.9).split(',')[1];
      });
      save(join(OUT, 'story', 'shadow.webp'), b64, '480x96');
    }
  }
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
}
