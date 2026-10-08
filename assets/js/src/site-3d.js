/* BUILT website 3D: one WebGL renderer, one canvas, every [data-3d] slot on the page.
 *
 * Source for assets/js/site-3d.min.js. Rebuild after editing:
 *   node scripts/build-site-3d.mjs
 * The still posters (assets/img/dumbbell-hero*.webp and assets/img/3d/*.webp) are rendered
 * from this same file:
 *   node scripts/render-hero-poster.mjs
 *
 * How it draws (the three.js "multiple elements" technique): a single transparent canvas the
 * size of the viewport sits above the page sections (z-index 1, pointer-events none). Each
 * frame it is cleared, then every slot that intersects the viewport is drawn into its own
 * bounding rect with setViewport + setScissor. Nothing is drawn outside a slot's rect, so copy
 * is never covered. The canvas is moved with the page (translateY) in the same frame it is
 * drawn, so objects stay glued to their slots while the compositor scrolls.
 *
 * Look (DESIGN.md, "3D"): matte black rubber, brushed steel, Carbon metal, matte Stone, and
 * Built Green as one accent per object: a collar, a ring, the latest bar, the B on the last streak tile. One studio light set
 * for every object: warm-neutral key top left, cool fill right, a faint green rim (0.2) from
 * behind, low sky, softbox reflections. No bloom, no glow.
 *
 * Framing works like CSS `object-fit: contain`: each scene is composed in a fixed aspect,
 * fitted inside its slot and aligned by --ax / --ay on the slot, so the live drawing lands
 * exactly on top of the poster image that uses the same alignment.
 *
 * Motion: every pose is a function of the slot's scroll progress (0 when the slot's centre meets
 * the bottom of the viewport, 1 when it reaches the top), plus a tiny bob while in view. Scrolling back plays it backwards.
 * Pinned slots (data-3d-scrub, the scroll story) take their progress across their chapter's pinned
 * scroll instead, and a slot with data-3d-anchors gets leader lines aimed at points on its object.
 * The hero slot (retired from the page, kept for its posters) has its own slow ambient loop.
 */
import {
  ACESFilmicToneMapping,
  AddEquation,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  CustomBlending,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Quaternion,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  ZeroFactor,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const GREEN = 0xa3ff3d;
const RIM = 0.2; // the faint green rim light; a slot can ask for less with `rim`
const TAU = Math.PI * 2;

/* ---------- small maths ---------- */
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const win = (a, b, x) => clamp01((x - a) / (b - a));
const outCubic = (x) => 1 - Math.pow(1 - x, 3);
const outQuart = (x) => 1 - Math.pow(1 - x, 4);
const easeInOut = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
const damp = (rate, dt) => 1 - Math.exp(-dt * rate);
/** a tiny vertical bob that only runs while the slot is drawn; zero for posters */
const bob = (c, amp, period, phase = 0) => (c.still ? 0 : Math.sin((c.t / period) * TAU + phase) * amp);

/* ---------- hero dumbbell dimensions (scene units, roughly decimetres) ---------- */
const HEAD_R = 0.62;      // hex circumradius
const HEAD_L = 0.86;      // head length along the bar
const CHAMFER = 0.075;
const GRIP_L = 1.22;      // exposed steel between the collars
const GRIP_R = 0.165;
const COLLAR_L = 0.07;
const COLLAR_R = 0.235;
const HEAD_X = GRIP_L / 2 + COLLAR_L + HEAD_L / 2; // centre of each head on the bar

/* ---------- the B mark, from assets/img/mark.svg (viewBox 127.5 x 100) ---------- */
function markShape() {
  const pts = [];
  const P = (x, y) => pts.push(new Vector2(x, y));
  // arc in SVG coordinates (y down); angles in degrees, sampled every ~6 degrees
  const arc = (cx, cy, r, a0, a1) => {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 6));
    for (let i = 1; i <= n; i++) {
      const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
      P(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
  };
  P(15.2, 0);
  P(100.35, 0);
  arc(100.35, 27.15, 27.15, -90, 0);
  arc(100.35, 27.15, 27.15, 0, 54.88);
  arc(99.5, 72, 28, -53.96, 0);
  arc(99.5, 72, 28, 0, 90);
  P(0, 100);
  P(11.76, 75.03);
  P(89.02, 75.03);
  arc(89.02, 68.145, 6.885, 90, -90);
  P(18.25, 61.26);
  P(29.95, 36.42);
  P(89.08, 36.42);
  arc(89.08, 29.6, 6.82, 90, -90);
  P(36.37, 22.78);
  // centre on the origin, flip to y-up
  return new Shape(pts.map((p) => new Vector2(p.x - 63.75, 50 - p.y)));
}

/** the flat B, `width` units across, centred, facing +Z */
function markGeometry(width, curve = 6) {
  const g = new ShapeGeometry(markShape(), curve);
  const s = width / 127.5;
  g.scale(s, s, 1);
  return g;
}

/** split every triangle into four, `levels` times, so a flat shape can bend onto a curve */
function subdivide(geo, levels) {
  let src = geo.index ? geo.toNonIndexed() : geo;
  for (let l = 0; l < levels; l++) {
    const a = src.attributes.position.array;
    const out = new Float32Array(a.length * 4);
    let o = 0;
    const put = (x, y, z) => { out[o++] = x; out[o++] = y; out[o++] = z; };
    for (let i = 0; i < a.length; i += 9) {
      const p0 = [a[i], a[i + 1], a[i + 2]], p1 = [a[i + 3], a[i + 4], a[i + 5]], p2 = [a[i + 6], a[i + 7], a[i + 8]];
      const m = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
      const m01 = m(p0, p1), m12 = m(p1, p2), m20 = m(p2, p0);
      for (const t of [[p0, m01, m20], [m01, p1, m12], [m20, m12, p2], [m01, m12, m20]]) for (const v of t) put(...v);
    }
    src = new BufferGeometry();
    src.setAttribute('position', new BufferAttribute(out, 3));
  }
  return src;
}

/** the B bent onto a surface: `surfaceZ(x, y)` gives the surface depth at each point */
function wrappedMark(width, yc, surfaceZ, levels = 3) {
  const g = subdivide(markGeometry(width, 4), levels);
  g.translate(0, yc, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, surfaceZ(pos.getX(i), pos.getY(i)));
  g.computeVertexNormals();
  return g;
}

/** a rounded rectangle outline, centred */
function roundedRect(w, h, r) {
  const s = new Shape();
  const x = w / 2 - r, y = h / 2 - r;
  s.moveTo(-w / 2, -y);
  s.lineTo(-w / 2, y);
  s.absarc(-x, y, r, Math.PI, Math.PI / 2, true);
  s.lineTo(x, h / 2);
  s.absarc(x, y, r, Math.PI / 2, 0, true);
  s.lineTo(w / 2, -y);
  s.absarc(x, -y, r, 0, -Math.PI / 2, true);
  s.lineTo(-x, -h / 2);
  s.absarc(-x, -y, r, -Math.PI / 2, -Math.PI, true);
  return s;
}

/* ---------- procedural textures ---------- */
function knurlTexture() {
  // diamond knurl: two sets of diagonal grooves, used as bump and roughness
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d8d8';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#6a6a6a';
  g.lineWidth = 5;
  for (let i = -64; i <= 128; i += 16) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(14, 5);
  return t;
}

function ribTexture() {
  // vertical grip ribs for the shaker cap, used as a bump map: smooth ring, ribbed light
  const c = document.createElement('canvas');
  c.width = 16; c.height = 4;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) {
    const v = Math.round(128 + 110 * Math.cos((x / 16) * TAU));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x, 0, 1, 4);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(40, 1);
  return t;
}

