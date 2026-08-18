import { Dimensions, PixelRatio, Platform } from 'react-native';

/**
 * Phone-first responsive scale.
 *
 * Everything is sized against a 390pt reference (iPhone 14/15/16). Scaling is
 * clamped hard in both directions so a 320pt iPhone SE never gets unreadable
 * text and a 480pt foldable or tablet never gets comically large controls.
 */
const REFERENCE_WIDTH = 390;
const REFERENCE_HEIGHT = 844;

const { width, height } = Dimensions.get('window');

/** Short edge, so a rotated or unfolded device still scales from a sane number. */
export const SCREEN_W = Math.min(width, height);
export const SCREEN_H = Math.max(width, height);

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const widthRatio = clamp(SCREEN_W / REFERENCE_WIDTH, 0.84, 1.22);
const heightRatio = clamp(SCREEN_H / REFERENCE_HEIGHT, 0.86, 1.18);

/** Scale a horizontal / general dimension. */
export const s = (size: number) => Math.round(size * widthRatio);

/** Scale a vertical rhythm value (gaps between stacked blocks). */
export const vs = (size: number) => Math.round(size * heightRatio);

/**
 * Scale a font size. Deliberately flatter than `s` — type that grows linearly
 * with screen width looks wrong on large devices.
 */
export const fs = (size: number) => {
  const scaled = size * clamp(widthRatio, 0.92, 1.1);
  return Math.round(PixelRatio.roundToNearestPixel(scaled));
};

/** Devices that need tighter padding and smaller headline sizes. */
export const isSmallPhone = SCREEN_W < 360;
/** iPhone SE-class height: vertical space is the scarce resource. */
export const isShortPhone = SCREEN_H < 700;
export const isTablet = SCREEN_W >= 700;

/**
 * Cap for `maxFontSizeMultiplier`. Users with large accessibility type still
 * get bigger text, but not so big that cards blow apart.
 */
export const MAX_FONT_SCALE = 1.35;
export const MAX_FONT_SCALE_TIGHT = 1.15;

export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';
