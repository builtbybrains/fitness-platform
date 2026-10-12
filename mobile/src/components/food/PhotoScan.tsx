/* The meal photo while the estimate is being worked out: a thin Built
   Green line sweeps down the photo and back (1.6s each way, ease in and
   out) over a light dimming, and the label under it breathes softly
   (opacity 0.55 to 1, 1.1s). Both stop the moment the answer arrives.
   Reduce Motion: no sweep, a still label. */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Text, View } from 'react-native';

import { C, FONT, R } from '../../design';
import { useReduceMotion } from '../motion';

const NATIVE = Platform.OS !== 'web';
const SWEEP_MS = 1600;

export function PhotoScan({ uri, scanning, label }: { uri: string; scanning: boolean; label: string }) {
  const reduce = useReduceMotion();
  const [height, setHeight] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const live = scanning && !reduce;

  useEffect(() => {
    if (!live) return;
    const ease = Easing.inOut(Easing.cubic);
    const a = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: ease, useNativeDriver: NATIVE }),
          Animated.timing(sweep, { toValue: 0, duration: SWEEP_MS, easing: ease, useNativeDriver: NATIVE }),
        ]),
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 0.55, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
          Animated.timing(pulse, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        ]),
      ),
    ]);
    sweep.setValue(0);
    a.start();
    return () => {
      a.stop();
      sweep.setValue(0);
      pulse.setValue(1);
    };
  }, [live, sweep, pulse]);

  return (
    <View style={{ gap: 12 }}>
      <View onLayout={(e) => setHeight(e.nativeEvent.layout.height)} style={{ borderRadius: R.tile, overflow: 'hidden', backgroundColor: C.raised }}>
        <Image source={{ uri }} style={{ width: '100%', aspectRatio: 4 / 3 }} accessibilityLabel="Your meal photo" accessibilityIgnoresInvertColors />
        {scanning ? (
          <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(8,8,8,0.28)' }}>
            {live && height > 0 ? (
              <Animated.View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 2,
                  backgroundColor: C.green,
                  transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [0, height - 2] }) }],
                }}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      {scanning ? (
        <Animated.View style={{ opacity: pulse }} accessibilityLiveRegion="polite">
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, lineHeight: 20, color: C.stone, textAlign: 'center' }}>{label}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}
