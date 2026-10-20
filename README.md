# BUILT: Build your best.

BUILT is an all-in-one fitness and nutrition platform powered by AI coaching. This repository
holds three things:

| Folder | What it is | Read |
| --- | --- | --- |
| repository root (`src/`, `public/`) | the marketing website and the admin dashboard | below |
| `mobile/` | the Expo / React Native app | [`mobile/README.md`](mobile/README.md) |
| `supabase/` | database schema and the Edge Functions (AI coach, planner, meals, check-ins, admin, account deletion) | [`supabase/README.md`](supabase/README.md) |

The brand rules live in [`DESIGN.md`](DESIGN.md) and what the product does in
[`PRODUCT.md`](PRODUCT.md).

## The website

TanStack Start, React 19, Tailwind 4 and Vite. The home page is `src/routes/index.tsx`, the
shared design tokens are in `src/styles.css`.

```sh
bun install
bun run dev     # local preview
bun run build   # what Vercel runs (vercel.json)
```

Use bun: `npm install` fails on this project.

The early-access and contact form posts to the `contact_messages` table in Supabase.

## The admin dashboard

A static page in `public/admin/` (`index.html`, `admin.js`, `admin.css`), served at `/admin/`.
It talks only to the `admin` Edge Function; the login is checked on the server.

## Hosting

Vercel deploys every pushed branch: the `fitness-platform` project builds the website from
the repository root, and the `vital-app` project builds the app's web version from `mobile/`.
