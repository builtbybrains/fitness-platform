---
name: rtl-arabic
description: Build and check bilingual Arabic/English interfaces with correct RTL. Use whenever a demo serves an Arabic-speaking market, when adding a language toggle, when any chevron, arrow, progress bar, timeline or breadcrumb appears on a bilingual screen, or when Omar says Arabic, RTL, bilingual, or عربي.
---

# rtl-arabic

Arabic is the default language when the client's market speaks it. English is the toggle.
Every rule here came from a real defect on a shipped BuiltByBrains demo.

## Setup (before the first bilingual screen)

1. `<html lang="ar" dir="rtl">` by default. The toggle swaps both `lang` and `dir` on the
   document element, never on a wrapper div. Persist the choice (cookie or localStorage).
2. Load an Arabic face with real weights: Cairo, Tajawal, IBM Plex Arabic, Noto Naskh Arabic,
   or the client's own. Set it on `:lang(ar)` so Latin text keeps the Latin face.
3. Put `font: inherit` on `button, input, select, textarea`. A button does not inherit the
   page font by default and shipped in Arial on a real demo.
4. Strings live in one dictionary per language. No Arabic written by us for the client's own
   claims: their vision, slogans and product names come from their real surfaces or stay off
   screen.

## Writing CSS

- Logical properties only in new code: `margin-inline-start`, `padding-inline`,
  `inset-inline-end`, `border-start-start-radius`, `text-align: start`.
  `grep -rn "margin-left\|margin-right\|padding-left\|padding-right\|left:\|right:\|text-align: left\|text-align: right" app src` must return nothing new.
- Tailwind: use `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`. Never `ml-`,
  `mr-`, `pl-`, `pr-`, `left-`, `right-` in new code.
- Flex and grid follow `dir` on their own. Do not add `flex-row-reverse` to "fix" RTL.
- Letter-spacing on Arabic is zero. Tracking breaks the connected script.
- Line-height for Arabic body is 1.7 to 1.9. Arabic glyphs sit taller than Latin.
- Numbers: follow the client's own convention (most Gulf and Lebanese brands use Western
  digits). Keep phone numbers, prices and codes LTR inside RTL text with `unicode-bidi: isolate`
  or `<bdi>`.

## What mirrors and what does not

Mirror in RTL: back and forward chevrons, arrows that mean "next" or "previous", progress
bars, sliders, timelines, breadcrumbs, step indicators, carousel direction, swipe-to-dismiss
direction, the drawer edge, and the order of icon and label in a button.

Never mirror: search, clock, user, phone, check marks, play, media controls, brand marks,
charts with a time axis reading by convention, and any icon with no direction.

Implementation: give directional icons `[dir="rtl"] & { transform: scaleX(-1) }` through one
utility class (`.mirror-rtl`). Never mirror by swapping icon files.

## Gate (run before any judge round)

1. Full width sweep at 360, 375, 390, 430 and 1440 in BOTH languages. Overflow measured with
   `scrollWidth > clientWidth` on every element with its own text. An English pill hung 27px
   off a 390 screen while the Arabic pass was green.
2. Directional check: list every chevron, arrow, progress bar, breadcrumb and timeline;
   screenshot each in both languages; each one flips or is on the never-mirror list.
3. Default language correct on every route, including deep links and the 404.
4. `dir` on the document element flips with the toggle. The toggle is visible on every screen.
5. No `left`/`right` physical properties in new CSS (grep above).
6. Buttons, inputs and toasts render in the Arabic face, not the browser default.
7. A native Arabic reader (stranger judge) reads every screen aloud. A line they stumble on is
   a defect.

## Pairs well with

`impeccable adapt` for the layout pass, `a11y-code-review` for `lang` attributes and reading
order, `design-critic` for the scored round.
