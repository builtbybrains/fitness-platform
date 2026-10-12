/* Muscle map: a flat, geometric body, front and back side by side, with the
   muscles a session works lit up. Main muscles are solid Built Green; the
   ones it also works get the green tint and its border; everything else is
   a mid grey that still reads on Carbon. Rounded segments with even gaps,
   no outlines on unworked parts, so it reads as a diagram, not a drawing.
   The shoulders are caps over the upper arm whose inner edge runs along
   the chest's cut corner (front) or beside the upper back (back).

   Each figure is drawn on a 67 x 183 grid (x 16.5..83.5). Paired segments
   are drawn once on the figure's left and mirrored. At the small size the tint
   is too faint to read and a 1px border would swallow the thin segments,
   so "also" muscles fill with the border colour instead. The whole map is
   one image for screen readers ("Works chest and triceps, with shoulders"). */

import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { C, T } from '../../design';
import type { Muscle } from '../../data/exercises';
import { muscleMapLabel, toneFor, type MuscleTone } from '../../lib/muscles';

const VIEW = { x: 16.5, y: 1, w: 67, h: 183 } as const;
const HEIGHT = { small: 64, large: 160 } as const;
const GAP = { small: 6, large: 20 } as const;
/** Unworked segments: light enough to read on Carbon at both sizes. */
const UNWORKED = '#4A4A4A';

type Size = 'small' | 'large';
type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'path'; d: string };

/** A segment of the body. `muscle` null: structure only (head, neck,
    forearms, hips, feet), never lit. `pair`: drawn on both sides. */
type Segment = { muscle: Muscle | null; shape: Shape; pair?: boolean };

const HEAD: Segment[] = [
  { muscle: null, shape: { kind: 'path', d: 'M50 3c5.8 0 10 4.9 10 11.6S55.8 27 50 27s-10-5.7-10-12.4S44.2 3 50 3Z' } },
  { muscle: null, shape: { kind: 'rect', x: 45.5, y: 28.5, w: 9, h: 7, r: 3 } },
];

// Shoulder caps: a dome over the upper arm, flat underneath. On the front
// the inner edge follows the chest's cut corner at an even gap; on the back
// it stands clear of the upper back and lats.
const DELT_FRONT = 'M38.6 37.6C31 37.4 22.6 40.4 21.5 51.5c-.1 1.4.6 2.2 2 2.2H30c3.6 0 6.4-4 6.4-8.4l.1-1.3 2.1-6.4Z';
const DELT_BACK = 'M37.6 37.6C30.6 37.4 22.6 40.4 21.5 51.5c-.1 1.4.6 2.2 2 2.2H30c3.6 0 6.2-4 6.2-8.4V40c0-1.5.5-2.4 1.4-2.4Z';

const ARMS = (upper: Muscle, delt: string): Segment[] => [
  { muscle: 'shoulders', pair: true, shape: { kind: 'path', d: delt } },
  { muscle: upper, pair: true, shape: { kind: 'rect', x: 21, y: 55.5, w: 9, h: 20, r: 4.5 } },
  { muscle: null, pair: true, shape: { kind: 'rect', x: 18.5, y: 77, w: 8.5, h: 22, r: 4.25 } },
];

const FRONT: Segment[] = [
  ...HEAD,
  ...ARMS('biceps', DELT_FRONT),
  // Chest: two plates meeting at a narrow sternum line, square at the
  // centre, sweeping up to the outside, outer top corner cut for the cap.
  { muscle: 'chest', pair: true, shape: { kind: 'path', d: 'M41.2 37h8.3v15.6c0 1.2-.7 2-1.9 2-4 0-7.2-1-9-3.4-.4-.5-.6-1.2-.6-1.9V45l2.1-6.9c.2-.7.5-1.1 1.1-1.1Z' } },
  // Core: six blocks and the obliques either side.
  { muscle: 'core', pair: true, shape: { kind: 'rect', x: 42.5, y: 56.5, w: 6.5, h: 8.5, r: 2.5 } },
  { muscle: 'core', pair: true, shape: { kind: 'rect', x: 42.5, y: 66.5, w: 6.5, h: 8.5, r: 2.5 } },
  { muscle: 'core', pair: true, shape: { kind: 'rect', x: 42.5, y: 76.5, w: 6.5, h: 8.5, r: 2.5 } },
  { muscle: 'core', pair: true, shape: { kind: 'rect', x: 37, y: 56.5, w: 4, h: 27, r: 2 } },
  { muscle: null, shape: { kind: 'rect', x: 37.5, y: 86.5, w: 25, h: 10, r: 4 } },
  { muscle: 'quads', pair: true, shape: { kind: 'rect', x: 37, y: 98, w: 12, h: 40, r: 6 } },
  { muscle: 'calves', pair: true, shape: { kind: 'rect', x: 38.5, y: 141, w: 9.5, h: 33, r: 4.75 } },
  { muscle: null, pair: true, shape: { kind: 'rect', x: 37.5, y: 176, w: 10.5, h: 6, r: 3 } },
];

