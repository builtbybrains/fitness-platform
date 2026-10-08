/* The data-driven scenes: the Today ring, the Food macro donut, the
   Progress trophy shelf, the Workout plate stack and the questionnaire
   object. All draw on demand (see Scene3D): they move when their data
   changes or a finger moves them, then hold still. No idle loops; the one
   ambient loop in the app stays the sign-in dumbbell (DESIGN.md 3D).

   Loaded inside the lazy 3D chunk only (through presets). */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import type { BuildScene, SceneHandle } from './Scene3D';
import type { ObjectKind, SceneKind, SceneParams } from './sceneTypes';
import {
  addStudioLights,
  disposeTree,
  makeDumbbell,
  makeEnvironment,
  makeKettlebell,
  makeMacroDonut,
  makeMedal,
  makePin,
  makePlate,
  makeShaker,
  makeTorusRing,
} from './meshes';
import { fitDistance, fitExtent } from './pose';
import {
  MACRO_KEYS,
  PLATE_CAP,
  TAU,
  plateDrop,
  plateRadius,
  plateThickness,
  plateY,
  retarget,
  settle,
  softClamp,
  stepTween,
  swapPose,
  tween,
  tweenDone,
  tweenValue,
  visiblePlates,
  type MacroKey,
  type Tween,
} from './layout';

/** Lights plus, where the GL context allows it, a soft room for the metal
    to reflect. Returns whether the room is there. */
export function studio(scene: THREE.Scene, renderer: THREE.WebGLRenderer): boolean {
  addStudioLights(scene);
  const room = new RoomEnvironment();
  const env = makeEnvironment(renderer, room);
  room.dispose();
  if (!env) return false;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  return true;
}

/** Point the camera at (0, `y`, 0) from `elevation` radians above the
    horizon, `d` units away. */
export function aim(camera: THREE.PerspectiveCamera, elevation: number, d: number, y = 0) {
  camera.position.set(0, y + Math.sin(elevation) * d, Math.cos(elevation) * d);
  camera.lookAt(0, y, 0);
  camera.updateProjectionMatrix();
}

const anyMoving = (ts: Tween[]) => ts.some((t) => !tweenDone(t));

// ─────────────────────────────── Today ring ───────────────────────────────

const RING_TILT = (12 * Math.PI) / 180; // top leans back, so it reads as a solid ring
const RING_DRAG = 0.6; // most the drag can turn it, radians

export const buildRing: BuildScene = (scene, camera, renderer) => {
  const ring = makeTorusRing({ hasEnv: studio(scene, renderer), tube: 0.09 });
  const tilt = new THREE.Group();
  tilt.add(ring.group);
  tilt.rotation.x = -RING_TILT;
  scene.add(tilt);
  camera.fov = 26;
  let fill = tween(0);

  const pose = (spin: number) => {
    ring.setProgress(tweenValue(fill));
    tilt.rotation.y = softClamp(spin, RING_DRAG);
  };

  const handle: SceneHandle = {
    onDemand: true,
    // The ring's outer edge meets the box's edge, like the 2D ring it replaces.
    resize: (aspect) => aim(camera, 0, fitExtent(1.1, 1.1, 0, camera.fov, aspect)),
    setParams(p, first) {
      const { progress } = p as SceneParams['ring'];
      // First view: fill from empty in 400ms; later changes in 250ms (as useTween).
      fill = retarget(first ? tween(0) : fill, progress, first ? 0.4 : 0.25);
    },
    still() {
      fill = settle(fill);
      pose(0);
    },
    update(_t, dt, input) {
      fill = stepTween(fill, dt);
      pose(input.spin);
      return !tweenDone(fill);
    },
  };
  return handle;
};

// ─────────────────────────────── Food donut ───────────────────────────────

const DONUT_LEAN = 0.42; // leans back so the depth shows
const DONUT_TURN = 1.2;

