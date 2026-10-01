# BUILT v2 API

Everything the app and the admin dashboard talk to: the Supabase tables, the
Edge Functions, the typed client wrappers in `mobile/src/api/`, the device
modules, the static libraries, and the admin API. Product rules live in
`PRODUCT.md`; setup and deployment in `supabase/README.md`.

Contents

1. [How it fits together](#1-how-it-fits-together)
2. [Conventions](#2-conventions)
3. [Errors](#3-errors)
4. [Feature map: which wrapper to call](#4-feature-map-which-wrapper-to-call)
5. [Client API reference (`mobile/src/api`)](#5-client-api-reference-mobilesrcapi)
6. [Device modules (camera blur, faces, health)](#6-device-modules)
7. [Static libraries and rules](#7-static-libraries-and-rules)
8. [Plan v2](#8-plan-v2)
9. [Edge Functions (app)](#9-edge-functions-app)
10. [Tables and storage](#10-tables-and-storage)
11. [Admin API](#11-admin-api)
12. [Limits](#12-limits)

---

## 1. How it fits together

- **The app** (`mobile/`) reads and writes its own rows in Supabase directly
  (row-level security keeps everyone to their own rows) and calls Edge
  Functions for anything that needs AI or the server's judgement. Screens
  never call Supabase or `supabase.functions.invoke` themselves: they call
  the wrappers in `mobile/src/api/`, which handle the account modes,
  offline, and errors.
- **Edge Functions** (`supabase/functions/`) run with the signed-in
  person's own token, so RLS applies to every read and write. Only `admin`
  and the push helper use the service role.
- **The admin dashboard** (`/admin/` on the website) calls one Edge
  Function, `admin`, with its own login. It never touches the database or
  storage directly and never sees body photos.

Account modes (decided per user id, `lib/cloud.ts`):

| Mode | Who | What the API does |
| --- | --- | --- |
| cloud | signed-in account (UUID id) | Server first, device mirror for offline, outbox for writes made offline |
| device-only | "Continue without an account" (`local-…` id) | Device storage only, never calls Supabase. AI, photos, reports, push: throw `needs_account` |

## 2. Conventions

- **Days** are the person's LOCAL calendar day, `yyyy-mm-dd`. Functions
  take `localDay` so "today" is their day, not the server's UTC day.
- **Weekdays, two conventions:** `profiles.training_days` uses
  `0 = Sunday … 6 = Saturday` (like `Date.getDay()`). Plans and calendar
  weeks are **Monday first**: plan day index `0 = Monday … 6 = Sunday`.
  Convert with `planIndexOfWeekday()` / `weekdayOfPlanIndex()` from
  `api/rules.ts`.
- **Weeks** start on Monday (`weekStartOf(day)`).
- **Ids** of rows the app creates (food logs, activities, reports) are made
  on the device (`newId()`), so a retried upload never duplicates.
- **Weights** are kg, heights cm, energy kcal, macros grams (integers).
- **Phone numbers** are stored E.164 (`+96170123456`); normalise input with
  `normalizePhone(input)` (adds +961 when no country code).
- **No loads, ever:** every plan exercise has `kg: null`; loaded lifts carry
  "Choose a weight you can lift for every rep with 2 in reserve." (3 for
  under-18s).

## 3. Errors

Every wrapper throws `ApiError` (`mobile/src/api/errors.ts`):

```ts
class ApiError extends Error { code: ApiErrorCode; status: number; message: string /* safe to show */ }
```

```ts
try {
  await generatePlan(userId);
} catch (e) {
  const err = asApiError(e);
  if (err.code === 'needs_account') openSignUpSheet();
  else showToast(err.message);
}
```

| code | HTTP | When | What to show |
| --- | --- | --- | --- |
| `needs_account` | n/a | Device-only mode called an account feature | The message, plus a sign-up action |
| `offline` | 0 | No connection | The message; data saved locally stays queued |
| `bad_request` | 400 | Input refused | The message (it says what to fix) |
| `unauthorized` | 401 | Signed out or session ended (`session_expired` from admin) | Sign-in |
| `forbidden` | 403 | Not allowed (e.g. under 13) | The message |
| `not_found` | 404 | Missing row | The message |
| `payload_too_large` | 413 | Photo too big | The message |
| `limit_reached` | 429 | Daily AI limit (section 12) | The message (it names the limit) |
| `not_configured` | 503 | No AI key on the server | The message; carry on without the AI step |
| `ai_busy` | 502 | Every AI model failed | The message and a retry |
| `under_13` | 400 | Database rule BU013 | Block with `UNDER_13_TEXT` |
| `waiver_required` | 400 | BU014: finishing onboarding without the waiver | Go to the waiver step |
| `guardian_required` | 400 | BU015: 13 to 17 without guardian consent | Go to the guardian step |
| `birth_date_required` | 400 | BU016: finishing without a birth date | Go to the birth date step |
| `not_blurred` | n/a | A body photo without baked blur | Back to the blur step |
| `unsupported` | n/a | Not on this platform | Hide the feature |
| `server_error` | 500 | Anything else | The message |

Edge Function error bodies are always `{ "error": "<message>", "code": "<code>" }`.
Real causes go to the function logs, never to clients.

## 4. Feature map: which wrapper to call

| Feature (PRODUCT.md) | Call | Backed by |
| --- | --- | --- |
| Load / save questionnaire | `getProfile`, `saveProfilePatch` | `profiles` |
| Resume questionnaire | `resumeStep`, `nextStep`, `previousStep`, `stepProgress`, `ONBOARDING_STEPS` | `profiles.onboarding_step` |
| Phone field | `normalizePhone` | |
| Timeline warning | `paceFor(profile)` | `api/rules.ts` |
| Targets preview | `targetsFor(profile)` | `api/rules.ts` |
| Waiver, guardian, finish | `acceptWaiver`, `giveGuardianConsent`, `completeOnboarding` | `profiles` + DB rules |
| Body photo: detect, blur, upload | `detectFaces`, `bakeBlur`, `uploadBodyPhoto`, `newPhotoSetId` | device + `body-photos` bucket + `body_photos` |
| Photo estimate | `runBodyAnalysis`, `latestBodyAnalysis` | `body-analysis` fn, `body_analyses` |
| First plan / change request | `generatePlan(userId, instruction?)` | `planner` fn, `ai_plans` |
| Show the week | `getPlan`, `getWeekOverrides`, `weekView` | `ai_plans`, `plan_overrides` |
| Move a workout day | `moveWorkoutDay`, `resetWeek` | `plan_overrides` |
| Replace an exercise | `exerciseOptions`, `replaceExercise` | `data/exercises.ts`, `plan_overrides` / `ai_plans` |
| Home or gym this week | `planForLocation(plan, location)` | plan variants |
| Log food (photo or text) | `analyzeFood`, `answerFoodQuestions`, then save with `foodLogRow` | `meals` fn, `food_logs` |
| Swap a meal | `swapMeal` | `meals` fn |
| Cook from what I have | `generateMealFromHome` | `meals` fn |
| Activities | `logActivity`, `listActivities`, `deleteActivity`, `activityKcalByDay` | `activities` |
| Check-ins | `submitCheckin`, `listCheckins`, `checkinsDue` | `checkin` fn, `checkins` |
| Coach | `sendCoachMessage` | `coach` fn |
| Memory in Profile | `listMemory`, `deleteMemory`, `rememberFact` | `coach_memory` |
| Report a problem | `createReport`, `listMyReports`, `getReport`, `replyToReport`, `markReportRead`, `unreadCount` | `problem_reports`, `report_messages`, `report-screenshots` bucket |
| Push | `registerPushToken`, `unregisterPushToken` | `push_tokens` |
| Health apps | `enableHealthSync`, `syncHealth`, `getHealthDays`, `healthPlatform` | device + `health_daily`, `activities`, `weights` |
| Reminders settings | `saveProfilePatch({ reminder_prefs, quiet_hours_start, quiet_hours_end })` | `profiles` |

## 5. Client API reference (`mobile/src/api`)

Import from `mobile/src/api` (one barrel), except device modules (section 6):

```ts
import { getProfile, saveProfilePatch, generatePlan, weekView, ApiError } from '../src/api';
import type { ProfileV2, PlanV2 } from '../src/types';
```

All types are in `mobile/src/types/index.ts`.

### 5.1 Profile and questionnaire (`api/profile.ts`)

| Function | Returns | Notes |
| --- | --- | --- |
| `getProfile(userId)` | `ProfileV2` | Cloud: server row (device copy offline). Device-only: the `vital.localUser` record auth.tsx uses |
| `saveProfilePatch(userId, patch, current?)` | `ProfileV2` | Validates first (same rules as the DB), saves, returns the full row. A changed `weight_kg` is also logged to the weight history |
| `validateProfilePatch(patch, current, today?)` | `ApiError \| null` | Pure; use it for inline field errors |
| `acceptWaiver(userId)` | `ProfileV2` | Sets `waiver_version = WAIVER_VERSION`, `waiver_accepted_at = now` |
| `giveGuardianConsent(userId, name)` | `ProfileV2` | 13 to 17 year olds |
| `completeOnboarding(userId)` | `ProfileV2` | Sets `onboarding_done_at`; throws `waiver_required`, `guardian_required`, `birth_date_required`. Then call `generatePlan(userId)` |
| `resumeStep(profile)` | `OnboardingStep` | Where to reopen the questionnaire |
| `nextStep(step, { skipPhoto })` / `previousStep` | `OnboardingStep` | `skipPhoto: true` in device-only mode |
| `stepProgress(step)` | `0..1` | Progress bar |
| `normalizePhone(input, '+961')` | `string \| null` | `''` for empty, `null` when invalid |
| `paceFor(profile)` | `PaceCheck \| null` | Timeline warning: show `message` when `safe` is false, offer `suggestedMonths` |
| `targetsFor(profile)` | `DailyTargets` | kcal, protein/carbs/fat, water, with every safety floor |
| `ageOf(profile)`, `waiverCurrent(profile)` | | Helpers |

Save after every questionnaire step: `saveProfilePatch(userId, { goal: 'lose_fat', onboarding_step: nextStep('goal') })`.
JSON fields (`reminder_prefs`, `health_sync`) are replaced whole, so merge
first: `saveProfilePatch(userId, { reminder_prefs: { ...profile.reminder_prefs, water: false } })`.
A person whose `onboarding_done_at` is null (including every v1 account)
should go through the questionnaire.

Questionnaire values (`ProfileV2`):

| Field | Values |
| --- | --- |
| `activity_level` | `sedentary`, `light`, `moderate`, `very`, `athlete` |
| `job_activity` | `desk`, `on_feet`, `physical` |
| `sleep_hours` | 3 to 14 |
| `goal` | `lose_fat`, `build_muscle`, `tone_up`, `stay_fit`, `sports_performance` |
| `timeline_months` | 1, 3, 6, 12 |
| `target_weight_kg` | 30 to 300, optional |
| `train_location` | `home_none`, `home_equipment`, `gym` |
| `equipment` | any of `dumbbells`, `bands`, `kettlebell`, `pullup_bar`, `bench`, `other` (+ `equipment_other` text) |
| `training_days` | 1 to 7 of `0..6`, 0 = Sunday. Default `[1,2,3,4,5,6]` (Sunday rest) |
| `training_time` | `morning`, `midday`, `evening` or `HH:MM` |
| `diet_type` | `none`, `halal`, `vegetarian`, `vegan`, `pescatarian`, `lactose_free`, `gluten_free` |
| `allergies` | any of `nuts`, `peanuts`, `dairy`, `eggs`, `gluten`, `shellfish`, `fish`, `soy`, `sesame`, `other` (+ `allergies_other`) |
| `dislikes`, `injuries` | free text |
| `injury_areas` | any of `knee`, `lower_back`, `shoulder`, `wrist`, `elbow`, `hip`, `ankle`, `neck` (these drive exercise choice) |
| `conditions` | any of `high_blood_pressure`, `diabetes`, `asthma`, `heart_condition`, `pregnant`, `postpartum`, `eating_disorder_history`, `joint_pain`, `other` |
| `quiet_hours_start/end` | `HH:MM`, default 22:00 to 07:00 |
| `reminder_prefs` | `{ workout, meals, water, weigh_in, checkin, streak, plan_updated, report_reply: boolean, meal_times?, water_every_hours? }` |
| `health_sync` | `{ enabled, provider?, write_workouts?, last_sync_at? }` |
| `timezone` | IANA, default `Asia/Beirut` |

### 5.2 Body photos (`api/photos.ts`) - account only

```ts
const setId = newPhotoSetId();
const { regions } = await detectFaces(picked.uri, picked.width, picked.height);   // device/faces
// person adjusts regions on screen
const photo = await bakeBlur({ uri: picked.uri }, adjustedRegions);                // device/blur
await uploadBodyPhoto(userId, { photo, kind: 'front', setId, source: 'signup' });
const analysis = await runBodyAnalysis(userId, setId);   // not_configured: carry on without it
```

| Function | Returns | Notes |
| --- | --- | --- |
| `newPhotoSetId()` | `string` | One id per set taken together |
| `uploadBodyPhoto(userId, { photo: BlurredPhoto, kind, setId, source })` | `BodyPhoto` | Only accepts a `BlurredPhoto` (made by `bakeBlur`). Front and side need at least one blur region. Retaking a kind replaces it. Max 6 MB |
| `listBodyPhotos(userId)` | `BodyPhoto[]` | Newest first |
| `bodyPhotoUrl(path, seconds = 3600)` | `string` | Signed link to the person's own photo |
| `deletePhotoSet(userId, setId)` | `void` | Files and rows |
| `runBodyAnalysis(userId, setId)` | `BodyAnalysis` | Needs a front photo in the set |
| `latestBodyAnalysis(userId)` | `BodyAnalysis \| null` | |

`BodyAnalysisResult`: `{ body_fat_range: [low, high], build: 'lean'|'average'|'athletic'|'muscular'|'heavier'|'unclear', posture_notes: string[], training_focus: string[], confidence, summary }`.
Show it as an estimate ("about 22 to 27%"), never as a fact.

### 5.3 Plan (`api/plan.ts`)

| Function | Returns | Notes |
| --- | --- | --- |
| `getPlan(userId)` | `PlanV2 \| null` | v1 plans are upgraded on read. Null: show the built-in week (`planData.buildWeek`) |
| `generatePlan(userId, instruction?)` | `PlanResult` `{ plan, changes, summary, stored, model }` | Account only. No instruction: build from the questionnaire. Instruction: a change request in the person's words. Show `changes` ("what changed and why") |
| `planHistory(userId)` | `{ at, instruction, changes, kcal_target }[]` | Last 20 changes |
| `weekStartOf(day?)` | `yyyy-mm-dd` | Monday |
| `getWeekOverrides(userId, weekStart)` | `PlanOverrides` | Works offline and without an account |
| `weekView(plan, overrides, weekStart)` | `WeekDayView[]` (7) | **Render the week through this.** Each entry: `{ id, weekday, planIndex, moved, day }` |
| `moveWorkoutDay(userId, weekStart, fromWeekday, toWeekday)` | `PlanOverrides` | Weekdays 0 = Monday. The two days trade what they show (move to a rest day, or swap two workouts). The coach remembers it |
| `resetWeek(userId, weekStart)` | `PlanOverrides` | Undo moves and this-week swaps |
| `exerciseOptions(exercise, profile, { location?, count? })` | `Exercise[]` (up to 3) | Same muscle group, fits the equipment and injuries; instant, offline |
| `replaceExercise(userId, { plan, weekStart, planIndex, exerciseIndex, replacement, scope, profile })` | `{ plan, overrides }` | `scope: 'week'` (this calendar week) or `'always'` (written into the plan). Use `planIndex` from `weekView`. The coach remembers it |
| `toPlanExercise(libraryExercise, original, profile)` | `PlanExerciseV2` | Keeps sets/reps/rest when the unit matches |
| `planForLocation(plan, location)` | `PlanV2` | Every exercise swapped to its home or gym variant |
| `upgradePlan(raw)` | `PlanV2 \| null` | Pure |
| `swapDays(order, a, b)`, `isPermutation`, `emptyOverrides`, `weekdayOf` | | Pure helpers |

Moving a day that is already done, or moving into the past, is allowed by
the API; the screen decides whether to offer it.

### 5.4 Food (`api/food.ts`) - AI calls need an account

```ts
let a = await analyzeFood(userId, { text: '2 eggs, 1 pita, labneh' });   // or { photoBase64, note? }
let estimate = a.status === 'final' ? a.estimate : await answerFoodQuestions(userId, a.draft, a.questions, answers);
// show estimate, let the person edit, then save it in foodLogs.ts:
const row = foodLogRow(userId, estimate, { id: newId(), day, slot: '', followUp });
```

| Function | Returns | Notes |
| --- | --- | --- |
| `analyzeFood(userId, { photoBase64, note? } \| { text })` | `FoodAnalysis` | `{ status: 'questions', draft, questions }` or `{ status: 'final', estimate }`. Resize photos to about 1024 px, under 1.8 MB |
| `answerFoodQuestions(userId, draft, questions, answers)` | `FoodEstimate` | `answers: { id, answer }[]` (tap option text or free text) |
| `swapMeal(userId, meal, reason?)` | `PlanMealV2[]` (up to 3) | Similar kcal (within 10%), at least as much protein, within diet, allergies, dislikes |
| `generateMealFromHome(userId, have, { slot?, kcal? })` | `GeneratedMeal` (`PlanMealV2 & { steps }`) | |
| `estimateFromMeal(meal, 'plan' \| 'generated')` | `FoodEstimate` | Log a plan meal like any food |
| `foodLogRow(userId, estimate, { id, day, slot?, followUp?, createdAt? })` | `FoodLogRowV2` | The row for `food_logs`, clamped |
| `sumMacros(list)` | `{ kcal, protein, carbs, fat }` | |

`FoodQuestion`: `{ id, question, options: string[] (0 to 4), allowFreeText: true }`.
`FoodEstimate`: `{ label, kcal, protein, carbs, fat, confidence, items: FoodItem[], source }`; totals are the sum of items.
Off-plan food counts toward the day's calories; the person confirms or edits before it counts.

### 5.5 Activities (`api/activities.ts`) - works without an account and offline

| Function | Returns | Notes |
| --- | --- | --- |
| `logActivity(userId, { kind, minutes, effort, day?, label? }, weightKg)` | `Activity` | kcal = MET × kg × hours. `pending: true` while only on the device |
| `listActivities(userId, fromDay, toDay)` | `{ activities, offline }` | Newest first |
| `deleteActivity(userId, id)` | `void` | |
| `activityKcalByDay(list)` | `Record<day, kcal>` | For Today and Progress |

### 5.6 Check-ins (`api/checkins.ts`)

| Function | Returns | Notes |
| --- | --- | --- |
| `submitCheckin(userId, { kind, day?, weight_kg?, measurements?, answers?, photo_set_id? })` | `CheckinResult` `{ checkin, summary, plan_changes, plan, localOnly? }` | Weekly needs a weight. Monthly with photos: upload the set and `runBodyAnalysis` first. Device-only: saved locally with a weight-trend summary |
| `listCheckins(userId, kind?, limit = 24)` | `Checkin[]` | |
| `checkinsDue({ today?, lastWeightDay, lastMonthlyDay, startedDay })` | `{ weekly, monthly }` | Weekly: 7 days since a weight. Monthly: 30 days since the last monthly (or onboarding) |
| `lastMonthlyCheckinDay(userId)` | `string \| null` | |

`answers`: `energy`, `sleep` (1 very low to 5 great), `hunger` (1 never to 5 always), `difficulty` (1 too easy, 3 right, 5 too hard), `adherence` (0..100 %), `notes`.
`measurements`: `waist_cm`, `hips_cm`, `chest_cm`, `arm_cm`, `thigh_cm`.
`plan_changes`: `{ changes, instruction, kcal_before, kcal_after, kcal_delta }`.

### 5.7 Coach and memory (`api/coach.ts`, `api/memory.ts`)

| Function | Returns | Notes |
| --- | --- | --- |
| `sendCoachMessage(userId, message, conversationId = 'default')` | `CoachReply` `{ reply, model, saved, suggestPlanChange, remembered }` | When `suggestPlanChange` is set, offer "Update my plan" → `generatePlan(userId, suggestPlanChange)`. `remembered`: facts saved from this message |
| `listMemory(userId)` | `MemoryFact[]` | For Profile → "What your coach remembers" |
| `deleteMemory(userId, id)` | `void` | People can delete, never edit |
| `rememberFact(userId, fact, category, source = 'behaviour')` | `MemoryFact \| null` | null when already known |

### 5.8 Reports (`api/reports.ts`) - account only

| Function | Returns | Notes |
| --- | --- | --- |
| `createReport(userId, { category, message, screenshotBase64?, screenshotMime?, platform?, appVersion? })` | `ProblemReportWithThread` | Categories `bug`, `plan`, `food`, `account`, `other` |
| `listMyReports(userId)` | `ProblemReportWithThread[]` | Each has `messages` and `unread` (an admin reply not opened yet) |
| `getReport(userId, id)` | `ProblemReportWithThread` | |
| `replyToReport(userId, id, body)` | `ReportMessage` | |
| `markReportRead(userId, id)` | `void` | Call when the thread is opened |
| `reportScreenshotUrl(path)`, `unreadCount(list)` | | |

Statuses: `new`, `in_progress`, `fixed` (admin only). An admin reply arrives as a push with `data: { type: 'report_reply', report_id }`.

### 5.9 Push (`api/push.ts`)

`registerPushToken(userId, { prompt })` → `{ ok: true, token } | { ok: false, reason }`
with reason `needs_account`, `web`, `not_device`, `denied`, `no_project_id`,
`unavailable`, `error`. Call after sign-in; `prompt: true` only from a
screen that explains why. `unregisterPushToken(userId, token)` before
sign-out. Server pushes carry `data.type`: `report_reply` or `plan_updated`.
Local reminders (workout, meals, water, weigh-in, check-in, streak) are
scheduled on the device with `lib/notify.ts`, honouring
`reminder_prefs` and quiet hours.

### 5.10 Health (`api/health.ts`)

| Function | Returns | Notes |
| --- | --- | --- |
| `enableHealthSync(userId)` | `boolean` | Asks for access, sets `health_sync.enabled` |
| `disableHealthSync(userId)` | `void` | |
| `syncHealth(userId, { days = 7, weightKg })` | `HealthSyncResult` | Steps, active kcal, sleep → `health_daily`; workouts → `activities` (deduped by `external_id`); latest weight → weights. Safe on every app open |
| `getHealthDays(userId, from, to)` | `HealthDaily[]` | |

## 6. Device modules

Import each from its own path; Metro picks the platform file, so web never
loads native code:

| Import | Web | iOS / Android |
| --- | --- | --- |
| `api/device/blur` → `bakeBlur(source, regions, { confirmNoFace? })` | Canvas 2D: pixelate (8 blocks) then blur | Skia offscreen: two strong Gaussian passes |
| `api/device/faces` → `detectFaces(uri, w, h)`, `faceDetectionAvailable()` | Returns one suggested box, `detected: false` | Google ML Kit (`@infinitered/react-native-mlkit-face-detection`); padded ellipses |
| `api/device/health` → `healthPlatform()`, `healthAvailable()`, `requestHealthPermissions()`, `readHealthDays()`, `readHealthWorkouts()`, `writeHealthWorkout()`, `openHealthSettings()` | Not available (`healthPlatform()` is null: hide it) | iOS: Apple Health (`@kingstinct/react-native-healthkit`). Android: Health Connect (`react-native-health-connect`) |

- `bakeBlur` output: `BlurredPhoto { uri, base64 (JPEG), width, height, regions }`, longest side 1280 px. It refuses an empty region list unless `confirmNoFace: true` (a back photo).
- `BlurRegion`: `{ x, y, width, height }` as fractions of the image, `shape: 'ellipse' | 'rect'`.
- The blur screen must always show the regions and let the person drag, resize, add and remove them before baking, even when faces were detected.
- Face detection and health need a **development or production build** (not Expo Go). In Expo Go, `detectFaces` returns the suggested box and health reports unavailable; nothing crashes. Skia works in Expo Go.
- Health Connect needs Android 8+ (minSdk 26 set) and, on Android 13 and older, the Health Connect app.

## 7. Static libraries and rules

| File | What |
| --- | --- |
| `mobile/src/data/exercises.ts` | 136 exercises: `id`, `name`, `aliases`, `muscle`, `secondary`, `pattern`, `equipment`, `cautions` (injury areas), `level`, `unit`, `sets`, `reps`, `rest`, `cue`. `findExercise`, `availableEquipment(location, equipment)`, `exercisesFor`, `alternativesFor(exercise, available, injuries, { count, exclude, maxLevel })`, `variantFor`, `injuriesFromText`. Byte-identical copy in `supabase/functions/_shared/exercises.ts` (a test enforces it) |
| `mobile/src/data/activities.ts` | `ACTIVITIES` (walking, running, football, basketball, swimming, cycling, padel, hiking, dancing, strength, other) with MET per effort, `EFFORT_HINTS`, `kcalFor(kind, minutes, effort, weightKg)` |
| `mobile/src/api/rules.ts` | `ageOn`, `ageRule` (blocked under 13, minor 13 to 17), `kcalFloor` (1200 women, 1500 men or unknown), `bmr`, `activityFactor`, `paceCheck` (loss at most 1% a week, gain at most 0.5 kg a week, no loss target under 18), `dailyTargets`, weekday converters, `mentionsSupplement`. Byte-identical copy in `supabase/functions/_shared/rules.ts` |
| `mobile/src/legal/waiver.ts` | `WAIVER_VERSION`, `WAIVER_PARAGRAPHS`, guardian texts, `UNDER_13_TEXT`. DRAFT, needs a lawyer's review |

## 8. Plan v2

Stored in `ai_plans.plan`. A superset of the v1 week, so v1 readers keep
working. `days[0]` is Monday.

```jsonc
{
  "version": 2,
  "generated_at": "2026-10-01T15:00:00.000Z",
  "source": "ai",                       // or "rules" (no AI key, or the AI failed)
  "model": "nvidia/nemotron-3-super-120b-a12b:free",
  "kcal_target": 1810, "water_target": 8,
  "macros": { "protein_g": 140, "carbs_g": 187, "fat_g": 56 },
  "location": "home_equipment", "equipment": ["none", "dumbbells"],
  "training_days": [1, 3, 5],           // 0 = Sunday
  "training_time": "18:30",
  "pace": { "direction": "lose", "weeklyKg": 0.38, "maxWeeklyKg": 0.7, "safe": true, "suggestedMonths": 3, "message": "", "totalKg": 5 },
  "minor": false,
  "summary": "3 training days a week at home with your equipment …",
  "changes": "Exercises that load your knee are swapped for safer ones. Training days: Mon, Wed, Fri (was Mon, Tue, Wed, Thu, Fri, Sat).",
  "instruction": "my knee hurts",
  "days": [
    {
      "session": {
        "kind": "workout", "focus": "Full body", "minutes": 45, "time": "18:30",
        "exercises": [
          {
            "id": "db_box_squat", "name": "Dumbbell squat to a box", "muscle": "quads",
            "sets": 3, "reps": 10, "unit": "reps", "rest": 90, "kg": null,
            "note": "Choose a weight you can lift for every rep with 2 in reserve.",
            "variants": {
              "home_none": { "id": "box_squat", "name": "Squat to chair" },
              "home_equipment": { "id": "db_box_squat", "name": "Dumbbell squat to a box" },
              "gym": { "id": "leg_press", "name": "Leg press" }
            }
          }
        ]
      },
      "meals": [
        { "slot": "Breakfast", "label": "Labneh with olive oil, cucumber, tomato and pita", "kcal": 475, "protein": 20, "carbs": 50, "fat": 22, "portion": 1.1 }
      ]
    },
    { "session": { "kind": "rest", "focus": "Recovery", "minutes": 0, "note": "Easy 20-minute walk …" }, "meals": [] }
  ]
}
```

- `unit`: `reps`, `s` (seconds per set) or `m` (metres per set).
- `portion`: servings of the recipe as written (1 = as written).
- `replaced_from` appears on an exercise the person replaced.
- Training days follow `profiles.training_days`; rest days everywhere else (Sunday by default). Workouts get exactly 1 to 7 days; 7 days includes an active-recovery day.
- Under 18 (`minor: true`): maintenance calories or more, at least 8 reps, 3 reps in reserve, no advanced lifts, no supplements anywhere.

**Overrides** (`plan_overrides`, one row per person per Monday):

```json
{ "week_start": "2026-09-28", "day_order": [0, 1, 3, 2, 4, 5, 6], "exercise_swaps": { "1:0": { "id": "box_squat", "name": "Squat to chair", "replaced_from": "Back squat", "...": "PlanExerciseV2" } } }
```

`day_order[i]` = the plan day shown on weekday `i`. Swap keys are
`<planIndex>:<exerciseIndex>` in PLAN indexes, so they survive moving
days. A new plan clears this week's and later `exercise_swaps` (moved days
stay). `weekView()` applies all of it.

## 9. Edge Functions (app)

Called through the wrappers; listed here for completeness. Base:
`https://<project>.supabase.co/functions/v1/<name>`, POST, JSON, with the
signed-in person's JWT (supabase-js does this). All AI goes through
OpenRouter free models by default (`supabase/README.md`).

### `planner`
Request `{ instruction?: string, goal?: string (v1), localDay?: string }`.
Response `{ plan: PlanV2, changes, summary, stored, model }`.
Understood in code before the AI: injuries ("my knee hurts"), day counts
("only 3 days this week"), no equipment / travel / gym, session length
("30 minutes", "short"), "too hard" / "too easy". A request that mentions an
injury is saved to coach memory. 403 `forbidden` under 13. Without an AI
key: a complete rules plan.

### `body-analysis`
Request `{ photo_set_id, localDay? }` → `{ analysis: BodyAnalysis, stored }`.
Reads the set with the person's token (RLS + storage policies), checks the
paths are in their folder, needs a front photo. 503 without a vision key.

### `meals`
| mode | Request | Response |
| --- | --- | --- |
| `photo` | `{ mode, imageBase64, note? }` | `FoodAnalysis` |
| `text` | `{ mode, text }` | `FoodAnalysis` (works without AI: built-in food table, asks portion questions) |
| `answer` | `{ mode, draft, questions, answers }` | `{ status: 'final', estimate }` |
| `swap` | `{ mode, meal, reason?, localDay? }` | `{ options: PlanMealV2[] }` (works without AI: meal library) |
| `generate` | `{ mode, have, slot?, kcal?, localDay? }` | `{ meal: GeneratedMeal }` (503 without AI) |

### `analyze-meal` (v1, kept for installed builds)
`{ imageBase64 }` → `{ estimate: { label, kcal, protein, carbs, fat, confidence, items }, model }`. No questions.

### `coach`
`{ message, conversationId?, localDay? }` → `{ reply, model, saved, suggestPlanChange, remembered }`.

### `checkin`
`{ kind, day?, weight_kg?, measurements?, answers?, photo_set_id? }` →
`{ checkin, summary, plan_changes, plan }`. Weekly: no AI, no plan change.
Monthly: calorie change decided in code (stalled with good adherence: -150;
losing too fast: +150; not gaining: +150; low energy or sleep while losing:
+100; never below the floors, never a deficit under 18), volume from how
hard it felt, a new plan, a written review, memory facts, and a
`plan_updated` push.

## 10. Tables and storage

All in `public`, all with RLS. "Own" = `auth.uid() = user_id`.

| Table | Purpose | Signed-in person can |
| --- | --- | --- |
| `profiles` | Account, targets, whole questionnaire (section 5.1) | read/update own. DB enforces: 13+ (BU013), waiver (BU014), guardian 13 to 17 (BU015), birth date to finish (BU016); `age` synced from `birth_date` |
| `plan_days` | Check-offs per day (`workout_done`, `exercises_done`, `meals_done`) | all on own |
| `water`, `weights` | Glasses per day; kg per day | all on own |
| `coach_messages` | Chat history | read, add own (no edit/delete: the daily limit counts them) |
| `ai_plans` | `plan` (v1 or v2), `kcal_target`, `water_target`, `change_log` (last 20) | all on own |
| `plan_overrides` | Per-week moves and swaps (section 8) | all on own |
| `food_logs` | `label, kcal, protein, carbs, fat, confidence, source (photo/text/plan/generated), slot, follow_up, items` | all on own |
| `activities` | `day, kind, label, minutes, effort (easy/moderate/hard), kcal, source (manual/health), external_id` (unique per person) | all on own |
| `health_daily` | `day, steps, active_kcal, sleep_minutes, source` | all on own |
| `body_photos` | `set_id, kind (front/side/back), source (signup/checkin), storage_path, taken_at` | read, add, delete own; no edits |
| `body_analyses` | `photo_set_id, result (JSON), model` | read, add, delete own |
| `checkins` | `kind (weekly/monthly), day, weight_kg, measurements, answers, photo_set_id, photo_ids, ai_summary, plan_changes`; one per kind per day | all on own |
| `coach_memory` | `fact, category, source (chat/behaviour/checkin/profile)`; duplicates rejected | read, add, delete own; no edits |
| `problem_reports` | `category, message, screenshot_path, status, platform, app_version, user_last_read_at, last_message_at` | read, add own (status always `new`); update only `user_last_read_at` |
| `report_messages` | `report_id, author (user/admin), body` | read own threads; add replies on own reports as `user` only |
| `push_tokens` | `token, platform` per person | read, delete own; add only via `register_push_token()` |
| `ai_usage` | AI calls per day per kind | read own |
| `contact_messages` | Website form | anyone may insert; nobody reads via the API |
| `app_config` | `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `AI_MODEL`, `VISION_MODEL` fallback | nothing (service role only) |
| `admin_credentials`, `admin_sessions`, `admin_login_attempts`, `admin_lockouts` | Admin login | nothing (service role only) |

`last_active_at` is bumped by the database whenever the person writes any
of their data (at most every 5 minutes).

Storage (private buckets, one folder per person):

| Bucket | Path | Signed-in person can | Admin |
| --- | --- | --- | --- |
| `body-photos` | `<user id>/<set id>/<kind>.jpg` | add, read, delete own | never |
| `report-screenshots` | `<user id>/<report id>.jpg` | add, read own | 10-minute signed link in report detail |

## 11. Admin API

One Edge Function. Base URL:
`https://<project-ref>.supabase.co/functions/v1/admin`

- **Auth:** `POST /login` returns a token. Send it on every other request as
  the header `x-admin-token: <token>` (or `Authorization: Bearer <token>`).
  Sessions last 12 hours. Store the token in `sessionStorage`, never in the
  page source. No Supabase key is needed (the function is deployed without
  the JWT check).
- **Lockout:** 5 failed logins from one address in 15 minutes lock that
  address for 15 minutes; 20 failures from anywhere lock every login for 15
  minutes. Changing the password clears lockouts and sessions.
- **CORS:** only `https://builtbybrains.github.io` and
  `http://localhost:<any>` / `http://127.0.0.1:<any>`. Other origins get 403.
- **Responses** are JSON with `Cache-Control: no-store`; errors are
  `{ "error": "<message to show>", "code": "<code>" }`.
- **Days** in the admin (today, this week, signups) are Beirut days.
- **Never photos:** no route returns body photos, photo paths or the photo
  estimate.

| Status | code | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | Missing or invalid input |
| 401 | `unauthorized` | Wrong username or password (login only) |
| 401 | `session_expired` | Missing, wrong or expired token: show the login |
| 403 | `forbidden` | Origin not allowed |
| 404 | `not_found` | Unknown route or id |
| 405 | `method_not_allowed` | Wrong method on /login |
| 423 | `locked` | Too many attempts; `locked_until` (ISO time) says until when |
| 503 | `not_configured` | No admin login set yet (README: admin_set_credentials) |
| 500 | `server_error` | Anything else |

```js
const BASE = 'https://<project-ref>.supabase.co/functions/v1/admin';
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-token': sessionStorage.getItem('adminToken') ?? '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { sessionStorage.removeItem('adminToken'); showLogin(); throw new Error('signed out'); }
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error), { code: data.code, data });
  return data;
}
```

### POST /login

```http
POST /login
{ "username": "owner", "password": "…" }
```
```json
{ "token": "4c1f…64 hex chars…", "expires_at": "2026-10-02T03:50:13.411+00:00" }
```
Errors: 400 (empty), 401 `unauthorized`, 423 `locked` with `locked_until`, 503 `not_configured`.

### POST /logout
→ `{ "ok": true }`. The token stops working.

### GET /overview

```json
{
  "total_users": 3,
  "new_this_week": 3,
  "active_today": 1,
  "active_7d": 1,
  "onboarding_incomplete": 3,
  "avg_streak": 0.3,
  "checkins_due": { "weekly": 3, "monthly": 0 },
  "open_reports": 1,
  "reports_by_status": { "new": 1, "in_progress": 0, "fixed": 0 },
  "users_by_goal": { "lose_fat": 1, "build_muscle": 1, "unknown": 1 },
  "signups_14d": [ { "day": "2026-09-18", "count": 0 }, "… 14 entries, oldest first …", { "day": "2026-10-01", "count": 3 } ],
  "generated_at": "2026-10-01T15:50:13.799+00:00"
}
```
`checkins_due.weekly`: no weight logged for 7+ days. `monthly`: 30+ days since the last monthly check-in (or signup).

### GET /users

Query parameters (all optional):

| Param | Values |
| --- | --- |
| `q` | Text in name or email; digits match the phone |
| `goal` | `lose_fat`, `build_muscle`, `tone_up`, `stay_fit`, `sports_performance` |
| `activity_level` | `sedentary`, `light`, `moderate`, `very`, `athlete` |
| `train_location` | `home_none`, `home_equipment`, `gym` |
| `age_group` | `under_18`, `18_24`, `25_34`, `35_44`, `45_54`, `55_plus`, `unknown` |
| `active` | `today`, `7d`, `30d`, `inactive_30d`, `never` |
| `signed_from`, `signed_to` | `yyyy-mm-dd`, inclusive |
| `streak_min`, `streak_max` | integers |
| `onboarding` | `done`, `incomplete` |
| `sort` | `created_desc` (default), `created_asc`, `last_active_desc`, `name_asc`, `streak_desc` |
| `limit`, `offset` | 1 to 5000 (default 50); 0+ |

```http
GET /users?goal=lose_fat&active=7d&sort=last_active_desc&limit=2
```
```json
{
  "total": 3, "limit": 2, "offset": 0,
  "rows": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Ana", "email": "ana@example.com", "phone": "+96170123456",
      "gender": "", "age": 32, "age_group": "25_34",
      "goal": "lose_fat", "activity_level": "moderate", "train_location": "gym", "timeline_months": null,
      "streak": 1, "onboarding_done": false,
      "created_at": "2026-10-01T15:50:12.939+00:00", "last_active_at": "2026-10-01T15:50:12.939+00:00"
    }
  ]
}
```
`streak` uses the app's rule (done workout +1, a missed past training day resets, rest days neutral) on the plan's week; moved days are not considered.

### GET /users.csv

Same filters (no paging, up to 5000 rows). Downloads `built-users-<date>.csv`
(UTF-8 with BOM, CRLF). Columns:
`name,email,phone,gender,age,age_group,goal,activity_level,train_location,timeline_months,streak,onboarding_done,created_at,last_active_at`.
Cells starting with `= + - @` (except plain phone numbers) are prefixed with `'`.
Download it with `fetch` (the token is a header) and save the blob:

```js
const res = await fetch(BASE + '/users.csv?' + new URLSearchParams(filters), { headers: { 'x-admin-token': token } });
const url = URL.createObjectURL(await res.blob());
Object.assign(document.createElement('a'), { href: url, download: 'built-users.csv' }).click();
```

### GET /users/:id

```json
{
  "profile": {
    "id": "1111…", "name": "Ana", "email": "ana@example.com", "phone": "+96170123456",
    "age": 32, "age_group": "25_34", "gender": "female", "birth_date": "1994-05-05",
    "height_cm": 165, "weight_kg": 68, "goal": "lose_fat", "timeline_months": 3, "target_weight_kg": 63,
    "activity_level": "moderate", "job_activity": "desk", "sleep_hours": 7,
    "train_location": "gym", "equipment": [], "equipment_other": "", "training_days": [1,2,3,4,5,6], "training_time": "evening",
    "diet_type": "none", "allergies": [], "allergies_other": "", "dislikes": "", "injuries": "", "injury_areas": [], "conditions": [],
    "kcal_target": 1810, "water_target": 8, "timezone": "Asia/Beirut",
    "quiet_hours_start": "22:00:00", "quiet_hours_end": "07:00:00",
    "waiver_version": "2026-10-01-draft", "waiver_accepted_at": "…", "guardian_name": "", "guardian_consent_at": null,
    "onboarding_step": "done", "onboarding_done_at": "…", "last_active_at": "…", "created_at": "…", "updated_at": "…"
  },
  "stats": {
    "streak": 1, "workouts_done": 1, "meals_done": 0, "food_logs": 0, "activities": 0, "activity_kcal_30d": 0,
    "checkins": 0, "coach_messages": 0, "checkins_due": { "weekly": true, "monthly": false }
  },
  "plan": { "kcal_target": 1810, "water_target": 8, "updated_at": "…", "version": 2, "recent_changes": [ { "at": "…", "instruction": "my knee hurts", "changes": "…", "kcal_target": 1810, "source": "ai" } ] },
  "weights": [ { "day": "2026-09-24", "kg": 68.4 } ],
  "activities": [ { "id": "…", "day": "2026-10-01", "kind": "padel", "label": "", "minutes": 60, "effort": "moderate", "kcal": 420, "source": "manual", "created_at": "…" } ],
  "checkins": [ { "id": "…", "kind": "monthly", "day": "…", "weight_kg": 67.5, "measurements": {}, "answers": {}, "ai_summary": "…", "plan_changes": {}, "created_at": "…" } ],
  "reports": [ { "id": "…", "category": "bug", "status": "new", "message": "Timer froze", "created_at": "…", "last_message_at": "…" } ],
  "timeline": [
    { "at": "2026-10-01T15:50:12.939+00:00", "kind": "signup", "label": "Signed up" },
    { "at": "2026-10-01T09:00:00+00:00", "kind": "workout", "label": "Workout done" }
  ]
}
```
`plan` is null when the person has no AI plan. `weights`: last 365 days,
oldest first. `timeline`: the last 100 events, newest first; `kind` is one
of `signup`, `onboarding`, `workout`, `meal`, `activity`, `weight`,
`checkin`, `report`, `coach` (coach messages are counted, never shown).
400 for a malformed id, 404 for an unknown one.

### GET /reports

Query: `status` (`new`, `in_progress`, `fixed`, or `open` = not fixed), `q`, `limit` (1 to 200, default 50), `offset`. Newest activity first.

```json
{
  "total": 1, "limit": 50, "offset": 0,
  "rows": [
    {
      "id": "44444444-4444-4444-8444-444444444444",
      "user_id": "1111…", "user_name": "Ana", "user_email": "ana@example.com",
      "category": "bug", "status": "new", "message": "Timer froze",
      "has_screenshot": true, "platform": "ios", "app_version": "0.2.0",
      "message_count": 1, "unread": true,
      "created_at": "2026-10-01T15:50:12.939+00:00", "last_message_at": "2026-10-01T15:50:12.939+00:00"
    }
  ]
}
```
`message` is the first 300 characters. `unread`: the person wrote something the admin hasn't opened.

### GET /reports/:id

Marks the report read for the admin.

```json
{
  "report": {
    "id": "4444…", "user_id": "1111…", "category": "bug", "status": "new", "message": "Timer froze",
    "screenshot_path": "1111…/4444….jpg", "platform": "ios", "app_version": "0.2.0",
    "created_at": "…", "updated_at": "…", "last_message_at": "…"
  },
  "user": { "id": "1111…", "name": "Ana", "email": "ana@example.com", "phone": "+96170123456" },
  "messages": [ { "id": "…", "author": "user", "body": "Still frozen", "created_at": "…" } ],
  "screenshot_url": "https://<project-ref>.supabase.co/storage/v1/object/sign/report-screenshots/…?token=…"
}
```
`screenshot_url` is null without a screenshot and expires after 10 minutes (fetch the detail again to refresh).

### POST /reports/:id/reply

```http
POST /reports/4444…/reply
{ "body": "Fixed in the next update.", "status": "fixed" }
```
```json
{
  "message": { "id": "cbe7…", "report_id": "4444…", "user_id": "1111…", "author": "admin", "body": "Fixed in the next update.", "created_at": "…" },
  "status": "fixed",
  "pushed": 1
}
```
`status` is optional (`new`, `in_progress`, `fixed`). The person gets a push
("BUILT support replied") unless they turned report replies off; during
their quiet hours it arrives silently. `pushed` = devices reached (0 is
normal when they have no push token).

### POST /reports/:id/status

```http
POST /reports/4444…/status
{ "status": "in_progress" }
```
```json
{ "id": "4444…", "status": "in_progress", "user_id": "1111…" }
```

## 12. Limits

Per person per UTC day; over the limit the function answers 429
`limit_reached` with a message naming the limit.

| Kind | Limit | Counted by |
| --- | --- | --- |
| Coach messages | 60 | `coach_messages` |
| Plans and change requests | 8 | `ai_usage.plan` |
| Food photos | 30 | `ai_usage.meal_photo` (shared with `analyze-meal`) |
| Typed food and follow-up answers | 60 | `ai_usage.food_text` |
| Meal swaps | 30 | `ai_usage.meal_swap` |
| Meals from what I have | 20 | `ai_usage.meal_generate` |
| Photo estimates | 6 | `ai_usage.body_analysis` |
| Monthly check-in reviews | 6 | `ai_usage.checkin` |

Sizes: food photo 1.8 MB (app) / 2.5 MB base64 (server); body photo 6 MB;
screenshot 6 MB; coach message 800 characters; report 4000.
