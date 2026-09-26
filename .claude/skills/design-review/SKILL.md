---
name: design-review
description: Screenshot-based visual review of a built or deployed UI against the BuiltByBrains design bar. Use after a build wave, before "done", after a deploy, or when Omar says review the design, does it look good, check the look, or /design-review <url or dir>.
---

# design-review

Reads rendered screens, not code. Code passes gates that eyes fail.

## Steps

1. Get screens. If given a URL or a dev server, run `node scripts/design-gate.mjs --shots-only --url <url>`
   (writes `shots/gate/<route>-<width>.png` at 360, 375, 390, 430, 1440). If given a folder,
   use its images. Every route that a client can reach gets shot, in both languages when bilingual.
2. Read `brain/design-bar.md` (or the plugin copy) and the client's `research/BRAND.md` and
   `DESIGN.md`.
3. Run the detector on the source: `node .claude/skills/impeccable/scripts/detect.mjs --json app src`
   (whichever exists). Keep the JSON.
4. Launch the `design-critic` agent with the shot folder, the detector JSON, and the brand
   files. The critic scores, you do not.
5. Turn the critic's top 3 fixes into work: run the named `/impeccable` command on the named
   target, or the named skill. Re-shoot and re-run the critic. Two rounds maximum per wave;
   after that the findings go to the plan, not to a third loop.
6. Commit the shots and the critic output under `shots/review/<date>/`. A review with no
   committed shots did not happen.

## Report to Omar

One line per rubric score that moved, the average before and after, the live URL, and the
three shots (360 and 1440 of the main screen, before and after). Format per CLAUDE.md.
