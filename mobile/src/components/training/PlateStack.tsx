/* A small stack of bumper plates beside the workout's set counter, as
   images on a steel pin. Each ticked set drops a plate onto the stack
   (falls 40px and lands in 0.35s, ease-out quart, one after another when
   several land at once), threaded on the pin; untick one and the top plate
   lifts off and fades (0.2s). When the workout is done the gaps between the plates close
   (0.25s) and the stack gives one small turn as it locks together. Up to
   6 plates show, alternating full size and a size down; a longer session
   maps its sets onto the 6 in proportion. Before the first set the pin
   stands alone. Still between changes. Under Reduce Motion the stack
   simply shows the right number of plates.

   Decorative: the "x of y sets done" text beside it says the same. */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';

import { useReduceMotion } from '../motion';
import { ObjectImage } from '../objects/ObjectImage';
import { plateRadius, plateY, visiblePlates } from '../../lib/objects/layout';

export const PLATE_STACK_SIZE = 90;

const NATIVE = Platform.OS !== 'web';
const MID = PLATE_STACK_SIZE / 2;
/** A full-size plate's square image. In it (README in assets/images/objects)
    the top face's centre sits 0.472 down, the plate's lowest edge 0.88
    down, and one plate is 0.054 of the image thick. */
const PLATE = 78;
const FACE_Y = 0.472;
const STEP = Math.round(0.054 * PLATE * 10) / 10;
/** The bottom plate's face centre, from the top of the box: its lowest edge 2px off the floor. */
const BASE_Y = PLATE_STACK_SIZE - 2 - (0.88 - FACE_Y) * PLATE;
const OPEN_GAP = 2; // px between plates until the workout is done
const DROP_PX = 40;
const PIN_TOP = 8;
const PIN_W = 4;
const STEEL = '#8C8C8C';

type Plate = { id: number; size: number; drop: Animated.Value; leave: Animated.Value; leaving: boolean };

const ease = Easing.out(Easing.poly(4));

export function PlateStack({ done, total, complete }: { done: number; total: number; complete: boolean }) {
  const reduce = useReduceMotion();
  const [plates, setPlates] = useState<Plate[]>([]);
  const list = useRef<Plate[]>([]);
  const nextId = useRef(1);
  const shownTotal = useRef(-1);
  const gap = useRef(new Animated.Value(complete ? 0 : 1)).current;
  const turn = useRef(new Animated.Value(0)).current;
  const wasComplete = useRef(complete);

  const commit = (next: Plate[]) => {
    list.current = next;
    setPlates(next);
  };
  const make = (index: number, settled: boolean): Plate => ({
    id: nextId.current++,
    size: plateRadius(index),
    drop: new Animated.Value(settled ? 0 : 1),
    leave: new Animated.Value(0),
    leaving: false,
  });

  useEffect(() => {
    const want = visiblePlates(done, total);
    // A different session (or the first one): show it as it is, no drops.
    if (total !== shownTotal.current) {
      shownTotal.current = total;
      commit(Array.from({ length: want }, (_, i) => make(i, true)));
      gap.setValue(complete ? 0 : 1);
      turn.setValue(0);
      wasComplete.current = complete;
      return;
    }
    const standing = list.current.filter((p) => !p.leaving);
    let next = list.current.slice();
    if (want > standing.length) {
      for (let k = standing.length; k < want; k++) {
        const p = make(k, reduce);
        next.push(p);
        if (!reduce) Animated.timing(p.drop, { toValue: 0, duration: 350, delay: (k - standing.length) * 80, easing: ease, useNativeDriver: NATIVE }).start();
      }
    } else if (want < standing.length) {
      const going = standing.slice(want);
      if (reduce) next = next.filter((p) => !going.includes(p));
      else
        for (const p of going) {
          p.leaving = true;
          Animated.timing(p.leave, { toValue: 1, duration: 200, easing: ease, useNativeDriver: NATIVE }).start(({ finished }) => {
            if (finished) commit(list.current.filter((x) => x !== p));
          });
        }
    }
    commit(next);

    // Done: the gaps close, then one small turn as the stack locks together.
    if (reduce) gap.setValue(complete ? 0 : 1);
    else Animated.timing(gap, { toValue: complete ? 0 : 1, duration: 250, easing: ease, useNativeDriver: NATIVE }).start();
    if (complete && !wasComplete.current && !reduce) {
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(turn, { toValue: 1, duration: 180, easing: ease, useNativeDriver: NATIVE }),
        Animated.timing(turn, { toValue: 0, duration: 420, easing: ease, useNativeDriver: NATIVE }),
      ]).start();
    }
    wasComplete.current = complete;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, total, complete, reduce]);

  if (total <= 0) return null;

  let index = 0;
  return (
    <View
      // A falling plate comes in from above the top edge, as through a window.
      style={{ width: PLATE_STACK_SIZE, height: PLATE_STACK_SIZE, overflow: 'hidden' }}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        style={{
          width: PLATE_STACK_SIZE,
          height: PLATE_STACK_SIZE,
          transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-5deg'] }) }],
        }}
      >
        {/* The pin on its foot, behind everything: it alone shows before the first set. */}
        <View style={{ position: 'absolute', left: MID - 15, top: BASE_Y - 3, width: 30, height: 9, borderRadius: 5, backgroundColor: '#2A2A2A' }} />
        <View style={{ position: 'absolute', left: MID - PIN_W / 2, top: PIN_TOP, width: PIN_W, height: BASE_Y - PIN_TOP + 2, borderRadius: PIN_W / 2, backgroundColor: STEEL }} />
        {plates.map((p) => {
          const i = p.leaving ? index : index++;
          const side = PLATE * p.size;
          // How far up the stack this plate's face centre sits, open and closed.
          const open = plateY(i, STEP, OPEN_GAP) - STEP / 2;
          const closed = plateY(i, STEP, 0) - STEP / 2;
          const lift = gap.interpolate({ inputRange: [0, 1], outputRange: [-closed, -open] });
          // The pin above this plate's hub, in front of it, so the plate is
          // threaded on it; the plate above hides it but for its own hole.
          // It runs from the hub up to the pin's top, and stretches (scaleY
          // about its middle, shifted to keep its top still) as the gaps close.
          const hOpen = BASE_Y - open - PIN_TOP;
          const hClosed = BASE_Y - closed - PIN_TOP;
          return (
            <React.Fragment key={p.id}>
              <ObjectImage
                name="plate"
                width={side}
                height={side}
                style={{
                  position: 'absolute',
                  left: MID - side / 2,
                  top: BASE_Y - FACE_Y * side,
                  opacity: p.leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  transform: [
                    { translateY: Animated.add(Animated.add(lift, p.drop.interpolate({ inputRange: [0, 1], outputRange: [0, -DROP_PX] })), p.leave.interpolate({ inputRange: [0, 1], outputRange: [0, -10] })) },
                    { scale: p.leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }) },
                  ],
                }}
              />
              <Animated.View
                style={{
                  position: 'absolute',
                  left: MID - PIN_W / 2,
                  top: PIN_TOP,
                  width: PIN_W,
                  height: hOpen,
                  borderRadius: PIN_W / 2,
                  backgroundColor: STEEL,
                  opacity: p.leave.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' }),
                  transform: [
                    { translateY: gap.interpolate({ inputRange: [0, 1], outputRange: [(hClosed - hOpen) / 2, 0] }) },
                    { scaleY: gap.interpolate({ inputRange: [0, 1], outputRange: [hClosed / hOpen, 1] }) },
                  ],
                }}
              />
            </React.Fragment>
          );
        })}
      </Animated.View>
    </View>
  );
}
