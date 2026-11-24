# Starting Phases 2 and 3 (any Claude account)

How to pick up the build plan in [BUILD_PHASES.md](BUILD_PHASES.md) from a fresh Claude Code session, on this or another Claude account. Written 24 Nov 2026, after Phase 1 ([PR 25](https://github.com/Finatrix/finatrix-kimi-agent/pull/25)).

## 1. Once, before the first step

1. **Review and merge PR 25.** Steps 2.1, 2.3 and 3.2 build on it, and it is what puts these docs on `main`. Merging deploys, so check it first.
2. **Before `git pull` in the main checkout,** delete the untracked copies of `docs/BUILD_PHASES.md` and `docs/NEW_FEATURES.md` in `/Users/hrishikks/Downloads/app/docs/`. The merged versions are newer, and git refuses to pull over untracked files with the same names.
3. **Same Mac, other account:** everything under `~/.claude` (global `CLAUDE.md`, skills, memory) and the CLI logins (`gh`, `wrangler`, `supabase`) are shared, because they belong to the macOS user, not the Claude account. Just sign in.
4. **Different machine:** clone the repo and copy over `.env` (never commit it), `~/.claude/CLAUDE.md`, `~/.claude/skills/task-router` and `task-estimator`, and the project's `.claude/agents/` and `.claude/skills/route/` (untracked today). Then log in to `gh`, `wrangler` and `supabase`. The native steps (3.1, 3.3, 3.4, 3.8) also need Xcode and Android Studio.
5. **Add the project settings in section 2.** Optionally commit `.claude/agents/` and `.claude/skills/route/`, so every worktree and machine gets the cheap helper agents and the `/route` skill.

## 2. Settings for the best output

**Model and effort** (the model picker in the app, or `/model`):

| Steps | Model | Effort | Why |
| --- | --- | --- | --- |
| 2.1, 2.2, 2.3, 2.4, 2.5, 2.8 | Opus 5.5 | High | Money maths, security (RLS, edge functions), shared state |
| 3.1, 3.2, 3.3, 3.4, 3.7, 3.8, 3.9 | Opus 5.5 | High | Native code (Swift and Kotlin), the AI's action boundary |
| 3.6 | Opus 5.5, then Sonnet 5.5 | High | Opus builds the translation system; Sonnet can sweep strings |
| 2.6, 2.7, 3.5 | Sonnet 5.5 | High | Mostly UI on existing maths; much cheaper |

Use Max effort only when a step is stuck. Run `/route <task>` at the start of a step: it picks files, helpers and model cheaply.

**Permission mode:** "Accept edits" plus the allowlist below. Don't use bypass mode: merging or deploying by accident ships to production.

**`.claude/settings.json`** (shared and committed, so both accounts and every worktree get it):

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "model": "opus",
  "permissions": {
    "allow": [
      "Bash(npm run build:*)",
      "Bash(npm test:*)",
      "Bash(npm run lint:*)",
      "Bash(npm run test:e2e:*)",
      "Bash(npm run audit:prod:*)",
      "Bash(npx vitest run:*)",
      "Bash(npx playwright test:*)",
      "Bash(npx tsc -b:*)",
      "Bash(npx eslint:*)",
      "Bash(node scripts/design-audit.mjs:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git worktree list:*)",
      "Bash(gh pr view:*)",
      "Bash(gh pr checks:*)",
      "Bash(gh pr list:*)"
    ],
    "deny": [
      "Bash(gh pr merge:*)",
      "Bash(git push origin main:*)",
      "Bash(wrangler deploy:*)",
      "Bash(npx wrangler deploy:*)",
      "Bash(supabase db push:*)",
      "Bash(npx supabase db push:*)",
      "Bash(supabase functions deploy:*)",
      "Bash(npx supabase functions deploy:*)",
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

The deny list keeps merges, deploys and production SQL with you, and keeps secrets out of transcripts. When a step really needs one of those, run it yourself or allow it once.

**Habits that matter more than any setting:**

- **One step per fresh session.** Every message re-reads the whole conversation. The Phase 1 session reached 530k tokens of context, so late messages were very expensive.
- **Run long checks in the background into a log** and read only the summary lines.
- **Two accounts can work at once,** but never on two steps that edit the same files (see section 5).

## 3. The starter prompt

Open a fresh Claude Code session on `/Users/hrishikks/Downloads/app`, pick the model from section 2, and paste this with the step number filled in:

```text
Build step <X.Y> from docs/BUILD_PHASES.md.

Read first: that step's brief and the "Rules for every step" at the end of docs/BUILD_PHASES.md, the feature's section in docs/NEW_FEATURES.md (including Decided), docs/PHASES_2_3_START.md section 4, and the project CLAUDE.md. Check git status and git worktree list for other editors, then work in a new worktree on a branch named feat/<short-name>. Copy .env from /Users/hrishikks/Downloads/app into the worktree before any build, and never commit it.

If the brief says "Decide first", or says new maths must be agreed, stop after reading and ask me those questions with your recommendation before writing any code. Write any new maths into the PR description before coding it.

Done when: the step's "Done when" list is met; npm run build, npm test, npx eslint ., npm run test:e2e (all three Playwright projects, run with FX_ALLOW_UNCONFIGURED_BUILD=1 VITE_ANALYTICS_URL=) and npm run audit:prod pass; node scripts/design-audit.mjs is clean against npx vite preview --port 4319; and one PR is open against main with the step ticked in docs/BUILD_PHASES.md and its PR link added. Do NOT merge: merging to main deploys to production.

If you get close to the usage limit, commit and push to the branch, and list what is left in the PR description so the next session (maybe on another account) can carry on from the docs alone.
```

Add the line for the step from this table:

| Step | Wait for | Extra line to add |
| --- | --- | --- |
| 2.1 | PR 25 merged | Also ask me whether to build the budget screen's "Includes ₹X from the trip" line (noted under 2.1). Build Hide amounts into `cfmt`/`cfmtSh` in src/tools/lib/format.ts first, then sweep the screens that format amounts themselves. |
| 2.2 | — | Test the migration on PGlite and every policy with a self-rolling-back probe, test the edge function under Deno (no Docker on this Mac), and run a security review. SQL reaches production only through the documented recipe (dry run first), after my yes. |
| 2.3 | 1.2 and 2.2 merged, 2.2's SQL live | Before testing any write, agree a safe two-user test setup with me. Never test against real accounts. |
| 2.4 | 2.3 | Write the split maths and the leftover-paise rounding rule in the PR and get my agreement before coding. |
| 2.5 | 2.4 | Reuse 2.4's split maths; do not write a second version. |
| 2.6 | — | Decide first with me: one daily summary (suggested) or a reminder per bill. Android notifications need isExactNotification: false. |
| 2.7 | — | Canvas cannot read CSS var(): resolve colours before drawing. Amounts are hidden by default in the shared image. |
| 2.8 | 2.6 | Write the 30–90 day projection maths in the PR and get it agreed first; always label it an estimate. |
| 3.1 | — | Check each language on real phones and fall back to typing where one is missing. Voice must sit behind the existing AI consent (fx_ai_consent). |
| 3.2 | 3.1, PR 25 | The AI fills in only what I said; the app does all maths; every write gets a confirm card and an undo. Travel entries go through spendMoney in src/tools/lib/trips.ts. |
| 3.3 | — | Both share paths go through the existing screenshot import (src/tools/lib/import/) and its review step. Receipt photos are read on the device. |
| 3.4 | 2.1 | Decide first with me: show the amount on the lock screen by default, or only after I turn it on. |
| 3.5 | 3.3 | Decide first with me: device-only to start (suggested), or synced photos. |
| 3.6 | No other UI step open | Decide first with me which languages ship first. Build the translation system before adding any language. |
| 3.7 | 3.2 | Same consent and grounding rules as the cloud AI, with the cloud AI as the fallback. |
| 3.8 | 3.4 | — |
| 3.9 | 3.2, 2.4 | Split into one PR per feature if it grows past one session. |

## 4. What Phase 1 taught (not yet in BUILD_PHASES.md)

- **Service worker:** `public/sw.js` serves every same-origin GET stale-while-revalidate, except navigations, build assets, `/healthz` and now `/api/`. Keep new Worker routes under `/api/`.
- **Playwright and the service worker:** `page.route` cannot stub a request that passes through the service worker. A spec that stubs the network needs `test.use({ serviceWorkers: 'block' })`.
- **No Worker in dev or preview:** `vite` and `vite preview` have no Worker, so `/api/fx/latest` answers 204 there (`noWorkerFeed` in vite.config.ts). A new Worker route needs the same, or the public-crawl e2e fails on the 404's console error.
- **React Compiler lint:** `react-hooks/preserve-manual-memoization` fails when a `useMemo` or `useCallback` depends on an object rebuilt every render. Derive such values inside one `useMemo`.
- **Component exports:** component files may export only components (`react-refresh` lint). Put helpers in lib files.
- **Category keys:** the Expense Tracker's categories come from Budget Builder (`utilities`, `subscriptions`, `eating_out` and so on), not the old `ET_CATS` keys. Old keys resolve with `migrateCategory`.
- **Calls from the apps:** the installed apps load pages from the phone, so a call to the Worker must use `PUBLIC_ORIGIN` (see `feedUrl` in src/tools/lib/fxLive.ts). CSP `connect-src` already allows `https://finatrix.co`.
- **Reuse, don't rebuild:**
  - `ToolSheet` (src/tools/ui/ToolSheet.tsx) for any sheet.
  - `spendMoney` and `tripDefaults` (src/tools/lib/trips.ts) for anything in another currency.
  - `effectiveRates` and `ratesAsOf` (src/tools/lib/fx.ts) for rates. Never call the rate source directly.
  - Toast kinds are `info`, `error` and `ok`.
- **Known false alarms:** in a worktree, `npm test` shows 2 false pdfjs failures (`uploadParsingHardening.test.ts`).

## 5. Two accounts at once

Steps that can run side by side because they touch different files:

| Account A (app UI) | Account B (server, native, independent) |
| --- | --- |
| 2.1 → 2.3 → 2.4 → 2.5 | 2.2, then 2.6 → 2.8, then 2.7 |
| 3.4 → 3.8 | 3.1 → 3.2 → 3.7 |
| 3.5 (after 3.3) | 3.3 |
| 3.6 last, alone | 3.9 last |

Merge each PR before starting a step that waits for it.
