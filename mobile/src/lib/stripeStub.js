// Web stand-in for @stripe/stripe-react-native, which is native-only.
// Nothing on web should ever call these; they exist so Metro can resolve.
module.exports = {
  StripeProvider: ({ children }) => children,
  initStripe: async () => {},
  initPaymentSheet: async () => ({ error: { message: 'Stripe is unavailable on web' } }),
  presentPaymentSheet: async () => ({ error: { message: 'Stripe is unavailable on web' } }),
};
