# BUILT: Build your best.

BUILT is an all-in-one fitness and nutrition platform powered by AI coaching. This repository
holds three things:

| Folder | What it is | Read |
| --- | --- | --- |
| repository root | the marketing website (this file) | below |
| `mobile/` | the Expo / React Native app | [`mobile/README.md`](mobile/README.md) |
| `supabase/` | database schema and the AI coach Edge Function | [`supabase/README.md`](supabase/README.md) |

The brand rules (colours, type, logo, voice, app screens) live in [`DESIGN.md`](DESIGN.md),
read off the client's brand deck. When the site and DESIGN.md disagree, DESIGN.md wins.

## The website

Live at **https://builtbybrains.github.io/fitness-platform/**

It is one static page, `index.html`, with its CSS and JavaScript inline. There is no build
step and no dependencies. Everything it loads:

| File | Used for |
| --- | --- |
| `index.html` | the whole site: hero, how it works, features, the app screen switcher, training, daily rhythm, progress, pricing, FAQ, about, contact form, privacy and terms |
| `assets/img/logo.svg` | BUILT lockup (green B, white wordmark) in the nav and footer |
| `assets/img/mark.svg` | the B mark, used as the coach avatar inside the phone mockup |
| `assets/img/favicon.svg`, `assets/img/icon-180.png` | browser tab icon and home-screen icon |
| `assets/img/athlete.jpg`, `athlete.webp`, `athlete-640.webp` | the hero photo from the brand deck (webp for modern browsers, jpg fallback) |
| `assets/img/og-cover.png` | the 1200 x 630 card shown when the link is shared |
| `robots.txt`, `sitemap.xml` | search engines; the sitemap lists the one real page |

`assets/img/logo-on-light.svg` and `logo-tagline.svg` are brand files for light backgrounds
and print; the page does not load them. `scripts/gen-web-images.mjs` regenerates the PNGs
from the SVG sources.

Fonts are Sora (headlines, numbers, buttons) and Inter (body), loaded from Google Fonts with
`display=swap`, so the page renders straight away in a system font if Google is slow.

All links and asset paths are relative (`assets/img/logo.svg`, `#contact`), because the site
is served from the `/fitness-platform/` sub-path, not a domain root. Keep new paths relative.

### Page sections

The nav follows the page order: Home, How it works, Features, Pricing, About, Contact. A
scroll-spy underlines the section you are reading. Every "Get early access" button scrolls to
the contact form with the topic "Early access" already chosen. The app is not in the App Store
or Google Play yet, so both show as "Coming soon" and are not links.

The phone mockup has three screens (Today, Nutrition, Coach) drawn from the brand deck. They
are WAI-ARIA tabs: arrow keys, Home and End move between them, the screens rotate every five
seconds only while the phone is on screen, rotation pauses on hover or focus, stops for good
once someone picks a tab, and the round button beside the tabs pauses and resumes it. With
reduced motion turned on in the operating system, nothing rotates or animates.

### The contact form

The form posts straight to Supabase, the same project the app uses:

```
POST https://kpsoovvsdunbohezbwnc.supabase.co/rest/v1/contact_messages
apikey / Authorization: Bearer <publishable key from mobile/supabase.config.ts>
Prefer: return=minimal
{ name, email, topic, message, source: "website" }
```

- `topic` is one of `early-access`, `question`, `partnership`, `support`, `privacy`.
- The success message appears only when Supabase answers with a 2xx. Anything else (an
  error, no network, a 15 second timeout) shows "We couldn't send that. Please try again in a
  moment." and keeps what the person typed.
- A hidden `company` field catches bots: if it is filled in, nothing is sent.
- The table and its rules are in `supabase/schema.sql`. Visitors may insert only; nobody can
  read messages through the API. Read them in the Supabase dashboard, Table Editor,
  `contact_messages`.

The publishable key is safe in the page: it is the same key the app ships with, and row level
security limits it to inserting contact messages.

### Deploy

`.github/workflows/pages.yml` publishes the site to the `gh-pages` branch, which GitHub Pages
serves. It runs on pushes to `claude/premium-ai-diet-training-site-uqlb73` that change
`index.html`, `assets/`, `robots.txt`, `sitemap.xml` or the workflow itself, and can be run by
hand. It copies only those files plus `.nojekyll`; nothing else in the repository (the app, the
backend, internal notes) is published.

`vercel.json` and `.vercelignore` let the same page deploy on Vercel if wanted. `.vercelignore`
is an allowlist too: everything is ignored except the site files.

Search engines only read `robots.txt` at the root of a domain, so on the GitHub Pages sub-path
it has no effect; submit `sitemap.xml` in Google Search Console instead. Both files are ready
for when the site moves to its own domain (update the URLs in `index.html`, `robots.txt` and
`sitemap.xml` then).

### Preview locally

```bash
npx http-server . -p 8080     # or: python3 -m http.server 8080
```

Then open http://localhost:8080/.

### Editing

- Colours, radii and motion are CSS custom properties at the top of the `<style>` block,
  named after DESIGN.md (`--black`, `--carbon`, `--stone`, `--green`, `--muted`, `--faint`).
  Built Green is the only accent. No text on black or carbon goes darker than `--faint`
  (`#8C8C8C`).
- Icons are one inline SVG sprite at the top of `<body>` (`#i-train`, `#i-nutrition`,
  `#i-coach`, `#i-progress` and a few UI icons), 2px outline, used with
  `<svg class="ico"><use href="#i-train"/></svg>`.
- The numbers inside the mockups and the progress dashboard (7.2 kg lost, 24-day streak,
  2,100 kcal) are example data, and the page says so.
