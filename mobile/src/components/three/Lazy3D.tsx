/* The only 3D entry point screens import. It is light: three.js and expo-gl
   load on first use through React.lazy (a separate chunk on web), and a
   same-size empty box holds the space meanwhile, so nothing shifts. If the
   chunk cannot load or GL cannot start, `fallback` shows instead.

   Inside a screen the scene pauses while the screen is not focused. The
   global celebration overlay sits outside the navigator, so it passes
   focusAware={false}. Every 3D view here is decorative and hidden from
   screen readers; the meaning lives in the text next to it. */

import React, { lazy, Suspense } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useIsFocused } from 'expo-router';

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

class LoadBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
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
