/* A three.js scene in an expo-gl GLView. This module pulls in three.js, so
   screens never import it directly: they use Lazy3D, which loads it on
   demand (its own chunk on web).

   The renderer draws into the expo-gl context. On native it is handed a
   small canvas stand-in (the expo-three pattern); on web GLView gives a
   real canvas, sized at the device pixel ratio capped at 2. ACES tone
   mapping, sRGB output, transparent clear so the surface behind shows.

   Two kinds of scene:
   - looping (the dumbbell, the medal): the loop runs on
     requestAnimationFrame for as long as the scene is on screen.
   - on demand (`onDemand` on the handle: the ring, the donut, the shelf,
     the plates, the questionnaire object): frames are drawn only while
     something moves (a fill, a drop, a drag, a spring back). Once still,
     no frame is drawn until the data changes or a finger moves it.
   Either way the loop stops when the screen loses focus (`paused`), when
   the app goes to the background, and under Reduce Motion, where a single
   still frame is drawn. While paused nothing is drawn at all, unless the
   view has never been drawn or its size changed. Everything GPU-side is
   freed on unmount. If GL cannot start, `fallback` renders instead and
   `onFail` is called. */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, PixelRatio, Platform, Pressable, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';

import { useReduceMotion } from '../motion';
import { disposeTree } from './meshes';
import { flickVelocity, spinAtRest, stepSpin, stepSpring, type Spin } from './pose';
import { webglAvailable } from './support';

export type SceneInput = {
  /** Extra rotation from the person dragging, in radians (a free spin, or
      a tilt that springs back to 0, by the view's `drag`). */
  spin: number;
};

export type SceneHandle = {
  /** Called every frame: seconds since start (paused time excluded), seconds
      since the last frame. On-demand scenes return true while something
      still moves; false lets the loop sleep. */
  update(t: number, dt: number, input: SceneInput): boolean | void;
  /** Draw frames only while something moves (see the note at the top). */
  onDemand?: boolean;
  /** New data from the screen. `first` is the value at build time, which a
      scene shows as is; later values animate. */
  setParams?(params: unknown, first: boolean): void;
  /** Pose for the single Reduce Motion frame, with the data settled. Without it, update(0, 0) is used. */
  still?(): void;
  /** The view's aspect changed (width / height); refit the camera. */
  resize?(aspect: number): void;
  /** What sits under a tap at normalised device coordinates (-1..1, y up), or null. */
  pick?(x: number, y: number): string | null;
  /** Free anything the build made that is not in the scene graph. */
  dispose?(): void;
};

export type BuildScene = (scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) => SceneHandle;

export type Scene3DProps = {
  build: BuildScene;
  style?: StyleProp<ViewStyle>;
  /** Drag sideways to spin; the flick decays back to the idle spin. Same as drag="spin". */
  interactive?: boolean;
  /** "spin": a free spin with a decaying flick. "spring": follows the finger, springs back to 0. */
  drag?: 'spin' | 'spring';
  /** Data for the scene; a change (by value) is handed to the handle's setParams. */
  params?: unknown;
  /** Tap: the handle's pick result for the tapped point (null for empty space). */
  onPick?: (id: string | null) => void;
  /** Stop the loop (the last frame stays on screen). */
  paused?: boolean;
  /** Set only when the scene carries meaning; decorative scenes stay hidden from screen readers. */
  accessibilityLabel?: string;
  /** Shown when GL cannot start. */
  fallback?: React.ReactNode;
  /** GL could not start, or the scene threw. */
  onFail?: () => void;
};

const IS_WEB = Platform.OS === 'web';

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
  /** A frame request is out (raf is not a reliable flag: ids can be 0 on some platforms). */
  ticking: boolean;
  size: string;
  /** Frames drawn so far. */
  frames: number;
  /** Web: set while this runtime resizes the canvas itself, so the watcher skips it. */
  ownResize: boolean;
  /** Web: watches the canvas for resets made by someone else. */
  watcher: MutationObserver | null;
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
  return { gl, renderer, scene, camera, handle, t: 0, last: 0, raf: 0, ticking: false, size: '', frames: 0, ownResize: false, watcher: null };
}

/** Match the drawing size to the view. Web: CSS size times the pixel
    ratio, capped at 2. Native: the GL drawing buffer, which expo-gl sizes
    to the view at the screen's scale. Returns false while the view has no
    size yet, 'changed' when the drawing buffer was just resized (which
    clears it), 'same' otherwise. */
