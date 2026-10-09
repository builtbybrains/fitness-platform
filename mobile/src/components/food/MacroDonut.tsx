/* Today's protein, carbs and fat as a donut, sized by each one's share of
   calories: protein in Built Green, carbs mid grey (#A3A3A3), fat dark grey
   (#5A5A5A), so the green is the one bright thing in the card. Drawn with
   react-native-svg. On first view the slices sweep in clockwise from 12
   o'clock over 1.2s (ease-out quart), then rest. Tap a slice, or one of
   the chips under it, to pop that slice out 6px (0.22s) and read its grams
   beside the donut; tap it again, or the hole, to put it back. Nothing
   eaten yet: a grey ring and a line saying how to fill it. Under Reduce
   Motion the donut shows whole and a slice moves out at once.

   Screen readers hear the donut as one image with each share of calories
   in its label; the chips carry the grams and are the same choice as a tap
   on a slice. */

import React, { useMemo, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { C, card as cardStyle, FONT, R, T } from '../../design';
import { haptic } from '../../lib/haptics';
import { arcSweep, donutSegments, liftOffset, MACRO_KEYS, revealSegments, sharePercents, sliceAt, slicePath, TAU, type MacroKey } from '../../lib/objects/layout';
import { useTween } from '../motion';
import type { Macros } from '../../stats';

const NAME: Record<MacroKey, string> = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
/** The slice colours; the legend dots match them. */
const SWATCH: Record<MacroKey, string> = { protein: C.green, carbs: '#A3A3A3', fat: '#5A5A5A' };

/** A popped slice moves this far out from the centre. */
const LIFT = 6;
/** The hole, as a share of the outer radius. */
const HOLE = 0.6;

function Donut({ grams, size, lifted, onPick }: { grams: Record<MacroKey, number>; size: number; lifted: MacroKey | null; onPick: (key: MacroKey | null) => void }) {
  const segs = useMemo(() => donutSegments(grams), [grams]);
  const pct = useMemo(() => sharePercents(segs), [segs]);
  const start = useRef({ x: 0, y: 0 });
  const sweep = arcSweep(useTween(1, 1200));
  const lift: Record<MacroKey, number> = {
    protein: useTween(lifted === 'protein' ? 1 : 0, 220, 220),
    carbs: useTween(lifted === 'carbs' ? 1 : 0, 220, 220),
    fat: useTween(lifted === 'fat' ? 1 : 0, 220, 220),
  };
  const c = size / 2;
  const outer = c - LIFT - 1;
  const inner = outer * HOLE;
  const shown = revealSegments(segs, sweep);
  const label = segs.length
    ? `Share of calories: ${segs.map((s) => `${NAME[s.key].toLowerCase()} ${pct[s.key] ?? 0} percent`).join(', ')}`
    : 'Share of calories: nothing logged yet';

  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} style={{ pointerEvents: 'none' }}>
        {segs.length === 0 ? (
          <Path d={slicePath(c, c, inner, outer, 0, Math.min(TAU, sweep))} fill={C.raised} fillRule="evenodd" />
        ) : (
          shown.map((s) => {
            const { dx, dy } = liftOffset(s.mid, LIFT * lift[s.key]);
            return (
              <G key={s.key} transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}>
                <Path d={slicePath(c, c, inner, outer, s.start, s.end)} fill={SWATCH[s.key]} fillRule="evenodd" />
              </G>
            );
          })
        )}
      </Svg>
      {/* The tap area: an empty view, so the tap is measured in the donut's
          own box. A responder rather than a button: it is not a stop for
          the keyboard or a screen reader (the chips are), and it reads the
          tap's place from touch and mouse alike. A drag is not a tap. */}
      <View
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }}
        onResponderRelease={(e) => {
          const { locationX, locationY, pageX, pageY } = e.nativeEvent;
          if (Math.hypot(pageX - start.current.x, pageY - start.current.y) > 10) return;
          onPick(sliceAt(segs, locationX, locationY, c, c, inner, outer));
        }}
        style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}
      />
    </View>
  );
}

export function MacroDonut({ eaten }: { eaten: Macros }) {
  const [selected, setSelected] = useState<MacroKey | null>(null);
  const { height } = useWindowDimensions();
  // Same breakpoint as Today's ring: below 900px tall the card is shorter.
  const size = height < 900 ? 140 : 180;

  const grams = useMemo(
    () => ({ protein: Math.round(eaten.protein), carbs: Math.round(eaten.carbs), fat: Math.round(eaten.fat) }),
    [eaten.protein, eaten.carbs, eaten.fat],
  );
  const segs = useMemo(() => donutSegments(grams), [grams]);
  const pct = useMemo(() => sharePercents(segs), [segs]);
  const empty = segs.length === 0;
  // A slice that is gone (its macro went back to zero) cannot stay lifted.
  const lifted = selected && segs.some((s) => s.key === selected) ? selected : null;

  const choose = (key: MacroKey | null) => {
    // A tap in the hole or a gap with nothing popped out changes nothing.
    if (empty || (key === null && !lifted)) return;
    haptic.select();
    setSelected((cur) => (key === null || cur === key ? null : key));
  };

  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Donut grams={grams} size={size} lifted={lifted} onPick={choose} />
        <View style={{ flex: 1, gap: 4 }} accessibilityLiveRegion="polite">
          {empty ? (
            <>
              <Text style={T.h3}>No food yet</Text>
              <Text style={T.meta}>Log a meal to fill this</Text>
            </>
          ) : lifted ? (
            <>
              <Text style={T.small}>{NAME[lifted]}</Text>
              <Text style={{ fontFamily: FONT.displaySemi, fontSize: 32, lineHeight: 38, letterSpacing: -0.8, color: C.text }}>
                {grams[lifted]}
                <Text style={{ fontFamily: FONT.body, fontSize: 16, color: C.muted }}> g</Text>
              </Text>
              <Text style={T.small}>{pct[lifted] ?? 0}% of calories</Text>
            </>
          ) : (
            <>
              <Text style={T.h3}>Your macros</Text>
              <Text style={T.meta}>Tap a slice for its grams</Text>
            </>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {MACRO_KEYS.map((k) => {
          const on = lifted === k;
          const has = segs.some((s) => s.key === k);
          return (
            <Pressable
              key={k}
              onPress={() => choose(k)}
              disabled={!has}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !has }}
              accessibilityLabel={`${NAME[k]}, ${grams[k]} grams${has ? `, ${pct[k] ?? 0} percent of calories` : ''}`}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 10,
                borderRadius: R.tile,
                borderWidth: 1,
                borderColor: on ? C.greenBorder : C.line,
                backgroundColor: on ? C.greenTint : pressed ? C.pressed : C.raised,
              })}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: has ? SWATCH[k] : C.pressed }} />
              <View style={{ flexShrink: 1 }}>
                <Text numberOfLines={1} style={[T.small, { fontSize: 12, lineHeight: 16 }]}>
                  {NAME[k]}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: FONT.bodySemi, fontSize: 14, lineHeight: 18, color: C.text }}>
                  {grams[k]} g
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
