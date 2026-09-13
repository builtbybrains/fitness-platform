---
name: a11y-code-review
description: >
  Web accessibility code review and generation skill enforcing WCAG 2.2 AA.
  Use this skill whenever you write, review, edit, generate, or modify any
  web UI code — HTML, JSX, TSX, Vue, Svelte, Astro, CSS, Tailwind, or any
  user-facing web content. Also trigger when the user mentions accessibility,
  a11y, ARIA, screen readers, keyboard navigation, focus management, contrast,
  alt text, landmarks, skip links, live regions, or WCAG compliance in the
  context of web code. This skill applies to all web frameworks (React,
  Next.js, Vue, Angular, Svelte, Astro) and vanilla HTML/CSS/JS. Trigger it
  even if the user does not explicitly ask for accessibility — accessible code
  is the baseline, not an add-on.
---

# Accessibility Code Review

AI coding tools generate inaccessible code by default. They forget ARIA rules,
skip keyboard navigation, ignore contrast ratios, and produce modals that trap
screen reader users. This skill ensures every piece of web UI code meets
WCAG 2.2 AA standards before it ships.

> **AI and automated tools are not perfect.** They miss things, make mistakes,
> and cannot replace testing with real screen readers and assistive technology.
> Always verify with VoiceOver, NVDA, JAWS, and keyboard-only navigation.

## Authoritative Sources

- **WCAG 2.2 Specification** — <https://www.w3.org/TR/WCAG22/>
- **WAI-ARIA 1.2 Specification** — <https://www.w3.org/TR/wai-aria-1.2/>
- **ARIA Authoring Practices Guide (APG)** — <https://www.w3.org/WAI/ARIA/apg/>
- **HTML Living Standard** — <https://html.spec.whatwg.org/multipage/>
- **axe-core Rules** — <https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md>

## How This Skill Works

This skill contains eighteen specialist domains. When reviewing or generating
code, identify which domains apply and read the corresponding reference file
before proceeding. Do not guess at accessibility patterns from memory — load
the reference and follow its rules.

### Step 1: Detect What the Code Contains

Scan the code (or the task description) for these patterns:

| If the code contains... | Load this reference |
|--------------------------|---------------------|
| Interactive widgets, custom controls, `role=`, `aria-` attributes | `references/aria.md` |
| Modals, dialogs, drawers, popovers, overlays, `<dialog>` | `references/modals.md` |
| Colors, CSS, themes, dark mode, Tailwind classes, focus indicators | `references/contrast.md` |
| Tab order, focus management, `tabindex`, skip links, SPA routing | `references/keyboard.md` |
| Forms, inputs, `<label>`, validation, error messages, wizards | `references/forms.md` |
| Dynamic content, toasts, loading states, `aria-live`, notifications | `references/live-regions.md` |
| Images, `alt`, SVGs, headings, `<h1>`–`<h6>`, landmarks, `<nav>` | `references/alt-text-headings.md` |
| Data tables, `<table>`, `<th>`, sortable columns, grids | `references/tables.md` |
| Links, `<a>`, "click here", "read more", "learn more" | `references/links.md` |
| Reading level, cognitive load, timeouts, authentication flows | `references/cognitive.md` |
| Alt text strings, aria-label values, button text quality | `references/text-quality.md` |
| Framework-specific patterns (React, Vue, Angular, Svelte, Next.js) | `references/frameworks.md` |
| Charts, graphs, dashboards, D3, Recharts, Highcharts, SVG data viz | `references/data-viz.md` |
| HTML email templates, inline styles, email client rendering | `references/email.md` |
| Video, audio, `<video>`, `<audio>`, captions, transcripts, WebVTT | `references/media.md` |
| RTL content, `dir` attribute, `lang`, multilingual, bidirectional text | `references/i18n.md` |
| Custom elements, Shadow DOM, `attachShadow`, `ElementInternals` | `references/web-components.md` |
| Lazy loading, skeleton screens, infinite scroll, code splitting | `references/performance.md` |

**Multiple references will usually apply.** A login form needs forms + keyboard
+ contrast + alt-text-headings at minimum. A modal with a form inside needs
all of those plus modals. Load all relevant references.

### Step 2: Apply the Specialist Knowledge

For each loaded reference, review or generate the code against its rules.
Every rule violation is a real barrier for a real person — a missing label
locks out a blind user, a missing focus trap locks out a keyboard user, a
low-contrast button locks out a low-vision user.

