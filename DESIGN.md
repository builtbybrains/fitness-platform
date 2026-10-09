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
- Dials: variance 5/10, motion 6/10, density 5/10. Motion sits at 6 because of the objects: they
  follow the scroll (see Objects (2D renders)). The scroll story at the top of the page runs at 8 (see Scroll story).
  Everything else stays at the old 4: short, motivated, once.

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
- **Logo badge** (owner request, 2026-10-09): the green B centred on a solid black disc, with a soft
  bevel and shadow so it reads as an object. **No outline ring**: the logo is a green B with black all
  around it, never a ringed medal. Files: `assets/img/story/badge-480|960.webp` (face-on),
  `badge-edge.webp` (edge-on, for the coin turn), app `mobile/assets/images/objects/badge*.webp`.
  It opens the website (chapter 1) and stands above the pricing head.
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
- The web opens on the BUILT logo badge turning like a coin (owner request, 2026-10-09; it replaced
  the dumbbell), not a photo: the scroll story's green world. The hex dumbbell still
  (`dumbbell-hero-640.webp`) fills the workout tile in the site's phone mockup, and the right half of
  `og-cover.png`.
  The athlete photo (`assets/img/athlete.*`) stays in the repo, unreferenced.
- Dark, desaturated backgrounds, green only on the logo, the collars and the mark.
- Meal photos in the app are AI-generated (Flux), realistic food photography on dark
  stone, generated by `scripts/gen-media.mjs`; never shown as a real customer's meal.
- Phone mockups on the site show the real app screens in the new brand.

## Objects (2D renders)

Owner request, 2026-10-09: the live 3D was laggy and slow to load, so every object is now a flat image
with the same look and the same motion. Nothing on the website runs WebGL or downloads three.js.

- Source: the models, materials and the one studio light live in `assets/js/src/site-3d.js`, which is
  now an offline image generator only. `scripts/build-site-3d.mjs` bundles it and
  `scripts/render-hero-poster.mjs` renders transparent WebP images from it in headless Chromium (website
  set by default, `--layers` for the exploded parts, `--app` for the app). Re-render only when a model
  changes; commit the images.
- Images, one per object (`<div class="obj" data-obj="name">`, `aria-hidden`):
  - chapter 1: the logo badge face-on (480 and 960, the page's first paint, eager) and edge-on, plus a
    soft contact shadow (`assets/img/story/badge*.webp`, `shadow.webp`).
  - chapter 2: the exploded hex dumbbell, one layer per part (six head slices, two collars, the grip,
    the B medallion), all from one camera, wide (16:9) and phone (square) sets
    (`assets/img/story/parts/`). Each layer's place, transform origin, assembled offset and 2D map back
    to its assembled look come from the render (`scripts/exploded-parts.json`, inline in the page).
  - chapter 3: the plate face-on and at its first, nearly edge-on pose (`plate-face*`, `plate-edge*`).
  - how it works: the phone with the green B, the coiled tape, the dumbbell and shaker pair, the
    progress ring (`assets/img/3d/how-*.webp`, 256 in the cards, 640 on the step stage).
  - features: the kettlebell with the B. Diet: the shaker. Training: the plate stack on its pin.
    Accountability: the week streak (narrow column and wide row pictures). Progress: the week of bars,
    only the latest green. Pricing: the logo badge. Final call: dumbbell, kettlebell and shaker.
- Look: matte black rubber, brushed and knurled steel, Carbon metal, matte cast iron, matte Stone,
  matte black plastic. One green accent per object (a collar, the progress ring's arc, the latest bar,
  the B). One studio light: warm-neutral key top left, cool fill right, faint green rim from behind, no
  bloom, no glow. Transparent over the page; soft contact shadows only where an object stands.
- Motion: CSS transform and opacity only, written by the page's one scroll loop from the same eased
  progress as the words, so scrolling back plays it backwards:
  - the badge turns like a coin: a front and back face (the same picture) and its edge across the middle
    in one 3D context, `rotateY` with perspective, the edge showing only near edge-on;
  - the exploded layers move from their assembled places on the old timeline, each by a translate and a
    2x2 matrix eased to identity, and the leaders aim at where each layer is now;
  - the plate's face picture turns back toward edge-on with the render camera's three rotations, the
    edge-on picture crossfades in at the start, a highlight masked to the plate sweeps across it;
  - step images grow in turning one way and shrink away turning the other; section images float a few
    pixels against the scroll with a degree or two of lean; the pricing badge flips face up (a half turn,
    growing from 62%) and then leans toward a mouse pointer (up to 17 degrees, damped).
- Layout: desktop objects sit beside the copy (a column beside the features and progress heads, a
  narrow middle column in the diet, training and accountability splits from 1100px, above the copy
  in that column from 941px). Phones and tablets: the object sits above its heading, 180px tall,
  centred (136px inside the step cards). On desktop the step object sits in the card's top corner,
  116px, 148px from 1200px wide.
- Cost: images only, WebP, the first screen's badge eager and preloaded (it or the headline is the LCP
  element), everything below the first screen lazy, `<picture>` sources for phones where the composition
  differs. The badge's bob is a CSS animation that runs only while its section is on screen.