function syncSize(rt: Runtime): false | 'same' | 'changed' {
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
    rt.ownResize = IS_WEB;
    rt.renderer.setPixelRatio(ratio);
    rt.renderer.setSize(w, h, false);
    rt.camera.aspect = w / h;
    rt.camera.updateProjectionMatrix();
    rt.handle.resize?.(w / h);
    return 'changed';
  }
  return 'same';
}

function draw(rt: Runtime) {
  rt.renderer.render(rt.scene, rt.camera);
  rt.gl.endFrameEXP();
  rt.frames++;
}

function dispose(rt: Runtime) {
  cancelAnimationFrame(rt.raf);
  rt.ticking = false;
  rt.watcher?.disconnect();
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

/** Stable key for a params value, so a new object with the same data is no change. */
function keyOf(params: unknown): string {
  try {
    return JSON.stringify(params) ?? '';
  } catch {
    return String(params);
  }
}

export default function Scene3D({
  build,
  style,
  interactive = false,
  drag,
  params,
  onPick,
  paused = false,
  accessibilityLabel,
  fallback = null,
  onFail,
}: Scene3DProps) {
  const reduce = useReduceMotion();
  const [failed, setFailed] = useState(() => !webglAvailable());
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const rt = useRef<Runtime | null>(null);
  const buildRef = useRef(build);
  buildRef.current = build;
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onFailRef = useRef(onFail);
  onFailRef.current = onFail;
  const mode = drag ?? (interactive ? 'spin' : undefined);
  const spring = mode === 'spring';
  const spin = useRef<Spin>({ angle: 0, velocity: 0, dragging: false });
  const width = useRef(1);
  /** Starts the loop again if it went to sleep (on-demand scenes). */
  const wake = useRef<() => void>(() => {});
  /** Draw again after the canvas was cleared: wake the loop, or a still frame. */
  const redraw = useRef<() => void>(() => {});

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s !== 'background'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (failed) onFailRef.current?.();
  }, [failed]);

  const onContextCreate = useCallback((gl: ExpoWebGLRenderingContext) => {
    try {
      const r = createRuntime(gl, buildRef.current);
      r.handle.setParams?.(paramsRef.current, true);
      if (IS_WEB && typeof MutationObserver !== 'undefined') {
        // expo-gl's web canvas sets its own width and height after layout,
        // which clears the picture. A sleeping on-demand scene would stay
        // blank, so any resize this runtime did not make forces a redraw.
        r.watcher = new MutationObserver(() => {
          if (r.ownResize) {
            r.ownResize = false;
            return;
          }
          r.size = '';
          redraw.current();
        });
        r.watcher.observe(gl.canvas as HTMLCanvasElement, { attributes: true, attributeFilter: ['width', 'height'] });
      }
      rt.current = r;
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
  const runningRef = useRef(running);
  runningRef.current = running;

  /** One frame now (or on the next tick, after the view has its size).
      Reduce Motion: the settled pose, every time. Paused: only when the
      view has never been drawn or its size changed, so a hidden screen
      draws nothing. */
  const drawStill = useCallback(() => {
    const r = rt.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    r.ticking = true;
    r.raf = requestAnimationFrame(() => {
      r.ticking = false;
      const size = syncSize(r);
      if (!size) return;
      if (reduce) {
        if (r.handle.still) r.handle.still();
        else r.handle.update(0, 0, { spin: 0 });
      } else {
        if (r.frames > 0 && size === 'same') return;
        r.handle.update(r.t, 0, { spin: spin.current.angle });
      }
      draw(r);
    });
  }, [reduce]);

  useEffect(() => {
    redraw.current = () => (runningRef.current ? wake.current() : drawStill());
  }, [drawStill]);

  useEffect(() => {
    const r = rt.current;
    if (!r || failed) return;
    if (!running) {
      drawStill();
      return;
    }
    r.last = 0;
    const step = (s: Spin, dt: number) => (spring ? stepSpring(s, dt) : stepSpin(s, dt));
    const loop = (now: number) => {
      r.ticking = false;
      // Clamp the step so a stall or a resume does not jump the motion.
      const dt = r.last ? Math.min((now - r.last) / 1000, 1 / 20) : 0;
      r.last = now;
      r.t += dt;
      spin.current = step(spin.current, dt);
      const size = syncSize(r);
      if (!size) {
        r.ticking = true;
        r.raf = requestAnimationFrame(loop);
        return;
      }
      const moving = r.handle.update(r.t, dt, { spin: spin.current.angle });
      draw(r);
      if (r.handle.onDemand && !moving && spinAtRest(spin.current, spring)) return; // asleep until woken
      r.ticking = true;
      r.raf = requestAnimationFrame(loop);
    };
    wake.current = () => {
      if (r.ticking) return;
      r.last = 0;
      r.ticking = true;
      r.raf = requestAnimationFrame(loop);
    };
    r.ticking = true;
    r.raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(r.raf);
      r.ticking = false;
      wake.current = () => {};
    };
  }, [running, failed, drawStill, spring]);

  // New data: hand it to the scene, then animate it (or draw it settled
  // under Reduce Motion). While paused it waits, and plays on return.
  const paramsKey = keyOf(params);
  const seenKey = useRef(paramsKey);
  useEffect(() => {
    if (seenKey.current === paramsKey) return;
    seenKey.current = paramsKey;
    const r = rt.current;
    if (!r?.handle.setParams) return;
    r.handle.setParams(paramsRef.current, false);
    if (running) wake.current();
    else if (reduce) drawStill();
  }, [paramsKey, running, reduce, drawStill]);

  const pan = useMemo(() => {
    let lastDx = 0;
    const end = (vx: number) => {
      // Spring: let go and it springs back from where it is, no flick.
      spin.current = { angle: spin.current.angle, velocity: spring ? 0 : flickVelocity(vx, width.current), dragging: false };
      wake.current();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => {
        lastDx = 0;
        spin.current = { ...spin.current, velocity: 0, dragging: true };
        wake.current();
      },
      onPanResponderMove: (_, g) => {
        const delta = ((g.dx - lastDx) / Math.max(1, width.current)) * Math.PI;
        lastDx = g.dx;
        spin.current = { ...spin.current, angle: spin.current.angle + delta };
        wake.current();
      },
      onPanResponderRelease: (_, g) => end(g.vx),
      onPanResponderTerminate: (_, g) => end(g.vx),
      onPanResponderTerminationRequest: () => true,
    });
  }, [spring]);

  const tap = useCallback(
    (e: GestureResponderEvent) => {
      const r = rt.current;
      if (!r?.handle.pick || reduce) return;
      // Native: locationX/Y are relative to the touched view. Web: the
      // press is a click (a MouseEvent), measured against the view's box.
      let x = e.nativeEvent.locationX;
      let y = e.nativeEvent.locationY;
      let w = width.current;
      let h = 0;
      if (IS_WEB) {
        const el = e.currentTarget as unknown as HTMLElement;
        const box = el.getBoundingClientRect();
        const m = e.nativeEvent as unknown as MouseEvent;
        x = m.clientX - box.left;
        y = m.clientY - box.top;
        w = box.width;
        h = box.height;
      } else {
        h = r.gl.drawingBufferHeight * (w / Math.max(1, r.gl.drawingBufferWidth));
      }
      if (!w || !h) return;
      const id = r.handle.pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
      onPickRef.current?.(id);
      wake.current();
    },
    [reduce],
  );

  const canDrag = !!mode && !reduce && !failed;
  const canPick = !!onPick && !reduce && !failed;
  // aria-hidden covers web and maps to the native hiding props; the native
  // props are set too for older screen reader paths.
  const label = accessibilityLabel
    ? { accessible: true, role: 'img' as const, 'aria-label': accessibilityLabel }
    : { 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  const surface = failed ? (
    fallback
  ) : (
    <GLBoundary fallback={fallback} onError={() => setFailed(true)}>
      <GLView style={{ flex: 1, backgroundColor: 'transparent' }} onContextCreate={onContextCreate} />
    </GLBoundary>
  );

  return (
    <View
      style={[style, { pointerEvents: canDrag || canPick ? 'auto' : 'none' }]}
      {...label}
      {...(canDrag ? pan.panHandlers : null)}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
        if (!running) drawStill();
        else wake.current();
      }}
    >
      {canPick ? (
        // A tap target for pointers only; the screen offers the same choice as real buttons.
        <Pressable style={{ flex: 1 }} onPress={tap} focusable={false} accessible={false}>
          {surface}
        </Pressable>
      ) : (
        surface
      )}
    </View>
  );
}
