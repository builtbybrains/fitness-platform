# BUILT backend: Supabase

The app talks to Supabase Postgres directly for its own rows and calls Edge
Functions for AI and server-side work. Accounts (sign up, sign in) are
Supabase Auth, handled inside the app. The admin dashboard has its own
login, checked by the `admin` Edge Function. Every request shape, response
and error is in [`docs/API.md`](../docs/API.md).

## 1. Create the project (about 5 minutes)

1. Go to [supabase.com](https://supabase.com) and choose **New project** (the free tier is fine).
2. Pick a name (for example `built`), a database password, and a region near your users.

## 2. Create or update the tables

Dashboard → **SQL Editor** → **New query** → paste all of
[`schema.sql`](./schema.sql) → **Run**. You should see "Success. No rows
returned".

`schema.sql` is the whole schema and it is safe to run again at any time, on a
new or an existing project: tables, columns, indexes, constraints, policies,
functions, triggers and storage buckets are created only when missing or
replaced in place, and it never deletes data. Run it again after every
change to this file. (New check constraints are added `NOT VALID`: they
apply to every new or edited row without failing on an old row that
predates them.)

### Storage

The script creates two private buckets and their per-person folder rules:
`body-photos` (progress photos, face blurred on the phone) and
`report-screenshots`. If the output shows the warning "Storage setup
skipped", create them by hand: Dashboard → **Storage** → **New bucket** →
name `body-photos`, leave **Public bucket** off → **Create**; repeat for
`report-screenshots`; then run `schema.sql` again so the folder rules are
added.

## 3. Set the admin login

The dashboard at `/admin/` has one fixed, hidden username and password,
checked in the database (stored as a bcrypt hash, never in the page).
Dashboard → **SQL Editor** → **New query** → run (with your own values):

```sql
select public.admin_set_credentials('choose-a-username', 'a long password, 12 characters or more');
```

Run it again to change either; that also signs out every admin session and
clears lockouts. Five wrong passwords from one address lock that address
for 15 minutes (twenty from anywhere lock every login). Nobody can call this
function from the app or the website; only the SQL Editor (and the service
role) can.

## 4. Deploy the Edge Functions

Install the Supabase CLI once and log in:

```bash
npm install -g supabase
supabase login
```

Then, from the repo root (your project ref is the `xxxx` in
`https://xxxx.supabase.co`):

```bash
supabase functions deploy planner       --project-ref YOUR-PROJECT-REF
supabase functions deploy coach         --project-ref YOUR-PROJECT-REF
supabase functions deploy meals         --project-ref YOUR-PROJECT-REF
supabase functions deploy analyze-meal  --project-ref YOUR-PROJECT-REF
supabase functions deploy body-analysis --project-ref YOUR-PROJECT-REF
supabase functions deploy checkin       --project-ref YOUR-PROJECT-REF
supabase functions deploy admin --no-verify-jwt --project-ref YOUR-PROJECT-REF
```

`admin` must be deployed with `--no-verify-jwt` (also set in
[`config.toml`](./config.toml)): the dashboard is not a Supabase user and
sends its own session token instead. Every other function requires a
signed-in person. The shared code in `functions/_shared/` is bundled into
each function automatically; redeploy a function after changing it or
`_shared/`.

| Function | What it does | Daily limit per person |
| --- | --- | --- |
| `planner` | Builds the weekly training and meal plan from the questionnaire, the photo estimate and coach memory; applies change requests ("my knee hurts") and says what changed | 8 |
| `coach` | AI coach chat with memory; saves new facts, suggests plan changes | 60 messages |
| `meals` | Food from a photo or typed text (asks follow-up questions), meal swaps, meals from what you have | 30 photos, 60 typed, 30 swaps, 20 meals |
| `analyze-meal` | v1 photo estimate, kept for app builds already installed | shares the 30 photos |
| `body-analysis` | Rough starting point from face-blurred body photos | 6 |
| `checkin` | Weekly weigh-ins; monthly check-ins review progress and update the plan | 6 monthly reviews |
| `admin` | The dashboard's API (login, overview, users, CSV, reports, replies) | n/a |

Over a limit a function answers HTTP 429 with a message the app shows as
is. Days are UTC days. All app functions run with the signed-in person's
own token, so row-level security applies to everything they read and
write. Only `admin`, the push sender and the settings lookup use the
service role, which Supabase provides to functions automatically.

### AI key and models

The AI runs on OpenRouter's free models by default. Set the key as a
function secret:

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-...   # OpenRouter (any model), or
supabase secrets set OPENAI_API_KEY=sk-...          # OpenAI directly
```

If secrets can't be set (for example from a deploy tool without access to
them), put the same values in the `app_config` table instead. Dashboard →
**SQL Editor** → run:

```sql
insert into public.app_config (key, value) values ('OPENROUTER_API_KEY', 'sk-or-...')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

A secret wins over `app_config` when both are set. Nobody can read
`app_config` from the app or the website; only the functions can. Changes
are picked up within a minute.

Optional model overrides (secret or `app_config`, same keys):

| Key | Used by | Value |
| --- | --- | --- |
| `AI_MODEL` | planner, coach, meals (text), check-in | one model id or a comma-separated list, tried in order |
| `VISION_MODEL` | meals (photo), analyze-meal, body-analysis | the same; models must accept images |

On OpenRouter the overrides are tried first and the built-in free models
follow as a fallback; on OpenAI the first override is the only model. The
free models are rate limited and sometimes disappear: when replies start
failing, set `AI_MODEL` / `VISION_MODEL` in `app_config` to currently
available free models (openrouter.ai/models, filter "free"), no redeploy
needed.

Without any key: `planner` builds a complete rules-based plan, `coach`
answers with built-in coaching rules, typed food and meal swaps use the
built-in food table and meal library, and photo estimates, body analysis
and "meals from what you have" answer "not set up yet".

Errors are never sent to the app in detail; read them in Dashboard →
**Edge Functions** → pick the function → **Logs**.

### Push notifications

Admin replies to a problem report and "plan updated" after a monthly
check-in go out through the Expo push service; no key is needed on the
server. The app can only register for push in a development or production
build with an EAS project id in `mobile/app.json` (`expo.extra.eas.projectId`,
added by `eas init`).

### Health safety

Every AI prompt carries the safety rules: never below 1200 kcal a day
(women) or 1500 kcal (men or not given), see a doctor or dietitian for
diabetes, pregnancy, an eating disorder, a heart condition or kidney
disease, never diagnose, stop and get help for chest pain or fainting. The
same numbers are enforced in code (`functions/_shared/rules.ts`): the
calorie floor, never below resting energy × 1.1 when losing weight, a
deficit of at most 25%, and a safe pace (at most 1% of body weight a week of
loss, 0.5 kg a week of gain). Under 13 can't sign up (the database refuses
the birth date). 13 to 17 need a guardian's consent and get maintenance
calories or more, no max-effort lifting (8+ reps, 3 in reserve, no advanced
lifts) and no supplements. No plan ever prescribes a load. Body-photo
estimates are ranges only, never about looks, never a diagnosis.

