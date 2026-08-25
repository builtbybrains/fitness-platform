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
  // Light. White page, white cards separated by a hairline and a soft shadow
  // rather than a grey fill, which keeps large areas calm.
  bg: '#FFFFFF',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F6F4',
  surfacePressed: '#E9EEEB',

  border: 'rgba(16, 26, 21, 0.09)',
  borderStrong: 'rgba(16, 26, 21, 0.18)',

  text: '#0F1613',
  textSoft: '#3C4A44',
  muted: '#6B7772',
  faint: '#98A39E',

  // Darker than the mark's leaf so it stays legible on white; white text on it
  // clears WCAG AA.
  primary: '#16A34A',
  primaryDeep: '#0D7A37',
  primaryLight: '#109042',
  primarySoft: 'rgba(22, 163, 74, 0.10)',
  primaryBorder: 'rgba(22, 163, 74, 0.24)',
  primaryGlow: 'rgba(22, 163, 74, 0.28)',
  onPrimary: '#FFFFFF',

  success: '#16A34A',
  successSoft: 'rgba(22, 163, 74, 0.10)',
  info: '#2563EB',
  infoSoft: 'rgba(37, 99, 235, 0.10)',
  warning: '#C2740A',
  danger: '#DC2626',

  overlay: 'rgba(15, 22, 19, 0.45)',
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
      shadowColor: '#0B1F16',
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 16,
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
