/* The BUILT 3D objects: a hex dumbbell, a milestone medal, a kettlebell, a
   shaker, a bumper plate, the Today ring and the macro donut, the objects
   carrying the green B. Flat ink brand, so the materials stay honest: matte black
   rubber, brushed steel, Carbon metal, and Built Green used only on thin
   collars, the rim and the mark, as flat brand colour. No bloom, no glow;
   the only emissive (the sides of the raised B) stays at 0.12. Poly
   counts are kept low for phone GPUs: a few thousand triangles each. */

import * as THREE from 'three';

import { MARK_PATH } from '../BuiltLogo';
import { centredOutline } from './outline';
import { arcSweep, clockPoint, donutSegments, type DonutSegment, type MacroKey } from './layout';

export const GREEN = '#A3FF3D';
const CARBON = '#1F1F1F';

/** The B as a three.js shape, centred, `height` units tall. */
export function markShape(height: number): THREE.Shape {
  const pts = centredOutline(MARK_PATH, height, 8).map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.Shape(pts);
}

/** Flat Built Green, exactly the brand hex: not lit and not tone mapped,
    because ACES pushes a lit saturated green toward pale yellow. Used for
    the thin green parts (collars, medal ring) and the face of the B. */
function brandGreen(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: GREEN, toneMapped: false });
}

/** The B, raised by `depth`. The face is exact Built Green (not tone
    mapped, so the brand colour survives the renderer); the sides are lit. */
function markMesh(height: number, depth: number): THREE.Mesh {
  const geo = new THREE.ExtrudeGeometry(markShape(height), { depth, bevelEnabled: false, curveSegments: 1 });
  const face = brandGreen();
  const side = new THREE.MeshStandardMaterial({ color: GREEN, roughness: 0.55, metalness: 0.05, emissive: GREEN, emissiveIntensity: 0.12 });
  // ExtrudeGeometry groups: 0 is the caps, 1 is the sides.
  const mesh = new THREE.Mesh(geo, [face, side]);
  mesh.name = 'mark';
  return mesh;
}

/** Soft warm key, cool fill, a faint green rim from behind, low hemisphere. */
export function addStudioLights(scene: THREE.Scene): void {
  const key = new THREE.DirectionalLight('#fff3e6', 2.4);
  key.position.set(3, 4.5, 5);
  const fill = new THREE.DirectionalLight('#c4d2ff', 0.7);
  fill.position.set(-5, 1, 2.5);
  const rim = new THREE.DirectionalLight(GREEN, 0.2);
  rim.position.set(-2, 2.5, -5);
  const under = new THREE.DirectionalLight('#ffffff', 0.35);
  under.position.set(1, -4, 2);
  const hemi = new THREE.HemisphereLight('#ffffff', '#080808', 0.45);
  scene.add(key, fill, rim, under, hemi);
}

/** The steel's look depends on having an environment to reflect; without
    one (some phone GL drivers cannot build it) it is lifted so it does not
    read as black. */
export function steelMaterial(hasEnv: boolean, color = '#cfd2d4'): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: hasEnv ? 0.9 : 0.55,
    roughness: 0.45,
  });
}

/** Diamond knurl as a 64px tile: two sets of diagonal grooves, dark in the
    grooves. Built as raw pixels rather than on a canvas, so it uploads the
    same way on native expo-gl (no DOM canvas there) and on web. Used as
    the grip's bump and roughness map, like the web hero's grip. */
