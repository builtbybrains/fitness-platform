#!/usr/bin/env node
/* Bundles the BUILT 3D scenes (assets/js/src/site-3d.js) with one copy of three.js into one
 * minified ES module, for the offline image generator (scripts/render-hero-poster.mjs). The website
 * never loads this bundle: it shows the rendered images and moves them with CSS transforms.
 *
 *   assets/js/src/site-3d.js  ->  assets/js/site-3d.min.js
 *
 * three and esbuild are not repo dependencies of the website. three is taken from
 * BUILT_TOOLS_DIR/node_modules/three, else mobile/node_modules/three:
 *   npm i --prefix /tmp/built-tools esbuild three
 *   BUILT_TOOLS_DIR=/tmp/built-tools node scripts/build-site-3d.mjs
 * or point ESBUILD_BIN at an esbuild binary.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets', 'js', 'src', 'site-3d.js');
const OUT = join(ROOT, 'assets', 'js', 'site-3d.min.js');
const THREE = [
  process.env.BUILT_TOOLS_DIR && join(process.env.BUILT_TOOLS_DIR, 'node_modules', 'three', 'build', 'three.module.js'),
  join(ROOT, 'mobile', 'node_modules', 'three', 'build', 'three.module.js'),
].filter(Boolean).find(existsSync);

if (!THREE) {
  console.error('three not found. Install it outside the repo: npm i --prefix /tmp/built-tools three, then set BUILT_TOOLS_DIR.');
  process.exit(1);
}

const candidates = [
  process.env.ESBUILD_BIN,
  process.env.BUILT_TOOLS_DIR && join(process.env.BUILT_TOOLS_DIR, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild'),
  join(ROOT, 'mobile', 'node_modules', 'esbuild', 'bin', 'esbuild'),
].filter(Boolean);
const esbuild = candidates.find(existsSync);
if (!esbuild) {
  console.error('esbuild not found. Install it outside the repo and point BUILT_TOOLS_DIR at it:\n' +
    '  npm i --prefix /tmp/built-tools esbuild\n' +
    '  BUILT_TOOLS_DIR=/tmp/built-tools node scripts/build-site-3d.mjs');
  process.exit(1);
}

const r = spawnSync(esbuild, [
  SRC,
  '--bundle',
  '--format=esm',
  '--minify',
  '--target=es2020',
  '--legal-comments=none',
  `--alias:three=${THREE}`,
  // three's add-ons (RoundedBoxGeometry) come from the same copy of three
  `--alias:three/addons=${join(dirname(dirname(THREE)), 'examples', 'jsm')}`,
  `--outfile=${OUT}`,
], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);

const bytes = statSync(OUT).size;
const gz = gzipSync(readFileSync(OUT), { level: 9 }).length;
console.log(`assets/js/site-3d.min.js  ${(bytes / 1024).toFixed(1)} KB  (${(gz / 1024).toFixed(1)} KB gzip)`);