function shadowTexture() {
  // soft contact shadow: a blurred ellipse, darkest at the centre, no edge
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,0.85)');
  r.addColorStop(0.45, 'rgba(0,0,0,0.38)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

function tapeTexture() {
  // tape measure print: Deep Black ticks on Stone, a long tick every eight
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e4e4e1';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#141414';
  for (let i = 0; i < 32; i++) {
    const len = i % 8 === 0 ? 34 : i % 4 === 0 ? 24 : 14;
    g.fillRect(i * 8, 0, 2, len);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}

/* ---------- studio environment for reflections (no HDR file to download) ---------- */
function studioEnvironment(renderer) {
  const env = new Scene();
  env.background = new Color(0.012, 0.012, 0.012);
  const panel = (w, h, rgb, pos) => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(...rgb), side: DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
    return m;
  };
  panel(6, 3.6, [7, 7, 6.8], [-3.2, 4.4, 3.6]);        // neutral key softbox, top left
  panel(1.4, 7, [2.6, 2.9, 3.3], [5, 0.4, 1.2]);     // cool strip, right
  panel(7, 0.7, [1.4, 1.4, 1.4], [0, -0.6, 5.5]);    // low front bounce, gives the bar its lower line
  panel(5, 0.6, [0.2, 0.33, 0.08], [0, 2.4, -5]);    // faint green strip behind
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

/* ---------- materials (DESIGN.md: matte rubber, brushed steel, Carbon, Stone, one green) ---------- */
const M = {
  rubber: () => new MeshStandardMaterial({ color: 0x262626, roughness: 0.52, metalness: 0, envMapIntensity: 1.1 }),
  steel: (roughness = 0.3) => new MeshStandardMaterial({ color: 0xd4d7db, metalness: 0.9, roughness, envMapIntensity: 1.6 }),
  carbon: () => new MeshStandardMaterial({ color: 0x1f1f1f, metalness: 0.7, roughness: 0.36, envMapIntensity: 1.2 }),
  // cast iron: matte enough that the bell never shows a bowling-ball highlight
  iron: () => new MeshStandardMaterial({ color: 0x202020, metalness: 0.15, roughness: 0.66, envMapIntensity: 0.8 }),
  plastic: () => new MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0, roughness: 0.46, envMapIntensity: 1.2 }),
  stone: (flatShading = false) => new MeshStandardMaterial({ color: 0xe9e9e9, metalness: 0, roughness: 0.82, flatShading }),
  // Stone a step down for big lit faces, so they sit under white copy instead of glaring
  stoneSoft: () => new MeshStandardMaterial({ color: 0xbdbdbd, metalness: 0, roughness: 0.85 }),
  // matte Carbon for the streak tiles: catches the key light, never mirrors the green rim
  carbonMatte: () => new MeshStandardMaterial({ color: 0x282828, metalness: 0, roughness: 0.78, envMapIntensity: 0.2 }),
  // graphite: a matte dark Stone for chart bars that are not the highlight
  graphite: () => new MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0, roughness: 0.6 }),
  // Brand green skips tone mapping so ACES cannot wash it toward yellow: the B is never recoloured.
  green: () => new MeshStandardMaterial({ color: GREEN, roughness: 0.42, metalness: 0.05, toneMapped: false }),
  // Large green surfaces (the last bar, the flame tip) sit a step under the brand hex so the lit face lands on it.
  greenMatte: (flatShading = false) => new MeshStandardMaterial({ color: new Color(GREEN).multiplyScalar(0.62), roughness: 0.78, metalness: 0, flatShading, toneMapped: false }),
  mark: () => new MeshStandardMaterial({
    color: GREEN, emissive: GREEN, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }),
  flatGreen: () => new MeshBasicMaterial({ color: GREEN, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
};

function contactShadow(rt, w, d, y, opacity = 0.85) {
  const m = new Mesh(
    new PlaneGeometry(w, d),
    new MeshBasicMaterial({ map: rt.shadowTex, transparent: true, depthWrite: false, toneMapped: false, opacity }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = -1;
  return m;
}

/* ============================================================
   Objects
   ============================================================ */

/* ---------- the hex dumbbell ----------
   buildDumbbell() is the hero dumbbell, unchanged. Options:
     collar: 'green' (default) or 'ink' (satin near-black metal, for the green world where a green
             collar would vanish into the page)
     split:  true builds each head as three slices and puts the right head's B on a thin rubber
             medallion, so the exploded view can take it apart
   The group's userData.parts = { slices: [[outer, middle, inner] left, [..] right] (split only),
   heads (whole heads, not split), collars: [left, right], grip (group: knurl and shoulders),
   shoulders, medal (split only), marks } */
function headProfile(len, R, cIn, cOut) {
  // a hex slice along the lathe's Y axis: -len/2 is the inner end, +len/2 the outer end
  const h = len / 2;
  return [
    new Vector2(0, -h), new Vector2(R - cIn, -h), new Vector2(R, -h + cIn),
    new Vector2(R, h - cOut), new Vector2(R - cOut, h), new Vector2(0, h),
  ];
}

function buildDumbbell(opts = {}) {
  const { collar: collarKind = 'green', split = false } = opts;
  const dumbbell = new Group();

  const rubber = new MeshStandardMaterial({ color: 0x262626, roughness: 0.52, metalness: 0, flatShading: false, envMapIntensity: 1.1 });
  const knurl = knurlTexture();
  const steel = new MeshStandardMaterial({
    color: 0xd4d7db, metalness: 0.9, roughness: 0.38,
    bumpMap: knurl, bumpScale: 1.6, roughnessMap: knurl, envMapIntensity: 1.6,
  });
  const steelSmooth = new MeshStandardMaterial({ color: 0xd4d7db, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.6 });
  const collarMat = collarKind === 'ink'
    ? new MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.4, envMapIntensity: 1.2 })
    : M.green();
  const mark = M.mark();

  // hex head: a 6-sided lathe with chamfered rims, axis along X
  const h = HEAD_L / 2, R = HEAD_R, c = CHAMFER;
  const headGeo = new LatheGeometry(headProfile(HEAD_L, R, c, c), 6, Math.PI / 6);
  headGeo.rotateZ(-Math.PI / 2);

  const markGeo = new ShapeGeometry(markShape(), 6);
  const markScale = ((R - c) * 0.92) / 127.5 * 1.04;
  markGeo.scale(markScale, markScale, 1);
  markGeo.rotateZ(-0.38); // undo the diagonal pose so the B stands upright in the first frame

  const parts = { slices: [], heads: [], collars: [], shoulders: [], marks: [], grip: null, medal: null };

  // split heads: three slices, the outer one carries the big chamfer, the cut faces a small one
  const SL = HEAD_L / 3, cut = 0.022;
  const sliceGeo = split ? [
    new LatheGeometry(headProfile(SL, R, cut, c), 6, Math.PI / 6),   // outer
    new LatheGeometry(headProfile(SL, R, cut, cut), 6, Math.PI / 6), // middle
    new LatheGeometry(headProfile(SL, R, c, cut), 6, Math.PI / 6),   // inner
  ] : null;
  if (sliceGeo) sliceGeo.forEach((g) => g.rotateZ(-Math.PI / 2)); // lathe +Y becomes -X; flipped per side below

  for (const side of [-1, 1]) {
    if (split) {
      const row = [];
      for (let i = 0; i < 3; i++) {
        const slice = new Group();
        const m = new Mesh(sliceGeo[i], rubber);
        // rotateZ(-PI/2) sends the lathe's outer end to +X; the left side mirrors it
        if (side < 0) m.rotation.y = Math.PI;
        slice.add(m);
        slice.position.x = side * (HEAD_X + h - SL / 2 - i * SL);
        slice.userData.rest = slice.position.x;
        dumbbell.add(slice);
        row.push(slice);
      }
      parts.slices.push(row);
      if (side < 0) {
        const m = new Mesh(markGeo, mark);
        m.rotation.y = side * Math.PI / 2;
        m.position.x = side * (SL / 2 + 0.002);
        row[0].add(m);
        parts.marks.push(m);
      } else {
        // the medallion: the B on a thin rubber disc, flush on the right head's outer face
        const medal = new Group();
        const disc = new Mesh(new CylinderGeometry((R - c) * 0.8, (R - c) * 0.8, 0.04, 48), rubber);
        disc.rotation.x = Math.PI / 2;
        disc.position.z = -0.02;
        medal.add(disc);
        const m = new Mesh(markGeo, mark);
        m.position.z = 0.002;
        medal.add(m);
        medal.rotation.y = Math.PI / 2;
        medal.position.x = SL / 2 + 0.04;
        row[0].add(medal);
        parts.medal = medal;
        parts.marks.push(m);
      }
    } else {
      const head = new Mesh(headGeo, rubber);
      head.position.x = side * HEAD_X;
      dumbbell.add(head);
      parts.heads.push(head);

      // the B sits on the outer face, upright, reading correctly from outside
      const m = new Mesh(markGeo, mark);
      m.rotation.y = side * Math.PI / 2;
      m.position.x = side * (HEAD_X + h + 0.002);
      dumbbell.add(m);
      parts.marks.push(m);
    }

    const collar = new Mesh(new CylinderGeometry(COLLAR_R, COLLAR_R, COLLAR_L, 40), collarMat);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = side * (GRIP_L / 2 + COLLAR_L / 2);
    collar.userData.rest = collar.position.x;
    dumbbell.add(collar);
    parts.collars.push(collar);

    // short smooth shoulder of the bar between knurl and collar
    const shoulder = new Mesh(new CylinderGeometry(GRIP_R, GRIP_R, 0.12, 40), steelSmooth);
    shoulder.rotation.z = Math.PI / 2;
    shoulder.position.x = side * (GRIP_L / 2 - 0.06);
    parts.shoulders.push(shoulder);
  }

  const grip = new Mesh(new CylinderGeometry(GRIP_R, GRIP_R, GRIP_L - 0.24, 48, 1, true), steel);
  grip.rotation.z = Math.PI / 2;
  const gripGroup = new Group();
  gripGroup.add(grip, ...parts.shoulders);
  dumbbell.add(gripGroup);
  parts.grip = gripGroup;

  dumbbell.userData.parts = parts;
  return dumbbell;
}

/* ---------- kettlebell: cast bell, looped handle, the B on the front ---------- */
function buildKettlebell() {
  const g = new Group();
  const iron = M.iron();
  const R = 0.78;
  // bell profile, bottom to top so the lathe faces point outward
  const prof = [new Vector2(0, -0.6), new Vector2(0.4, -0.6), new Vector2(0.45, -0.585)];
  const a0 = Math.asin(-0.57 / R), a1 = (68 * Math.PI) / 180;
  for (let i = 0; i <= 18; i++) {
    const a = a0 + ((a1 - a0) * i) / 18;
    prof.push(new Vector2(R * Math.cos(a), R * Math.sin(a)));
  }
  prof.push(new Vector2(0.18, 0.77), new Vector2(0, 0.78));
  g.add(new Mesh(new LatheGeometry(prof, 56), iron));

  // handle: one tube from shoulder to shoulder over the top
  const pts = [
    [-0.4, 0.5], [-0.47, 0.82], [-0.42, 1.12], [-0.24, 1.3], [0, 1.35],
    [0.24, 1.3], [0.42, 1.12], [0.47, 0.82], [0.4, 0.5],
  ].map(([x, y]) => new Vector3(x, y, 0));
  g.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 64, 0.088, 14), iron));

  // the B, wrapped onto the bell's front so it sits on the curve
  const mg = wrappedMark(0.5, -0.06, (x, y) => Math.sqrt(Math.max(0, R * R - x * x - y * y)) + 0.006);
  g.add(new Mesh(mg, M.mark()));
  return g;
}

