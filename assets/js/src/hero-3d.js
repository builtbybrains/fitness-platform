/* BUILT hero: a floating hex dumbbell, drawn with three.js.
 *
 * Source for assets/js/hero-3d.min.js. Rebuild after editing:
 *   node scripts/build-hero-3d.mjs
 * The still poster (assets/img/dumbbell-hero*.webp) is rendered from this same file:
 *   node scripts/render-hero-poster.mjs
 *
 * Look (DESIGN.md, "3D"): matte black rubber hex heads, brushed knurled steel grip,
 * thin Built Green collars, the green B on each outer face. Studio key, cool fill,
 * a faint green rim from behind. No bloom, no glow. Transparent canvas over Deep Black.
 *
 * Framing works like CSS `object-fit: contain`: the scene is composed in a square,
 * the square is fitted inside the canvas and aligned by --ax / --ay on the host, so the
 * live canvas lands exactly on top of the poster image that uses the same alignment.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';

const GREEN = 0xa3ff3d;
const TAU = Math.PI * 2;

/* ---------- dimensions (scene units, roughly decimetres) ---------- */
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

/* ---------- the dumbbell ---------- */
function buildDumbbell() {
  const dumbbell = new Group();

  const rubber = new MeshStandardMaterial({ color: 0x262626, roughness: 0.52, metalness: 0, flatShading: false, envMapIntensity: 1.1 });
  const knurl = knurlTexture();
  const steel = new MeshStandardMaterial({
    color: 0xd4d7db, metalness: 0.9, roughness: 0.38,
    bumpMap: knurl, bumpScale: 1.6, roughnessMap: knurl, envMapIntensity: 1.6,
  });
  const steelSmooth = new MeshStandardMaterial({ color: 0xd4d7db, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.6 });
  // Brand green skips tone mapping so ACES cannot wash it toward yellow: the B is never recoloured.
  const green = new MeshStandardMaterial({ color: GREEN, roughness: 0.42, metalness: 0.05, toneMapped: false });
  const mark = new MeshStandardMaterial({
    color: GREEN, emissive: GREEN, emissiveIntensity: 0.15, roughness: 0.5, metalness: 0, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });

  // hex head: a 6-sided lathe with chamfered rims, axis along X
  const h = HEAD_L / 2, R = HEAD_R, c = CHAMFER;
  const profile = [
    new Vector2(0, -h), new Vector2(R - c, -h), new Vector2(R, -h + c),
    new Vector2(R, h - c), new Vector2(R - c, h), new Vector2(0, h),
  ];
  const headGeo = new LatheGeometry(profile, 6, Math.PI / 6);
  headGeo.rotateZ(-Math.PI / 2);

  const markGeo = new ShapeGeometry(markShape(), 6);
  const markScale = ((R - c) * 0.92) / 127.5 * 1.04;
  markGeo.scale(markScale, markScale, 1);
  markGeo.rotateZ(-0.38); // undo the diagonal pose so the B stands upright in the first frame

  for (const side of [-1, 1]) {
    const head = new Mesh(headGeo, rubber);
    head.position.x = side * HEAD_X;
    dumbbell.add(head);

    // the B sits on the outer face, upright, reading correctly from outside
    const m = new Mesh(markGeo, mark);
    m.rotation.y = side * Math.PI / 2;
    m.position.x = side * (HEAD_X + h + 0.002);
    dumbbell.add(m);

    const collar = new Mesh(new CylinderGeometry(COLLAR_R, COLLAR_R, COLLAR_L, 40), green);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = side * (GRIP_L / 2 + COLLAR_L / 2);
    dumbbell.add(collar);

    // short smooth shoulder of the bar between knurl and collar
    const shoulder = new Mesh(new CylinderGeometry(GRIP_R, GRIP_R, 0.12, 40), steelSmooth);
    shoulder.rotation.z = Math.PI / 2;
    shoulder.position.x = side * (GRIP_L / 2 - 0.06);
    dumbbell.add(shoulder);
  }

  const grip = new Mesh(new CylinderGeometry(GRIP_R, GRIP_R, GRIP_L - 0.24, 48, 1, true), steel);
  grip.rotation.z = Math.PI / 2;
  dumbbell.add(grip);

  return dumbbell;
}

/* ---------- motion ---------- */
const BOB = 0.075;            // ~8 css px at the hero's size
const BOB_PERIOD = 6;         // seconds
const SPIN_PERIOD = 20;       // one revolution around the bar
const TILT = 0.06;            // slight rocking on X, radians
const POINTER_MAX = (8 * Math.PI) / 180;

const easeInOut = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);

/**
 * Mount the scene into `host`.
 * opts.still   render once at t = 0 and stop (poster rendering)
 * opts.size    { w, h } fixed pixel size instead of following the host
 * opts.dpr     device pixel ratio override
 * opts.watch   element whose visibility gates rendering (default: host)
 * Returns { canvas, renderer, destroy }.
 */
