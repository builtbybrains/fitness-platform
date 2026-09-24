/* Design tokens shared by every screen. Values match the website's dark
   glass + mint language. No custom fonts in Step 2 — system font only, so
   nothing can fail on the device. Custom fonts come later, verified alone. */

import { Platform, TextStyle, ViewStyle } from 'react-native';

export const C = {
  bg: '#05070A',
  card: 'rgba(255,255,255,0.05)',
  cardStrong: 'rgba(255,255,255,0.08)',
  line: 'rgba(255,255,255,0.09)',
  text: '#F2F5F7',
  muted: '#8A939B',
  mint: '#5CE0B8',
  mintDim: 'rgba(92,224,184,0.15)',
  warn: '#E8B84C',
  danger: '#E86A5C',
} as const;

export const FONT = {
  regular: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }),
  semibold: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: 'System' }),
} as const;

export const RADIUS = 20;

export const screen: ViewStyle = {
  flex: 1,
  backgroundColor: C.bg,
};

export const card: ViewStyle = {
  backgroundColor: C.card,
  borderRadius: RADIUS,
  borderWidth: 1,
  borderColor: C.line,
  padding: 16,
};

export const title: TextStyle = {
  color: C.text,
  fontSize: 28,
  fontWeight: '800',
  letterSpacing: 0.3,
};

export const subtitle: TextStyle = {
  color: C.muted,
  fontSize: 14,
  marginTop: 4,
};

export const sectionLabel: TextStyle = {
  color: C.muted,
  fontSize: 12,
  fontWeight: '700',
  letterSpacing: 1.4,
  textTransform: 'uppercase',
};

export const mintButton: ViewStyle = {
  backgroundColor: C.mint,
  borderRadius: 14,
  paddingVertical: 14,
  alignItems: 'center',
};

export const mintButtonText: TextStyle = {
  color: '#04120C',
  fontSize: 16,
  fontWeight: '800',
};
