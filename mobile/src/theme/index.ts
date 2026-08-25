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
  // Soft grey canvas so white cards read as raised surfaces, the way the
  // reference design does it. Depth comes from the contrast, not from borders.
  bg: '#F1F1F3',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F4F6',
  surfacePressed: '#EAEAED',

  border: 'rgba(20, 21, 23, 0.07)',
  borderStrong: 'rgba(20, 21, 23, 0.16)',

  text: '#141517',
  textSoft: '#43454A',
  muted: '#8A8D93',
  faint: '#B3B6BC',

  // Primary actions are near-black pills; the lime is an accent for progress,
  // badges and highlights, exactly as in the reference.
  primary: '#1B1C1E',
  primaryDeep: '#000000',
  primaryLight: '#1B1C1E',
  primarySoft: 'rgba(27, 28, 30, 0.06)',
  primaryBorder: 'rgba(27, 28, 30, 0.14)',
  primaryGlow: 'rgba(27, 28, 30, 0.25)',
  onPrimary: '#FFFFFF',

  accent: '#AEE761',
  accentSoft: '#E6F8C9',
  onAccent: '#263D0E',

  // Chart series: lavender for context bars, lime for the highlighted one.
  chart: '#BCB7F2',
  chartSoft: '#ECEBFA',
  onChart: '#4A45A8',

  badgeYellow: '#F6D465',
  badgeYellowSoft: '#FBEFC9',
  onBadgeYellow: '#6E520C',

  success: '#4CAF50',
  successSoft: '#E6F8C9',
  info: '#6C66D9',
  infoSoft: '#ECEBFA',
  warning: '#C2740A',
  danger: '#DC2626',

  overlay: 'rgba(20, 21, 23, 0.45)',
} as const;

export const spacing = {
  xxs: s(4),
  xs: s(10),
  sm: s(14),
  md: s(18),
  lg: s(22),
  xl: s(28),
  xxl: s(38),
  xxxl: s(52),
} as const;

/** Vertical gaps between major stacked blocks. */
export const gap = {
  sm: vs(16),
  md: vs(24),
  lg: vs(34),
  xl: vs(46),
} as const;

export const radius = {
  sm: s(12),
  md: s(16),
  lg: s(24),
  xl: s(30),
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
      shadowColor: '#101114',
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: '#101114',
      shadowOpacity: 0.22,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 4 },
    default: {},
  }),
} as const;

export const timing = {
  fast: 160,
  base: 260,
  slow: 420,
} as const;