/* ---------- shaker: matte black bottle, the B, a twist cap with a green collar ---------- */
function buildShaker() {
  const g = new Group();
  const R = 0.42;
  const prof = [
    [0, -0.75], [0.35, -0.75], [0.405, -0.72], [R, -0.64], [R, 0.48], [0.405, 0.55], [0.36, 0.6], [0.32, 0.61], [0.32, 0.7], [0, 0.7],
  ].map(([r, y]) => new Vector2(r, y));
  g.add(new Mesh(new LatheGeometry(prof, 56), M.plastic()));

  // a printed fill scale on the back third, so the turn reads
  const tickMat = M.stone();
  const longTick = new BoxGeometry(0.12, 0.014, 0.01);
  const shortTick = new BoxGeometry(0.065, 0.014, 0.01);
  for (let i = 0; i < 5; i++) {
    const a = -2.2; // around the back left, so it swings into view as the bottle turns
    const tick = new Mesh(i % 2 ? shortTick : longTick, tickMat);
    tick.position.set(Math.sin(a) * (R + 0.003), -0.32 + i * 0.16, Math.cos(a) * (R + 0.003));
    tick.rotation.y = a;
    g.add(tick);
  }

  // the B, wrapped onto the bottle's front
  const mg = wrappedMark(0.4, -0.08, (x) => Math.sqrt(Math.max(0, R * R - x * x)) + 0.004);
  g.add(new Mesh(mg, M.mark()));

  // cap: a smooth grip ring with fine ribs (bump, not facets), a flip spout off-centre so the
  // twist is visible, a thin green collar
  const cap = new Group();
  const carbon = M.carbon();
  const ribs = ribTexture();
  const ring = new Mesh(new CylinderGeometry(0.4, 0.42, 0.24, 48), new MeshStandardMaterial({
    color: 0x1f1f1f, metalness: 0.4, roughness: 0.42, bumpMap: ribs, bumpScale: 1.2, envMapIntensity: 1.2,
  }));
  cap.add(ring);
  const top = new Mesh(new CylinderGeometry(0.34, 0.4, 0.05, 44), carbon);
  top.position.y = 0.145;
  cap.add(top);
  const spout = new Mesh(new CylinderGeometry(0.085, 0.105, 0.13, 24), carbon);
  spout.position.set(0.17, 0.22, 0.05);
  cap.add(spout);
  const hinge = new Mesh(new BoxGeometry(0.22, 0.05, 0.1), carbon);
  hinge.position.set(-0.2, 0.19, -0.02);
  hinge.rotation.y = 0.25;
  cap.add(hinge);
  const collar = new Mesh(new CylinderGeometry(0.425, 0.425, 0.034, 48), M.green());
  collar.position.y = -0.128;
  cap.add(collar);
  cap.position.y = 0.7 + 0.03;
  g.add(cap);
  return { group: g, cap, capRest: cap.position.y };
}

/* ---------- weight plate: rubber, raised rim and hub, open centre ---------- */
function plateGeometry(R) {
  const h = 0.09, w = 0.045;
  const pts = [
    [R - 0.03, -h], [R, -h + 0.03], [R, h - 0.03], [R - 0.03, h],
    [R - 0.14, h], [R - 0.18, w], [0.36, w], [0.3, h],
    [0.15, h], [0.125, h - 0.02], [0.125, -h + 0.02], [0.15, -h],
    [0.3, -h], [0.36, -w], [R - 0.18, -w], [R - 0.14, -h], [R - 0.03, -h],
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 56);
}

/* ---------- week streak: seven Carbon tiles, a Stone check on six, the green B on the seventh ---------- */
const TILE_W = 0.34, TILE_H = 0.46, TILE_T = 0.07;
function buildStreakTiles(rt) {
  // each tile hinges on its bottom front edge: rotation.x = PI/2 lays it face down toward the viewer
  const tileGeo = new RoundedBoxGeometry(TILE_W, TILE_H, TILE_T, 3, 0.026);
  tileGeo.translate(0, TILE_H / 2, -TILE_T / 2);
  const tileMat = M.carbonMatte();
  const stone = M.stoneSoft();
  // the check: a short arm and a long arm, rounded, raised a little off the face
  const arm = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = new RoundedBoxGeometry(len + 0.034, 0.034, 0.016, 2, 0.012);
    g.rotateZ(Math.atan2(y1 - y0, x1 - x0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0.008);
    return g;
  };
  const checkA = arm(-0.085, 0.235, -0.03, 0.18), checkB = arm(-0.03, 0.18, 0.09, 0.3);
  const markGeo = new ExtrudeGeometry(markShape(), { depth: 0.014, bevelEnabled: false, curveSegments: 4 });
  const ms = 0.24 / 127.5;
  markGeo.scale(ms, ms, 1);
  markGeo.translate(0, TILE_H / 2, 0);
  const markMats = [
    new MeshBasicMaterial({ color: GREEN, toneMapped: false }),
    new MeshStandardMaterial({ color: GREEN, roughness: 0.55, metalness: 0.05, toneMapped: false }),
  ];
  return Array.from({ length: 7 }, (_, i) => {
    const seat = new Group();     // where the tile stands, turned to face the camera
    const hinge = new Group();    // flips about the bottom front edge
    hinge.add(new Mesh(tileGeo, tileMat));
    if (i < 6) hinge.add(new Mesh(checkA, stone), new Mesh(checkB, stone));
    else hinge.add(new Mesh(markGeo, markMats));
    seat.add(hinge);
    const sh = contactShadow(rt, 0.62, 0.34, -0.001, 0.55);
    sh.position.z = 0.02;
    seat.add(sh);
    return { seat, hinge };
  });
}

/* ---------- medal: Carbon disc, green rings, the raised B ---------- */
function buildMedal() {
  const g = new Group();
  const t = 0.12;
  const profile = [
    [0, t], [0.9, t], [0.955, t - 0.012], [0.99, t - 0.04], [1.0, t - 0.07],
    [1.0, -(t - 0.07)], [0.99, -(t - 0.04)], [0.955, -(t - 0.012)], [0.9, -t], [0, -t],
  ].map(([r, y]) => new Vector2(r, y));
  const disc = new LatheGeometry(profile.slice().reverse(), 64);
  disc.rotateX(Math.PI / 2);
  g.add(new Mesh(disc, new MeshStandardMaterial({ color: 0x1f1f1f, metalness: 0.8, roughness: 0.42, envMapIntensity: 0.9 })));
  const ringGeo = new TorusGeometry(0.84, 0.03, 8, 72);
  const ringMat = M.green();
  for (const side of [1, -1]) {
    const ring = new Mesh(ringGeo, ringMat);
    ring.position.z = side * t;
    g.add(ring);
  }
  // the B raised on the front: exact green face, lit sides
  const geo = new ExtrudeGeometry(markShape(), { depth: 0.05, bevelEnabled: false, curveSegments: 1 });
  const s = 1.06 / 127.5;
  geo.scale(s, s, 1);
  const face = new MeshBasicMaterial({ color: GREEN, toneMapped: false });
  const side = new MeshStandardMaterial({ color: GREEN, roughness: 0.55, metalness: 0.05, emissive: GREEN, emissiveIntensity: 0.12, toneMapped: false });
  const mark = new Mesh(geo, [face, side]);
  mark.position.z = t - 0.005;
  g.add(mark);
  return g;
}

/* ============================================================
   Slots: one builder per data-3d name. Each returns
   { root, camera, aspect, update(c), layout?(W, H) }
   ============================================================ */

function cam(dist, y = 0.6, x = 0, look = [0, 0, 0], fov = 28) {
  const c = new PerspectiveCamera(fov, 1, 0.1, 60);
  c.position.set(x, y, dist);
  c.lookAt(...look);
  return c;
}

/* ---------- hero: the floating dumbbell, its ambient loop, pointer tilt and scroll drift ---------- */
const BOB = 0.075;            // ~8 css px at the hero's size
const BOB_PERIOD = 6;         // seconds
const SPIN_PERIOD = 20;       // one revolution around the bar
const TILT = 0.06;            // slight rocking on X, radians
const POINTER_MAX = (8 * Math.PI) / 180;

