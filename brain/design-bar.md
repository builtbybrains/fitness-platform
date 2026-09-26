---
name: design-bar
description: What "good design" means at BuiltByBrains. The ceiling test, the banned defaults, the rules every view follows, and the 8-line rubric the design critic scores. Loaded by every build session.
type: reference
---

# Design Bar

Read this before any UI file is written and before any judge round. It is the standard the
[[design-pipeline]] enforces. Lessons that repeat land here from [[design-learnings]].

## The ceiling test (outranks every other check)

Place the demo next to Linear, Apple, Vercel, Arc, Notion or the client's own best surface.
A stranger cannot tell which one is the demo. Brand wins over trend: a couture house is not a
dev tool, a concrete plant is not a couture house. The look comes from the client's own
materials (`research/BRAND.md`, `DESIGN.md`), the craft comes from us.

## Banned defaults (the "AI slop" tells)

Any of these on a shipped screen is a defect, not a style choice:

1. Three equal stat cards in a row under a headline.
2. Dark navy dashboard with grey tiles and a single neon accent.
3. Inter or Roboto plus slate-900 as the whole identity.
4. Centered hero over a mesh or purple gradient. Gradient text anywhere.
5. Cards inside cards. Borders on everything. Identical corner radius on every element.
6. Eyebrow labels (ALL CAPS tiny text) on every section.
7. Icon grids of three or four "features" with generic line icons.
8. Uniform fade-up entrance on every section. Bounce or elastic easing.
9. Stock or generated photos of people or products standing in for the client's own.
10. Empty states, loading states and error states left unbuilt.
11. A dropdown, modal or table where a sheet, segmented control or list belongs on a phone.
12. Placeholder copy, lorem, "Company Name", or any other client's data.

## Required on every view

- A one-line design read before code (taste-skill format): page kind, audience, vibe,
  design family. Three dials stated: variance, motion, density.
- One display face that belongs to the client, one UI face, one Arabic face when bilingual.
  Fluid type scale, ratio 1.2 to 1.333, body 16px minimum on phones, 65ch max measure.
- One material system chosen from the brand: glass and translucency, layered depth with
  soft shadow, or flat ink on paper. Never all three on one screen. Glass needs a real
  backdrop behind it to earn its place.
- Palette in OKLCH, sampled from the client's real surfaces. One accent, rationed.
  Body text contrast 4.5:1 minimum, measured on the shipped bytes.
- Spacing on a 4px grid with visible rhythm (tight inside groups, loose between them).
- Motion is motivated: state change, hierarchy, feedback or story. Springs on touch,
  ease-out-expo or quart on entrances, 150 to 400ms, `prefers-reduced-motion` honored.
- Every control mutates state and gives feedback within 100ms. 44px touch targets.
- Empty, loading, error and success states designed, not defaulted.
- Real photography or a clean designed slot. No borrowed imagery.

## Mobile first (360, 375, 390, 430 are the gate, 1440 is the check)

- One focal element per screen at 360px. The primary action sits in the thumb zone.
- Sheets over modals. Segmented controls over tabs bars with more than 4 items.
- No horizontal card rail without a visible affordance (peeking card, dots, or scrollbar).
- No horizontal page scroll. No text cut mid-word. Measured, never eyeballed.
- Sticky bottom action bar on task screens. Safe-area insets respected.

## Arabic and RTL (default language when the market is Arabic)

- Real `dir="rtl"` on the document, logical CSS properties only (`margin-inline-start`,
  `padding-inline`, `inset-inline`). No `left`/`right` in new CSS.
- Chevrons, arrows, progress bars, breadcrumbs and timelines mirror. Icons that are not
  directional (search, clock, user) do not.
- Arabic face with real weights (Cairo, Tajawal, IBM Plex Arabic, or the client's own).
  Buttons and inputs inherit the page font. Numbers follow the client's convention.
- Both languages get the full width sweep. The EN toggle is one tap, always visible.

## Rubric (the design critic scores 0 to 10 on each, ships at 8 average, no line under 6)

1. Identity: reads as this client, not as a template. Their mark, type, palette, tone.
2. Hierarchy: one focal point per screen, eye lands where the task starts.
3. Typography: scale, measure, pairing, tracking, Arabic quality.
4. Color and material: palette discipline, contrast measured, one material system.
5. Layout and rhythm: spacing system, alignment, composition variety across screens.
6. Motion: motivated, physical, fast, reduced-motion honored.
7. Mobile: thumb zone, sheets, focal element, zero overflow at 360.
8. States and detail: empty, loading, error, success, hover, focus, pressed, disabled.

Related: [[demo-standards]], [[demo-quality-postmortem]], [[design-pipeline]], [[design-learnings]].
