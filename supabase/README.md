# VITAL backend = Supabase

The app talks **directly to Supabase Postgres** — there is no custom REST API.
Accounts (signup/login) are Supabase Auth, handled inside the app. The **only
keyed service is the AI coach**, and its key lives server-side in an Edge
Function — never in the app.

## 1. Create the project (~5 minutes)

1. Go to [supabase.com](https://supabase.com) → **New project** (free tier is fine).
2. Pick a name (e.g. `vital`), a password for the DB, and a region near you.

## 2. Create the tables

Dashboard → **SQL Editor** → New query → paste all of
[`schema.sql`](./schema.sql) → **Run**.
You should see "Success. No rows returned" — that's correct.

Already ran an earlier version? Just run the file again — every statement is
idempotent (`if not exists`), so it safely adds the newer columns
(height/age/gender) without touching your data.

## 3. Deploy the AI coach function

```bash
npm install -g supabase        # once
supabase login
supabase functions deploy coach --project-ref YOUR-PROJECT-REF
```

The function works **without any AI key** — it answers with built-in coaching
rules. To enable real AI:

```bash
supabase secrets set OPENAI_API_KEY=sk-...   # or any OpenAI-compatible key
```

## 4. Point the app at your project

Dashboard → Settings → **API** → copy the **Project URL** and **anon public key**.

```bash
cd mobile
cp .env .env
# edit .env with your URL + anon key
```

Then restart Expo (`npx expo start -c`). That's it — signup/login inside the
app now creates real accounts, and every check-off, glass of water, weight
entry and coach chat is stored in *your* database.

## What lives where

| Thing | Where |
| --- | --- |
| Accounts & sessions | Supabase Auth (`auth.users`) |
| Profile (name, height, age, gender, targets) | `profiles` |
| Workout/meal check-offs + set log | `plan_days` |
| Water glasses per day | `water` |
| Weight entries | `weights` |
| Coach chat history | `coach_messages` |
| AI key | Edge Function secret only |

Every table is locked with row-level security: users can only ever read and
write their own rows, enforced by the database, not the app.
