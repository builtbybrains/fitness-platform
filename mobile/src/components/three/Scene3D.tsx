/* A three.js scene in an expo-gl GLView. This module pulls in three.js, so
   screens never import it directly: they use Lazy3D, which loads it on
   demand (its own chunk on web).

   The renderer draws into the expo-gl context. On native it is handed a
   small canvas stand-in (the expo-three pattern); on web GLView gives a
   real canvas, sized at the device pixel ratio capped at 2. ACES tone
   mapping, sRGB output, transparent clear so the surface behind shows.

   The loop runs on requestAnimationFrame and stops when the screen loses
   focus (`paused`), when the app goes to the background, and under Reduce
   Motion, where a single still frame is drawn. Everything GPU-side is freed
   on unmount. If GL cannot start, `fallback` renders instead. */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, PixelRatio, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

import { useReduceMotion } from '../motion';
import { disposeTree } from './meshes';
import { flickVelocity, stepSpin, type Spin } from './pose';

export type SceneInput = {
  /** Extra Y rotation from the person dragging, in radians. */
  spin: number;
};

export type SceneHandle = {
  /** Called every frame: seconds since start (paused time excluded), seconds since the last frame. */
  update(t: number, dt: number, input: SceneInput): void;
  /** Pose for the single Reduce Motion frame. Without it, update(0, 0) is used. */
  still?(): void;
  /** The view's aspect changed (width / height); refit the camera. */
  resize?(aspect: number): void;
  /** Free anything the build made that is not in the scene graph. */
  dispose?(): void;
};

export type BuildScene = (scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) => SceneHandle;

export type Scene3DProps = {
  build: BuildScene;
  style?: StyleProp<ViewStyle>;
  /** Drag sideways to spin; the flick decays back to the idle spin. */
  interactive?: boolean;
  /** Stop the loop (the last frame stays on screen). */
  paused?: boolean;
  /** Set only when the scene carries meaning; decorative scenes stay hidden from screen readers. */
  accessibilityLabel?: string;
  /** Shown when GL cannot start. */
  fallback?: React.ReactNode;
};

const IS_WEB = Platform.OS === 'web';

let webglChecked: boolean | null = null;
/** Web only: can this browser make a WebGL2 context? three.js needs it. */
function webglAvailable(): boolean {
  if (!IS_WEB) return true;
  if (webglChecked !== null) return webglChecked;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webglChecked = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglChecked = false;
  }
  return webglChecked;
}

/** WebGL-only pixel store flags native expo-gl does not take (it logs a
    warning for each); three sets them on every reset. */
function quietPixelStore(gl: ExpoWebGLRenderingContext) {
  const native = gl.pixelStorei.bind(gl);
  const allowed = new Set([0x9240 /* UNPACK_FLIP_Y_WEBGL */, 0x0cf5 /* UNPACK_ALIGNMENT */]);
  gl.pixelStorei = (pname: number, param: number | boolean) => {
    if (allowed.has(pname)) native(pname, param as number);
  };
}

type Runtime = {
  gl: ExpoWebGLRenderingContext;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  handle: SceneHandle;
  t: number;
  last: number;
  raf: number;
  size: string;
};

function createRuntime(gl: ExpoWebGLRenderingContext, build: BuildScene): Runtime {
  if (!IS_WEB) quietPixelStore(gl);
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const canvas = IS_WEB
    ? (gl.canvas as HTMLCanvasElement)
    : ({
        width: w,
        height: h,
        style: {},
        addEventListener() {},
        removeEventListener() {},
        clientHeight: h,
        getContext() {
          return gl;
        },
      } as unknown as HTMLCanvasElement);
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl as unknown as WebGL2RenderingContext, alpha: true, antialias: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, w / Math.max(1, h), 0.1, 100);
  const handle = build(scene, camera, renderer);
  return { gl, renderer, scene, camera, handle, t: 0, last: 0, raf: 0, size: '' };
}

/** Match the drawing size to the view. Web: CSS size times the pixel
    ratio, capped at 2. Native: the GL drawing buffer, which expo-gl sizes
    to the view at the screen's scale. Returns false while the view has no size yet. */
function syncSize(rt: Runtime): boolean {
  let w: number;
  let h: number;
  let ratio: number;
  if (IS_WEB) {
    const c = rt.gl.canvas as HTMLCanvasElement;
    w = c.clientWidth;
    h = c.clientHeight;
    ratio = Math.min(2, PixelRatio.get());
    if (c.width !== Math.floor(w * ratio) || c.height !== Math.floor(h * ratio)) rt.size = '';
  } else {
    w = rt.gl.drawingBufferWidth;
    h = rt.gl.drawingBufferHeight;
    ratio = 1;
  }
  if (!w || !h) return false;
  const key = `${w}x${h}@${ratio}`;
  if (key !== rt.size) {
    rt.size = key;
    rt.renderer.setPixelRatio(ratio);
    rt.renderer.setSize(w, h, false);
    rt.camera.aspect = w / h;
    rt.camera.updateProjectionMatrix();
    rt.handle.resize?.(w / h);
  }
  return true;
}

