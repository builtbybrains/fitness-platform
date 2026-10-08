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
- Dials: variance 5/10, motion 6/10, density 5/10. Motion sits at 6 because of one exception: the
  hero dumbbell runs a slow ambient loop (see 3D). Everything else stays at the old 4: short,
  motivated, once.

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

- Only the client's own imagery. No stock photos, no people standing in for the client.
- The web hero is a 3D BUILT dumbbell (client request, 2026-10-08), not a photo. It also
  fills the workout tile in the site's phone mockup and the right half of `og-cover.png`.
  The athlete photo (`assets/img/athlete.*`) stays in the repo, unreferenced.
- Dark, desaturated backgrounds, green only on the logo, the collars and the mark.
- Meal photos in the app are AI-generated (Flux), realistic food photography on dark
  stone, generated by `scripts/gen-media.mjs`; never shown as a real customer's meal.
- Phone mockups on the site show the real app screens in the new brand.

## 3D

One object, the BUILT hex dumbbell, drawn live with three.js in the web hero
(`assets/js/src/hero-3d.js`, built to `assets/js/hero-3d.min.js` by `scripts/build-hero-3d.mjs`).

- Materials: matte black rubber hex heads with chamfered edges, brushed and knurled steel grip,
  thin Built Green collars, the green B on each outer face (emissive 0.15 at most). Green
  appears only as the collars and the mark; never recolour the rubber or the steel.
- Light: studio. Soft warm-neutral key from top left, cool fill from the right, a faint green
  rim from behind, low sky light, reflections from a built-in softbox environment. ACES tone
  mapping, sRGB output. No neon, no bloom, no glow, no light rays.
- Ground: a soft contact shadow on an invisible floor. No visible floor, no edge, no plinth.
  The canvas is transparent over Deep Black.
- Motion: an ambient loop is allowed in the hero only. Slow float (about 8px, 6s, sine), one
  turn around the bar every 20s, a slight rock, gentle pointer tilt (up to 8 degrees, damped),
  and a small drift up and turn as the hero scrolls away.
- Cost: rendered only while the hero is on screen and the tab is visible, pixel ratio capped
  at 2, loaded after the page's load event so it never delays the first paint.
- Poster: a still of the same scene (`assets/img/dumbbell-hero*.webp`, rendered by
  `scripts/render-hero-poster.mjs`) is the LCP image. The canvas fades in over it on the same
  frame. Without WebGL, with Save-Data, or with reduced motion, the poster stays and nothing
  animates.
- Elsewhere on the page, 3D is a touch, not an object: the phone mockup and the price card
  tilt toward a mouse pointer (perspective 900px, 6 degrees at most, eased, reset on leave;
  mouse and trackpad only) and settle in from a slight tilt the first time they scroll in.

## Motion

- Ease-out quart or expo, 150 to 400ms, transform and opacity only.
- Progress rings and bars fill once on first view. Buttons scale to 0.97 on press.
- Web scroll reveal: section headings and split copy rise in once (the `rise` keyframes,
  80ms stagger); only what starts below the fold is held back. Not every block reveals.
- The hero dumbbell loop is the only ambient motion; see 3D.
- `prefers-reduced-motion` (web) and Reduce Motion (app) turn all of it off, the dumbbell
  included (the still poster shows).

## App screens (deck page 6)

- Home/Today: greeting pattern above, big green progress ring ("Today 75%"), 2x2 tiles
  for the four pillars with green outline icons.
- Tab bar: Carbon, green active icon and label, grey inactive (`#8C8C8C`).
- Coach: the B mark as the coach's avatar beside its messages, green send button.
- Lists: rounded Carbon rows, thumbnail left, chevron right.
