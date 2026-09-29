# BUILT mobile

Expo / React Native app (SDK 57) for BUILT, the AI fitness and nutrition
coach. One codebase for iOS, Android and web. The look is defined in
[`../DESIGN.md`](../DESIGN.md).

## Architecture

- **Data:** talks directly to Supabase Postgres; there is no custom API.
  Every table is locked to its owner by row-level security.
- **Accounts:** sign up / sign in inside the app (Supabase Auth, email and
  password; the session persists on the device).
- **Device-only mode:** "Continue without an account" (or a build with no
  Supabase settings) runs the whole app with no account. Everything is saved
  on that device only and is never uploaded, then or later.
- **Offline:** a signed-in person who loses connection keeps working. Changes
  are saved on the device and queued (`src/lib/outbox.ts`), and upload the
  next time the app reaches the server. The plan, profile and history they
  last saw stay available.
- **First-run setup:** height, weight, age and gender once; the AI planner
  then sets calorie and water targets and builds the first week. Editable
  anytime in Profile.
- **AI:** three Supabase Edge Functions (`coach`, `planner`, `analyze-meal`)
  hold the only AI key; the app never sees it. Each has a daily limit per
  person. See [`../supabase/README.md`](../supabase/README.md).
- **Reminders:** local daily notifications (water and workout); no push server.

## Run

```bash
npm install
# 1. Set up Supabase (about 5 minutes): ../supabase/README.md
# 2. Point the app at it:
cp .env.example .env   # paste your project URL and anon key
# 3. Start:
npx expo start -c
```

Scan the QR code (iPhone: Camera app, then tap the banner; Android: inside
Expo Go). Use `npx expo start -c` after changing `.env` to clear the cached
bundle. Photo meal logging (`expo-image-picker`) and notifications need a
development build on Android; Expo Go on Android has no notifications.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests (vitest): streak, stats, week and plan helpers
npx expo export --platform web --output-dir /tmp/built-web   # web build smoke test
```

The tests cover pure modules only (no device needed): `src/lib/dates.ts`,
`src/planData.ts`, `src/streak.ts`, `src/stats.ts`, `src/lib/serial.ts`,
`src/lib/timer.ts`, `src/lib/foodCache.ts`.

## Where things live

| Thing | File |
| --- | --- |
| Session, profile, device-only identity, `logWeight` | `src/auth.tsx` |
| Week shown, check-offs, streak, history, regenerate | `src/planStore.tsx` |
| Reads and writes to Supabase + device mirror | `src/data.ts`, `src/foodLogs.ts`, `src/aiPlan.ts` |
| Plan model, rules week, AI plan mapping | `src/planData.ts` |
| Streak and Progress math | `src/streak.ts`, `src/stats.ts` |
| Water counter (rolls over at midnight) | `src/useWater.ts` |
| Rest timer (right after backgrounding) | `src/useRestTimer.ts` |
| Alert / confirm that also work on web | `src/lib/dialog.ts` |
| Edge Function calls with readable errors (limits, offline) | `src/lib/functions.ts` |
| Today's date as state (midnight + resume rollover) | `src/lib/useToday.ts` |

## Screens

- **Today**: greeting with the workout streak, today's training, calorie
  ring on your target, water counter, meals list.
- **Plan**: the Monday to Sunday week, workout and meal check-offs.
- **Workout player**: set-by-set logging, rest timer, completion moment.
- **Progress**: 8-week workout bars, streak history, weight trend.
- **Coach**: AI chat and photo meal logging.
- **Profile**: name, stats, targets, reminders, account.