function knurlTexture(): THREE.DataTexture {
  const N = 64;
  const P = 16; // groove spacing: four diamonds across a tile
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Distance to the nearest groove of each diagonal set, in pixels.
      const a = (((x - y) % P) + P) % P;
      const b = (x + y) % P;
      const d = Math.min(Math.min(a, P - a), Math.min(b, P - b)) / Math.SQRT2;
      // 2.5px half-width groove with a 1px soft edge.
      const k = Math.max(0, Math.min(1, d - 1.5));
      const v = Math.round(0x6a + (0xd8 - 0x6a) * k);
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

/**
 * Hex dumbbell lying along the X axis, centred on the origin. About 2.9
 * units end to end; the hex heads are 1.2 across their points.
 */
export function makeDumbbell({ hasEnv = true }: { hasEnv?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dumbbell';

  const rubber = new THREE.MeshStandardMaterial({ color: '#161616', roughness: 0.82, metalness: 0, flatShading: true });
  const rubberEdge = new THREE.MeshStandardMaterial({ color: '#1c1c1c', roughness: 0.7, metalness: 0, flatShading: true });
  const steel = steelMaterial(hasEnv);
  const knurl = steelMaterial(hasEnv);
  const knurlMap = knurlTexture();
  // Around the grip by along it, so the diamonds come out near square.
  knurlMap.repeat.set(6, 7);
  knurl.bumpMap = knurlMap;
  knurl.bumpScale = 1.6;
  knurl.roughnessMap = knurlMap;
  const collar = brandGreen();

  const R = 0.6; // hex point radius
  const headLen = 0.56;
  const chamfer = 0.06;
  const handleLen = 1.3;
  const headCentre = handleLen / 2 + headLen / 2;

  // One head: hex body plus a chamfer frustum on each face, built along Y
  // then turned to lie along X. Flat top and bottom, so it rests on a face.
  const body = new THREE.CylinderGeometry(R, R, headLen - chamfer * 2, 6, 1);
  const chamferOut = new THREE.CylinderGeometry(R - chamfer * 1.2, R, chamfer, 6, 1);
  const chamferIn = new THREE.CylinderGeometry(R, R - chamfer * 1.2, chamfer, 6, 1);
  for (const geo of [body, chamferOut, chamferIn]) geo.rotateZ(-Math.PI / 2);

  for (const side of [1, -1]) {
    const head = new THREE.Group();
    head.position.x = side * headCentre;
    head.add(new THREE.Mesh(body, rubber));
    const outer = new THREE.Mesh(side === 1 ? chamferOut : chamferIn, rubberEdge);
    outer.position.x = side * (headLen / 2 - chamfer / 2);
    const inner = new THREE.Mesh(side === 1 ? chamferIn : chamferOut, rubberEdge);
    inner.position.x = -side * (headLen / 2 - chamfer / 2);
    head.add(outer, inner);

    // The B on the outer face, reading the right way round from outside.
    const mark = markMesh(0.5, 0.018);
    mark.rotation.y = side * (Math.PI / 2);
    mark.position.x = side * (headLen / 2 - 0.004);
    head.add(mark);
    g.add(head);

    // Thin green collar where the handle meets the head, then a steel sleeve
    // narrow enough that the collar reads as a solid green ring around it.
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.045, 28, 1), collar);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = side * (handleLen / 2 - 0.0225);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 24, 1), steel);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = side * (handleLen / 2 - 0.095);
    g.add(ring, sleeve);
  }

  // Handle: a knurled grip with a short smooth shoulder at each end.
  const gripLen = handleLen - 0.44;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, gripLen, 32, 1, true), knurl);
  grip.rotation.z = Math.PI / 2;
  g.add(grip);
  const shoulderLen = (handleLen - 0.2 - gripLen) / 2;
  const shoulderGeo = new THREE.CylinderGeometry(0.11, 0.11, shoulderLen, 24, 1, true);
  for (const side of [1, -1]) {
    const shoulder = new THREE.Mesh(shoulderGeo, steel);
    shoulder.rotation.z = Math.PI / 2;
    shoulder.position.x = side * (gripLen / 2 + shoulderLen / 2);
    g.add(shoulder);
  }
  return g;
}

/**
 * Milestone medal facing +Z, radius 1: a bevelled Carbon metal disc, a
 * green ring inset on each face, and the B raised in green on the front.
 */
export function makeMedal({ hasEnv = true }: { hasEnv?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = 'medal';

  // Lathe profile (radius, height): flat face, bevel, rounded edge.
  const t = 0.12;
  const profile = [
    [0, t],
    [0.9, t],
    [0.955, t - 0.012],
    [0.99, t - 0.04],
    [1.0, t - 0.07],
    [1.0, -(t - 0.07)],
    [0.99, -(t - 0.04)],
    [0.955, -(t - 0.012)],
    [0.9, -t],
    [0, -t],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  // The profile is listed top to bottom; the lathe needs it bottom to top
  // for its faces to point outward (otherwise the disc is inside out and
  // the far face, with its ring and a mirrored B, shows through).
  const disc = new THREE.LatheGeometry(profile.slice().reverse(), 64);
  disc.rotateX(Math.PI / 2);
  const metal = new THREE.MeshStandardMaterial({ color: CARBON, metalness: hasEnv ? 0.8 : 0.5, roughness: 0.5, envMapIntensity: 0.5 });
  g.add(new THREE.Mesh(disc, metal));

  const ringMat = brandGreen();
  const ringGeo = new THREE.TorusGeometry(0.84, 0.03, 6, 64);
  for (const side of [1, -1]) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.z = side * t;
    g.add(ring);
  }

  const mark = markMesh(0.82, 0.05);
  mark.position.z = t - 0.005;
  g.add(mark);
  return g;
}

const RUBBER = '#161616';

function rubberMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: RUBBER, roughness: 0.82, metalness: 0 });
}

