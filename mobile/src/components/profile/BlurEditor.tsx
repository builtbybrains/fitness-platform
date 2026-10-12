/* The face-blur editor. Shows the photo with every blur area on top; each
   area can be dragged, resized from its corner handle, selected and
   removed, and new ones added. Areas are fractions of the image (the
   BlurRegion type), so they map onto the full-size photo when baked.
   Inside each area the photo is shown really blurred (a clipped, blurred
   copy of the same image), so people can see their face is covered before
   they preview the baked result. Handles sit in their own layer above
   every area, and a handle that would land on another is moved inward, so
   every handle stays grabbable when areas overlap.
   Screen readers get actions to move, grow, shrink and remove each area. */

import { useMemo, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';

import { C, FONT } from '../../design';
import { Icon } from '../Icon';
import type { BlurRegion } from '../../types';

const MIN = 0.06;
const BLUR = 24;
const HANDLE = 44;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Box = { w: number; h: number };

/** Where each corner handle goes: on the corner, or moved inward (or, for
    a small area, outward) until it is clear of every earlier handle. An
    inward handle never reaches the middle of its area, so a tap in the
    middle still selects and drags the area. */
export function handleShifts(regions: readonly BlurRegion[], box: Box): number[] {
  const placed: { x: number; y: number }[] = [];
  return regions.map((r) => {
    const cx = (r.x + r.width) * box.w;
    const cy = (r.y + r.height) * box.h;
    const room = Math.min(r.width * box.w, r.height * box.h) / 2 - HANDLE / 2 - 8;
    const clear = (d: number) => placed.every((p) => Math.hypot(p.x - (cx - d), p.y - (cy - d)) >= HANDLE);
    let shift = 0;
    if (!clear(0)) {
      const tries = [16, 32, 48, 64, 80].filter((d) => d <= room).concat([-24, -48]);
      shift = tries.find(clear) ?? tries[tries.length - 1];
    }
    placed.push({ x: cx - shift, y: cy - shift });
    return shift;
  });
}

/** The photo, blurred, clipped to the area's shape. blurRadius works on
    iOS and Android, and react-native-web turns it into a CSS blur filter. */
function BlurredInside({ uri, r, box, left, top }: { uri: string; r: BlurRegion; box: Box; left: number; top: number }) {
  return (
    <View
      pointerEvents="none"
      // An ellipse clip: a 50% radius follows the area's own width and height.
      // The opaque backing matters: a blur fades out at the photo's edge, and
      // the sharp photo must never show through that fade.
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden', backgroundColor: C.raised, borderRadius: r.shape === 'rect' ? 0 : ('50%' as unknown as number) }}
    >
      <Image
        source={{ uri }}
        blurRadius={BLUR}
        resizeMode="cover"
        style={{ position: 'absolute', left: -left, top: -top, width: box.w, height: box.h }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

function RegionBox({
  r,
  index,
  box,
  uri,
  layer,
  handleShift,
  selected,
  onSelect,
  onChange,
  onRemove,
}: {
  r: BlurRegion;
  index: number;
  box: Box;
  uri: string;
  /** 'area': the blurred inside, the outline and the drag surface.
      'handles': the resize dot and the remove button, drawn above every area. */
  layer: 'area' | 'handles';
  handleShift: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (r: BlurRegion) => void;
  onRemove: () => void;
}) {
  // Gestures read the latest values through refs, so a re-render mid-drag
  // never resets the responder.
  const rRef = useRef(r);
  rRef.current = r;
  const boxRef = useRef(box);
  boxRef.current = box;
  const cb = useRef({ onSelect, onChange });
  cb.current = { onSelect, onChange };
  const start = useRef(r);

  const move = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = rRef.current;
          cb.current.onSelect();
        },
        onPanResponderMove: (_e, g) => {
          const s = start.current;
          const b = boxRef.current;
          cb.current.onChange({ ...s, x: clamp(s.x + g.dx / b.w, 0, 1 - s.width), y: clamp(s.y + g.dy / b.h, 0, 1 - s.height) });
        },
      }),
    [],
  );

  const resize = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = rRef.current;
          cb.current.onSelect();
        },
        onPanResponderMove: (_e, g) => {
          const s = start.current;
          const b = boxRef.current;
          cb.current.onChange({ ...s, width: clamp(s.width + g.dx / b.w, MIN, 1 - s.x), height: clamp(s.height + g.dy / b.h, MIN, 1 - s.y) });
        },
      }),
    [],
  );

  const step = 0.03;
  const left = r.x * box.w;
  const top = r.y * box.h;
  const w = r.width * box.w;
  const h = r.height * box.h;
  const stroke = selected ? C.green : C.stone;

  if (layer === 'handles') {
    return (
      <View style={{ position: 'absolute', left, top, width: w, height: h }} pointerEvents="box-none">
        {/* Corner handle: a 26px dot with a 44px touch area. */}
        <View
          {...resize.panHandlers}
          accessibilityLabel={`Resize blur area ${index + 1}`}
          style={{ position: 'absolute', right: -22 + handleShift, bottom: -22 + handleShift, width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center', cursor: 'nwse-resize' } as object}
        >
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: selected ? C.green : C.stone, borderWidth: 3, borderColor: C.bg }} />
        </View>

        {selected ? (
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove blur area ${index + 1}`}
            style={{ position: 'absolute', right: -22, top: -22, width: HANDLE, height: HANDLE, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={14} color={C.text} strokeWidth={2.6} />
            </View>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ position: 'absolute', left, top, width: w, height: h }}>
      <BlurredInside uri={uri} r={r} box={box} left={left} top={top} />
      <View
        {...move.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Blur area ${index + 1}. Drag to move it over your face.`}
        accessibilityActions={[
          { name: 'increment', label: 'Make bigger' },
          { name: 'decrement', label: 'Make smaller' },
          { name: 'up', label: 'Move up' },
          { name: 'down', label: 'Move down' },
          { name: 'left', label: 'Move left' },
          { name: 'right', label: 'Move right' },
          { name: 'remove', label: 'Remove' },
        ]}
        onAccessibilityAction={(e) => {
          const a = e.nativeEvent.actionName;
          if (a === 'remove') return onRemove();
          const grow = a === 'increment' ? step : a === 'decrement' ? -step : 0;
          const nw = clamp(r.width + grow, MIN, 1);
          const nh = clamp(r.height + grow, MIN, 1);
          const dx = a === 'left' ? -step : a === 'right' ? step : 0;
          const dy = a === 'up' ? -step : a === 'down' ? step : 0;
          onChange({ ...r, width: nw, height: nh, x: clamp(r.x + dx, 0, 1 - nw), y: clamp(r.y + dy, 0, 1 - nh) });
        }}
        style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, cursor: 'move' } as object}
      >
        <Svg width={w} height={h} pointerEvents="none">
          {r.shape === 'rect' ? null : (
            <Ellipse
              cx={w / 2}
              cy={h / 2}
              rx={Math.max(1, w / 2 - 1.5)}
              ry={Math.max(1, h / 2 - 1.5)}
              fill="none"
              stroke={stroke}
              strokeWidth={2.5}
              strokeDasharray={selected ? undefined : '6 5'}
            />
          )}
        </Svg>
        {r.shape === 'rect' ? (
          <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: 2.5, borderColor: stroke, borderStyle: selected ? 'solid' : 'dashed' }} pointerEvents="none" />
        ) : null}
      </View>
    </View>
  );
}

