#!/usr/bin/env node
/* Generates the website's raster brand images from the VITAL mark geometry
 * (broken ring, leaves, athlete) — pure Node, no image dependencies.
 *
 *   assets/img/og-cover.png   1200x630  social share card (og:image / twitter:image)
 *   assets/img/icon-180.png    180x180  apple-touch-icon
 *
 * Run: node scripts/gen-web-images.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets', 'img');

/* ---------------- PNG encoder (RGBA, filter 0) ---------------- */
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
function pngEncode(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- tiny vector kit (y-down screen space) ---------------- */
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = clamp01(t);
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return Math.hypot(x, y);
}
function angleIn(px, py, cx, cy, a0deg, a1deg) {
  // clockwise (increasing atan2 angle in y-down space) from a0 to a1
  let a = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
  const span = ((a1deg - a0deg) % 360 + 360) % 360;
  const rel = ((a - a0deg) % 360 + 360) % 360;
  return rel <= span;
}
const inCircle = (px, py, cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
const inLens = (px, py, ax, ay, bx, by, r) => inCircle(px, py, ax, ay, r) && inCircle(px, py, bx, by, r);

/* ---------------- the VITAL mark, parameterised ---------------- */
/* Draws into a shape list. Scale s maps the 64x64 logo viewBox to pixels;
   ox/oy place the viewBox origin. Order follows logo.svg (ring, leaves,
   midribs, athlete) so overlaps composite the same way. */
function markShapes(s, ox, oy) {
  const X = (x) => ox + x * s;
  const Y = (y) => oy + y * s;
  const W = (svgWidth) => (svgWidth / 2) * s; // stroke width -> capsule radius

  return [
    // broken ring — green arc (top-left), silver arc (right/bottom-right)
    { hit: (x, y) => Math.abs(Math.hypot(x - X(32), y - Y(32)) - 26.4 * s) <= W(4) && angleIn(x, y, X(32), Y(32), 177.8, 305.7),
      color: (x, y) => mix([0x14, 0x95, 0x4a], [0x9b, 0xf4, 0x57], clamp01((Y(32) - y) / (52 * s) + 0.5)) },
    { hit: (x, y) => Math.abs(Math.hypot(x - X(32), y - Y(32)) - 26.4 * s) <= W(4) && angleIn(x, y, X(32), Y(32), 347.5, 119.3),
      color: (x, y) => mix([0xff, 0xff, 0xff], [0x8b, 0x9a, 0xab], clamp01((y - Y(8)) / (52 * s))) },

    // leaves (two-circle lenses) + midribs
    { hit: (x, y) => inLens(x, y, X(6.6), Y(23.2), X(31.8), Y(47.3), 20 * s),
      color: (x, y) => mix([0x9b, 0xf4, 0x57], [0x14, 0x95, 0x4a], clamp01(segDist(x, y, X(6.6), Y(23.2), X(31.8), Y(47.3)) / (34.9 * s))) },
    { hit: (x, y) => segDist(x, y, X(6.6), Y(23.2), X(31.8), Y(47.3)) <= 3 && inLens(x, y, X(6.6), Y(23.2), X(31.8), Y(47.3), 20 * s),
      color: () => [0x0b, 0x6f, 0x33], alpha: 0.5 },
    { hit: (x, y) => inLens(x, y, X(7), Y(40.5), X(26.6), Y(57.2), 15 * s),
      color: (x, y) => mix([0xae, 0xf8, 0x6e], [0x1e, 0xaa, 0x52], clamp01(segDist(x, y, X(7), Y(40.5), X(26.6), Y(57.2)) / (25.7 * s))) },
    { hit: (x, y) => segDist(x, y, X(7), Y(40.5), X(26.6), Y(57.2)) <= 2.6 && inLens(x, y, X(7), Y(40.5), X(26.6), Y(57.2), 15 * s),
      color: () => [0x0b, 0x6f, 0x33], alpha: 0.45 },

    // athlete: head, body swoosh (tapered capsules), arm
    { hit: (x, y) => inCircle(x, y, X(32.9), Y(17.2), 6.9 * s),
      color: (x, y) => mix([0xff, 0xff, 0xff], [0xae, 0xbc, 0xcb], clamp01((y - Y(10)) / (14 * s))) },
    { hit: (x, y) => segDist(x, y, X(40.6), Y(26.2), X(29), Y(42)) <= 7.5,
      color: (x, y) => mix([0xff, 0xff, 0xff], [0xae, 0xbc, 0xcb], clamp01((y - Y(22)) / (36 * s))) },
    { hit: (x, y) => segDist(x, y, X(29), Y(42), X(20), Y(52)) <= 9,
      color: (x, y) => mix([0xff, 0xff, 0xff], [0xae, 0xbc, 0xcb], clamp01((y - Y(22)) / (36 * s))) },
    { hit: (x, y) => segDist(x, y, X(20), Y(52), X(15.2), Y(58.8)) <= 6.5,
      color: (x, y) => mix([0xff, 0xff, 0xff], [0xae, 0xbc, 0xcb], clamp01((y - Y(22)) / (36 * s))) },
    { hit: (x, y) => segDist(x, y, X(36.4), Y(28.6), X(22.4), Y(51)) <= 4.5,
      color: () => [0xff, 0xff, 0xff], alpha: 0.35 },
    { hit: (x, y) => segDist(x, y, X(38.9), Y(31.3), X(51.4), Y(34.8)) <= W(7.4) || segDist(x, y, X(51.4), Y(34.8), X(46.3), Y(21.3)) <= W(7.4),
      color: (x, y) => mix([0xff, 0xff, 0xff], [0xae, 0xbc, 0xcb], clamp01((y - Y(18)) / (20 * s))) },
  ];
}

/* Blocky geometric caps for the VITAL wordmark — unit boxes, thick strokes. */
const GLYPHS = {
  V: [[[0, 0], [0.5, 1]], [[1, 0], [0.5, 1]]],
  I: [[[0.5, 0], [0.5, 1]]],
  T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
  A: [[[0, 1], [0.5, 0]], [[0.5, 0], [1, 1]], [[0.22, 0.64], [0.78, 0.64]]],
  L: [[[0, 0], [0, 1]], [[0, 1], [1, 1]]],
};
function wordmarkShapes(text, x0, y0, cap, gap) {
  const shapes = [];
  let x = x0;
  for (const ch of text) {
    const g = GLYPHS[ch];
    const letterX = x; // capture per-letter: the hit closures must not see later mutations
    if (!g) { x += cap; continue; }
    for (const [[ax, ay], [bx, by]] of g) {
      shapes.push({
        hit: (px, py) => segDist(px, py, letterX + ax * cap, y0 + ay * cap, letterX + bx * cap, y0 + by * cap) <= cap * 0.085,
        color: () => [0xee, 0xf3, 0xf8],
      });
    }
    x += cap * 0.74 + gap;
  }
  return { shapes, endX: x };
}

/* ---------------- renderer ---------------- */
function render(w, h, paint) {
  const out = Buffer.alloc(w * h * 4);
  const SS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (const [sx, sy] of SS) {
        const [cr, cg, cb] = paint(x + sx, y + sy);
        r += cr; g += cg; b += cb;
      }
      const i = (y * w + x) * 4;
      out[i] = Math.round(r / SS.length);
      out[i + 1] = Math.round(g / SS.length);
      out[i + 2] = Math.round(b / SS.length);
      out[i + 3] = 255;
    }
  }
  return out;
}

