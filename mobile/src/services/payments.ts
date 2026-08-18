/**
 * Subscription payments.
 *
 * SECURITY: this app never sees, stores or transmits a raw card number, expiry
 * or CVV. Card entry happens inside Stripe's own PaymentSheet, which collects
 * the details in a Stripe-controlled view and exchanges them for a token. Only
 * the publishable key ships in the client; the secret key lives on the server.
 *
 * The backend is expected to expose:
 *   POST /subscriptions  ->  { paymentIntent, ephemeralKey, customer }
 * where it creates the Stripe customer and subscription and returns the
 * PaymentIntent client secret for the first invoice.
 */
export interface SubscriptionSession {
  paymentIntent: string;
  ephemeralKey: string;
  customer: string;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL;
export const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

/** True when both the publishable key and a backend are configured. */
export const stripeConfigured = Boolean(PUBLISHABLE_KEY && API_URL);

export const PRICE = {
  amount: '$30',
  period: 'month',
  perDay: "That's only $1 per day.",
  benefits: [
    'AI nutrition guidance',
    'AI personal training',
    'Personalized plans',
    'Daily reminders',
    'Smart notifications',
    'Goal tracking',
    'Progress tracking',
    'AI health assistant',
  ],
} as const;

export async function createSubscriptionSession(email: string): Promise<SubscriptionSession> {
  if (!API_URL) throw new Error('No API_URL configured');

  const res = await fetch(`${API_URL}/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, priceId: 'vital_premium_monthly' }),
  });

  if (!res.ok) {
    throw new Error(`Could not start checkout (${res.status})`);
  }

  return (await res.json()) as SubscriptionSession;
}
