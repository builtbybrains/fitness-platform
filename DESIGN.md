# BUILT design system

Source of truth: the client's brand deck, `BUILT_fitness_app_branding.pdf` (10 pages: lockup,
app icon, logo variations, palette, brand hero, app screens, typography, taglines, merch,
App Store preview). Everything below is read off that deck. When this file and the deck
disagree, the deck wins; fix this file.

## Design read

- Page kind: marketing landing page (web) and a daily-use fitness app (iOS, Android, web).
- Audience: people who train, want a plan and a coach in their pocket, and pay $30/month.
- Vibe: athletic, strong, premium, direct. Black gym, one electric green.
- Family: flat ink on deep black. Solid fills, hard edges, no glass, no gradients.
- Dials: variance 5/10, motion 4/10, density 5/10.

## Name and voice

- Product name: **BUILT** (always caps in the wordmark; "Built" in running copy is fine).
- Primary tagline: **Build your best.** (with the full stop). Set wide-tracked caps under
  the lockup: `BUILD YOUR BEST.`
- Supporting lines, use as written:
  - Train. Fuel. Become.
  - More Than Fitness.
  - A Stronger You, Everyday.
  - Built by You.
  - Your Goals. Our AI. Real Results.
  - Everything You Need to Build You.
- Brand sentence: "An all-in-one fitness and nutrition platform powered by AI coaching.
  Built to help you train, fuel, and become a stronger, healthier, better you."
- Four pillars, always in this order: **Train**, **Nutrition**, **AI Coach**, **Progress**.
- Home greeting pattern (app): "Good morning," then "Let's **build your best.**" with the
  phrase in Built Green.
- Tone: short, confident, second person. No guilt, no hype words, no em dashes.

## Logo

- **Mark**: a heavy, forward-leaning "B" in Built Green. The top-left corner is cut into a
  chevron point, two horizontal slots run in from the open left side and end in round
  caps, the left edges of the three bars slant forward (like "/"), the right side is two
  rounded bowls. The mark alone is the app icon and the coach avatar.
- **Wordmark**: "UILT" in a heavy, wide geometric sans, set so the green B reads as the
  first letter: **B**UILT. White on dark, Deep Black on light.
- **Lockups** (deck page 3): mark + wordmark + `BUILD YOUR BEST.` tagline; mark + wordmark
  without tagline; reversed on a black pill. The B is always green; never recolour it.
- **App icon**: green B centred on Deep Black, rounded square, generous padding (the B
  fills about 60% of the tile).
- Minimum size: the mark at 20px, the full lockup at 96px wide. Clear space around the
  lockup equals the height of one slot in the B.
- Files: `assets/img/logo.svg` (lockup on dark), `assets/img/logo-on-light.svg`,
  `assets/img/mark.svg`, `assets/img/favicon.svg`; app component
  `mobile/src/components/BuiltLogo.tsx`.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| Built Green | `#A3FF3D` | The one accent: primary buttons, active tab, progress fill, the B, highlighted words |
| Deep Black | `#080808` | Page and app background; text on green |
| Carbon | `#1F1F1F` | Cards, inputs, tab bar, raised surfaces |
| Stone | `#E9E9E9` | Secondary text on dark; light-mode surfaces |
| White | `#FFFFFF` | Primary text on dark |

The deck prints Stone as `#E9E999`; the swatch is a neutral light grey, so it is `#E9E9E9`.

Derived, for states only (stay inside the family, no new hues):

- Surface between black and carbon: `#121212` (section bands, pressed cards).
- Hairline: `rgba(255,255,255,0.08)`; strong hairline `rgba(255,255,255,0.14)`.
- Muted text on Deep Black: `#A3A3A3` (8.1:1). Faint text floor: `#8C8C8C` (6.0:1). Never
  go darker than `#8C8C8C` for any text on black or carbon.
- Green tint for selected rows and chips: `rgba(163,255,61,0.12)`, border
  `rgba(163,255,61,0.35)`.
- Pressed green: `#8FE62E`.
- Danger `#FF5A4E`, warning `#FFC53D` (functional only, never decorative).

Rules:

- Green is a fill or a mark, rationed to one or two things per screen. On green, text is
  always Deep Black (16:1). Green text is allowed on black/carbon (15:1). Never green text
  on white or Stone.
- No gradients, no gradient text, no neon glows, no blur halos. Highlight words with solid
  Built Green.

## Type

- Display: **Sora** (Light, Regular, Medium, Bold). Headlines, big numbers, the wordmark
  tagline, buttons.
- Body and UI: **Inter** (Light, Regular, Medium, Bold).
- Web: load both from Google Fonts with `display=swap` and system fallbacks.
- App: load with `@expo-google-fonts/sora` and `@expo-google-fonts/inter` via `expo-font`;
  hold the splash screen until loaded, fall back to system on failure.
- Scale ratio about 1.25. Body 16px minimum on phones. Headlines tight (-0.02em), the
  `BUILD YOUR BEST.` tagline wide (about +0.5em as measured on the deck, caps, Light or Regular).

## Shape, space, material

- Flat ink: Deep Black ground, Carbon cards, hairline borders only where two surfaces meet.
  No cards inside cards.
- Radius: cards 20px, inputs and small tiles 14px, buttons fully round (pill), icon tiles
  and avatars circular. Vary radius by role, not one radius everywhere.
- 4px spacing grid. Tight inside groups (8/12), loose between groups (24/32/48).
- Icons: 2px outline icons in Built Green on Carbon tiles or bare: dumbbell (Train), burger
  (Nutrition), brain (AI Coach), rising bars (Progress), plus home, chat and profile. One
  icon set, drawn as inline SVG; never emoji or Unicode glyphs.
- Primary button: Built Green pill, Deep Black Sora SemiBold label, 48px tall minimum
  (44px touch target floor everywhere). Secondary: Carbon pill with white label. Play
  actions: a round green button with a black triangle.

## Imagery

- Only the client's own deck imagery: the athlete in the BUILT tee (deck page 5), trimmed
  so none of the deck's own labels show. Dark, desaturated backgrounds, green only on the
  logo. No stock photos from elsewhere.
- Phone mockups on the site show the real app screens in the new brand.

## Motion

- Ease-out quart or expo, 150 to 400ms, transform and opacity only.
- Progress rings and bars fill once on first view. Buttons scale to 0.97 on press.
- `prefers-reduced-motion` (web) and Reduce Motion (app) turn all of it off.

## App screens (deck page 6)

- Home/Today: greeting pattern above, big green progress ring ("Today 75%"), 2x2 tiles
  for the four pillars with green outline icons.
- Tab bar: Carbon, green active icon and label, grey inactive (`#8C8C8C`).
- Coach: the B mark as the coach's avatar beside its messages, green send button.
- Lists: rounded Carbon rows, thumbnail left, chevron right.
