# BUILT backend: Supabase

The app talks directly to Supabase Postgres; there is no custom REST API.
Accounts (sign up, sign in) are Supabase Auth, handled inside the app. The
only keyed service is AI, and its key lives in the Edge Functions' secrets,
never in the app.

## 1. Create the project (about 5 minutes)

1. Go to [supabase.com](https://supabase.com) and choose **New project** (the free tier is fine).
2. Pick a name (for example `built`), a database password, and a region near your users.

## 2. Create or update the tables

Dashboard → **SQL Editor** → **New query** → paste all of
[`schema.sql`](./schema.sql) → **Run**. You should see "Success. No rows
returned".

`schema.sql` is the whole schema and it is safe to run again at any time, on a
new or an existing project: tables, columns, indexes, constraints, policies,
functions and the signup trigger are created only when missing or replaced in
place, and it never deletes data. Run it again after every change to this
file. (New check constraints are added `NOT VALID`: they apply to every new or
edited row without failing on an old row that predates them.)

## 3. Deploy the Edge Functions

Install the Supabase CLI once and log in:

```bash
npm install -g supabase
supabase login
```

Then, from the repo root, deploy each function (your project ref is the
`xxxx` in `https://xxxx.supabase.co`):

```bash
supabase functions deploy coach        --project-ref YOUR-PROJECT-REF
supabase functions deploy planner      --project-ref YOUR-PROJECT-REF
supabase functions deploy analyze-meal --project-ref YOUR-PROJECT-REF
```

The shared code in `functions/_shared/` is bundled into each function
automatically. Redeploy a function after changing it or `_shared/`.

| Function | What it does | Daily limit per person |
| --- | --- | --- |
| `coach` | AI coach chat; reads today's real stats and saves the conversation | 60 messages |
| `planner` | Builds the weekly training + meal plan and sets calorie/water targets | 5 plans |
| `analyze-meal` | Estimates calories and protein from a meal photo | 30 photos |

Over a limit the function answers HTTP 429 with a message the app shows as
is. Days are UTC days. All three run with the signed-in person's own token,
so row-level security applies to everything they read and write; none of
them uses the service-role key.

### AI key and models

```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-...   # OpenRouter (any model), or
supabase secrets set OPENAI_API_KEY=sk-...          # OpenAI directly
```

If both are set, OpenRouter wins. Optional model overrides:

```bash
supabase secrets set AI_MODEL=openai/gpt-4o-mini       # coach + planner
supabase secrets set VISION_MODEL=openai/gpt-4o-mini   # analyze-meal (must accept images)
```

On OpenRouter the override is tried first and the built-in free (`:free`)
models follow as a fallback; on OpenAI the override is the only model. The
free models are rate limited and sometimes unavailable, so set a paid model
here once one is chosen.

Without any key, `coach` answers with built-in coaching rules, `planner`
builds a rules-based plan from the person's stats, and `analyze-meal`
answers "Photo estimates aren't set up yet".

Errors are never sent to the app in detail; read them in Dashboard →
**Edge Functions** → pick the function → **Logs**.

### Health safety

The coach and planner prompts refuse diets under 1200 kcal a day (women) or
1500 kcal (men), send anyone who mentions diabetes, pregnancy, an eating
disorder, a heart condition, kidney disease or being under 18 to a doctor or
registered dietitian, and never diagnose. The planner also enforces the
calorie floor in code (and never goes below BMR × 1.1 for weight loss, or
below maintenance for under-18s), and never prescribes fixed loads: each
lift says "Choose a weight you can lift for every rep with 2 in reserve."

## 4. Point the app at your project

Dashboard → **Project Settings** → **API**: copy the **Project URL** and the
**anon** (publishable) key.

```bash
cd mobile
cp .env.example .env
# edit .env with your URL and anon key
npx expo start -c
```

Sign up inside the app to create a real account; every check-off, glass of
water, weight entry, photo log and coach message is then stored in your
database.

## What lives where

| Thing | Where |
| --- | --- |
| Accounts and sessions | Supabase Auth (`auth.users`) |
| Profile (name, height, age, gender, weight, targets) | `profiles` (one row per account, created by a trigger at signup) |
| Workout, set and meal check-offs per day | `plan_days` |
| Glasses of water per day | `water` |
| Body weight per day (Progress chart) | `weights` |
| Coach chat history, per conversation | `coach_messages` (people can read and add their own, not edit or delete, so the daily limit holds) |
| The active AI plan and targets | `ai_plans` |
| Meals logged from a photo | `food_logs` |
| AI calls per person per day (limits) | `ai_usage` (people can read their own counts; only the `bump_ai_usage` function changes them) |
| Website contact form messages | `contact_messages` |
| AI keys | Edge Function secrets only |

Every table has row-level security. Signed-in people can only reach their
own rows, enforced by the database, not the app. People who aren't signed in
(the `anon` role) can reach nothing, with one exception: they can add a row
to `contact_messages`.

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
only and nothing is uploaded, then or later. A signed-in person who loses
connection keeps working too; their changes are saved on the device and
upload the next time the app reaches the server.
