/* The BUILT 3D objects: a hex dumbbell and a milestone medal, both carrying
   the green B. Flat ink brand, so the materials stay honest: matte black
   rubber, brushed steel, Carbon metal, and Built Green used only on thin
   collars, the rim and the mark, as flat brand colour. No bloom, no glow;
   the only emissive (the sides of the raised B) stays at 0.12. Poly
   counts are kept low for phone GPUs: a few thousand triangles each. */

import * as THREE from 'three';

import { MARK_PATH } from '../BuiltLogo';
import { centredOutline } from './outline';

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
  const rim = new THREE.DirectionalLight(GREEN, 0.55);
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
    roughness: 0.35,
  });
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
  const knurl = steelMaterial(hasEnv, '#a9adb0');
  knurl.roughness = 0.6;
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

    // Thin green collar where the handle meets the head, then a steel sleeve.
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.045, 28, 1), collar);
    ring.rotation.z = Math.PI / 2;
    ring.position.x = side * (handleLen / 2 - 0.0225);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 24, 1), steel);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = side * (handleLen / 2 - 0.095);
    g.add(ring, sleeve);
  }

  // Handle, with two bands of fine knurl rings.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, handleLen - 0.2, 24, 1), steel);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  const knurlGeo = new THREE.CylinderGeometry(0.114, 0.114, 0.014, 24, 1, true);
  for (const band of [-0.24, 0.24]) {
    for (let i = -3; i <= 3; i++) {
      const k = new THREE.Mesh(knurlGeo, knurl);
      k.rotation.z = Math.PI / 2;
      k.position.x = band + i * 0.032;
      g.add(k);
    }
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
  const disc = new THREE.LatheGeometry(profile, 64);
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

/** Free every geometry and material under `root`. */
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
        mat.dispose();
      }
    }
  });
}
