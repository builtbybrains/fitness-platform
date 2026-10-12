/* BUILT design tokens, read off the client's brand deck (see DESIGN.md).
   Flat ink: Deep Black ground, Carbon cards, one electric green used
   sparingly. Sora for display, Inter for body. Custom font families are
   loaded in app/_layout.tsx before the splash screen hides; on web the
   family carries a system fallback stack in case a font fails to load. */

import { Platform, TextStyle, ViewStyle } from 'react-native';

export const C = {
  bg: '#080808', // Deep Black
  surface: '#121212', // between black and carbon
  card: '#1F1F1F', // Carbon: cards, inputs, tab bar
  raised: '#2A2A2A', // controls on Carbon, ring tracks
  pressed: '#363636',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.14)',
  inputBorder: '#737373', // 3.5:1 on Carbon, 4.2:1 on Deep Black
  text: '#FFFFFF',
  stone: '#E9E9E9',
  muted: '#A3A3A3',
  faint: '#8C8C8C', // the floor: never dimmer for text
  green: '#A3FF3D',
  greenPressed: '#8FE62E',
  greenTint: 'rgba(163,255,61,0.12)',
  greenBorder: 'rgba(163,255,61,0.35)',
  onGreen: '#080808',
  danger: '#FF5A4E',
  warn: '#FFC53D',
} as const;

function family(name: string, fallback: string): string {
  return Platform.OS === 'web' ? `"${name}", ${fallback}` : name;
}

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const FONT = {
  displayLight: family('Sora_300Light', SANS),
  display: family('Sora_400Regular', SANS),
  displayMedium: family('Sora_500Medium', SANS),
  displaySemi: family('Sora_600SemiBold', SANS),
  displayBold: family('Sora_700Bold', SANS),
  body: family('Inter_400Regular', SANS),
  bodyMedium: family('Inter_500Medium', SANS),
  bodySemi: family('Inter_600SemiBold', SANS),
  bodyBold: family('Inter_700Bold', SANS),
} as const;

/** Radius by role, never one radius everywhere. */
export const R = {
  card: 20,
  input: 14,
  tile: 14,
  pill: 999,
} as const;

/** Type scale, ratio about 1.25 around a 16px body. */
export const T = {
  hero: { fontFamily: FONT.displaySemi, fontSize: 31, lineHeight: 38, letterSpacing: -0.6, color: C.text },
  h1: { fontFamily: FONT.displaySemi, fontSize: 28, lineHeight: 34, letterSpacing: -0.5, color: C.text },
  h2: { fontFamily: FONT.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: C.text },
  h3: { fontFamily: FONT.displaySemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: C.text },
  body: { fontFamily: FONT.body, fontSize: 16, lineHeight: 24, color: C.text },
  bodyStrong: { fontFamily: FONT.bodySemi, fontSize: 16, lineHeight: 22, color: C.text },
  meta: { fontFamily: FONT.body, fontSize: 14, lineHeight: 20, color: C.muted },
  small: { fontFamily: FONT.bodyMedium, fontSize: 13, lineHeight: 18, color: C.muted },
  number: { fontFamily: FONT.displaySemi, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: C.text },
  button: { fontFamily: FONT.displaySemi, fontSize: 16, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export const screen: ViewStyle = {
  flex: 1,
  backgroundColor: C.bg,
};

export const card: ViewStyle = {
  backgroundColor: C.card,
  borderRadius: R.card,
  padding: 20,
};

/** Page padding and the loose gap between groups. */
export const PAGE = { padding: 20, gap: 24 } as const;
