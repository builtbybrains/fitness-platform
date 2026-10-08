/* The only 3D entry point screens import. It is light: three.js and expo-gl
   load on first use through React.lazy (a separate chunk on web), and a
   same-size empty box holds the space meanwhile, so nothing shifts. If the
   chunk cannot load or GL cannot start, `fallback` shows instead.

   Inside a screen the scene pauses while the screen is not focused. The
   global celebration overlay sits outside the navigator, so it passes
   focusAware={false}. Every 3D view here is decorative and hidden from
   screen readers; the meaning lives in the text next to it.

   Lazy3DScene shows the data-driven scenes (Today ring, Food donut,
   Progress shelf, Workout plates, questionnaire object): `params` carries
   the data, and a change animates in the scene. Screens decide between it
   and their 2D form with useCan3D (support.ts); `onFail` reports a chunk
   or GL failure so the screen can switch to 2D. */

import React, { lazy, Suspense } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';

import type { SceneKind, SceneParams } from './sceneTypes';

type Chunk = typeof import('./presets');
let chunk: Promise<Chunk> | null = null;

/** Start loading the 3D code ahead of need. Safe to call repeatedly. */
export function preload3D(): Promise<Chunk> {
  if (!chunk) {
    chunk = import('./presets');
    chunk.catch(() => {
      chunk = null; // let a later mount try again
    });
  }
  return chunk;
}

const Dumbbell = lazy(() => preload3D().then((m) => ({ default: m.DumbbellScene })));
const Medal = lazy(() => preload3D().then((m) => ({ default: m.MedalScene })));
const Param = lazy(() => preload3D().then((m) => ({ default: m.ParamScene })));

export type Lazy3DProps = {
  kind: 'dumbbell' | 'medal';
  /** Dumbbell only. */
  motion?: 'float' | 'drop' | 'rest';
  width: number;
  height: number;
  interactive?: boolean;
  paused?: boolean;
  /** Pause while the screen is not focused. Needs a navigator above it. */
  focusAware?: boolean;
  /** Shown if the 3D cannot load or GL cannot start. */
  fallback?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

class LoadBoundary extends React.Component<{ fallback: React.ReactNode; onFail?: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Inner({ kind, motion = 'float', width, height, interactive = false, paused = false, fallback = null, style }: Omit<Lazy3DProps, 'focusAware'>) {
  const box = { width, height };
  return (
    <View
      style={[box, { alignItems: 'center', justifyContent: 'center', pointerEvents: interactive ? 'box-none' : 'none' }, style]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LoadBoundary fallback={fallback}>
        <Suspense fallback={<View style={box} />}>
          {kind === 'medal' ? (
            <Medal style={box} paused={paused} fallback={fallback} />
          ) : (
            <Dumbbell style={box} motion={motion} interactive={interactive} paused={paused} fallback={fallback} />
          )}
        </Suspense>
      </LoadBoundary>
    </View>
  );
}

function FocusAware(props: Omit<Lazy3DProps, 'focusAware'>) {
  const focused = useIsFocused();
  return <Inner {...props} paused={props.paused || !focused} />;
}

export function Lazy3D({ focusAware = true, ...props }: Lazy3DProps) {
  return focusAware ? <FocusAware {...props} /> : <Inner {...props} />;
}

export type Lazy3DSceneProps<K extends SceneKind> = {
  kind: K;
  params: SceneParams[K];
  width: number;
  height: number;
  /** "spring": drag sideways to turn it, it springs back on release. */
  drag?: 'spin' | 'spring';
  /** Tap to pick a part of the scene (the donut's segments). */
  onPick?: (id: string | null) => void;
  paused?: boolean;
  /** Pause while the screen is not focused. Needs a navigator above it. */
  focusAware?: boolean;
  /** Shown if the 3D cannot load or GL cannot start. */
  fallback?: React.ReactNode;
  /** Holds the space while the 3D code loads. Defaults to an empty box. */
  placeholder?: React.ReactNode;
  /** The 3D could not load or start; the screen can show its 2D form. */
  onFail?: () => void;
  /** The first 3D frame is on screen; a 2D stand-in under it can go. */
  onDrawn?: () => void;
  style?: StyleProp<ViewStyle>;
};

function SceneInner<K extends SceneKind>({ kind, params, width, height, drag, onPick, paused = false, fallback = null, placeholder, onFail, onDrawn, style }: Omit<Lazy3DSceneProps<K>, 'focusAware'>) {
  const box = { width, height };
  const touch = !!drag || !!onPick;
  return (
    <View
      style={[box, { alignItems: 'center', justifyContent: 'center', pointerEvents: touch ? 'box-none' : 'none' }, style]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <LoadBoundary fallback={fallback} onFail={onFail}>
        <Suspense fallback={placeholder ?? <View style={box} />}>
          <Param kind={kind} params={params} style={box} drag={drag} onPick={onPick} paused={paused} fallback={fallback} onFail={onFail} onDrawn={onDrawn} />
        </Suspense>
      </LoadBoundary>
    </View>
  );
}

function FocusAwareScene<K extends SceneKind>(props: Omit<Lazy3DSceneProps<K>, 'focusAware'>) {
  const focused = useIsFocused();
  return <SceneInner {...props} paused={props.paused || !focused} />;
}

/** A data-driven 3D scene, loaded with the 3D chunk. Decorative to screen
    readers: the screen keeps the numbers in text beside or over it. */
export function Lazy3DScene<K extends SceneKind>({ focusAware = true, ...props }: Lazy3DSceneProps<K>) {
  return focusAware ? <FocusAwareScene {...props} /> : <SceneInner {...props} />;
}