## 5. Point the app at your project

Dashboard → **Project Settings** → **API**: copy the **Project URL** and the
**anon** (publishable) key.

```bash
cd mobile
cp .env.example .env
# edit .env with your URL and anon key
npx expo start -c
```

Face detection and Apple Health / Health Connect need a development build
(`npx expo run:ios` / `npx expo run:android`, or EAS Build); they are
unavailable in Expo Go and on the web, and the app degrades gracefully.

## What lives where

| Thing | Where |
| --- | --- |
| Accounts and sessions | Supabase Auth (`auth.users`) |
| Profile and the whole questionnaire | `profiles` (one row per account, created by a trigger at signup) |
| Workout, set and meal check-offs per day | `plan_days` |
| Glasses of water per day | `water` |
| Body weight per day | `weights` |
| The active plan, targets and its change history | `ai_plans` |
| This week's moved days and exercise swaps | `plan_overrides` |
| Food logged (photo, typed, plan, generated) | `food_logs` |
| General activities and imported workouts | `activities` |
| Daily steps, active calories, sleep from health apps | `health_daily` |
| Body photos (files) | Storage bucket `body-photos`, rows in `body_photos` |
| Photo estimates | `body_analyses` |
| Weekly and monthly check-ins | `checkins` |
| What the coach remembers | `coach_memory` |
| Coach chat history | `coach_messages` (people can read and add their own, not edit or delete, so the daily limit holds) |
| Problem reports and replies | `problem_reports`, `report_messages`, bucket `report-screenshots` |
| Push tokens | `push_tokens` |
| AI calls per person per day | `ai_usage` (people can read their own counts; only `bump_ai_usage` changes them) |
| Website contact form messages | `contact_messages` |
| AI keys and model choice | Edge Function secrets, or `app_config` |
| Admin login, sessions, attempts, lockouts | `admin_credentials`, `admin_sessions`, `admin_login_attempts`, `admin_lockouts` |

Every table has row-level security. Signed-in people can only reach their
own rows, enforced by the database, not the app. People who aren't signed in
(the `anon` role) can reach nothing, with one exception: they can add a row
to `contact_messages`. `app_config` and the admin tables are reachable by
the service role only.

## Website contact form

Messages sent from the website land in **Table Editor → contact_messages**
(sort by `created_at`, descending, to see the latest first). Nobody
can read, change or delete them through the API; only you, in the dashboard.

For the website code: send a `POST` to
`https://YOUR-PROJECT.supabase.co/rest/v1/contact_messages` with headers
`apikey: <anon key>`, `Content-Type: application/json` and
`Prefer: return=minimal` (required: the anon role may add a row but not read
it back), and a JSON body with `name`, `email`, `message`, and optionally
`topic` and `source` (defaults to `website`). Only those five fields are
accepted. Limits: name 1 to 120 characters, a valid-looking email up to 254,
topic up to 120, message 1 to 5000, source up to 40. A success is HTTP 201
with an empty body.

## Device-only mode

If the app has no Supabase URL and key (or someone taps "Continue without an
account"), it runs without an account: everything is stored on that device
only and nothing is uploaded, then or later. The questionnaire, the plan
week, moving days, replacing exercises, activities and weekly weigh-ins all
work; AI features, body photos, problem reports and push need an account.
A signed-in person who loses connection keeps working too; their changes
are saved on the device and upload the next time the app reaches the
server.