### Step 3: Verify the Non-Negotiables

Regardless of which references you loaded, always verify these baseline
requirements. Every single one matters:

**Semantic HTML first.** Use `<button>` not `<div onclick>`. Use `<nav>` not
`<div class="nav">`. Use `<dialog>` not `<div class="modal">`. Native HTML
elements provide keyboard support, screen reader semantics, and focus
management for free.

**Every interactive element is keyboard accessible.** Tab reaches it. Enter or
Space activates it. Escape dismisses overlays. Arrow keys navigate within
composite widgets. No keyboard traps exist.

**Every image has appropriate alt text.** Informative images get descriptive alt.
Decorative images get `alt=""`. Functional images (links, buttons) get alt
describing the action, not the appearance.

**Every form control has a visible, programmatically associated label.** Never
use placeholder as the only label. Use `<label for="id">` or wrap the input
in a `<label>`. `aria-label` is a last resort when a visible label is truly
impossible.

**Color is never the only way to convey information.** Error states need text +
icon, not just red. Chart data needs patterns or labels, not just color.
Links in body text need underlines, not just color.

**Text contrast is 4.5:1 minimum.** Large text (18px+ or 14px+ bold) is
3:1 minimum. UI components and focus indicators are 3:1 minimum.

**Focus is visible.** Never `outline: none` without a replacement.
`focus-visible` is preferred over `focus` for mouse-click aesthetics.

**Dynamic content is announced.** Use `aria-live="polite"` for non-urgent
updates. Use `aria-live="assertive"` only for critical alerts. Never
`aria-live="assertive"` for routine updates.

**Page structure exists.** One `<h1>` per page. Headings don't skip levels.
Landmarks exist (`<main>`, `<nav>`, `<header>`, `<footer>`). Skip link is
the first focusable element.

**Language is declared.** `<html lang="en">` (or appropriate language code)
is present.

### Step 4: Framework-Specific Checks

If the code uses a framework, also load `references/frameworks.md` and apply
the framework-specific pitfall checks. Common traps:

- **React:** `onClick` on `<div>` without keyboard handler, portals without
  focus traps, `useEffect` missing focus management on route changes
- **Next.js:** Missing `alt` on `<Image>`, no focus management on
  `router.push()`, `Link` component missing descriptive text
- **Vue:** `v-if` on live regions (use `v-show`), `<teleport>` outside
  landmark tree, transitions without focus management
- **Tailwind:** `sr-only` class misuse, `outline-none` without replacement,
  contrast failures in default palette

## What Accessible Code Looks Like

When generating new UI code, accessibility is baked in from the start — it is
not a separate pass. Here is the mental model:

1. Choose the right HTML element (semantic first, ARIA only when native
   elements cannot express the semantics)
2. Ensure keyboard operability (can everything be reached and activated?)
3. Add screen reader context (labels, descriptions, live regions, landmarks)
4. Verify visual accessibility (contrast, focus indicators, motion safety)
5. Handle dynamic behavior (focus management, announcements, no traps)

## Severity Classification

When reporting findings, use this severity scale:

| Severity | Meaning | Example |
|----------|---------|---------|
| **Critical** | Users cannot access core functionality | Missing form labels, keyboard trap, no alt on informative image |
| **Major** | Users face significant barriers | Missing skip link, broken heading hierarchy, low contrast text |
| **Minor** | Users experience degraded experience | Long alt text, missing `autocomplete`, heading too long |
| **Best Practice** | Not a WCAG failure but improves UX | Redundant ARIA, `title` as sole label, missing `lang` on quotes |

## User Preference Media Queries

Always implement these when styling is involved:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

@media (prefers-contrast: more) {
  /* Increase border widths, use solid outlines, boost contrast */
}

@media (forced-colors: active) {
  /* Respect system colors, don't override borders/outlines */
}
```

## Report Format

When performing a code review, structure findings like this:

```
## Accessibility Review: [component/file name]

### Critical Issues
- [Issue]: [What's wrong] → [How to fix] (WCAG [criterion])

### Major Issues
- [Issue]: [What's wrong] → [How to fix] (WCAG [criterion])

### Minor Issues / Best Practices
- [Issue]: [What's wrong] → [How to fix] (WCAG [criterion])

### What's Done Well
- [Note positive patterns to reinforce good habits]
```

Always include "What's Done Well" — positive reinforcement helps developers
build accessible code by habit.
