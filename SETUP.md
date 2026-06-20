# FinatriX — Setup & Deployment Guide

This is the FinatriX site: the animated dark landing page **plus** the full 7‑tool
finance suite, now merged into one app with **real user accounts**. When a visitor
signs in, everything they enter in the tools (budgets, expenses, plans) is saved to
their account and follows them to any device or browser.

- **Design & animation:** the original landing page (dark, gold, WebGL/GSAP).
- **Tools & features:** all 7 tools, keeping their light "Apple" look exactly.
- **Backend:** [Supabase](https://supabase.com) — email/password auth with email
  verification + a per‑user database row (secured with Row Level Security).

Without a backend configured the site still runs: the tools work and save **on the
device only** (guest mode). Add the two keys below to turn on real accounts.

---

## 1. Create the free backend (Supabase)

1. Go to https://supabase.com → sign in → **New project**. Pick a name and a strong
   database password, choose a region near your users, and create it.
2. When it's ready, open **Settings → API** and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string — this is the safe, public key)
3. Open **SQL Editor → New query**, paste the contents of
   [`supabase/schema.sql`](./supabase/schema.sql), and click **Run**. This creates
   the `tool_data` table that stores each user's data securely.
4. (Email verification) Go to **Authentication → Providers → Email** and make sure
   **"Confirm email"** is ON. New users will get a verification link before they can
   sign in. For going live, also add your real site URL under
   **Authentication → URL Configuration → Site URL / Redirect URLs**.

## 2. Add your keys to the app

Copy `.env.example` to `.env` in the project root and fill in the two values:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
```

> The anon key is meant to be public in a browser app — never use the `service_role`
> key here.

## 3. Run locally

```
npm install
npm run dev
```

Open the printed URL. Try: create an account → verify via the email → sign in →
open the tools, enter some data, then sign in on another browser to see it sync.

## 4. Deploy (Netlify)

This repo already includes `netlify.toml` (build command, `dist` output, and the
SPA redirect so routes like `/tools` and `/login` work).

1. Push the repo to GitHub and "Add new site → Import" in Netlify
   (or run `netlify deploy`).
2. In Netlify → **Site settings → Environment variables**, add the same two
   variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Deploy. Then add your Netlify URL to Supabase's allowed redirect URLs (step 1.4).

Any static host that supports SPA fallback (Vercel, Cloudflare Pages, etc.) works
too — just set the same two environment variables and add an SPA redirect to
`index.html`.

---

## How it fits together

| Area | Where |
| --- | --- |
| Landing page (dark, animated) | `src/sections/*`, `src/pages/Home.tsx` |
| Auth screens (sign in / up / profile) | `src/pages/{Login,Signup,Profile}.tsx`, `src/components/AuthShell.tsx` |
| Auth state + session | `src/context/AuthContext.tsx` |
| Supabase client | `src/lib/supabase.ts` |
| The 7 tools (markup/CSS/logic) | `src/tools/{toolsMarkup.ts,tools.css,toolsEngine.js}` |
| Tools page + account bar | `src/pages/ToolsPage.tsx` |
| Cloud save / sync layer | `src/tools/fxStore.ts` |
| Database schema | `supabase/schema.sql` |

**Data sync model:** the tools read/write through a small store that keeps data in
memory, mirrors it to the browser, and (when signed in) saves it to your Supabase
row a moment after each change. On sign‑in, the app loads your saved data so it
appears on whatever device you're using.

> The unused starter UI kit under `src/components/ui/` is excluded from the build
> (see `tsconfig.app.json`) and can be deleted entirely if you like.
