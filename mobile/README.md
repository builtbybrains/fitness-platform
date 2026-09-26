# VITAL mobile

Expo / React Native app (SDK 57) for the VITAL AI health platform, styled after
the website: near-black glass surfaces, one mint accent.

## Architecture (Step 4, current)

- **Data:** talks **directly to Supabase Postgres** — no custom API.
- **Accounts:** signup/login inside the app (Supabase Auth, email + password,
  session persists on-device).
- **First-run setup:** the app asks for height, age and gender once, then
  suggests a calorie target (Mifflin-St Jeor). Editable anytime in Profile.
- **AI coach:** the only keyed service; its key lives in the Supabase Edge
  Function (`supabase/functions/coach`), never in the app. Without a key the
  coach answers with built-in rules.
- **Reminders:** local daily notifications (water + workout) — no push server.
- **Offline:** if Supabase isn't configured (or the network is down) the app
  mirrors data locally and keeps working; see [`../supabase/README.md`](../supabase/README.md).

## Run

```bash
# 1. Set up Supabase (5 min):  ../supabase/README.md
# 2. Point the app at it:
cp .env .env   # paste your URL + anon key
# 3. Start:
npm start              # from repo root, or npx expo start here
```

Scan the QR (iPhone: Camera app → tap banner; Android: inside Expo Go).
Use `npx expo start -c` after changing `.env` to clear the cached bundle.

## Screens

- **Today** — greeting with streak chip, training card (opens the workout
  player), calorie ring on your profile target, water counter, meals list
- **Plan** — Mon–Sun week, day switcher, workout + meal check-offs
- **Workout player** — set-by-set chips, rest timer (+30s / skip / vibration),
  completion celebration → back to Plan
- **Progress** — 8-week workout bars, streak history, weight trend (all from
  the database)
- **Coach** — AI chat (Edge Function) with local rules fallback, history saved
- **Profile** — editable name/height/age/gender/targets, reminders, account