function heroSlot(rt) {
  const root = new Group();
  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.8, 7.7);
  camera.lookAt(0, 0, 0);

  // rig: drift (scroll, bob, pointer) > pose (the diagonal) > yaw > spin (around the bar)
  const drift = new Group();
  const pose = new Group();
  const yaw = new Group();
  const spin = new Group();
  pose.rotation.z = 0.46;        // rises to the right, like the forward lean of the B
  yaw.rotation.y = -0.62;        // turn the right face toward the light and the viewer
  yaw.rotation.x = 0.12;
  spin.add(buildDumbbell());
  yaw.add(spin);
  pose.add(yaw);
  drift.add(pose);
  drift.position.set(0.1, 0.12, 0);
  root.add(drift);

  const shadow = new Mesh(
    new PlaneGeometry(2.8, 0.8),
    new MeshBasicMaterial({ map: rt.shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.05, -1.05, 0.2);
  root.add(shadow);

  const pointer = { x: 0, y: 0 };
  let scrollP = 0, first = true, t = 0, speed = 0;

  return {
    root, camera, aspect: 1, ambient: true,
    update(c) {
      if (c.still) { spin.rotation.x = 0; drift.position.y = 0.12; return; } // the poster frame
      const dt = c.dt;
      if (c.started) {
        speed = Math.min(1, speed + dt / 1.4);
        t += dt * easeInOut(speed);
      }
      const k = damp(4, dt);
      pointer.x += (c.pointer.x - pointer.x) * k;
      pointer.y += (c.pointer.y - pointer.y) * k;
      const r = c.track;
      const target = r.height ? clamp01(-r.top / r.height) : 0;
      scrollP = first ? target : scrollP + (target - scrollP) * damp(6, dt);
      first = false;

      spin.rotation.x = (t / SPIN_PERIOD) * TAU;
      yaw.rotation.x = 0.12 + Math.sin((t / 9) * TAU) * TILT;
      const b = Math.sin((t / BOB_PERIOD) * TAU) * BOB;
      drift.position.y = 0.12 + b + scrollP * 0.8;
      drift.rotation.y = pointer.x * POINTER_MAX + scrollP * 0.5;
      drift.rotation.x = pointer.y * POINTER_MAX + scrollP * 0.25;
      // the shadow tightens and darkens as the bell sinks, softens as it rises
      const lift = (b / BOB + 1) / 2 + scrollP * 2;
      shadow.scale.setScalar(1 + lift * 0.08);
      shadow.material.opacity = Math.max(0, 0.9 - lift * 0.18 - scrollP * 3);
    },
  };
}

/* ---------- how it works: four small objects, each with its own entrance as its step arrives ----------
   The phone flips up from flat, the tape turns in on its coil, the dumbbell and shaker slide
   together from either side, the progress ring fills. `e` is the eased entrance (0 to 1). */
function stepSlot(rt, build, phase) {
  const root = new Group();
  const holder = new Group();
  const inner = build(rt);
  holder.add(inner.group);
  root.add(holder);
  const camera = cam(5.7, 1.0);
  return {
    root, camera, aspect: 1,
    update(c) {
      const e = outCubic(win(0.06, 0.42, c.p));
      holder.rotation.y = (c.p - 0.5) * 0.5;
      holder.position.y = bob(c, 0.035, 5, phase);
      inner.update(c, e);
    },
  };
}

function howPhone() {
  const g = new Group();
  const body = new ExtrudeGeometry(roundedRect(0.9, 1.84, 0.2), {
    depth: 0.08, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 3, curveSegments: 12,
  });
  body.translate(0, 0, -0.04);
  g.add(new Mesh(body, M.steel(0.34)));
  const zf = 0.04 + 0.035;
  const screen = new Mesh(new ShapeGeometry(roundedRect(0.84, 1.78, 0.17), 12),
    new MeshStandardMaterial({ color: 0x080808, roughness: 0.16, metalness: 0, envMapIntensity: 1.3 }));
  screen.position.z = zf + 0.002;
  g.add(screen);
  const island = new Mesh(new ShapeGeometry(roundedRect(0.22, 0.06, 0.03), 6), new MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, 0.79, zf + 0.004);
  g.add(island);
  const mark = new Mesh(markGeometry(0.44), M.flatGreen());
  mark.position.set(0, 0.04, zf + 0.005);
  g.add(mark);
  // hinge on the bottom edge: the phone starts lying face up and stands up toward the viewer
  const BASE = 0.95;
  g.position.y = BASE;
  g.rotation.z = 0.06;
  const hinge = new Group();
  hinge.add(g);
  hinge.position.y = -BASE;
  const root = new Group();
  root.add(hinge);
  return {
    group: root,
    update(c, e) {
      hinge.rotation.x = -0.12 - (1 - e) * 1.42;
      root.scale.setScalar(0.86 + 0.14 * e);
    },
  };
}

function howTape(rt) {
  // a coiled tape around a Carbon hub, its free end running out toward the viewer
  const g = new Group();
  const turns = 2.6, r0 = 0.5, pitch = 0.055, width = 0.44;
  const segs = 180, tail = 0.75, tailSegs = 16;
  const verts = [], uvs = [], idx = [];
  let s = 0, prev = null;
  const push = (x, z) => {
    if (prev) s += Math.hypot(x - prev[0], z - prev[1]);
    prev = [x, z];
    const u = s / 0.55;
    verts.push(x, -width / 2, z, x, width / 2, z);
    uvs.push(u, 1, u, 0);
  };
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * turns * TAU;
    const r = r0 + (pitch * a) / TAU;
    push(Math.cos(a) * r, Math.sin(a) * r);
  }
  const aEnd = turns * TAU, rEnd = r0 + pitch * turns;
  const ex = Math.cos(aEnd) * rEnd, ez = Math.sin(aEnd) * rEnd;
  const tx = -Math.sin(aEnd), tz = Math.cos(aEnd);
  for (let i = 1; i <= tailSegs; i++) push(ex + tx * (tail * i) / tailSegs, ez + tz * (tail * i) / tailSegs);
  const n = verts.length / 6;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
    idx.push(a, c2, b, b, c2, d);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const coil = new Group();
  g.add(coil);
  const band = new Mesh(geo, new MeshStandardMaterial({ map: tapeTexture(), roughness: 0.62, metalness: 0.05, side: DoubleSide }));
  coil.add(band);

  const hub = new Mesh(new CylinderGeometry(0.5, 0.5, width * 0.96, 48), M.carbon());
  coil.add(hub);
  const mark = new Mesh(markGeometry(0.5), M.flatGreen());
  mark.rotation.set(-Math.PI / 2, 0, -0.75); // cancels the coil's turn below, so the B reads upright
  mark.position.y = (width * 0.96) / 2 + 0.003;
  coil.add(mark);
  // the hook at the free end: a thin green tab
  const hook = new Mesh(new BoxGeometry(0.035, width + 0.06, 0.09), M.green());
  hook.position.set(ex + tx * tail, 0, ez + tz * tail);
  hook.rotation.y = -aEnd;
  coil.add(hook);

  // tip the coil toward the viewer so the layers and the printed face both read
  g.rotation.set(0.62, 0.75, 0.0);
  return {
    group: g,
    update(c, e) {
      // the coil turns in on its own axis, the way a tape winds, and settles with the B upright
      coil.rotation.y = (1 - e) * TAU * 0.55;
      g.scale.setScalar(1.08 * (0.7 + 0.3 * e));
    },
  };
}

function howPair(rt) {
  const g = new Group();
  const db = buildDumbbell();
  db.scale.setScalar(0.42);
  db.rotation.set(0.0, 0.55, 0.0);
  db.position.set(-0.32, -0.52, 0.42);
  g.add(db);
  const sh = buildShaker();
  sh.group.scale.setScalar(0.66);
  sh.group.position.set(0.48, -0.25, -0.3);
  sh.group.rotation.y = -0.35;
  g.add(sh.group);
  const shadow = contactShadow(rt, 2.6, 1.4, -0.78, 0.7);
  g.add(shadow);
  return {
    group: g,
    update(c, e) {
      // the two slide in from either side and meet in the middle
      const off = (1 - e) * 0.75;
      db.position.x = -0.32 - off;
      db.rotation.y = 0.55 + (1 - e) * 0.7;
      sh.group.position.x = 0.48 + off;
      sh.group.rotation.y = -0.35 - (1 - e) * 0.9;
      shadow.scale.x = 0.7 + 0.3 * e;
    },
  };
}