const BACK: Segment[] = [
  ...HEAD,
  ...ARMS('triceps', DELT_BACK),
  // Upper back: one kite from the neck to mid-back.
  { muscle: 'back', shape: { kind: 'path', d: 'M40 37h20c1.4 0 1.6.6 1 1.6L51.3 58.3c-.6 1.3-2 1.3-2.6 0L39 38.6c-.6-1-.4-1.6 1-1.6Z' } },
  // Lats down to the lower back; the gap between them is the spine.
  { muscle: 'back', pair: true, shape: { kind: 'path', d: 'M37.8 42 45.8 58.6c1.6 1.4 2.45 2.9 2.45 4.4V84c0 .9-.5 1.2-1.3 1-6.4-1.5-7.8-3.7-8.4-9L37.6 47c-.1-2.6 0-4.4.2-5Z' } },
  { muscle: 'glutes', pair: true, shape: { kind: 'rect', x: 37.5, y: 87, w: 11.5, h: 17, r: 7 } },
  { muscle: 'hamstrings', pair: true, shape: { kind: 'rect', x: 37, y: 106, w: 12, h: 32, r: 6 } },
  // Calves: the bulge sits high.
  { muscle: 'calves', pair: true, shape: { kind: 'path', d: 'M43.25 141c5.25 0 5.75 9 4.75 17l-1.2 14c-.2 1.4-1 2-2.3 2h-2.5c-1.3 0-2.1-.6-2.3-2l-1.2-14c-1-8-.5-17 4.75-17Z' } },
  { muscle: null, pair: true, shape: { kind: 'rect', x: 37.5, y: 176, w: 10.5, h: 6, r: 3 } },
];

function paint(tone: MuscleTone, size: Size, unit: number) {
  if (tone === 'main') return { fill: C.green };
  if (tone === 'also') {
    return size === 'small' ? { fill: C.greenBorder } : { fill: C.greenTint, stroke: C.greenBorder, strokeWidth: unit };
  }
  return { fill: UNWORKED };
}

function Draw({ shape, p }: { shape: Shape; p: ReturnType<typeof paint> }) {
  if (shape.kind === 'rect') return <Rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.r} {...p} />;
  if (shape.kind === 'circle') return <Circle cx={shape.cx} cy={shape.cy} r={shape.r} {...p} />;
  return <Path d={shape.d} {...p} />;
}

function Figure({ segments, primary, secondary, size }: { segments: Segment[]; primary: Muscle[]; secondary: Muscle[]; size: Size }) {
  const height = HEIGHT[size];
  const width = (height * VIEW.w) / VIEW.h;
  // One screen pixel in grid units, so the "also" border is a true 1px.
  const unit = VIEW.h / height;
  return (
    <Svg width={width} height={height} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} pointerEvents="none">
      {segments.map((s, i) => {
        const p = paint(s.muscle ? toneFor(s.muscle, primary, secondary) : 'none', size, unit);
        return (
          <G key={i}>
            <Draw shape={s.shape} p={p} />
            {s.pair ? (
              <G transform="translate(100 0) scale(-1 1)">
                <Draw shape={s.shape} p={p} />
              </G>
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

export function MuscleMap({ primary, secondary, size }: { primary: Muscle[]; secondary: Muscle[]; size: Size }) {
  const large = size === 'large';
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={muscleMapLabel(primary, secondary)} style={{ flexDirection: 'row', gap: GAP[size] }}>
      {[FRONT, BACK].map((segments, i) => (
        <View key={i} style={{ alignItems: 'center', gap: 6 }}>
          <Figure segments={segments} primary={primary} secondary={secondary} size={size} />
          {large ? <Text style={[T.small, { fontSize: 11, lineHeight: 14, color: C.faint }]}>{i === 0 ? 'Front' : 'Back'}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const MAIN_SWATCH = { backgroundColor: C.green };
const ALSO_SWATCH = { backgroundColor: C.greenTint, borderWidth: 1, borderColor: C.greenBorder };

/** The key for the map: "Main" (solid green) and "Also" (the tint).
    `compact`: one line each, for short phones. */
export function MuscleLegend({ primary, secondary, compact = false }: { primary: string; secondary: string; compact?: boolean }) {
  if (compact) {
    return (
      <View style={{ gap: 8 }}>
        <CompactRow swatch={MAIN_SWATCH} text={primary} label={`Main: ${primary}`} />
        {secondary ? <CompactRow swatch={ALSO_SWATCH} text={`Also: ${secondary}`} label={`Also: ${secondary}`} /> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <LegendRow swatch={MAIN_SWATCH} label="Main" value={primary} />
      {secondary ? <LegendRow swatch={ALSO_SWATCH} label="Also" value={secondary} /> : null}
    </View>
  );
}

function LegendRow({ swatch, label, value }: { swatch: object; label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[{ width: 10, height: 10, borderRadius: 3 }, swatch]} />
        <Text style={T.small}>{label}</Text>
      </View>
      <Text style={[T.small, { color: C.text, fontSize: 14, lineHeight: 20 }]}>{value}</Text>
    </View>
  );
}

function CompactRow({ swatch, text, label }: { swatch: object; text: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel={label}>
      <View style={[{ width: 10, height: 10, borderRadius: 3 }, swatch]} />
      <Text style={[T.small, { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 }]}>{text}</Text>
    </View>
  );
}