/** Lathe from (radius, height) pairs listed bottom to top, so faces point out. */
function lathe(points: [number, number][], segments: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/** Height of a group's bounding box centre, so callers can centre it. */
function centreY(g: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(g);
  g.position.y -= (box.min.y + box.max.y) / 2;
}

/**
 * Kettlebell, about 1.9 units tall and 1.45 wide, centred, facing +Z: a
 * matte rubber bell with a flat base, a steel handle, a thin green band
 * around the shoulder and the green B on the front.
 */
export function makeKettlebell({ hasEnv = true }: { hasEnv?: boolean } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = 'kettlebell';
  const R = 0.72;
  // A sphere cut flat at the base and a little at the top, as a lathe.
  const pts: [number, number][] = [[0, -0.6]];
  const from = Math.asin(-0.6 / R);
  const to = Math.asin(0.6 / R);
  for (let i = 0; i <= 20; i++) {
    const a = from + ((to - from) * i) / 20;
    pts.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  pts.push([0, 0.6]);
  const bell = new THREE.Mesh(lathe(pts, 48), rubberMaterial());
  g.add(bell);

  // Green band around the shoulder, sitting just proud of the rubber.
  const bandY = 0.34;
  const band = new THREE.Mesh(new THREE.TorusGeometry(Math.sqrt(R * R - bandY * bandY) + 0.004, 0.022, 6, 64), brandGreen());
  band.rotation.x = Math.PI / 2;
  band.position.y = bandY;
  g.add(band);

  // Steel handle: two posts and a half ring across the top.
  const steel = steelMaterial(hasEnv);
  const span = 0.42;
  const tube = 0.075;
  const postTop = 0.86;
  const postGeo = new THREE.CylinderGeometry(tube, tube, postTop - 0.5, 16, 1);
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(side * span, (postTop + 0.5) / 2, 0);
    g.add(post);
  }
  const bow = new THREE.Mesh(new THREE.TorusGeometry(span, tube, 12, 32, Math.PI), steel);
  bow.position.y = postTop;
  g.add(bow);

  // The B on the front, a raised badge on the curve.
  const mark = markMesh(0.34, 0.05);
  mark.position.set(0, -0.04, R - 0.03);
  g.add(mark);

  centreY(g);
  const outer = new THREE.Group();
  outer.add(g);
  return outer;
}

/**
 * Protein shaker, about 1.6 units tall, centred, facing +Z: a dark bottle,
 * a Stone cap with a spout, and the green B on the side.
 */
export function makeShaker(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shaker';
  const bottle = new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.42, metalness: 0 });
  // Bottom to top: base, rounded foot, a slight waist, the shoulder under the cap.
  const body = lathe(
    [
      [0, -0.8],
      [0.36, -0.8],
      [0.4, -0.77],
      [0.42, -0.72],
      [0.41, -0.2],
      [0.4, 0.1],
      [0.42, 0.42],
      [0.4, 0.46],
      [0, 0.46],
    ],
    48,
  );
  g.add(new THREE.Mesh(body, bottle));

  const stone = new THREE.MeshStandardMaterial({ color: '#E9E9E9', roughness: 0.55, metalness: 0 });
  const cap = lathe(
    [
      [0, 0.44],
      [0.45, 0.44],
      [0.45, 0.62],
      [0.43, 0.66],
      [0, 0.66],
    ],
    48,
  );
  g.add(new THREE.Mesh(cap, stone));
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 24, 1), stone);
  spout.position.set(0.16, 0.73, 0.04);
  g.add(spout);
  // A thin dark seam between bottle and cap reads as a real join.
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.012, 6, 48), bottle);
  seam.rotation.x = Math.PI / 2;
  seam.position.y = 0.45;
  g.add(seam);

  const mark = markMesh(0.3, 0.05);
  mark.position.set(0, -0.12, 0.38);
  g.add(mark);

  centreY(g);
  const outer = new THREE.Group();
  outer.add(g);
  return outer;
}

/**
 * Bumper plate lying flat (axis on Y), radius 1, `thickness` tall: matte
 * rubber with a rounded edge, a raised steel hub, a thin green line near
 * the rim on each face and a small green B on the top face.
 */