/* ---------------- og-cover.png ---------------- */
function genOgCover() {
  const W = 1200, H = 630;
  const BG = [0x05, 0x07, 0x0a];
  const glows = [
    { cx: 250, cy: 130, R: 460, k: 0.42, c: [52, 229, 164] },
    { cx: 1060, cy: 430, R: 520, k: 0.22, c: [121, 166, 255] },
    { cx: 620, cy: 660, R: 420, k: 0.16, c: [52, 229, 164] },
  ];
  const shapes = [...markShapes(3.75, 90, 195)];
  const word = wordmarkShapes('VITAL', 410, 265, 100, 26);
  shapes.push(...word.shapes);
  shapes.push({ hit: (x, y) => segDist(x, y, 410, 408, 910, 408) <= 4, color: () => [52, 229, 164], alpha: 0.9 });

  const rgba = render(W, H, (x, y) => {
    let c = BG;
    for (const ginfo of glows) {
      const d = Math.hypot(x - ginfo.cx, y - ginfo.cy);
      if (d < ginfo.R) c = mix(c, ginfo.c, ginfo.k * (1 - d / ginfo.R) ** 2);
    }
    for (const sh of shapes) {
      if (!sh.hit(x, y)) continue;
      const a = sh.alpha ?? 1;
      c = mix(c, sh.color(x, y), a);
    }
    return c;
  });
  writeFileSync(join(OUT, 'og-cover.png'), pngEncode(W, H, rgba));
  console.log('og-cover.png  1200x630');
}

/* ---------------- icon-180.png (apple-touch-icon) ---------------- */
function genIcon180() {
  const W = 180, H = 180;
  const BG = [0x05, 0x07, 0x0a];
  const s = 2.4, ox = (W - 64 * s) / 2, oy = (H - 64 * s) / 2;
  const shapes = markShapes(s, ox, oy);
  const rgba = render(W, H, (x, y) => {
    let c = BG;
    const d = Math.hypot(x - W / 2, y - H * 0.4);
    if (d < 120) c = mix(c, [52, 229, 164], 0.16 * (1 - d / 120) ** 2);
    for (const sh of shapes) {
      if (!sh.hit(x, y)) continue;
      c = mix(c, sh.color(x, y), sh.alpha ?? 1);
    }
    return c;
  });
  writeFileSync(join(OUT, 'icon-180.png'), pngEncode(W, H, rgba));
  console.log('icon-180.png   180x180');
}

mkdirSync(OUT, { recursive: true });
genOgCover();
genIcon180();
console.log('done.');
