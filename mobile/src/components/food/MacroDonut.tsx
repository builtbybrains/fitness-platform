/* Today's protein, carbs and fat as a 3D donut, sized by each one's share
   of calories: protein in Built Green, carbs mid grey (#A3A3A3), fat dark
   grey (#5A5A5A), so a lifted slice is the brightest thing in the card. It turns
   once when it first shows (1.2s), then rests. Tap a slice, or one of the
   chips under it, to lift that slice out and read its grams beside the
   donut; tap it again to put it back. Nothing eaten yet: a grey ring and
   a line saying how to fill it.

   The donut itself is hidden from screen readers; the chips carry the
   numbers and are the same choice as a tap on the donut. Under Reduce
   Motion, without WebGL, or if the 3D cannot load, the card is not shown
   and the day's totals below stand alone, as before (`onFail` tells the
   screen, which then shows the macros row in the totals again). */

import React, { useMemo, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { C, card as cardStyle, FONT, R, T } from '../../design';
import { haptic } from '../../lib/haptics';
import { donutSegments, MACRO_KEYS, sharePercents, type MacroKey } from '../three/layout';
import { Lazy3DScene } from '../three/Lazy3D';
import { useCan3D } from '../three/support';
import type { Macros } from '../../stats';

const NAME: Record<MacroKey, string> = { protein: 'Protein', carbs: 'Carbs', fat: 'Fat' };
/** The legend dots match the donut's slice colours (meshes.ts DONUT_COLOR). */
const SWATCH: Record<MacroKey, string> = { protein: C.green, carbs: '#A3A3A3', fat: '#5A5A5A' };

export function MacroDonut({ eaten, onFail }: { eaten: Macros; onFail?: () => void }) {
  const can3D = useCan3D();
  const [failed, setFailed] = useState(false);
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

  if (!can3D || failed) return null;

  const choose = (key: MacroKey | null) => {
    if (empty) return;
    haptic.select();
    setSelected((cur) => (key === null || cur === key ? null : key));
  };

  return (
    <View style={[cardStyle, { gap: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Lazy3DScene
          kind="donut"
          params={{ ...grams, selected: lifted }}
          width={size}
          height={size}
          onPick={(id) => choose(id === 'protein' || id === 'carbs' || id === 'fat' ? id : null)}
          onFail={() => {
            setFailed(true);
            onFail?.();
          }}
        />
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