export function mount(host, opts = {}) {
  const still = !!opts.still;
  const renderer = new WebGLRenderer({
    antialias: true, alpha: true, premultipliedAlpha: true,
    preserveDrawingBuffer: still, powerPreference: 'low-power',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  const dpr = opts.dpr || Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  canvas.className = 'hero__canvas';

  const scene = new Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1;

  const camera = new PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0.8, 7.7);
  camera.lookAt(0, 0, 0);

  // lights: warm-neutral key top left, cool fill right, faint green rim from behind, low sky
  const key = new DirectionalLight(0xfffcf8, 3.4);
  key.position.set(-3, 5, 6);
  const fill = new DirectionalLight(0xc8d8ff, 1.25);
  fill.position.set(6, -0.5, 4);
  const rim = new DirectionalLight(GREEN, 0.2);
  rim.position.set(1.5, 3, -6);
  const sky = new HemisphereLight(0xffffff, 0x080808, 0.22);
  scene.add(key, fill, rim, sky);

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
  scene.add(drift);

  const shadow = new Mesh(
    new PlaneGeometry(2.8, 0.8),
    new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.05, -1.05, 0.2);
  scene.add(shadow);

  /* ----- sizing: object-fit: contain against a square composition ----- */
  let W = 1, H = 1;
  const align = () => {
    const cs = getComputedStyle(host);
    const ax = parseFloat(cs.getPropertyValue('--ax'));
    const ay = parseFloat(cs.getPropertyValue('--ay'));
    return [isNaN(ax) ? 0.5 : ax, isNaN(ay) ? 0.5 : ay];
  };
  const resize = () => {
    if (opts.size) { W = opts.size.w; H = opts.size.h; }
    else { const r = host.getBoundingClientRect(); W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height)); }
    const S = Math.min(W, H);
    const [ax, ay] = align();
    renderer.setSize(W, H, false);
    camera.aspect = 1;
    camera.setViewOffset(S, S, -(W - S) * ax, -(H - S) * ay, W, H);
    camera.updateProjectionMatrix();
  };
  resize();
  host.appendChild(canvas);

  /* ----- state ----- */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollP = 0, scrollTarget = 0;
  let t = 0;            // animation clock, only advances while running
  let speed = 0;        // eases from 0 to 1 once the canvas has replaced the poster
  let last = 0;
  let raf = 0;
  let running = false;
  let inView = true;
  let started = false;

  const pose0 = () => {
    spin.rotation.x = 0;
    drift.position.y = 0.12;
  };

  const apply = (dt) => {
    // damped follow for pointer and scroll
    const k = 1 - Math.exp(-dt * 4);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    scrollP += (scrollTarget - scrollP) * (1 - Math.exp(-dt * 6));

    spin.rotation.x = (t / SPIN_PERIOD) * TAU;
    yaw.rotation.x = 0.12 + Math.sin((t / 9) * TAU) * TILT;
    const bob = Math.sin((t / BOB_PERIOD) * TAU) * BOB;
    drift.position.y = 0.12 + bob + scrollP * 0.8;
    drift.rotation.y = pointer.x * POINTER_MAX + scrollP * 0.5;
    drift.rotation.x = pointer.y * POINTER_MAX + scrollP * 0.25;
    // the shadow tightens and darkens as the bell sinks, softens as it rises
    const lift = (bob / BOB + 1) / 2 + scrollP * 2;
    shadow.scale.setScalar(1 + lift * 0.08);
    shadow.material.opacity = Math.max(0, 0.9 - lift * 0.18 - scrollP * 3);
  };

  const frame = (now) => {
    raf = 0;
    if (!running) return;
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    if (started) {
      speed = Math.min(1, speed + dt / 1.4);
      t += dt * easeInOut(speed);
    }
    apply(dt);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  const sync = () => {
    const should = !still && inView && !document.hidden;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
    else if (!should && running) { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }
  };

  // first frame matches the poster exactly: t = 0, no pointer, no scroll offset
  pose0();
  renderer.render(scene, camera);
  if (still) return { canvas, renderer, destroy: () => renderer.dispose() };

  const onPointer = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onLeave = () => { pointer.tx = 0; pointer.ty = 0; };
  const watch = opts.watch || host;
  const onScroll = () => {
    const r = watch.getBoundingClientRect();
    scrollTarget = r.height ? Math.min(1, Math.max(0, -r.top / r.height)) : 0;
  };
  onScroll();
  scrollP = scrollTarget;
  window.addEventListener('pointermove', onPointer, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', sync);

  const ro = new ResizeObserver(() => { resize(); if (!running) renderer.render(scene, camera); });
  ro.observe(host);
  const io = new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    sync();
  }, { rootMargin: '80px 0px' });
  io.observe(watch);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    host.classList.remove('is-3d', 'is-3d-live');
  });

  // reveal: fade the canvas over the identical poster, then start the clock
  requestAnimationFrame(() => {
    host.classList.add('is-3d');
    setTimeout(() => { host.classList.add('is-3d-live'); started = true; }, opts.fadeMs ?? 520);
  });
  sync();

  return {
    canvas,
    renderer,
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', sync);
      renderer.dispose();
      canvas.remove();
      host.classList.remove('is-3d', 'is-3d-live');
    },
  };
}
