import { Platform } from 'react-native';
import { fs, s, vs } from './responsive';

export * from './responsive';

/**
 * VITAL palette.
 *
 * A deep, slightly warm near-black base with one sophisticated crimson accent.
 * The red is desaturated away from neon and paired with generous neutral space
 * so it reads as premium rather than alarming.
 */
export const colors = {
  bg: '#07090A',
  bgElevated: '#0E1213',
  surface: '#131819',
  surfaceAlt: '#1A2021',
  surfacePressed: '#202728',

  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.15)',

  text: '#F2F6F4',
  textSoft: '#C2CCC7',
  muted: '#87938D',
  faint: '#586159',

  // Green, taken from the leaf in the VITAL mark. Deep enough to read as
  // premium on near-black rather than a highlighter.
  primary: '#31CC70',
  primaryDeep: '#12864A',
  primaryLight: '#63E895',
  primarySoft: 'rgba(49, 204, 112, 0.13)',
  primaryBorder: 'rgba(49, 204, 112, 0.30)',
  primaryGlow: 'rgba(49, 204, 112, 0.30)',
  onPrimary: '#04170C',

  // A cool second accent so "done" never fights the primary green.
  success: '#31CC70',
  successSoft: 'rgba(49, 204, 112, 0.13)',
  info: '#5AA9FF',
  infoSoft: 'rgba(90, 169, 255, 0.13)',
  warning: '#F0B23E',
  danger: '#FF6B6B',

  overlay: 'rgba(4, 6, 6, 0.74)',
} as const;

export const spacing = {
  xxs: s(4),
  xs: s(8),
  sm: s(12),
  md: s(16),
  lg: s(20),
  xl: s(24),
  xxl: s(32),
  xxxl: s(44),
} as const;

/** Vertical gaps between major stacked blocks. */
export const gap = {
  sm: vs(12),
  md: vs(18),
  lg: vs(26),
  xl: vs(36),
} as const;

export const radius = {
  sm: s(10),
  md: s(14),
  lg: s(20),
  xl: s(26),
  pill: 999,
} as const;

export const type = {
  display: { fontSize: fs(34), lineHeight: fs(38), fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  h1: { fontSize: fs(26), lineHeight: fs(31), fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
  h2: { fontSize: fs(20), lineHeight: fs(25), fontFamily: 'Inter_600SemiBold', letterSpacing: -0.4 },
  h3: { fontSize: fs(16), lineHeight: fs(21), fontFamily: 'Inter_600SemiBold', letterSpacing: -0.2 },
  body: { fontSize: fs(15), lineHeight: fs(22), fontFamily: 'Inter_400Regular' },
  bodyMed: { fontSize: fs(15), lineHeight: fs(22), fontFamily: 'Inter_500Medium' },
  small: { fontSize: fs(13), lineHeight: fs(18), fontFamily: 'Inter_400Regular' },
  smallMed: { fontSize: fs(13), lineHeight: fs(18), fontFamily: 'Inter_500Medium' },
  caption: { fontSize: fs(11), lineHeight: fs(15), fontFamily: 'Inter_500Medium', letterSpacing: 0.4 },
  /** Big dashboard numbers. */
  metric: { fontSize: fs(28), lineHeight: fs(32), fontFamily: 'Inter_700Bold', letterSpacing: -1 },
  metricSm: { fontSize: fs(21), lineHeight: fs(25), fontFamily: 'Inter_700Bold', letterSpacing: -0.6 },
} as const;

export const shadow = {
  card: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 4 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: colors.primary,
      shadowOpacity: 0.45,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 8 },
    default: {},
  }),
} as const;

export const timing = {
  fast: 160,
  base: 260,
  slow: 420,
} as const;