function draw(rt: Runtime) {
  rt.renderer.render(rt.scene, rt.camera);
  rt.gl.endFrameEXP();
}

function dispose(rt: Runtime) {
  cancelAnimationFrame(rt.raf);
  try {
    rt.handle.dispose?.();
    disposeTree(rt.scene);
    const env = rt.scene.environment;
    if (env) env.dispose();
    rt.renderer.dispose();
  } catch {
    /* the context may already be gone; nothing left to free */
  }
}

class GLBoundary extends React.Component<{ fallback: React.ReactNode; onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Scene3D({ build, style, interactive = false, paused = false, accessibilityLabel, fallback = null }: Scene3DProps) {
  const reduce = useReduceMotion();
  const [failed, setFailed] = useState(() => !webglAvailable());
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const rt = useRef<Runtime | null>(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  const spin = useRef<Spin>({ angle: 0, velocity: 0, dragging: false });
  const width = useRef(1);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s !== 'background'));
    return () => sub.remove();
  }, []);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    try {
      rt.current = createRuntime(gl, buildRef.current);
      setReady(true);
    } catch (e) {
      if (__DEV__) console.warn('3D scene could not start', e);
      setFailed(true);
    }
  }, []);

  // Free GPU objects before GLView tears its context down (layout effect
  // cleanups run before the child's unmount).
  useLayoutEffect(
    () => () => {
      if (rt.current) dispose(rt.current);
      rt.current = null;
    },
    [],
  );

  const running = ready && !failed && !paused && active && !reduce;

  /** One frame now (or on the next tick, after the view has its size). */
  const drawStill = useCallback(() => {
    const r = rt.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    r.raf = requestAnimationFrame(() => {
      if (!syncSize(r)) return;
      if (reduce) {
        if (r.handle.still) r.handle.still();
        else r.handle.update(0, 0, { spin: 0 });
      } else {
        r.handle.update(r.t, 0, { spin: spin.current.angle });
      }
      draw(r);
    });
  }, [reduce]);

  useEffect(() => {
    const r = rt.current;
    if (!r || failed) return;
    if (!running) {
      drawStill();
      return;
    }
    r.last = 0;
    const loop = (now: number) => {
      r.raf = requestAnimationFrame(loop);
      // Clamp the step so a stall or a resume does not jump the motion.
      const dt = r.last ? Math.min((now - r.last) / 1000, 1 / 20) : 0;
      r.last = now;
      r.t += dt;
      spin.current = stepSpin(spin.current, dt);
      if (!syncSize(r)) return;
      r.handle.update(r.t, dt, { spin: spin.current.angle });
      draw(r);
    };
    r.raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(r.raf);
  }, [running, failed, drawStill]);

  const pan = useMemo(() => {
    let lastDx = 0;
    const end = (vx: number) => {
      spin.current = { angle: spin.current.angle, velocity: flickVelocity(vx, width.current), dragging: false };
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        lastDx = 0;
        spin.current = { ...spin.current, velocity: 0, dragging: true };
      },
      onPanResponderMove: (_, g) => {
        const delta = ((g.dx - lastDx) / Math.max(1, width.current)) * Math.PI;
        lastDx = g.dx;
        spin.current = { ...spin.current, angle: spin.current.angle + delta };
      },
      onPanResponderRelease: (_, g) => end(g.vx),
      onPanResponderTerminate: (_, g) => end(g.vx),
      onPanResponderTerminationRequest: () => true,
    });
  }, []);

  const canDrag = interactive && !reduce && !failed;
  // aria-hidden covers web and maps to the native hiding props; the native
  // props are set too for older screen reader paths.
  const label = accessibilityLabel
    ? { accessible: true, role: 'img' as const, 'aria-label': accessibilityLabel }
    : { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  return (
    <View
      style={[style, { pointerEvents: canDrag ? 'auto' : 'none' }]}
      {...label}
      {...(canDrag ? pan.panHandlers : null)}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        if (!running) drawStill();
      }}
    >
      {failed ? (
        fallback
      ) : (
        <GLBoundary fallback={fallback} onError={() => setFailed(true)}>
          <GLView style={{ flex: 1, backgroundColor: 'transparent' }} onContextCreate={onContextCreate} />
        </GLBoundary>
      )}
    </View>
  );
}
