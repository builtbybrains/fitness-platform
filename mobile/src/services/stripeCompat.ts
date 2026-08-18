import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Expo Go ships a fixed set of native modules and Stripe is not one of them.
 * Touching the Stripe SDK there crashes the app, so every Stripe entry point is
 * gated on this flag and loaded lazily. In Expo Go the subscription flow falls
 * back to demo mode, which is exactly what it already does without API keys.
 *
 * A development build (`npx expo run:ios` / `run:android`) has the native module
 * and takes the real path.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export type StripeSdk = typeof import('@stripe/stripe-react-native');

/** Loads the Stripe SDK only when it can actually work. */
export async function loadStripe(): Promise<StripeSdk | null> {
  if (isExpoGo) return null;
  try {
    return await import('@stripe/stripe-react-native');
  } catch {
    return null;
  }
}
