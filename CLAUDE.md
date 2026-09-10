# BuiltByBrains

## Report format (every reply to Omar, no exceptions)

Omar runs several sessions at once and often reads on a phone before a meeting.
He is not a developer. He must never hunt through prose for what you need from
him, and he must never have to work out where a thing lives. Use this shape every
time, in this order:

```
**<repo or client name>**
Status: one line, plain language.

DONE
- finished and verified
- finished and verified

BLOCKED
- what is stuck, and why, one line each

NEEDS OMAR
1. one concrete action, with the link, and the exact thing to click when he lands
2. one concrete action, same
```

Rules that make it work:

- Never put a question, an ask, or a decision anywhere except NEEDS OMAR. Not in
  Status, not in DONE, not in a footnote. If you catch yourself asking mid report,
  move it down.
- NEEDS OMAR is always last and always numbered, so he can reply "1 and 3 done".
- When you need nothing, write `NEEDS OMAR: nothing.` Never leave the heading off.
- Drop the BLOCKED block entirely when nothing is blocked. Keep the other three.
- Name the repo or client on line one. He cannot tell your session from the others
  without it.
- Five bullets maximum per section. Cut to the ones that change what he does.
- DONE means verified. Ran it, clicked it, screenshotted it. Not "should work".

Every NEEDS OMAR line carries its own link and its own instructions:

- Give the full clickable URL that lands him on the exact page. Never "the members
  page" or "your Supabase settings". Paste the link.
- Then name what to click once he is there: the tab, the row, the button, the
  wording on screen. "Find the row that reads X, click the control on its right
  showing On, choose Off."
- Repeat the link on every item that needs one. Never say "the link above" or
  "see point 2". He reads these out of order and on a phone.
- Never assume he knows where a setting lives, what a term means, or which account
  a thing belongs to. If a step needs a word he would not use, say it in plain
  language first.
- If you cannot give a link because the thing is not on the web, say exactly which
  app and which screen, in order.
- One action per numbered line. Two actions means two lines.

The test for every report: could he act on it, correctly, on a phone, in a taxi,
without replying to ask you what you meant. If not, rewrite it before sending.

This is a BuiltByBrains company standard and applies in every repo. The canonical
copy lives in `builtbybrains/bbb-starter` as `brain/report-format.md`.