export function BlurEditor({
  uri,
  width,
  height,
  regions,
  onChange,
}: {
  uri: string;
  width: number;
  height: number;
  regions: BlurRegion[];
  onChange: (r: BlurRegion[]) => void;
}) {
  const [area, setArea] = useState<Box>({ w: 0, h: 0 });
  const [selected, setSelected] = useState(0);
  const aspect = width > 0 && height > 0 ? width / height : 3 / 4;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: cw, height: ch } = e.nativeEvent.layout;
    setArea({ w: cw, h: ch });
  };
  const w = area.w && area.h ? Math.min(area.w, area.h * aspect) : 0;
  const h = w ? w / aspect : 0;
  const shifts = useMemo(() => handleShifts(regions, { w, h }), [regions, w, h]);

  return (
    <View style={{ flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center' }} onLayout={onLayout}>
      {w > 0 ? (
        <View style={{ width: w, height: h, borderRadius: 14, overflow: 'visible' }}>
          <Image source={{ uri }} style={{ width: w, height: h, borderRadius: 14 }} resizeMode="cover" accessibilityLabel="Your photo" />
          {(['area', 'handles'] as const).flatMap((layer) =>
            regions.map((r, i) => (
              <RegionBox
                key={`${layer}-${i}`}
                r={r}
                index={i}
                box={{ w, h }}
                uri={uri}
                layer={layer}
                handleShift={shifts[i] ?? 0}
                selected={selected === i}
                onSelect={() => setSelected(i)}
                onChange={(nr) => onChange(regions.map((x, j) => (j === i ? nr : x)))}
                onRemove={() => {
                  onChange(regions.filter((_, j) => j !== i));
                  setSelected(Math.max(0, i - 1));
                }}
              />
            )),
          )}
        </View>
      ) : null}
    </View>
  );
}

/** A new area in the upper middle of the photo, for a second face or a
    face the detector missed. */
export function newRegion(existing: number): BlurRegion {
  const off = (existing % 4) * 0.06;
  return { x: 0.34 + off, y: 0.04 + off, width: 0.3, height: 0.22, shape: 'ellipse' };
}

export function RegionCount({ n }: { n: number }) {
  return (
    <Text style={{ fontFamily: FONT.bodyMedium, fontSize: 13, color: C.muted }}>
      {n === 0 ? 'No blur areas' : `${n} blur area${n === 1 ? '' : 's'}`}
    </Text>
  );
}