- Elsewhere on the page, 3D is a touch: the phone mockup and the price card tilt toward a mouse
  pointer (perspective 900px, 6 degrees at most on the phone and 3 on the price card, eased, reset on
  leave; mouse and trackpad only) and settle in from a slight tilt the first time they scroll in.
- App: the same objects as images (`mobile/assets/images/objects/`, at 1x, 2x and 3x, see its
  README). The floating dumbbell above the app's sign-in and sign-up forms is the app's one ambient
  loop; it stops while the keyboard is open, while the screen is out of focus, and under Reduce Motion.

## Motion

- Ease-out quart or expo, 150 to 400ms, transform and opacity only.
- Progress rings and bars fill once on first view. Buttons scale to 0.97 on press.
- Web scroll reveal: the Nutrition split copy rises in once (the `rise` keyframes, 80ms stagger),
  and the phone and price card settle in from a slight tilt; only what starts below the fold is
  held back. Everything else that moves with the page is scroll-linked (below).
- The world badge's bob (about 6px, 6s) is the only time-driven motion on the website (and the pricing
  badge's, the same); every other object moves with the scroll. See Objects (2D renders) and Scroll story.
- `prefers-reduced-motion` (web) and Reduce Motion (app) turn all of it off, every object included
  (each image stands still).

### Web scroll system