export const buildDonut: BuildScene = (scene, camera, renderer) => {
  studio(scene, renderer);
  const donut = makeMacroDonut({ protein: 0, carbs: 0, fat: 0 });
  const turn = new THREE.Group();
  turn.add(donut.group);
  const lean = new THREE.Group();
  lean.add(turn);
  lean.rotation.x = -DONUT_LEAN;
  scene.add(lean);
  camera.fov = 28;
  let spin = tween(0);
  const lifts: Record<MacroKey, Tween> = { protein: tween(0), carbs: tween(0), fat: tween(0) };
  let key = '';
  const ray = new THREE.Raycaster();

  const pose = () => {
    turn.rotation.z = tweenValue(spin);
    donut.lift({ protein: tweenValue(lifts.protein), carbs: tweenValue(lifts.carbs), fat: tweenValue(lifts.fat) });
  };

  return {
    onDemand: true,
    resize: (aspect) => aim(camera, 0, fitExtent(1.16, 1.16, 0.1, camera.fov, aspect)),
    setParams(p, first) {
      const d = p as SceneParams['donut'];
      const next = `${d.protein}|${d.carbs}|${d.fat}`;
      if (next !== key) {
        key = next;
        donut.set({ protein: d.protein, carbs: d.carbs, fat: d.fat });
      }
      // One turn on first view (clockwise, ease-out), then it rests.
      if (first) spin = { from: TAU, to: 0, elapsed: 0, duration: DONUT_TURN };
      for (const k of MACRO_KEYS) lifts[k] = retarget(lifts[k], d.selected === k ? 1 : 0, 0.22);
    },
    still() {
      spin = settle(spin);
      for (const k of MACRO_KEYS) lifts[k] = settle(lifts[k]);
      pose();
    },
    update(_t, dt) {
      spin = stepTween(spin, dt);
      for (const k of MACRO_KEYS) lifts[k] = stepTween(lifts[k], dt);
      pose();
      return anyMoving([spin, ...MACRO_KEYS.map((k) => lifts[k])]);
    },
    pick(x, y) {
      scene.updateMatrixWorld();
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const hit = ray.intersectObjects(donut.pickables(), false)[0];
      return hit ? hit.object.name : null;
    },
    dispose: () => donut.dispose(),
  };
};

// ─────────────────────────────── Progress shelf ───────────────────────────────

const MEDAL_SCALE = 0.4;
const SHELF_TOP = -0.42;
const SHELF_SPAN = 1.7;

/** The latest milestone's medal standing on a short Carbon shelf: its
    badge icon raised on the face, the green ring. Swipe to turn it; it
    springs back. */
export const buildShelf: BuildScene = (scene, camera, renderer) => {
  const hasEnv = studio(scene, renderer);
  const turn = new THREE.Group();
  scene.add(turn);
  camera.fov = 24;

  // Matte Carbon, and a dim reflection of the room, so no glare runs along its edge.
  const shelfMat = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.85, metalness: 0.1, envMapIntensity: 0.6 });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(SHELF_SPAN, 0.06, 0.34), shelfMat);
  shelf.position.y = SHELF_TOP - 0.03;
  turn.add(shelf);

  const holder = new THREE.Group();
  holder.position.set(0, SHELF_TOP + MEDAL_SCALE, 0);
  turn.add(holder);
  let medal: THREE.Group | null = null;

  // The medal catches a soft, narrow key of its own, turning with it.
  const spot = new THREE.SpotLight('#fff3e6', 22, 0, 0.2, 0.6, 0);
  spot.position.set(0.9, 2.6, 2.4);
  spot.target.position.copy(holder.position);
  turn.add(spot, spot.target);

  let shown = '';
  const frame = (aspect: number) => aim(camera, 0.1, fitExtent(SHELF_SPAN / 2, 0.52, 0.3, camera.fov, aspect), -0.06);

  return {
    onDemand: true,
    resize: frame,
    setParams(p) {
      const { icon } = p as SceneParams['shelf'];
      if (icon === shown) return;
      shown = icon;
      if (medal) {
        holder.remove(medal);
        disposeTree(medal);
      }
      medal = makeMedal({ hasEnv, icon });
      medal.scale.setScalar(MEDAL_SCALE);
      medal.rotation.x = -0.06;
      holder.add(medal);
    },
    still() {
      turn.rotation.y = 0;
    },
    update(_t, _dt, input) {
      // Nothing moves on its own: only the drag and its spring back, which Scene3D runs.
      turn.rotation.y = softClamp(input.spin, 0.9);
      return false;
    },
  };
};

// ─────────────────────────────── Workout plates ───────────────────────────────

const STACK_HEIGHT = 1.3;
const PLATE_MAX = 0.22;
const OPEN_GAP = 0.035;
const DROP = 0.35;

type Plate = { obj: THREE.Object3D; drop: Tween; leave: Tween | null; radius: number };

