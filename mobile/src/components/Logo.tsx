import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * The VITAL mark, identical to the one on the website: leaf, athlete and a
 * broken ring. Drawn as vectors so it is razor sharp at every density.
 */
/**
 * The athlete and the outer ring are near-white, which disappears on a light
 * background. `onLight` swaps just those two gradients for slate, leaving the
 * leaf and the mark's identity untouched.
 */
export function Logo({ size = 64, onLight = true }: { size?: number; onLight?: boolean }) {
  const body = onLight ? ['#243330', '#4A5B55'] : ['#ffffff', '#aebccb'];
  const ring = onLight ? ['#3A4A45', '#7C8B85'] : ['#ffffff', '#8b9aab'];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="VITAL">
      <Defs>
        <LinearGradient id="vLeaf" x1="6" y1="22" x2="34" y2="50" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#9bf457" />
          <Stop offset="1" stopColor="#14954a" />
        </LinearGradient>
        <LinearGradient id="vLeaf2" x1="8" y1="38" x2="28" y2="57" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#aef86e" />
          <Stop offset="1" stopColor="#1eaa52" />
        </LinearGradient>
        <LinearGradient id="vRingG" x1="6" y1="32" x2="48" y2="8" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#14954a" />
          <Stop offset="1" stopColor="#9bf457" />
        </LinearGradient>
        <LinearGradient id="vBody" x1="44" y1="14" x2="16" y2="58" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={body[0]} />
          <Stop offset="1" stopColor={body[1]} />
        </LinearGradient>
        <LinearGradient id="vRingS" x1="58" y1="24" x2="20" y2="56" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={ring[0]} />
          <Stop offset="1" stopColor={ring[1]} />
        </LinearGradient>
      </Defs>

      <Path
        d="M5.6 33A26.4 26.4 0 0 1 46.9 11.3"
        fill="none"
        stroke="url(#vRingG)"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Path
        d="M58.2 26.2A26.4 26.4 0 0 1 18.6 55.9"
        fill="none"
        stroke="url(#vRingS)"
        strokeWidth={4}
        strokeLinecap="round"
      />

      <Path d="M6.6 23.2c14.4.6 24.2 9.8 25.2 24.1C17.2 47 7.2 37.7 6.6 23.2Z" fill="url(#vLeaf)" />
      <Path
        d="M6.6 23.2c10.1 5.2 18.5 13.2 25.2 24.1"
        fill="none"
        stroke="#0b6f33"
        strokeOpacity={0.42}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path d="M7 40.5c10.8-.2 18.5 6.2 19.6 16.7C16 57.6 7.9 51.1 7 40.5Z" fill="url(#vLeaf2)" />
      <Path
        d="M7 40.5c7.6 3.9 14 9.5 19.6 16.7"
        fill="none"
        stroke="#0b6f33"
        strokeOpacity={0.38}
        strokeWidth={1.4}
        strokeLinecap="round"
      />

      <Path
        d="M40.6 26.2C39.2 38.2 32.6 49.2 15.2 58.8c5.6-15.2 12.7-26.3 25.4-32.6Z"
        fill="url(#vBody)"
      />
      <Path
        d="M36.4 28.6C34.6 37 30.2 44.6 22.4 51c3.4-10.4 8.2-17.9 14-22.4Z"
        fill="url(#vBody)"
        opacity={0.45}
      />
      <Circle cx={32.9} cy={17.2} r={6.9} fill="url(#vBody)" />
      <Path
        d="M38.9 31.3 51.4 34.8 46.3 21.3"
        fill="none"
        stroke="url(#vBody)"
        strokeWidth={7.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
