---
name: design-inspo
description: Builds the reference board before any design plan. Pulls three to five real references per view from curated galleries and open-source UI kits, photographs them, reads their code (fonts, palette, radius, motion libraries), and writes research/INSPO.md with what to take and what to leave. Use in demo-forge Phase 2 and 4, on any polish wave, or when Omar says inspo, references, moodboard, stalk that site, or "don't reinvent the wheel".
---

# design-inspo

Taste comes from looking at the best work in the client's own category before drawing
anything. This skill makes that a step with an artifact, not a mood. Output:
`research/INSPO.md` plus `research/inspo/*.png`. The `frontend-design` plan and the
`design-critic` both read it. A plan with no INSPO.md is not a plan.

## Step 1. Name the hunt

From the design read (page kind, audience, vibe, family) write three search lines:

- the client's category, in the client's words ("couture atelier", "pizza delivery",
  "concrete plant dispatch", "gym membership app")
- the page kind ("landing", "kanban", "calendar", "menu", "POS", "client portal")
- one named ceiling reference from `brain/design-bar.md` or the client's own world

## Step 2. Pull references from sources that work from the cloud

Tested 2026-09-13 from the cloud container. Use these, in this order:

| Need | Source | How |
|---|---|---|
| Landing pages, brand sites | https://godly.website (search by tag), https://www.landing.love, https://saaslandingpage.com, https://minimal.gallery, https://www.curated.design | open, search the category, pick 3 to 5 live sites |
| App UI, flows, real product screens | https://refero.design (search by screen type), https://mobbin.com (browse) | pick the screen kind you are designing |
| Components with code (copy, do not rebuild) | https://ui.shadcn.com/blocks, https://21st.dev, https://tailark.com, https://reactbits.dev, https://ui.aceternity.com | find the block, read its licence, note the install command |
| Whole open-source apps in the domain (engines to wrap) | GitHub search with the domain's own words; see demo-forge Phase 4 licence gate | note repo, licence, what to take |
| Visual moodboard | https://www.pinterest.com, https://dribbble.com | pictures only; never copy a Dribbble shot's layout into a real product without a live-site reference too |

Blocked from the cloud (2026-09-13): land-book.com, siteinspire.com, awwwards.com,
magicui.design, screenlane.com, uiverse.io. Do not spend a call on them; Omar's Mac-side
session can ferry shots into `intake/` if one is needed.

Pick with the ceiling test in mind: a reference is worth keeping only if a stranger would
place it next to Linear, Apple, or the client's own best surface.

## Step 3. Photograph and read the code

Run the recon script on every kept reference (it handles the live site and the shots):

```bash
node .claude/skills/design-inspo/scripts/recon.mjs <url> [<url> ...]
```

For each URL it writes `research/inspo/<host>-390.png`, `<host>-1440.png` and appends a
block to `research/inspo/recon.json`: fonts in use (display, body, mono), the palette
sampled from computed styles (top 8 colors by area), radius and shadow values seen,
motion and layout libraries detected in the bundle (framer-motion, gsap, lenis, three,
lottie, tailwind, radix, base-ui), the type scale (h1 to body sizes at 1440 and 390),
and the section count and first-viewport height. Read the JSON before writing INSPO.md.

Then run `design-dna` on the 1440 shots to get the qualitative read (style, effects).

## Step 4. Write research/INSPO.md

One block per view, in this shape:

```
## <view> — <page kind>
Ceiling reference: <name, url>
1. <site> <url> — take: <one layout move, one type move, one motion move>. leave: <what is their brand, not ours>
2. ...
3. ...
Components to reuse: <block name, source url, licence, install command>
Engines to wrap: <repo, licence, what part>
What this view must NOT look like: <the banned default it is closest to, from design-bar>
```

Rules:
- Take moves, never skins. A reference's palette and type belong to that brand; the
  client's come from `research/BRAND.md`. Layout, rhythm, motion timing, density and the
  way a section breathes are what travel.
- Three references minimum per view, five maximum. Fewer reads as no taste, more reads as
  no decision.
- Every component or engine line carries a licence. MIT and Apache-2.0 travel; AGPL and
  no-licence never ship inside a client build.
- The whole file stays under 150 lines. It is read at the top of every build session.

## Step 5. Hand off

`frontend-design` writes the design plan from INSPO.md and BRAND.md. The plan's review
step ("would I make this for any client") now has a second question: "does each view
carry one move from its references, and none of their skins". The critic reads INSPO.md
when it scores Identity and Layout.
