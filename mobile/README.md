# VITAL, mobile app

A premium Expo / React Native app for the VITAL AI health, nutrition and personal
training platform. Same brand as the website in `../`, rebuilt for phones.

## See it on your phone

This project targets **Expo SDK 54**, so it needs an Expo Go build that supports
SDK 54. Expo Go supports exactly one SDK at a time; check yours under Settings,
App Info, Supported SDK. If that number is not 54, Expo Go refuses to open the
project with "Project is incompatible with this version of Expo Go", and the SDK
here has to be moved to match.

Install **Expo Go** ([iOS](https://apps.apple.com/app/expo-go/id982107779) /
[Android](https://play.google.com/store/apps/details?id=host.exp.exponent)), then
on a computer on the same Wi-Fi as your phone:

```bash
cd mobile
npm install
npx expo start
```

A QR code prints in the terminal. Scan it with the Camera app on iOS, or from
inside Expo Go on Android. The whole app runs: launch animation, AI coach, every
screen.

If your phone and computer are on different networks, add `--tunnel`.

The QR has to be generated on your own machine, because it encodes that
computer's address on your network.

On iPhone there is no QR scanner inside Expo Go; Apple's rules made Expo remove
it. Scan with the system Camera app and tap the banner, or use "Enter URL
manually" in Expo Go with the `exp://…` address the terminal prints.

### Real payments need a development build

Stripe is a native module and Expo Go cannot load it. In Expo Go the subscription
flow runs in demo mode and says so on screen; everything else is identical. For
the real Stripe sheet, build the app once:

```bash
npx expo run:ios       # needs macOS + Xcode
npx expo run:android   # needs Android Studio
```

## Journey

```
Launch logo  ->  Login / Register  ->  Set goals  ->  Home
                                                       |
                    AI coach · Plan · Reminders · Progress · Premium
```

| Route | What it is |
| --- | --- |
| `app/index.tsx` | Animated logo launch, then routes by auth and onboarding state |
| `app/(auth)/` | Login, register, forgot password |
| `app/(onboarding)/` | Four-step goal setup |
| `app/(tabs)/` | Home, AI, Plan, Progress, Profile |
| `app/settings/` | Personal info, goals, preferences, reminders, subscription, payment, legal |

## Design system

Everything comes from `src/theme`. The palette is a deep, slightly warm
near-black base with one sophisticated crimson accent (`colors.primary`,
`#E03B4F`), white type and soft grey secondary text. Change the tokens and the
whole app follows; nothing hardcodes a colour.

Type is Inter, bundled locally rather than fetched, so there is no network
dependency or font flash on launch.

## Responsiveness

`src/theme/responsive.ts` scales every dimension from a 390pt reference, clamped
to 0.84x–1.22x. That keeps an iPhone SE readable without making a foldable or an
iPad look like a toy. Font scaling is clamped tighter (0.92x–1.1x) because type
that grows linearly with width looks wrong on large screens.

Verified against iPhone SE, 13 mini, 8 Plus, 15/16, 16 Pro Max, Pixel 4a and
8 Pro, Galaxy S24 Ultra and A14, Galaxy Z Fold open, and iPad mini: body text
never drops below 14px, every control clears the 44pt touch minimum, and all
five tabs fit across the bar.

Other rules that hold the layout together:

- All safe-area handling lives in `src/components/Screen.tsx`. Screens never read
  insets themselves, so nothing lands under a notch, home indicator or Android
  gesture bar.
- The tab bar is absolutely positioned and its height is computed once in
  `src/lib/tabBar.ts`. The bar and every screen read the same number, so content
  can never hide behind it or float above a gap.
- `Txt` caps `maxFontSizeMultiplier`, so large accessibility type grows without
  bursting cards apart.
- Content is width-capped on tablets and foldables instead of stretching.

## Animation

Reanimated on the UI thread throughout: the logo launch (fade, settle, twist and
a light sweep, about 1.6s), card entrances, progress bars and rings, the weight
chart, button press springs, the AI typing indicator, and pull to refresh. Every
one of them is skipped when the OS "Reduce Motion" setting is on, via
`src/lib/useReducedMotion.ts`.

## The AI coach

`src/services/coach.ts` answers from the user's own numbers, so the app is fully
usable offline and in review builds. Set `EXPO_PUBLIC_API_URL` and it posts to
`POST /coach` instead, falling back to the on-device answers if that call fails.

## Payments

Card details are entered inside Stripe's PaymentSheet, which runs in Stripe's own
UI. **This app never receives, stores or transmits a raw card number, expiry or
CVV**, and there is deliberately no card form anywhere in the codebase. Only the
publishable key ships in the client.

To take real payments, copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_API_URL`, a backend exposing `POST /subscriptions` that creates
  the Stripe customer and subscription and returns
  `{ paymentIntent, ephemeralKey, customer }`

Your Stripe **secret key belongs on that server and must never appear in this
app**. Without both values the subscription flow runs in demo mode, labelled as
such on screen, and no charge is made.

## What is mock data

The dashboard figures (1,260 kcal, 24-day streak, the 12-week weight series,
today's meals and exercises) live in `src/data/plan.ts` as illustrative sample
data. Auth resolves locally rather than calling a provider. Both are single files
to swap when the backend is ready.

## Checks

```bash
npm run typecheck                 # tsc --noEmit
npx expo-doctor                   # 21 config and dependency checks
npx expo export --platform ios    # verify it bundles
npx expo export --platform android
```