/** a torus whose triangles run in order from 12 o'clock, clockwise, so a draw range draws an arc */
function arcTube(R, r, radial, tubular) {
  const pos = [], nor = [], idx = [];
  for (let i = 0; i <= tubular; i++) {
    const a = (i / tubular) * TAU;
    const cx = Math.sin(a), cy = Math.cos(a);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * TAU;
      const nx = cx * Math.cos(v), ny = cy * Math.cos(v), nz = Math.sin(v);
      pos.push(cx * R + nx * r, cy * R + ny * r, nz * r);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  geo.setIndex(idx);
  return geo;
}

function howRing() {
  // the app's progress ring in 3D: a Carbon track, a green arc that fills as the step arrives
  const g = new Group();
  const R = 0.7, r = 0.12, RAD = 18, TUB = 120, FULL = 0.75;
  g.add(new Mesh(arcTube(R, r, RAD, TUB), M.carbon()));
  const green = M.green();
  const arc = new Mesh(arcTube(R, r * 1.08, RAD, TUB), green);
  g.add(arc);
  // round ends, like the app ring's stroke caps
  const capGeo = new SphereGeometry(r * 1.08, 20, 12);
  const start = new Mesh(capGeo, green);
  start.position.set(0, R, 0);
  const head = new Mesh(capGeo, green);
  g.add(start, head);
  g.rotation.set(-0.28, 0.42, 0);
  return {
    group: g,
    update(c, e) {
      const n = Math.round(FULL * e * TUB);
      arc.geometry.setDrawRange(0, n * RAD * 6);
      arc.visible = start.visible = head.visible = n > 0;
      const a = (n / TUB) * TAU;
      head.position.set(Math.sin(a) * R, Math.cos(a) * R, 0);
      g.scale.setScalar(0.82 + 0.18 * e);
    },
  };
}

/* ---------- features: a kettlebell turning with scroll ---------- */
function featuresSlot(rt) {
  const root = new Group();
  const turn = new Group();
  turn.add(buildKettlebell());
  turn.position.y = -0.3;
  root.add(turn);
  root.add(contactShadow(rt, 2.4, 1.3, -0.95, 0.8));
  const camera = cam(6.6, 1.1, 0, [0, -0.05, 0]);
  return {
    root, camera, aspect: 1,
    update(c) {
      // a short swing (about 34 degrees each way) so the B faces the viewer most of the scroll
      turn.rotation.y = (c.p - 0.5) * 1.2;
      turn.rotation.z = (c.p - 0.5) * -0.12;
      turn.position.y = -0.3 + bob(c, 0.03, 6);
    },
  };
}

/* ---------- diet: the BUILT shaker, its cap screwing on as the section scrolls ---------- */
const PITCH = 0.16; // cap rise per full turn
function dietSlot(rt) {
  const root = new Group();
  const sh = buildShaker();
  const body = new Group();
  body.add(sh.group);
  body.position.y = -0.18;
  root.add(body);
  root.add(contactShadow(rt, 1.8, 1.0, -0.95, 0.8));
  const camera = cam(6.1, 1.0, 0, [0, 0.16, 0]);
  return {
    root, camera, aspect: 0.55,
    update(c) {
      const seat = outCubic(win(0.04, 0.62, c.p));
      const lift = (1 - seat) * 0.42;
      sh.cap.position.y = sh.capRest + lift;
      sh.cap.rotation.y = -(lift / PITCH) * TAU;
      body.rotation.y = (c.p - 0.5) * 1.1;
      body.position.y = -0.18 + bob(c, 0.025, 6);
    },
  };
}

/* ---------- training: plates stacking one by one onto a steel pin ---------- */
function trainingSlot(rt) {
  const root = new Group();
  const stack = new Group();
  root.add(stack);
  // a stack of rubber faces catches the green rim more than any other object: this slot's
  // rubber takes less environment and the slot draws with a dimmer rim (see `rim` below)
  const rubber = M.rubber();
  rubber.envMapIntensity = 0.8;
  const radii = [0.98, 0.88, 0.78, 0.68, 0.58];
  const T = 0.18, base = -0.95;
  const plates = radii.map((R, i) => {
    const m = new Mesh(plateGeometry(R), rubber);
    const rest = base + T / 2 + i * T;
    m.position.y = rest;
    stack.add(m);
    return { m, rest };
  });
  const pinTop = base + radii.length * T + 0.24;
  const pinGeo = new CylinderGeometry(0.11, 0.11, pinTop - base, 32);
  pinGeo.translate(0, (pinTop + base) / 2, 0);
  stack.add(new Mesh(pinGeo, M.steel(0.32)));
  const collar = new Mesh(new CylinderGeometry(0.16, 0.16, 0.07, 40), M.green());
  collar.position.y = base + radii.length * T + 0.035;
  stack.add(collar);
  root.add(contactShadow(rt, 2.8, 1.6, base - 0.001, 0.9));
  const camera = cam(7.3, 2.6, 0, [0, -0.15, 0]);
  return {
    root, camera, aspect: 0.62, rim: 0.12,
    update(c) {
      let top = base;
      plates.forEach((pl, i) => {
        const k = win(0.05 + i * 0.085, 0.2 + i * 0.085, c.p);
        const e = outCubic(k);
        pl.m.visible = k > 0;
        pl.m.position.y = pl.rest + (1 - e) * 1.2;
        pl.m.rotation.y = (1 - e) * 1.6;
        pl.m.rotation.x = (1 - e) * 0.35;
        pl.m.scale.setScalar(0.4 + 0.6 * outCubic(clamp01(k * 2.5)));
        if (k >= 1) top = pl.rest + T / 2;
      });
      // the collar rides down onto the top plate once the stack is complete
      collar.position.y = Math.max(top, base + radii.length * T) + 0.035;
      collar.visible = c.p > 0.5;
      stack.rotation.y = -0.3 + (c.p - 0.5) * 0.6;
    },
  };
}

/* ---------- accountability: a week streak; the tiles flip up one by one, the last shows the B ----------
   Wide slots (phones, tablets) stand the week in a gentle arc facing the viewer. Tall slots (the narrow
   desktop column) run the same week as a curving path toward the viewer, Monday furthest, the B nearest. */
function accountabilitySlot(rt) {
  const root = new Group();
  const week = new Group();
  root.add(week);
  const tiles = buildStreakTiles(rt);
  tiles.forEach((t) => week.add(t.seat));
  const camera = new PerspectiveCamera(28, 1, 0.1, 60);
  let mode = '';
  const slot = {
    // tiles lying face down catch the green rim at a grazing angle; a dimmer rim keeps them Carbon
    root, camera, aspect: 0.62, rim: 0.06,
    layout(W, H) {
      const next = W / H >= 1 ? 'wide' : 'tall';
      if (next === mode) return;
      mode = next;
      if (mode === 'wide') {
        slot.aspect = 2.1;
        camera.position.set(0, 0.95, 3.75);
        camera.lookAt(0, 0.2, 0.3);
        // a gentle arc: the ends come a little toward the viewer
        const R = 3.2, step = 0.135;
        tiles.forEach((t, i) => {
          const a = (i - 3) * step;
          t.seat.position.set(R * Math.sin(a), -0.05, R * (1 - Math.cos(a)));
          t.seat.rotation.y = -a;
          t.seat.scale.setScalar(1);
        });
      } else {
        slot.aspect = 0.62;
        camera.position.set(0, 3.3, 5.6);
        camera.lookAt(0, -0.3, -0.55);
        tiles.forEach((t, i) => {
          const z = -2.15 + i * 0.62;
          const x = 0.42 * Math.sin((i / 6) * Math.PI) - 0.12;
          t.seat.position.set(x, -0.55, z);
          t.seat.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z) * 0.6;
          t.seat.scale.setScalar(1.25);
        });
      }
    },
    update(c) {
      tiles.forEach((t, i) => {
        const k = outCubic(win(0.08 + i * 0.075, 0.24 + i * 0.075, c.p));
        t.hinge.rotation.x = (1 - k) * (Math.PI / 2);
      });
      week.position.y = bob(c, 0.02, 6);
      week.rotation.y = (c.p - 0.5) * 0.16;
    },
  };
  slot.layout(300, 500);
  return slot;
}

/* ---------- progress: a week of bars rising as the section scrolls; only this week's is green ---------- */
function progressSlot(rt) {
  const root = new Group();
  const chart = new Group();
  root.add(chart);
  const plate = new Mesh(new BoxGeometry(3.1, 0.12, 1.0), M.carbon());
  plate.position.y = -0.92;
  chart.add(plate);
  const heights = [0.5, 0.68, 0.62, 0.9, 1.06, 1.0, 1.46];
  // mirrors the app's weekly card: past weeks in graphite, the latest week in green
  const past = M.graphite();
  const latest = M.greenMatte();
  const barGeo = new RoundedBoxGeometry(0.3, 1, 0.42, 3, 0.03);
  barGeo.translate(0, 0.5, 0);
  const bars = heights.map((h, i) => {
    const m = new Mesh(barGeo, i === heights.length - 1 ? latest : past);
    m.position.set((i - 3) * 0.41, -0.86, 0);
    chart.add(m);
    return m;
  });
  root.add(contactShadow(rt, 4.2, 1.8, -0.985, 0.8));
  const camera = cam(7.2, 2.2, 1.6, [0, -0.15, 0]);
  return {
    root, camera, aspect: 1.15,
    update(c) {
      bars.forEach((b, i) => {
        const k = outCubic(win(0.06 + i * 0.045, 0.32 + i * 0.045, c.p));
        b.scale.y = Math.max(0.015, heights[i] * k);
      });
      chart.rotation.y = -0.18 + (c.p - 0.5) * 0.4;
      chart.position.y = bob(c, 0.02, 6);
    },
  };
}

/* ---------- pricing: the B medal flips in, then leans toward the pointer ---------- */
function pricingSlot() {
  const root = new Group();
  const lean = new Group();
  const flip = new Group();
  flip.add(buildMedal());
  lean.add(flip);
  root.add(lean);
  const camera = cam(6.0, 0.25);
  const tilt = { x: 0, y: 0 };
  return {
    root, camera, aspect: 1,
    update(c) {
      const e = outCubic(win(0.04, 0.34, c.p));
      flip.rotation.y = (1 - e) * Math.PI;
      flip.scale.setScalar(0.62 + 0.38 * e);
      // gently follow a fine pointer once the flip has landed
      let tx = 0, ty = 0;
      if (c.fine && c.pointer.active && e >= 1) {
        const r = c.rect;
        const nx = (c.pointer.cx - (r.left + r.width / 2)) / (c.vw / 2);
        const ny = (c.pointer.cy - (r.top + r.height / 2)) / (c.vh / 2);
        ty = Math.max(-1, Math.min(1, nx)) * 0.3;
        tx = Math.max(-1, Math.min(1, ny)) * 0.22;
      }
      const k = c.still ? 1 : damp(3.5, c.dt);
      tilt.x += (tx - tilt.x) * k;
      tilt.y += (ty - tilt.y) * k;
      lean.rotation.set(tilt.x, tilt.y, 0);
      lean.position.y = bob(c, 0.03, 6);
    },
  };
}

