/**
 * TEMPORARY DIAGNOSTIC.
 *
 * When true, the startup path is stripped back to plain React Native: no custom
 * fonts, no splash-screen control, no Stripe gate, no gesture handler or safe
 * area providers, and a boot screen with no Reanimated, SVG or gradients.
 *
 * If the app still crashes with this on, the fault is in the native runtime or
 * Expo Go itself rather than in any of those libraries. Remove this file and its
 * two call sites once the cause is found.
 */
export const SAFE_MODE = false;
