import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';
import { ExerciseArt, ExerciseArtName } from './ExerciseArt';

/**
 * Monochrome exercise photography (CC BY, credited in
 * assets/exercises/CREDITS.md), processed to one consistent look. Metro needs
 * static require calls, hence the literal map.
 */
const PHOTOS: Partial<Record<ExerciseArtName, number>> = {
  bench: require('../../assets/exercises/bench.jpg'),
  row: require('../../assets/exercises/row.jpg'),
  raise: require('../../assets/exercises/raise.jpg'),
  pushdown: require('../../assets/exercises/pushdown.jpg'),
  facepull: require('../../assets/exercises/facepull.jpg'),
  plank: require('../../assets/exercises/plank.jpg'),
};

interface Props {
  name: ExerciseArtName;
  size?: number;
  /** Width/height when used as a hero rather than a square thumb. */
  width?: number;
  height?: number;
  radius?: number;
  style?: StyleProp<ImageStyle>;
}

/** Falls back to the drawn illustration for movements without a photo. */
export function ExercisePhoto({ name, size = 52, width, height, radius = 16, style }: Props) {
  const source = PHOTOS[name];
  const w = width ?? size;
  const h = height ?? size;

  if (!source) {
    return <ExerciseArt name={name} size={Math.min(w, h)} />;
  }

  return (
    <View style={[styles.wrap, { width: w, height: h, borderRadius: radius }]}>
      <Image source={source} style={[styles.img, style]} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  img: { width: '100%', height: '100%' },
});