/** Top of the pin: a full stack of the thickest plates, open, plus a little. */
const PIN_HEIGHT = PLATE_CAP * (PLATE_MAX + OPEN_GAP) + 0.2;
/** Seen from 0.8 rad (about 46 degrees) up, so the top plate's face reads as a disc. */
const PLATE_ELEVATION = 0.8;

export const buildPlates: BuildScene = (scene, camera, renderer) => {
  const hasEnv = studio(scene, renderer);
  const stack = new THREE.Group();
  scene.add(stack);
  // The pin stands from the start, so no sets yet still shows the object.
  stack.add(makePin({ hasEnv, height: PIN_HEIGHT }));
  camera.fov = 30;
  let template: THREE.Group | null = null;
  let thickness = PLATE_MAX;
  let total = -1;
  let plates: Plate[] = [];
  let gap = tween(OPEN_GAP);
  let turn = tween(0);
  const BASE_YAW = -0.5;

  function rebuild(t: number) {
    for (const p of plates) stack.remove(p.obj);
    plates = [];
    if (template) template.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    thickness = plateThickness(t, STACK_HEIGHT, PLATE_MAX);
    template = makePlate({ hasEnv, thickness });
  }

  function add(delay: number, settled: boolean) {
    if (!template) return;
    const obj = template.clone();
    stack.add(obj);
    const drop = settled ? tween(0) : { from: 1, to: 0, elapsed: -delay, duration: DROP };
    const radius = plateRadius(plates.filter((p) => !p.leave).length);
    plates.push({ obj, drop, leave: null, radius });
  }

  const pose = () => {
    const g = tweenValue(gap);
    let i = 0;
    for (const p of plates) {
      const leaving = p.leave ? tweenValue(p.leave) : 0;
      // Drop: tween runs 1 to 0 over DROP seconds; plateDrop gives the ease-out height.
      const fall = p.drop.duration > 0 ? plateDrop(Math.max(0, p.drop.elapsed), p.drop.duration, 1.4) : 0;
      p.obj.position.y = plateY(i, thickness, g) + fall + leaving * 0.3;
      const k = Math.max(0.001, 1 - leaving);
      p.obj.scale.set(p.radius * k, k, p.radius * k);
      p.obj.visible = p.drop.elapsed >= 0 || p.drop.duration === 0;
      if (!p.leave) i++;
    }
    stack.rotation.y = BASE_YAW + tweenValue(turn);
  };

  return {
    onDemand: true,
    // Framed on the pin and a full stack; a falling plate enters from above the top edge.
    resize: (aspect) => aim(camera, PLATE_ELEVATION, fitExtent(1.08, 1.32, 0.3, camera.fov, aspect), PIN_HEIGHT * 0.42),
    setParams(p, first) {
      const s = p as SceneParams['plates'];
      if (s.total !== total) {
        total = s.total;
        rebuild(s.total);
        first = true; // a different session: show it as it is, no drops
      }
      const want = visiblePlates(s.done, s.total);
      const standing = plates.filter((x) => !x.leave);
      if (first) {
        for (let k = standing.length; k < want; k++) add(0, true);
      } else {
        // New plates drop one after another; a removed set lifts the top plate off.
        for (let k = standing.length; k < want; k++) add((k - standing.length) * 0.08, false);
        for (let k = standing.length - 1; k >= want; k--) standing[k].leave = { from: 0, to: 1, elapsed: 0, duration: 0.2 };
      }
      // Done: the gaps close, then one quarter turn.
      const g = s.complete ? 0 : OPEN_GAP;
      const q = s.complete ? Math.PI / 2 : 0;
      if (first) {
        gap = tween(g);
        turn = tween(q);
      } else {
        gap = retarget(gap, g, 0.25);
        if (turn.to !== q) turn = { from: tweenValue(turn), to: q, elapsed: s.complete ? -0.2 : 0, duration: 0.6 };
      }
    },
    still() {
      plates = plates.filter((p) => {
        if (p.leave) stack.remove(p.obj);
        return !p.leave;
      });
      for (const p of plates) p.drop = tween(0);
      gap = settle(gap);
      turn = settle(turn);
      pose();
    },
    update(_t, dt) {
      gap = stepTween(gap, dt);
      turn = stepTween(turn, dt);
      for (const p of plates) {
        p.drop = { ...p.drop, elapsed: Math.min(p.drop.duration, p.drop.elapsed + dt) };
        if (p.leave) p.leave = stepTween(p.leave, dt);
      }
      // Plates that finished leaving are gone.
      plates = plates.filter((p) => {
        if (p.leave && tweenDone(p.leave)) {
          stack.remove(p.obj);
          return false;
        }
        return true;
      });
      pose();
      return anyMoving([gap, turn, ...plates.map((p) => p.drop), ...plates.flatMap((p) => (p.leave ? [p.leave] : []))]);
    },
    dispose() {
      if (template) template.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
};

// ─────────────────────────────── questionnaire object ───────────────────────────────

/** The questionnaire object's box: 1.4 wide for 1 tall (its view is 168 by 120). */
const OBJECT_BOX = { halfW: 1.4, halfH: 1 };
/** Every object gets the same visual mass: the square root of its outline's
    area (width times height) is this many units, about 85px of the 168 by
    120 view. Filling the box instead made the long, low dumbbell read far
    bigger than the tall shaker. Never wider than MAX_W or taller than MAX_H. */
const OBJECT_MASS = 1.8;
const OBJECT_MAX_W = 2.64;
const OBJECT_MAX_H = 1.95;

/** Each object in a three-quarter pose, centred, all of one visual size. */
function poseObject(kind: ObjectKind, hasEnv: boolean): THREE.Group {
  const holder = new THREE.Group();
  let model: THREE.Group;
  switch (kind) {
    case 'dumbbell':
      model = makeDumbbell({ hasEnv });
      model.rotation.set(0.12, -0.62, 0.2);
      break;
    case 'kettlebell':
      model = makeKettlebell({ hasEnv });
      model.rotation.set(0.08, -0.35, 0);
      break;
    case 'shaker':
      model = makeShaker();
      model.rotation.set(0.1, -0.3, 0);
      break;
    case 'medal':
      model = makeMedal({ hasEnv });
      model.rotation.set(-0.1, -0.26, 0);
      break;
  }
  holder.add(model);
  const box = new THREE.Box3().setFromObject(holder);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const w = Math.max(0.01, size.x);
  const h = Math.max(0.01, size.y);
  holder.scale.setScalar(Math.min(OBJECT_MASS / Math.sqrt(w * h), OBJECT_MAX_W / w, OBJECT_MAX_H / h));
  return holder;
}

export const buildObject: BuildScene = (scene, camera, renderer) => {
  const hasEnv = studio(scene, renderer);
  const swap = new THREE.Group();
  scene.add(swap);
  camera.fov = 28;
  const made = new Map<ObjectKind, THREE.Group>();
  let shown: ObjectKind | null = null;
  let target: ObjectKind = 'dumbbell';
  let t = 0;
  let skipOut = true;

  const show = (kind: ObjectKind) => {
    if (shown === kind) return;
    if (shown) made.get(shown)!.visible = false;
    let g = made.get(kind);
    if (!g) {
      g = poseObject(kind, hasEnv);
      made.set(kind, g);
      swap.add(g);
    }
    g.visible = true;
    shown = kind;
  };

  const pose = () => {
    const s = swapPose(t, skipOut);
    if (s.phase !== 'out') show(target);
    swap.scale.setScalar(s.scale);
    swap.rotation.y = s.spin;
    return s.phase !== 'rest';
  };

  return {
    onDemand: true,
    resize: (aspect) => aim(camera, 0.12, fitExtent(OBJECT_BOX.halfW, OBJECT_BOX.halfH, 0.7, camera.fov, aspect)),
    setParams(p, first) {
      const { kind } = p as SceneParams['object'];
      if (first) {
        target = kind;
        t = 0;
        skipOut = true;
        show(kind);
        return;
      }
      if (kind === target) return;
      const s = swapPose(t, skipOut);
      target = kind;
      // Still leaving: the new object simply follows. Already coming in:
      // it gives way at once and the new one comes in.
      if (s.phase === 'out') return;
      t = 0;
      skipOut = s.phase === 'in';
    },
    still() {
      t = 10;
      show(target);
      pose();
    },
    update(_t, dt) {
      t += dt;
      return pose();
    },
  };
};

export const BUILDERS: Record<SceneKind, BuildScene> = {
  ring: buildRing,
  donut: buildDonut,
  shelf: buildShelf,
  plates: buildPlates,
  object: buildObject,
};