/* ---------- final CTA: dumbbell, kettlebell and shaker orbiting the headline ---------- */
function finalSlot() {
  const root = new Group();
  // natural footprint of each object (scene units) so they can be sized to the margin they get
  const items = [
    { o: buildDumbbell(), foot: 2.9, side: -1, y: 0.5, spin: [0.5, 2.2, 0.55] },
    { o: buildKettlebell(), foot: 1.9, side: 1, y: 0.04, spin: [0, 2.6, 0.08] },
    { o: buildShaker().group, foot: 1.7, side: -1, y: -0.52, spin: [0, 2.4, 0.14] },
  ].map((it) => {
    const hold = new Group();
    const turn = new Group();
    turn.add(it.o);
    hold.add(turn);
    root.add(hold);
    return { ...it, hold, turn };
  });
  const camera = new PerspectiveCamera(28, 1, 0.1, 60);
  const HALF = Math.tan((14 * Math.PI) / 180); // half the vertical field of view, as a slope
  let mode = 'wide';
  const slot = {
    root, camera, aspect: 1.9,
    layout(W, H) {
      mode = H < 420 ? 'compact' : 'wide';
      slot.aspect = mode === 'wide' ? 1.9 : 1.8;
      if (mode === 'wide') camera.position.set(0, 0.2, 7.7);
      else camera.position.set(0, 1.5, 7.4);
      camera.lookAt(0, mode === 'wide' ? 0 : -0.05, 0);
    },
    update(c) {
      const p = c.p;
      const sw = (p - 0.5);
      if (mode === 'wide') {
        // The copy owns the middle. The engine passes the rects of the headline and of the
        // lines under it (data-3d-avoid); the objects take the free space either side of the
        // lines under the headline: the dumbbell on the left, kettlebell and shaker circling
        // each other on the right. Nothing ever crosses the copy.
        const d = camera.position.length();
        const r = c.rect;
        const Sh = Math.min(r.height, r.width / slot.aspect);
        const upp = (2 * d * HALF) / Sh; // scene units per css px at the centre plane
        let bandTop = r.top + r.height * 0.42, innerL = r.left + r.width * 0.33, innerR = r.right - r.width * 0.33;
        if (c.avoid && c.avoid.length) {
          bandTop = c.avoid[0].bottom;
          const below = c.avoid.slice(1).filter((a) => a.width > 0 && a.bottom > bandTop);
          if (below.length) {
            innerL = Math.min(...below.map((a) => a.left));
            innerR = Math.max(...below.map((a) => a.right));
          }
        }
        const bandBot = r.bottom - 12;
        const bandH = Math.max(80, bandBot - bandTop);
        const leftW = Math.max(40, innerL - r.left), rightW = Math.max(40, r.right - innerR);
        const room = Math.min(Math.min(leftW, rightW) * 0.62, bandH * 0.75, 240); // px
        const cy = (bandTop + bandBot) / 2;
        const toX = (px) => (px - (r.left + r.width / 2)) * upp;
        const toY = (px) => ((r.top + r.height / 2) - px) * upp;
        const R = room * upp;
        const lx = toX(r.left + leftW / 2), rx = toX(innerR + rightW / 2), y0 = toY(cy);
        const th = sw * Math.PI * 1.1;
        // dumbbell: a slow loop in its own lane, nearer and further as the page scrolls
        const db = items[0];
        // x is pulled in as an object comes forward, so its projected position stays in its lane
        const zd = Math.cos(th) * R * 0.35;
        db.hold.position.set((lx + Math.sin(th) * R * 0.12) * (d - zd) / d, y0 + Math.cos(th) * R * 0.06 + bob(c, 0.035, 6), zd);
        db.o.scale.setScalar(R / db.foot);
        db.turn.rotation.set(db.spin[0] * sw, db.spin[1] * sw, db.spin[2]);
        // kettlebell and shaker: a pair orbiting a shared centre on the right
        [items[1], items[2]].forEach((it, k) => {
          const a = th + k * Math.PI + 0.25;
          const z = Math.sin(a) * R * 0.45;
          it.hold.position.set((rx + Math.cos(a) * R * 0.3) * (d - z) / d, y0 + bob(c, 0.035, 6, 2 + k * 2), z);
          it.o.scale.setScalar((R * 0.66) / it.foot);
          it.turn.rotation.set(it.spin[0] * sw, it.spin[1] * sw + k * 0.9, it.spin[2]);
        });
      } else {
        // phones: a small orbit above the headline; the three pass in front of and behind each other
        items.forEach((it, i) => {
          const a = (i / 3) * TAU + sw * TAU * 0.45 + 2.09; // mid-scroll: shaker in front, the others behind
          it.hold.position.set(Math.sin(a) * 2.05, bob(c, 0.04, 6, i * 2) + (i === 0 ? 0.15 : 0), Math.cos(a) * 1.2);
          it.o.scale.setScalar(1.55 / it.foot);
          it.turn.rotation.set(it.spin[0] * sw, it.spin[1] * sw + i * 0.9, it.spin[2]);
        });
      }
    },
  };
  slot.layout(1900, 1000);
  return slot;
}

/* ============================================================
   Scroll story: three pinned chapters at the top of the page. Each slot is scrubbed by its
   chapter's pinned progress (data-3d-scrub: 0 as the chapter's top meets the top of the screen,
   1 as its bottom meets the bottom), so every pose plays backwards on the way up.
   ============================================================ */

/* ---------- chapter 1, the green world: the dumbbell turns 1.25 times as the headlines swap ---------- */
function storyWorldSlot(rt) {
  const root = new Group();
  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.7, 8.25);
  camera.lookAt(0, 0.05, 0);
  // rig: float (bob) > turn (yaw about the vertical) > pose (the diagonal lean) > roll (about the bar)
  const float = new Group();
  const turn = new Group();
  const pose = new Group();
  const roll = new Group();
  roll.add(buildDumbbell({ collar: 'ink' }));
  pose.add(roll);
  turn.add(pose);
  float.add(turn);
  root.add(float);
  pose.rotation.x = 0.12;
  const shadow = contactShadow(rt, 3.1, 0.95, -1.45, 0.5);
  root.add(shadow);
  return {
    root, camera, aspect: 1,
    update(c) {
      const p = c.p;
      turn.rotation.y = -0.62 + p * 1.25 * TAU;
      pose.rotation.z = 0.46 - 0.14 * Math.sin(p * Math.PI);
      roll.rotation.x = p * 0.9;
      const b = bob(c, 0.045, 6);
      float.position.y = b;
      shadow.scale.set(1 - b * 1.5, 1, 1 - b * 1.5);
      shadow.material.opacity = 0.5 - b * 2;
    },
  };
}

/* ---------- chapter 2, the exploded view: the dumbbell comes apart along its bar ----------
   0.05 to 0.15 a quarter turn to a three-quarter view; 0.12 to 0.55 the slices leave the bar
   (outer first), the collars slide out spinning, the grip drops back and the medallion floats
   forward and turns to face the camera; 0.55 to 1 it holds, drifting 15 degrees.
   Wide slots lay it across the screen with labels either side; phones stand it near vertical. */
const EXPLODE_OUT = [1.08, 0.72, 0.38];            // how far each slice leaves along the bar: outer, middle, inner
const EXPLODE_WIN = [[0.12, 0.4], [0.18, 0.47], [0.24, 0.55]];
const EXPLODE_RISE = [0.26, 0.13, 0.05];
function storyExplodedSlot(rt) {
  const root = new Group();
  const view = new Group();   // the quarter turn and the drift, about the vertical
  const pose = new Group();   // the lean: slight on wide slots, near vertical on phones
  const db = buildDumbbell({ split: true });
  const P = db.userData.parts;
  pose.add(db);
  view.add(pose);
  root.add(view);

  // a set screw on each collar, so its spin reads
  const screwGeo = new CylinderGeometry(0.035, 0.035, 0.05, 16);
  const screwMat = M.steel(0.3);
  for (const collar of P.collars) {
    const s = new Mesh(screwGeo, screwMat);
    s.rotation.x = Math.PI / 2;
    s.position.z = COLLAR_R + 0.012;
    collar.add(s);
  }

  // the medallion leaves its head: it lives in root space, placed each frame between its mount
  // on the head and a spot in front, turned to face the camera
  const medal = P.medal;
  const mount = new Group();
  medal.parent.add(mount);
  mount.position.copy(medal.position);
  mount.rotation.copy(medal.rotation);
  medal.parent.remove(medal);
  root.add(medal);
  const face = new Group();
  root.add(face);
  const upright = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.38);
  const qa = new Quaternion(), qb = new Quaternion(), va = new Vector3(), vb = new Vector3();

  // leader-line anchors, one per label (data-anchor on the page)
  const anchor = (parent, x, y, z) => { const o = new Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const anchors = {
    'head-l': anchor(P.slices[0][1], 0, HEAD_R * 0.5, HEAD_R * 0.5),
    'head-r': anchor(P.slices[1][1], 0, HEAD_R * 0.5, HEAD_R * 0.5),
    'collar-l': anchor(P.collars[0], 0, 0, COLLAR_R),
    grip: anchor(P.grip, -0.18, 0, GRIP_R),
    mark: anchor(medal, 0.32, 0.3, 0.04),
  };

  const camera = new PerspectiveCamera(28, 1, 0.1, 60);
  let mode = '';
  let float = { x: 0, y: 0, z: 0 };
  const slot = {
    // the slices' faces turn straight toward the green rim as they part: no rim for this slot, and a
    // slightly softer environment, keep the rubber black
    root, camera, aspect: 16 / 9, anchors, rim: 0, env: 0.8,
    layout(W, H, vw) {
      const next = (vw || W) <= 620 ? 'narrow' : 'wide';
      if (next === mode) return;
      mode = next;
      if (mode === 'wide') {
        slot.aspect = 16 / 9;
        camera.position.set(0, 2.2, 10.6);
        camera.lookAt(0.3, 0.12, 0);
        pose.rotation.set(0, 0, 0.08);
        float = { x: -1.0, y: 1.22, z: 0.9 };
      } else {
        slot.aspect = 1;
        camera.position.set(0, 1.2, 12);
        camera.lookAt(0.1, 0.15, 0);
        pose.rotation.set(0, 0, 0.78);
        float = { x: -1.5, y: -0.1, z: 1.0 };
      }
    },
    update(c) {
      const p = c.p;
      const turn = easeInOut(win(0.05, 0.15, p));
      const drift = easeInOut(win(0.55, 1, p));
      view.rotation.y = -0.06 - 0.4 * turn + 0.26 * drift;
      view.position.y = bob(c, 0.03, 6);

      P.slices.forEach((row, s) => {
        const side = s ? 1 : -1;
        row.forEach((slice, i) => {
          const k = easeInOut(win(EXPLODE_WIN[i][0], EXPLODE_WIN[i][1], p));
          slice.position.x = slice.userData.rest + side * EXPLODE_OUT[i] * k;
          slice.position.y = EXPLODE_RISE[i] * k; // the outer slices rise a little more: a shallow arc
          slice.rotation.z = side * 0.05 * (2 - i) * k;
        });
      });
      const kc = easeInOut(win(0.2, 0.5, p));
      P.collars.forEach((collar, s) => {
        const side = s ? 1 : -1;
        collar.position.x = collar.userData.rest + side * 0.26 * kc;
        collar.rotation.x = side * kc * 1.5 * TAU;
      });
      const kg = easeInOut(win(0.22, 0.55, p));
      P.grip.position.set(0, -0.14 * kg, -0.3 * kg);

      // the medallion: from flush on the head to floating in front, facing the camera
      const km = easeInOut(win(0.18, 0.5, p));
      root.updateMatrixWorld(true);
      mount.getWorldPosition(va);
      mount.getWorldQuaternion(qa);
      vb.set(va.x + float.x * km, va.y + float.y * km, va.z + float.z * km);
      face.position.copy(vb);
      face.lookAt(camera.position);
      qb.copy(face.quaternion).multiply(upright);
      medal.position.copy(vb);
      medal.quaternion.copy(qa).slerp(qb, km);
      medal.scale.setScalar(1 + 0.08 * km);
    },
  };
  slot.layout(1600, 900, 1600);
  return slot;
}