export function makePlate({ hasEnv = true, thickness = 0.22 }: { hasEnv?: boolean; thickness?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  g.name = 'plate';
  const h = thickness / 2;
  const e = Math.min(0.04, h * 0.5); // edge round
  const rubber = lathe(
    [
      [0.2, -h],
      [1 - e, -h],
      [1 - e * 0.3, -h + e * 0.3],
      [1, -h + e],
      [1, h - e],
      [1 - e * 0.3, h - e * 0.3],
      [1 - e, h],
      [0.2, h],
    ],
    56,
  );
  g.add(new THREE.Mesh(rubber, rubberMaterial()));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, thickness + 0.02, 32, 1), steelMaterial(hasEnv));
  g.add(hub);
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, thickness + 0.03, 20, 1), new THREE.MeshStandardMaterial({ color: '#0a0a0a', roughness: 0.9 }));
  g.add(hole);
  const line = new THREE.TorusGeometry(0.9, 0.014, 4, 64);
  const green = brandGreen();
  for (const side of [1, -1]) {
    const ring = new THREE.Mesh(line, green);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = side * h;
    g.add(ring);
  }
  // Big enough to read as the B on a 90px stack.
  const mark = markMesh(0.36, 0.012);
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(0, h, -0.52);
  g.add(mark);
  return g;
}

// ─────────────────────────────── Today ring ───────────────────────────────

export type TorusRing = {
  group: THREE.Group;
  /** Fill the green arc to `progress` (0..1), clockwise from 12 o'clock. */
  setProgress(progress: number): void;
};

/**
 * The Today ring facing +Z, radius 1 to the tube's centre: a Carbon track
 * torus and a green arc, a touch fatter so it sits proud of the track,
 * with round caps. The arc's vertices are rewritten in place on update,
 * so filling it allocates nothing.
 */
