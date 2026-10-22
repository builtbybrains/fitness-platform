# Exercise tutorial videos

Every exercise in a workout has a tutorial slot: a 16:9 frame on top of the open
exercise and a small chip beside the name on the others (and beside each option
in "Replace this exercise"). Until a video is picked, the slot reads "Tutorial
video coming soon" and offers "Search YouTube", which opens a YouTube search for
that exercise.

## The one file

`exerciseVideos.generated.json` is the only list of videos. It is keyed by the
exercise id from `exercises.ts` (for example `push_up`, `goblet_squat`):

```json
{
  "push_up": {
    "videoId": "IODxDxX7oi4",
    "title": "The perfect push up",
    "channel": "Calisthenicmovement",
    "seconds": 214,
    "source": "manual"
  }
}
```

- `videoId` is the part after `v=` in a YouTube link
  (`https://www.youtube.com/watch?v=IODxDxX7oi4`).
- `seconds` is the length, or `null` if unknown (the tile then hides the badge).
- `source` is optional: `manual` (typed in by hand), `playlist` (from the
  owner's channel or playlist) or `api` (found by the script below). Entries
  marked `manual` or `playlist` are never replaced by the script, even with
  `--force`.

As soon as an id has an entry, the app shows YouTube's thumbnail with a play
button, and a tap plays the video inside the app. The video must allow
embedding (most do; YouTube's "Share, Embed" option must be on).

## Filling it once the owner sends his YouTube details

**(a) He sends a channel or a playlist.** For each exercise, find its video in
the playlist and add an entry under the exercise id, with `"source":
"playlist"`. This can be done by hand or with a small script that reads the
playlist (the YouTube Data API's `playlistItems` endpoint needs a key, see (b)).

**(b) He sends a YouTube Data API v3 key.** From the repo root:

```sh
YOUTUBE_API_KEY=... node scripts/gen-media.mjs --videos-only
```

It searches YouTube's official API for "<exercise name> exercise tutorial"
(embeddable videos only, English results first), keeps videos between 25
seconds and 10 minutes, takes a well-known coaching channel when one is there
and otherwise the top result, and writes the picks (tagged `"source": "api"`)
into the JSON.

- Exercises that already have a video are skipped (add `--force` to redo the
  `api` ones), so it is safe to re-run.
- Each search costs 100 of the key's 10,000 free daily units, so a run makes
  at most 90 searches (change it with `--limit 50`, for example). The lengths
  for every pick are fetched together, 50 videos per call, for 1 unit each.
- It works through the owner's exercise sheet in order: sheet rows 1 to 48
  first, then the rest by row (library order when a row has no `sheetId`).
- When the day's quota runs out it stops, saves what it found and prints
  `quota reached: N filled, M left; run again tomorrow`.

Never commit the key. Without `YOUTUBE_API_KEY` the script falls back to reading
YouTube's public results page, as it always has.
