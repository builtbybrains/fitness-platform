#!/usr/bin/env node
/* Bundles the website's 3D engine (every [data-3d] slot: the hero dumbbell, the roadmap
 * objects, kettlebell, shaker, plates, flame, bar chart, medal and the closing orbit) into one
 * self-hosted, minified ES module with a single copy of three.js.
 *
 *   assets/js/src/site-3d.js  ->  assets/js/site-3d.min.js
 *
 * three is resolved from mobile/node_modules (the app already depends on it), so the
 * website ships no CDN and no extra package.json. esbuild is not a repo dependency:
 *   npm i --prefix /tmp/built-tools esbuild
 *   BUILT_TOOLS_DIR=/tmp/built-tools node scripts/build-site-3d.mjs
 * or point ESBUILD_BIN at an esbuild binary.
 *
 * Run: node scripts/build-site-3d.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets', 'js', 'src', 'site-3d.js');
const OUT = join(ROOT, 'assets', 'js', 'site-3d.min.js');
const THREE = join(ROOT, 'mobile', 'node_modules', 'three', 'build', 'three.module.js');

if (!existsSync(THREE)) {
  console.error('three not found in mobile/node_modules. Run: npm --prefix mobile install');
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
  `--outfile=${OUT}`,
], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);

const bytes = statSync(OUT).size;
const gz = gzipSync(readFileSync(OUT), { level: 9 }).length;
console.log(`assets/js/site-3d.min.js  ${(bytes / 1024).toFixed(1)} KB  (${(gz / 1024).toFixed(1)} KB gzip)`);
