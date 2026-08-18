# VITAL — AI Diet & Personal Training

Marketing website for an AI-powered nutrition and personal training mobile app.

**Zero dependencies, zero build step.** Plain HTML, one stylesheet, one script — it deploys
to any static host and loads instantly.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Homepage — hero, how it works, features, AI diet, personal trainer, daily accountability, goals & progress, pricing, about, why, contact, final CTA |
| `features.html` | How It Works + full feature catalogue + a day with VITAL + FAQ |
| `pricing.html` | The single $30/month plan, cost comparison, what's included, billing FAQ |
| `about.html` | Mission, principles, why choose us |
| `contact.html` | Contact form + questions / partnerships / support |
| `privacy.html`, `terms.html` | Legal |

## Structure

```
assets/
  css/style.css   design tokens, components, responsive rules
  js/main.js      nav, mobile menu, scroll reveal, counters, tabs, form, CTA orbit
  img/favicon.svg
```

## Design system

Everything is driven by custom properties at the top of `assets/css/style.css`.

- **Base** — near-black (`--bg: #05070a`) with layered translucent surfaces
- **Accent** — a single mint (`--accent: #34e5a4`); `--accent-2` appears only inside gradients
- **Type** — Sora for display, Inter for body, loaded async from Google Fonts with a
  system-font fallback stack, so the page renders immediately either way
- **Motion** — `--ease`/`--ease-out` and three duration tokens; every animation is
  transform/opacity only

To rebrand, change the token values — nothing else hardcodes a colour.

## The animated CTA

The Download button's orbiting energy line is the site's signature detail. It is an inline
SVG of two rounded rects sharing the button's geometry:

- a bright gradient stroke with an SVG glow filter (the "snake")
- a wider, blurred, low-opacity stroke behind it (the trail)

Both use `pathLength="1000"`, so the `stroke-dasharray` segment is a fixed fraction of the
perimeter at any button size, and the travel animation is a single `stroke-dashoffset`
keyframe. `sizeOrbits()` in `main.js` keeps the corner radius matched to the pill on resize.
Hover speeds the line up, thickens it, brightens the trail and scales the button.
The `.cta-orbit--xl` variant in the final CTA adds a pulsing radial glow.

## Behaviour

- **Scroll reveal** — one `IntersectionObserver` adds `.is-visible`; it also triggers number
  counters, progress bars and the weekly bar chart. `data-stagger` on a container spaces its
  children's delays.
- **Headline reveal** — `data-words` splits a heading into per-word masked spans.
- **App screen switcher** — `data-tabs="<panel-id>"` cross-fades the phone screens and
  autoplays only while the section is in view.
- **Hero parallax** — pointer-driven, rAF-smoothed, desktop and fine-pointer only.
- **Contact form** — client-side validation with inline errors. It is not wired to a backend;
  see "Wiring up" below.

## Accessibility & resilience

- Full keyboard support, visible focus rings, a skip link, and `aria-expanded` /
  `aria-hidden` on the mobile menu (Escape closes it and returns focus).
- `prefers-reduced-motion: reduce` disables every animation and shows all content statically.
- Nothing depends on JavaScript to be readable: `.no-js` rules force all revealed content
  visible, and a 1.2s timeout clears the load state even if `load` never fires.

## Performance

No frameworks, no images beyond an inline-SVG favicon, one 55 KB stylesheet and one 11 KB
script (both cacheable, script is `defer`red). All animation runs on `transform`/`opacity`.
Fonts load non-blocking via the `media="print"` swap with a `<noscript>` fallback.

## Wiring up before launch

These are the placeholders to replace with real values:

1. **Store links** — `https://vital.app/get`, `/ios`, `/android` in the final CTA.
2. **Contact form** — `main.js` simulates the submit. Point the handler at your endpoint
   (or set a `action`/`method` on the `<form>` and remove the `preventDefault`).
3. **Email addresses** — `hello@`, `partners@`, `support@`, `privacy@`, `legal@vital.app`.
4. **Social links** — the footer icons are `href="#"`.
5. **Canonical URLs** — `https://vital.app/` in each page's `<link rel="canonical">`,
   `sitemap.xml` and `robots.txt`.

The dashboard figures (7.2 kg lost, 24-day streak, 2,100 kcal, etc.) are illustrative example
data shown inside app mockups, not claims about real users.

## Local preview

```bash
npx http-server . -p 8080     # or: python3 -m http.server 8080
```

## Editing

The header and footer markup is repeated in each page — there is no template engine, which is
what keeps the site build-free. When you change the nav or footer, change it in all seven HTML
files (`grep -l 'class="nav__inner"' *.html`).