export function makeTorusRing({ hasEnv = true, tube = 0.085, progress = 0 }: { hasEnv?: boolean; tube?: number; progress?: number } = {}): TorusRing {
  const group = new THREE.Group();
  group.name = 'ring';
  const track = new THREE.Mesh(
    new THREE.TorusGeometry(1, tube, 16, 128),
    new THREE.MeshStandardMaterial({ color: '#2f2f2f', roughness: 0.5, metalness: hasEnv ? 0.35 : 0.15 }),
  );
  group.add(track);

  const r = tube * 1.08;
  const N = 128; // along the arc
  const M = 14; // around the tube
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * (M + 1) * 3);
  const nor = new Float32Array((N + 1) * (M + 1) * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  const index: number[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = (i + 1) * (M + 1) + j;
      // Wound so the faces point out of the tube (front faces, not culled).
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  geo.setIndex(index);
  const green = brandGreen();
  const arc = new THREE.Mesh(geo, green);
  arc.frustumCulled = false;
  group.add(arc);
  const capGeo = new THREE.SphereGeometry(r, 14, 10);
  const capStart = new THREE.Mesh(capGeo, green);
  const capEnd = new THREE.Mesh(capGeo, green);
  group.add(capStart, capEnd);

  function setProgress(p: number) {
    const sweep = arcSweep(p);
    const show = sweep > 0.002;
    arc.visible = capStart.visible = capEnd.visible = show;
    if (!show) return;
    for (let i = 0; i <= N; i++) {
      const theta = (sweep * i) / N;
      const [cx, cy] = clockPoint(theta, 1);
      for (let j = 0; j <= M; j++) {
        const phi = (j / M) * Math.PI * 2;
        // Around the tube: out along the radius and along Z.
        const nx = Math.cos(phi) * cx;
        const ny = Math.cos(phi) * cy;
        const nz = Math.sin(phi);
        const k = (i * (M + 1) + j) * 3;
        pos[k] = cx + r * nx;
        pos[k + 1] = cy + r * ny;
        pos[k + 2] = r * nz;
        nor[k] = nx;
        nor[k + 1] = ny;
        nor[k + 2] = nz;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    const [sx, sy] = clockPoint(0, 1);
    const [ex, ey] = clockPoint(sweep, 1);
    capStart.position.set(sx, sy, 0);
    capEnd.position.set(ex, ey, 0);
  }
  setProgress(progress);
  return { group, setProgress };
}

// ─────────────────────────────── macro donut ───────────────────────────────

export type MacroDonut = {
  group: THREE.Group;
  /** Rebuild the segments for new totals. */
  set(m: Record<MacroKey, number>): void;
  /** Current segments, for picking and labels. */
  segments(): DonutSegment[];
  /** Meshes to raycast against, named by macro. */
  pickables(): THREE.Object3D[];
  /** Lift each segment outward by its amount (0..1 of the full lift). */
  lift(amounts: Partial<Record<MacroKey, number>>): void;
  /** Free the materials (some may not be in the scene when it unmounts). */
  dispose(): void;
};

const DONUT = { outer: 1, inner: 0.6, depth: 0.24, gap: 0.08, lift: 0.12 };

/** A flat annular sector (angles clockwise from 12 o'clock) as a shape. */
function sectorShape(start: number, end: number, inner: number, outer: number): THREE.Shape {
  // three's arcs run in standard angles (counter-clockwise from +X).
  const a0 = Math.PI / 2 - start;
  const a1 = Math.PI / 2 - end;
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * outer, Math.sin(a0) * outer);
  s.absarc(0, 0, outer, a0, a1, true);
  s.lineTo(Math.cos(a1) * inner, Math.sin(a1) * inner);
  s.absarc(0, 0, inner, a1, a0, false);
  s.closePath();
  return s;
}

/**
 * Macro donut facing +Z: one extruded segment per macro, sized by share
 * of calories with small gaps. Faces are the exact hex (protein Built
 * Green, carbs Stone #E9E9E9, fat grey #8C8C8C), sides lit. All zero: one grey ring.
 */
export function makeMacroDonut(initial: Record<MacroKey, number>): MacroDonut {
  const group = new THREE.Group();
  group.name = 'donut';
  // Each slice: its exact colour on the faces (flat, not tone mapped, so
  // the hex survives), lit sides so the depth reads.
  const slice = (hex: string, emissive = 0): THREE.Material[] => [
    new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }),
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0, emissive: emissive ? hex : '#000000', emissiveIntensity: emissive }),
  ];
  const mats: Record<MacroKey, THREE.Material[]> = {
    protein: slice(GREEN, 0.12),
    carbs: slice('#E9E9E9'),
    fat: slice('#8C8C8C'),
  };
  const empty = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.7, metalness: 0 });
  // Materials live for the donut's life; only geometry is rebuilt.
  let segs: DonutSegment[] = [];
  let meshes: THREE.Mesh[] = [];

  function extrude(shape: THREE.Shape, sweep: number) {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: DONUT.depth,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 2,
      curveSegments: Math.max(3, Math.ceil((sweep / (Math.PI * 2)) * 72)),
    });
    geo.translate(0, 0, -DONUT.depth / 2);
    return geo;
  }

  function set(m: Record<MacroKey, number>) {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      group.remove(mesh);
    }
    meshes = [];
    segs = donutSegments(m, DONUT.gap);
    if (!segs.length) {
      const ring = new THREE.Mesh(extrude(sectorShape(0, Math.PI * 2 - 1e-4, DONUT.inner, DONUT.outer), Math.PI * 2), empty);
      ring.name = 'empty';
      group.add(ring);
      meshes.push(ring);
      return;
    }
    for (const s of segs) {
      const mesh = new THREE.Mesh(extrude(sectorShape(s.start, s.end, DONUT.inner, DONUT.outer), s.end - s.start), mats[s.key]);
      mesh.name = s.key;
      mesh.userData.mid = s.mid;
      group.add(mesh);
      meshes.push(mesh);
    }
  }
  set(initial);

  return {
    group,
    set,
    segments: () => segs,
    pickables: () => meshes.filter((x) => x.name !== 'empty'),
    lift(amounts) {
      for (const mesh of meshes) {
        const on = amounts[mesh.name as MacroKey] ?? 0;
        const [dx, dy] = clockPoint(mesh.userData.mid ?? 0, DONUT.lift * on);
        mesh.position.set(dx, dy, 0.06 * on);
      }
    },
    dispose() {
      for (const m of [mats.protein, mats.carbs, mats.fat, empty].flat()) m.dispose();
    },
  };
}

/** A room-like environment for the metals to reflect. Returns null when
    the GL context cannot render to the float targets it needs. */
export function makeEnvironment(renderer: THREE.WebGLRenderer, room: THREE.Scene): THREE.Texture | null {
  const ext = renderer.extensions;
  if (!ext.has('EXT_color_buffer_float') && !ext.has('EXT_color_buffer_half_float')) return null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tex = pmrem.fromScene(room, 0.04).texture;
    pmrem.dispose();
    return tex;
  } catch {
    return null;
  }
}

/** Free every geometry, material and texture map under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      if (!seen.has(mat)) {
        seen.add(mat);
        const std = mat as THREE.MeshStandardMaterial;
        for (const tex of [std.map, std.bumpMap, std.roughnessMap]) {
          if (tex && !seen.has(tex)) {
            seen.add(tex);
            tex.dispose();
          }
        }
        mat.dispose();
      }
    }
  });
}