/* ---------- chapter 3, more than an app: one plate flips to face the light ---------- */
function storyPlateSlot() {
  const root = new Group();
  const drop = new Group();   // eases down and shrinks under the typed word
  const tilt = new Group();   // the diagonal it starts on
  const flip = new Group();   // edge-on to facing the camera
  const rubber = M.rubber();
  rubber.roughness = 0.42;    // a touch more sheen, so the light sweep reads on the face
  flip.add(new Mesh(plateGeometry(1.0), rubber));
  const ring = new Mesh(new TorusGeometry(0.235, 0.018, 10, 72), M.green());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.09 + 0.006; // on the hub's front face
  flip.add(ring);
  tilt.add(flip);
  drop.add(tilt);
  root.add(drop);
  const camera = cam(6.6, 0.3);
  return {
    // edge-on, the face turns straight toward the green rim: no rim for this slot, a softer environment
    root, camera, aspect: 1, rim: 0, env: 0.8,
    update(c) {
      const p = c.p;
      const f = easeInOut(win(0.05, 0.45, p));
      flip.rotation.x = 0.24 + (Math.PI / 2 - 0.24) * f;
      tilt.rotation.z = -0.55 * (1 - f);
      tilt.rotation.y = 0.4 * (1 - f);
      const d = easeInOut(win(0.5, 0.95, p));
      drop.position.y = -0.42 * d + bob(c, 0.03, 6);
      drop.scale.setScalar(1 - 0.2 * d);
    },
    // the key light sweeps across the face as it turns; restored after this slot draws
    light(rt, c) {
      rt.key.position.x = -6 + 12 * easeInOut(win(0.25, 0.6, c.p));
    },
  };
}

const BUILDERS = {
  hero: heroSlot,
  'story-world': storyWorldSlot,
  'story-exploded': storyExplodedSlot,
  'story-plate': storyPlateSlot,
  'how-phone': (rt) => stepSlot(rt, howPhone, 0),
  'how-tape': (rt) => stepSlot(rt, howTape, 1.3),
  'how-pair': (rt) => stepSlot(rt, howPair, 2.6),
  'how-ring': (rt) => stepSlot(rt, howRing, 3.9),
  features: featuresSlot,
  diet: dietSlot,
  training: trainingSlot,
  accountability: accountabilitySlot,
  progress: progressSlot,
  pricing: pricingSlot,
  final: finalSlot,
};
export const SLOTS = Object.keys(BUILDERS);

/* ============================================================
   Runtime: renderer setup, one scene, one light set, one environment
   ============================================================ */

function setupRenderer(renderer) {
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
}