The site runs one scroll loop (the inline script in `index.html`): one passive scroll listener, one
`requestAnimationFrame` per frame, shared by the solid nav, scroll-spy, the roadmap and every effect
below. Positions are measured in one pass as document offsets (on load, resize, fonts ready and any
change in the page's height, via a ResizeObserver), so a frame only reads `scrollY` and writes, and
only values that changed. Every effect is a function of scroll position: scrolling back plays it
backwards. Transform, opacity, `clip-path` and `stroke-dashoffset` only; `will-change` sits on the
big movers (kinetic rows, phone, final panel) only while they are on screen. All of it hangs off
the `.fx` class the script sets when motion is allowed; without it the page is the still page.

Each section moves its own way, never the same fade-up twice:

- Scroll progress: a 2px line under the nav. Stone at 35% for the page so far, green for the part
  of the current section already read.
- Scroll story: see the section below.
- Key headings (How it works and the final call): word by word, each word rises out of its own mask
  with a 4-degree settle as the heading crosses the lower third of the screen.
- Section headlines (Features, Nutrition, Train, AI Coach, Progress, Pricing, About): line after line,
  each word comes out of a soft blur from a quarter of a letter to the right, as the heading rises
  from the bottom of the screen to 60% up. The words stay real text; the filter is cleared at rest.
- How it works: a pinned step sequence (see Scroll story). Without motion the roadmap stands as before:
  every step reached, the rail drawn green, each number lit.
- Features: each card stands up from lying back (rotateX 24 degrees to 0, 40px rise, opacity), the
  right-hand column a beat behind the left, rows staggered by their position.
- Kinetic band (between Features and Nutrition, decorative, hidden from screen readers): "Train ·
  Fuel · Become ·" in Sora Bold caps, solid and outline words alternating, green once. Two rows slide
  against each other with the scroll and lean up to 6 degrees into the scroll's direction while it
  moves.
- Progress: the counters count up (900ms, ease-out quart) each time they come on screen and reset
  when they leave; they keep the final number's width, so nothing shifts. The weekly bars grow with
  the scroll, left to right.
- Pricing: "$30" rolls up like an odometer as the card arrives (the last digit goes once round) and
  lands by the time the price is 72% down the screen; "about $1 a day" underlines itself in green.
- Phone mockup: drifts slower than the page (40px at most, 22px on phones) and its screen scrolls
  under a pinned status bar and tab bar, as if in use.
- Final call: a Deep Black panel opens from a rounded card (scale 0.96, 24px corners) inside a band
  of `#121212` to full bleed as the section arrives. The copy itself never scales.

## Scroll story (web, top of the page)

Owner request, 2026-10-08, modelled on a reference video: three pinned chapters replace the old hero.
Each chapter is tall (300, 400 and 250vh) and its content pins one screen high (`svh`) while the
scroll scrubs it. Progress p runs 0 to 1 across the pinned scroll; the inline scroll loop eases it once
per frame and moves the words and the object images with that one value, so they move together, and
scrolling back plays everything backwards. Native touch scroll, no hijacking.

1. Green world (`#home`): the one full-bleed Built Green surface on the site. The logo badge (the
   green B on a black disc, no ring; it replaced the dumbbell on 2026-10-09) faces the viewer at first
   paint, then makes one coin turn across the chapter (p 0.03 to 0.83, eased at both ends) with a few
   degrees of lean, its edge showing as it passes edge-on, over a soft contact shadow that narrows with
   it; it bobs about 6px every 6s while the chapter is on screen. Behind it, three headlines in Sora 800 caps swap at p 0.33 and 0.66
   with a blur-stretch (blur 16px, scaleY 1.45, 8% slide). Text on green is Deep Black; buttons on
   green are ink pills (`.btn-ink`: Deep Black, white label); the scroll cue's fill is p. The nav is
   always solid Deep Black so the white wordmark and the green B read over the green.
2. Exploded view (`#inside`, Deep Black): the dumbbell (one image layer per part, one camera) settles
   from a slightly wider side view to three-quarters, then comes apart along its bar (slices outer
   first, the collars slide out, the grip drops back, the B medallion floats up and turns to face the
   viewer, a touch larger) and holds, drifting wider as if turning. On wide screens the object is fitted
   between the two label columns and clear of the title block. Five labels, one real feature each,
   reveal in turn; from 1200px they sit in two columns with a 1px Stone leader to their part and a
   small green dot on it, below that in a row above and a row below the object, and on phones they
   become a numbered list under it with the current part lit and its line shown. Title in Sora Light.
3. More than an app (`#more`): one plate flips from nearly edge-on to face the viewer while a soft
   highlight, masked to the plate, sweeps across it like the key light. The caption and paragraph blur away, then "Powered by
   AI." types in letter by letter from a blur, and the plate settles under it.

Recorded exceptions to the rules above, scoped to the story only:

- Motion dial 8/10 here (pinning, blur-stretch swaps, letter reveal); the rest of the page stays at 6.
- Blur is allowed as a transition state only (headline swaps, label and letter reveals, the caption
  leaving), never at rest: the filter is cleared outside each window.
- Chapter 3 carries a gradient: Deep Black to Carbon (ending in the band colour so it meets the goals
  without a seam), with a green glow at 6% alpha at most. How it works carries the other: the radial
  glow behind its object, green at 12% alpha at most. No other gradients on the site.
- Blur also appears in the section headline reveals and the goal and step swaps, always as a
  transition state, cleared at rest.
- Sora 800 for the world headlines only.
- Full-bleed green for chapter 1 only.

Chapter 1 ends in a zoom-through (owner request, second reference video): over its last 15% the
badge swells toward the viewer (to about 3.6 times) and sweeps out under the frame, fading out by
p 0.98, while the chapter's green scrubs to Deep Black and the lines and the foot fade, so it hands
over to the exploded view as one move.

The exploded view's leaders are elbowed: from 1200px they run flat out of the label's first line, then
straight down onto the part; in the row layout, down from the label, then across. The left column runs
from the innermost part at the top (AI training plan, the grip) to the outer plates at the bottom
(Check-ins), so no two lines cross and none cuts across a plate or the title. The title, its line and
its button follow the left column in the same flow (at the bottom when there is room), so no label can
land on them at any desktop size (owner report, 2026-10-09). Under 860px of screen height the labels'
lines step down a size and the title steps down; under 680px the labels show their names only. Checked
at 1894x757, 1920x1080, 1920x820, 1536x730, 1440x760, 1366x657, 1280x620 and 1280x560.

Second wave (owner request, 2026-10-08, two more reference videos), after chapter 3:

4. Pick your goal (`#goals`, `#121212`, 300vh): the five goals from PRODUCT.md in Sora 800, stacked
   and rolling past a fixed line like a rolodex. The goal on the line is white and full size, the rest
   sit at 18% and 82% size; blur appears only between goals. A short green bar marks the line (the
   section's only green). Left column (under the words on phones): the kicker "Pick your goal" and one
   or two lines on what BUILT does for that goal, crossfading. No medical or result promises. Words are
   sized so "Sports performance" fits one line from 941px; on phones it wraps, the rest fit 320px.
5. How it works (`#how`): the section head scrolls in as before, then the four steps play pinned
   (340vh). Each step's card, its object (moved onto one shared stage) and a big Sora Light step word
   (Answer, Plan, Follow, Track) take the screen in turn: card and word swap with a blur, the object
   grows in turning one way and shrinks away turning the other. Behind the object a soft green radial
   glow deepens step by step: 5, 7.5, 10 and 12% alpha, never more. Desktop: card left, word bottom
   left, object right. Phones: object on top, word under it, card at the bottom.

Fallbacks: with reduced motion or no script the chapters are plain sections: every headline, label
and line shown, the goals a plain list with every line, the roadmap as before, each object standing
still (the badge face-on, the dumbbell exploded, the plate face-on).

## App screens (deck page 6)

- Home/Today: greeting pattern above, big green progress ring ("Today 75%"), 2x2 tiles
  for the four pillars with green outline icons.
- Tab bar: Carbon, green active icon and label, grey inactive (`#8C8C8C`).
- Coach: the B mark as the coach's avatar beside its messages, green send button.
- Lists: rounded Carbon rows, thumbnail left, chevron right.
