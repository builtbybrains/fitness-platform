---
name: design-retro
description: Close the design learning loop at the end of a demo or a polish wave. Writes the dated lesson block locally and carries design lessons to the central brain in builtbybrains/bbb-starter. Use at demo-forge Phase 9, after Omar's eyeball round, or when Omar says retro, lessons, what did we learn, or /design-retro.
---

# design-retro

Lessons die in the repo they were learned in unless something carries them out. This skill
is that something. Run it at the close of every demo and every polish wave.

## Steps

1. Gather the raw material from this session and the repo: what Omar upgraded or killed,
   what the design-critic scored low and what fixed it, what the stranger judge caught, what
   the client reacted to (if the demo ran), which banned default slipped through and how.
2. Append the dated block to `.claude/skills/demo-forge/LEARNINGS.md` in this repo (format
   is in that file). One line per lesson.
3. Write the design-only lessons to `brain/design-learnings.md` in this repo, same dated
   block shape:

   ```
   ## YYYY-MM-DD — <client> <version>
   - Slipped through: <banned default or rubric line> — caught by <Omar | critic | stranger | client>
   - Fixed by: <skill or command, one line>
   - Rule candidate: <one sentence that could join design-bar.md> | none
   ```

4. Carry it to the central brain. Clone `builtbybrains/bbb-starter` (shallow), branch
   `learnings/<client>-<date>`, append the same block to `brain/design-learnings.md`, add or
   bump its line in `brain/MEMORY.md`, commit, push, open a PR titled
   `design-learnings: <client> <date>`. Merge it yourself once the checks pass. Omar never
   touches GitHub.
5. Promotion check: read the central `brain/design-learnings.md`. Any "Rule candidate" that
   now appears twice (same idea, any wording) gets promoted in the same PR: a numbered line
   in `brain/design-bar.md` (and the plugin copy), and if it is mechanical, a check in
   `scripts/design-gate.mjs` or a rule in the detector. Say in the PR body what was promoted.
6. Report to Omar under DONE: lessons written, PR merged, rules promoted (or none).

## Privacy

Client names are fine inside the central brain (private repo). Prices, contracts, and any
personal data of the client's staff stay out.
