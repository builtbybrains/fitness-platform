/* The scenes the app shows, built on Scene3D. Loaded through Lazy3D only,
   so three.js stays out of the first download on web.

   Dumbbell motions:
   - float: hovers with a slow bob and a slow Y spin (sign-in, sign-up; the
            app's one ambient loop, see DESIGN.md 3D).
   - drop:  drops in with a spin and settles in 500ms, then idles while the
            celebration is open (workout done).
   - rest:  lies on a face, still, in a three-quarter pose (Today on a rest day).
   Medal: flips in from its back to face-on in 600ms (ease-out quart, no
   overshoot), then sways gently while the celebration is open.
   Under Reduce Motion each one is drawn once, in its settled pose. */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import Scene3D, { type BuildScene, type Scene3DProps } from './Scene3D';
import { addStudioLights, makeDumbbell, makeEnvironment, makeMedal } from './meshes';
import { bob, dropIn, fitDistance, fitExtent, flipIn } from './pose';

export type DumbbellMotion = 'float' | 'drop' | 'rest';

/** Lights plus, where the GL context allows it, a soft room for the metal
    to reflect. Returns whether the room is there. */
function studio(scene: THREE.Scene, renderer: THREE.WebGLRenderer): boolean {
  addStudioLights(scene);
  const room = new RoomEnvironment();
  const env = makeEnvironment(renderer, room);
  room.dispose();
  if (!env) return false;
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  return true;
}

/** Point the camera at the origin from `elevation` radians above the
    horizon, `d` units away. */
function aim(camera: THREE.PerspectiveCamera, elevation: number, d: number) {
  camera.position.set(0, Math.sin(elevation) * d, Math.cos(elevation) * d);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

// Three-quarter view: the side of the dumbbell and one B face both show.
const POSE_Y = -0.62;
const IDLE_SPIN = 0.45; // rad/s, about 14s a turn
const DROP = 0.5;

export function buildDumbbell(motion: DumbbellMotion): BuildScene {
  return (scene, camera, renderer) => {
    const model = makeDumbbell({ hasEnv: studio(scene, renderer) });
    const tilt = new THREE.Group();
    const spin = new THREE.Group();
    tilt.add(model);
    spin.add(tilt);
    scene.add(spin);

    const resting = motion === 'rest';
    // Floating, the handle leans a little; resting, it lies on a hex face.
    const lean = resting ? 0 : 0.2;
    tilt.rotation.z = lean;
    tilt.rotation.x = resting ? 0 : 0.12;
    camera.fov = 30;
    const elevation = resting ? 0.5 : 0.2;
    // Spinning, the dumbbell sweeps about 1.6 units either side; standing
    // up it is about 1 unit either side of centre with the lean and float.
    const fit = (aspect: number) => (resting ? fitDistance(1.5, camera.fov, aspect) : fitExtent(1.6, 1.0, 0.6, camera.fov, aspect));

    return {
      resize: (aspect) => aim(camera, elevation, fit(aspect)),
      still() {
        spin.rotation.y = POSE_Y;
        spin.position.y = 0;
        tilt.rotation.z = lean;
      },
      update(t, _dt, input) {
        if (resting) {
          spin.rotation.y = POSE_Y + input.spin;
          return;
        }
        if (motion === 'drop' && t < DROP) {
          const d = dropIn(t, DROP);
          spin.position.y = d.y;
          spin.rotation.y = POSE_Y + t * IDLE_SPIN + d.spin + input.spin;
          tilt.rotation.z = lean + d.tilt;
          return;
        }
        const idle = motion === 'drop' ? t - DROP : t;
        spin.position.y = bob(idle);
        spin.rotation.y = POSE_Y + t * IDLE_SPIN + input.spin;
        tilt.rotation.z = lean;
      },
    };
  };
}

const FLIP = 0.6;

export const buildMedal: BuildScene = (scene, camera, renderer) => {
  const model = makeMedal({ hasEnv: studio(scene, renderer) });
  const turn = new THREE.Group();
  model.rotation.x = -0.1; // top leans back a touch, so the rim catches the key light
  turn.add(model);
  scene.add(turn);
  camera.fov = 30;

  return {
    resize: (aspect) => aim(camera, 0.08, fitDistance(1.08, camera.fov, aspect)),
    still() {
      turn.rotation.y = -0.26;
      turn.position.y = 0;
    },
    update(t) {
      if (t < FLIP) {
        turn.rotation.y = flipIn(t, FLIP);
        turn.position.y = 0;
        return;
      }
      const idle = t - FLIP;
      turn.rotation.y = Math.sin(idle * 0.9) * 0.22;
      turn.position.y = bob(idle, 0.04, 3.6);
    },
  };
};

type SceneProps = Omit<Scene3DProps, 'build'>;

export function DumbbellScene({ motion, ...rest }: SceneProps & { motion: DumbbellMotion }) {
  const build = useMemo(() => buildDumbbell(motion), [motion]);
  return <Scene3D build={build} {...rest} />;
}

export function MedalScene(props: SceneProps) {
  return <Scene3D build={buildMedal} {...props} />;
}