function runtime(renderer) {
  const scene = new Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1;
  // lights: warm-neutral key top left, cool fill right, faint green rim from behind, low sky
  const key = new DirectionalLight(0xfffcf8, 3.4);
  key.position.set(-3, 5, 6);
  const fill = new DirectionalLight(0xc8d8ff, 1.25);
  fill.position.set(6, -0.5, 4);
  const rim = new DirectionalLight(GREEN, RIM);
  rim.position.set(1.5, 3, -6);
  const sky = new HemisphereLight(0xffffff, 0x080808, 0.22);
  scene.add(key, fill, rim, sky);

  // A full-viewport quad drawn after a slot: multiplies what the slot drew by fade x mask, the
  // same as the CSS mask and opacity fade the poster gets.
  const maskMat = new ShaderMaterial({
    uniforms: { uFade: { value: 1 }, uLeft: { value: 0 }, uBottom: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform float uFade; uniform float uLeft; uniform float uBottom; varying vec2 vUv;
      void main() {
        float mx = uLeft > 0.0 ? clamp(vUv.x / uLeft, 0.0, 1.0) : 1.0;
        float my = uBottom > 0.0 ? clamp(vUv.y / uBottom, 0.0, 1.0) : 1.0;
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - uFade * mx * my);
      }`,
    blending: CustomBlending, blendEquation: AddEquation,
    blendSrc: ZeroFactor, blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: ZeroFactor, blendDstAlpha: OneMinusSrcAlphaFactor,
    depthTest: false, depthWrite: false, transparent: true,
  });
  const maskScene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), maskMat);
  quad.frustumCulled = false;
  maskScene.add(quad);
  const maskCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return { renderer, scene, key, rim, maskScene, maskCam, maskMat, shadowTex: shadowTexture(), roots: [] };
}

function buildSlot(rt, name) {
  const make = BUILDERS[name];
  if (!make) return null;
  const slot = make(rt);
  rt.scene.add(slot.root);
  rt.roots.push(slot.root);
  return slot;
}

function showOnly(rt, slot) {
  for (const r of rt.roots) r.visible = r === slot.root;
  rt.rim.intensity = slot.rim ?? RIM;
  // with a scene environment three ignores each material's envMapIntensity: a slot sets its own
  rt.scene.environmentIntensity = slot.env ?? 1;
}

/** object-fit: contain against the scene's composition aspect, aligned by ax / ay.
 *  vw is the viewport width, for slots whose composition follows the page's breakpoints. */
function frameCamera(slot, W, H, ax, ay, vw = W) {
  if (slot.layout) slot.layout(W, H, vw);
  const a = slot.aspect;
  let Sw, Sh;
  if (W / H > a) { Sh = H; Sw = H * a; } else { Sw = W; Sh = W / a; }
  slot.camera.aspect = a;
  slot.camera.setViewOffset(Sw, Sh, -(W - Sw) * ax, -(H - Sh) * ay, W, H);
  slot.camera.updateProjectionMatrix();
}

/**
 * Render one slot as a still (posters). Returns { canvas, destroy }.
 * opts: name, width, height, dpr, ax, ay, p (scroll progress for the pose),
 *       vw (the viewport width the poster stands for; picks a slot's phone or wide composition)
 */
export function still({ name, width, height, dpr = 2, ax = 0.5, ay = 0.5, p = 0.5, vw = width }) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  setupRenderer(renderer);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  const rt = runtime(renderer);
  const slot = buildSlot(rt, name);
  showOnly(rt, slot);
  frameCamera(slot, width, height, ax, ay, vw);
  const rect = { left: 0, top: 0, width, height, right: width, bottom: height };
  const c = { still: true, p, t: 0, dt: 0, pointer: { x: 0, y: 0, active: false }, track: rect, rect, vw, vh: height, fine: false };
  slot.update(c);
  if (slot.light) slot.light(rt, c);
  renderer.render(rt.scene, slot.camera);
  return { canvas: renderer.domElement, destroy: () => renderer.dispose() };
}

/* ============================================================
   Live engine
   ============================================================ */

/**
 * Mount the shared canvas and start drawing every [data-3d] slot.
 * opts.canvas, opts.context   a canvas and its WebGL2 context (the page's capability probe),
 *                             so the page only ever opens one context
 * opts.slots                  the slot elements (default: every [data-3d])
 * Returns { canvas, renderer, stats(), destroy() }. The same handle hangs off canvas.built3d.
 */
export function mount(opts = {}) {
  const canvas = opts.canvas || document.createElement('canvas');
  const renderer = new WebGLRenderer({
    canvas, context: opts.context || undefined,
    antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power',
  });
  setupRenderer(renderer);
  renderer.autoClear = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  const rt = runtime(renderer);

  canvas.className = 'stage3d';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  document.body.insertBefore(canvas, document.body.firstChild);

  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  // phones list the exploded view's labels under the object, without leader lines
  const phone = window.matchMedia('(max-width: 620px)');
  const els = Array.from(opts.slots || document.querySelectorAll('[data-3d]'));
  const entries = els.map((el) => {
    const trackSel = el.getAttribute('data-3d-track');
    const anchorSel = el.getAttribute('data-3d-anchors');
    return {
      el, name: el.getAttribute('data-3d'),
      track: (trackSel && document.querySelector(trackSel)) || el,
      gate: el.getAttribute('data-3d-gate'),
      avoid: el.getAttribute('data-3d-avoid') ? Array.from(document.querySelectorAll(el.getAttribute('data-3d-avoid'))) : null,
      // pinned chapters: progress runs across the chapter's pinned scroll, not its pass over the screen
      scrub: el.hasAttribute('data-3d-scrub'),
      // labels whose leader lines run to a point on the object: { el, name, leader, rect, w }
      labels: anchorSel ? Array.from(document.querySelectorAll(anchorSel)).map((a) => ({
        el: a, name: a.getAttribute('data-anchor'), leader: a.querySelector('.leader'), rect: null, w: '',
      })).filter((l) => l.leader) : null,
      slot: null, near: false, live: false, fadeT0: 0, fade: 0, gateFade: 0, gateT0: 0,
      p: 0, pSet: false, t: 0, W: 0, H: 0, ax: 0.5, ay: 0.5, mLeft: 0, mBottom: 0, varsDirty: true,
      drawn: 0,
    };
  }).filter((e) => BUILDERS[e.name]);

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, cx: 0, cy: 0, active: false };
  const stats = { frames: 0, drawCalls: 0, lastDrawn: [], lastDrawCalls: 0 };
  let cw = 0, ch = 0, raf = 0, last = 0, running = false, dirty = false, lost = false;

  const readVars = (e) => {
    const cs = getComputedStyle(e.el);
    const num = (n, d) => { const v = parseFloat(cs.getPropertyValue(n)); return isNaN(v) ? d : v; };
    e.ax = num('--ax', 0.5); e.ay = num('--ay', 0.5);
    e.mLeft = num('--m-left', 0); e.mBottom = num('--m-bottom', 0);
    e.varsDirty = false;
  };

  const sizeCanvas = () => {
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    // keep the tallest height seen at this width, so a phone's toolbar sliding away does not
    // reallocate the canvas every few frames
    const nh = w !== cw ? h : Math.max(ch, h);
    if (w === cw && nh === ch) return;
    cw = w; ch = nh;
    renderer.setSize(cw, ch, false);
    canvas.style.height = ch + 'px';
    for (const e of entries) e.varsDirty = true;
  };

  const build = (e) => {
    e.slot = buildSlot(rt, e.name);
    showOnly(rt, e.slot);
    try { renderer.compile(rt.scene, e.slot.camera); } catch { /* compiles on first draw instead */ }
  };

  const gateOpen = (e) => !e.gate || !!e.el.closest(e.gate);
  // pinned chapters: 0 as the chapter's top meets the top of the screen, 1 as its bottom meets the
  // bottom. Everything else: 0 as the slot's centre meets the bottom, 1 as it reaches the top
  const progress = (e, vh) => {
    const tr = e.trackRect;
    return e.scrub ? clamp01(-tr.top / Math.max(1, tr.height - vh)) : clamp01((vh - (tr.top + tr.height / 2)) / vh);
  };

  // project each label's anchor through the slot camera (the matrices the draw just used) into
  // screen px, and aim a line at it from the label's nearest edge, in the label's own box
  const pt = new Vector3();
  const leaders = (e) => {
    const r = e.rect, out = [];
    for (const l of e.labels) {
      const o = e.slot.anchors[l.name], lr = l.rect;
      if (!o || !lr || !lr.width) continue;
      o.getWorldPosition(pt).project(e.slot.camera);
      const sx = r.left + ((pt.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - pt.y) / 2) * r.height;
      let ox, oy;
      if (sx > lr.right + 12) { ox = lr.width + 12; oy = 12; }
      else if (sx < lr.left - 12) { ox = -12; oy = 12; }
      else { ox = Math.min(lr.width, Math.max(0, sx - lr.left)); oy = sy > lr.bottom ? lr.height + 10 : -10; }
      const dx = sx - (lr.left + ox), dy = sy - (lr.top + oy);
      const len = Math.max(0, Math.hypot(dx, dy));
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      out.push([l, `--lx:${ox.toFixed(0)}px;--ly:${oy.toFixed(0)}px;--len:${len.toFixed(0)}px;--ang:${ang.toFixed(1)}deg`]);
    }
    return out;
  };
  // the box the content actually paints (a centred paragraph is narrower than its block)
  const range = document.createRange();
  const inkRect = (el) => { range.selectNodeContents(el); return range.getBoundingClientRect(); };

  const frame = (now) => {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    sizeCanvas();

    // reads first, then writes
    const vw = cw, vh = window.innerHeight, sy = window.scrollY;
    const docH = document.body.getBoundingClientRect().bottom + sy;
    let builtThisFrame = false;
    const near = [];
    for (const e of entries) {
      if (!e.near) continue;
      if (!e.slot) {
        if (builtThisFrame) continue; // one new scene per frame keeps scrolling smooth
        build(e);
        builtThisFrame = true;
      }
      if (e.varsDirty) readVars(e);
      e.rect = e.el.getBoundingClientRect();
      e.trackRect = e.track === e.el ? e.rect : e.track.getBoundingClientRect();
      e.avoidRect = e.avoid ? e.avoid.map(inkRect) : null;
      if (e.labels && !phone.matches) for (const l of e.labels) l.rect = l.el.getBoundingClientRect();
      e.open = gateOpen(e);
      near.push(e);
    }

    // canvas follows the page; it always covers the viewport and never pokes past the document
    const T = Math.max(0, Math.min(sy - (ch - vh) / 2, docH - ch));
    canvas.style.transform = `translate3d(0,${T.toFixed(1)}px,0)`;
    const off = sy - T;

    const drawn = [];
    for (const e of near) {
      // the crossfade from poster to live drawing, then the poster is hidden
      if (e.open && !e.fadeT0) e.fadeT0 = now;
      if (e.fadeT0) {
        const k = clamp01((now - e.fadeT0) / 500);
        e.fade = outQuart(k);
        if (!e.live && now - e.fadeT0 >= 520) { e.live = true; e.el.classList.add('is-3d-live'); }
      }
      // gated slots (inside a card that reveals itself) fade in with the card, over 400ms
      if (!e.gate) e.gateFade = 1;
      else if (!e.open) { e.gateFade = 0; e.gateT0 = 0; }
      else { if (!e.gateT0) e.gateT0 = now; e.gateFade = outQuart(clamp01((now - e.gateT0) / 400)); }
      const r = e.rect;
      const visible = e.open && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      if (visible) drawn.push(e);
      // off screen nothing eases: a slot keeps its exact progress, so it comes back where it should be
      else if (e.pSet || e.scrub) { e.p = progress(e, vh); e.pSet = true; }
    }

    if (drawn.length || dirty) {
      renderer.setScissorTest(false);
      renderer.clear(true, true, false);
      dirty = false;
    }
    let calls = 0;
    const leaderWrites = [];
    for (const e of drawn) {
      const r = e.rect;
      const W = Math.round(r.width), H = Math.round(r.height);
      const key = `${W}x${H}:${e.ax}:${e.ay}:${vw}`;
      if (key !== e.framed) {
        e.framed = key;
        frameCamera(e.slot, W, H, e.ax, e.ay, vw);
      }
      const tr = e.trackRect;
      const target = progress(e, vh);
      e.p = e.pSet ? e.p + (target - e.p) * damp(9, dt) : target;
      e.pSet = true;
      e.t += dt;
      const ctx = {
        still: false, dt, t: e.t, p: e.p, track: tr, rect: r, avoid: e.avoidRect, vw, vh,
        pointer, fine: fine.matches, started: e.live,
      };
      e.slot.update(ctx);
      showOnly(rt, e.slot);
      const top = r.top + off;
      renderer.setViewport(r.left, ch - (top + r.height), r.width, r.height);
      const x0 = Math.max(0, r.left), x1 = Math.min(vw, r.right);
      const y0 = Math.max(0, r.top) + off, y1 = Math.min(vh, r.bottom) + off;
      renderer.setScissor(x0, ch - y1, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
      renderer.setScissorTest(true);
      // a slot can move the key light for its own draw (the plate's sweep); restored straight after
      let keyX = 0, keyY = 0, keyZ = 0;
      if (e.slot.light) { ({ x: keyX, y: keyY, z: keyZ } = rt.key.position); e.slot.light(rt, ctx); }
      renderer.render(rt.scene, e.slot.camera);
      if (e.slot.light) rt.key.position.set(keyX, keyY, keyZ);
      calls += renderer.info.render.calls;
      if (e.labels && e.slot.anchors && !phone.matches) leaderWrites.push(...leaders(e));
      const f = e.fade * e.gateFade;
      if (f < 1 || e.mLeft > 0 || e.mBottom > 0) {
        rt.maskMat.uniforms.uFade.value = f;
        rt.maskMat.uniforms.uLeft.value = e.mLeft;
        rt.maskMat.uniforms.uBottom.value = e.mBottom;
        renderer.render(rt.maskScene, rt.maskCam);
      }
      e.drawn++;
      dirty = true;
    }
    renderer.setScissorTest(false);
    // writes last: each label's leader line, from the label's edge to its part on the object
    for (const [l, v] of leaderWrites) {
      if (v === l.w) continue;
      l.w = v;
      l.leader.setAttribute('style', v);
    }
    stats.frames++;
    stats.lastDrawn = drawn.map((e) => e.name);
    stats.lastDrawCalls = calls;
    stats.drawCalls += calls;

    if (!near.length) {
      if (dirty) { renderer.clear(true, true, false); dirty = false; }
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  };

  const sync = () => {
    const should = !lost && !document.hidden && entries.some((e) => e.near);
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  };

  // "near" = within half a screen of the viewport: scenes build and posters hand over before
  // the slot scrolls in; drawing itself is limited to slots that actually intersect the viewport
  const io = new IntersectionObserver((list) => {
    for (const it of list) {
      const e = entries.find((x) => x.el === it.target);
      if (e) e.near = it.isIntersecting;
    }
    sync();
  }, { rootMargin: '50% 0px 50% 0px' });
  entries.forEach((e) => io.observe(e.el));

  const onPointer = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    pointer.cx = e.clientX; pointer.cy = e.clientY; pointer.active = true;
  };
  const onLeave = () => { pointer.x = 0; pointer.y = 0; pointer.active = false; };
  const onResize = () => { for (const e of entries) e.varsDirty = true; };
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', sync);

  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    lost = true;
    sync();
    for (const e of entries) e.el.classList.remove('is-3d-live');
    canvas.style.display = 'none';
  });

  // the first screen's object (the story world, or the hero where a page still has one) is built
  // at once so its first frame lands on the poster; the rest build as they near
  const first = entries.find((e) => e.name === 'story-world') || entries.find((e) => e.name === 'hero');
  if (first) build(first);
  sizeCanvas();

  const api = {
    canvas, renderer,
    stats: () => ({
      ...stats,
      slots: entries.map((e) => ({ name: e.name, built: !!e.slot, near: e.near, live: e.live, drawn: e.drawn, p: +e.p.toFixed(3) })),
      running,
    }),
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', sync);
      for (const e of entries) e.el.classList.remove('is-3d-live');
      renderer.dispose();
      canvas.remove();
    },
  };
  canvas.built3d = api;
  return api;
}
