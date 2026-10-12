/* A meal's photo (see lib/mealImage.ts: bundled for library meals, made on
   demand for the rest). While it loads, a raised Carbon slot with a soft
   light band sweeping across; then the photo fades in (220ms, ease-out
   quart). Reduce Motion: no sweep, no fade. If the photo can't load, the
   burger icon tile stands in, so a row never shows a broken image.

   Sizes: 'thumb' 52px (radius 14) for rows, 'card' full width at 16:10
   (radius 20) for the one meal a screen leads with, 'sheet' 72px square
   for choices in a sheet. `checked` adds the eaten badge on a thumbnail;
   its tick pops in (scale 0.8 to 1, 180ms) when the meal is ticked. */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleProp, View, ViewStyle } from 'react-native';

import { C, R } from '../../design';
import { mealImageSource } from '../../lib/mealImage';
import { Icon } from '../Icon';
import { useReduceMotion } from '../motion';
import { usePop } from '../usePop';

export type MealImageSize = 'thumb' | 'card' | 'sheet';

const BOX: Record<MealImageSize, ViewStyle> = {
  thumb: { width: 52, height: 52, borderRadius: R.tile },
  // 16:10 on phones; capped so a tablet or desktop column keeps the text in view.
  card: { width: '100%', aspectRatio: 16 / 10, maxHeight: 300, borderRadius: R.card },
  sheet: { width: 72, height: 72, borderRadius: R.tile },
};

const ICON: Record<MealImageSize, number> = { thumb: 22, card: 40, sheet: 28 };

type Props = {
  label: string;
  items?: string[];
  size?: MealImageSize;
  /** Thumbnails in a tick list: show the eaten badge (true) or the empty ring (false). */
  checked?: boolean;
  /** The meal was ticked a moment ago and this row is new: pop the tick on mount. */
  justTicked?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function MealImage({ label, items, size = 'thumb', checked, justTicked, style }: Props) {
  const reduce = useReduceMotion();
  const itemsKey = (items ?? []).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => mealImageSource(label, items), [label, itemsKey]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(source ? 'loading' : 'error');
  const fade = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);

  // A new meal starts over.
  useEffect(() => {
    setState(source ? 'loading' : 'error');
    fade.setValue(0);
  }, [source, fade]);

  useEffect(() => {
    if (state !== 'loading' || reduce || width === 0) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    );
    loop.start();
    return () => loop.stop();
  }, [state, reduce, width, sweep]);

  function onLoad() {
    setState('ready');
    if (reduce) {
      fade.setValue(1);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.poly(4)), useNativeDriver: Platform.OS !== 'web' }).start();
  }

  const box = BOX[size];
  const band = Math.max(24, width * 0.45);
  const translateX = sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, width] });

  return (
    <View style={[{ position: 'relative' }, size === 'card' ? { width: '100%' } : null, style]}>
      <View
        accessible={state !== 'error'}
        accessibilityRole="image"
        accessibilityLabel={state === 'error' ? undefined : `Photo of ${label}`}
        accessibilityHint={state === 'error' ? undefined : 'AI-generated image, not a photo of a real plate'}
        importantForAccessibility={state === 'error' ? 'no-hide-descendants' : 'yes'}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[box, { overflow: 'hidden', backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }]}
      >
        {state === 'error' || !source ? (
          <Icon name="burger" size={ICON[size]} color={C.stone} />
        ) : (
          <>
            {state === 'loading' && !reduce && width > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: band, backgroundColor: 'rgba(255,255,255,0.05)', transform: [{ translateX }] }}
              />
            ) : null}
            <Animated.Image
              source={source}
              onLoad={onLoad}
              onError={() => setState('error')}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%', opacity: fade }}
            />
          </>
        )}
      </View>
      {checked !== undefined ? <EatenBadge checked={checked} justTicked={!!justTicked} /> : null}
    </View>
  );
}

/** The tick in the corner of a thumbnail: an empty ring until eaten, then
    the green ring and tick (the CheckBox style). The disc is Carbon, like
    the card around it, so the empty ring reads as a notch, not a hole. */
function EatenBadge({ checked, justTicked }: { checked: boolean; justTicked: boolean }) {
  const scale = usePop(checked, justTicked ? false : checked);
  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        position: 'absolute',
        right: -5,
        bottom: -5,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: checked ? C.bg : C.card,
        borderWidth: 2,
        borderColor: checked ? C.green : C.inputBorder,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Icon name="check" size={14} color={C.green} strokeWidth={3} /> : null}
    </Animated.View>
  );
}
