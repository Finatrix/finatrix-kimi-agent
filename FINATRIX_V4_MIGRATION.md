# FinatriX V4 — De-iframe Migration Report

**Workstream:** V4 Priority #1 — retire `tools-app.html`, rebuild every tool as native React, preserving every calculation, formula, validation, persistence key, cloud sync and auth flow.

**Branch:** `v4-react-tools-migration`
**Status:** ✅ Complete. TypeScript **0 errors** · ESLint **0 errors** · **518 tests passing** · production build **clean**.

---

## 1. What changed (and what did not)

The seven tools used to live in a single 3,212-line vanilla-JS file (`public/tools-app.html`) embedded in the React app through a sandboxed `<iframe>`. They are now **native React pages** that share the app's layout, components, design tokens, routing and state — there is no iframe and no separate tool application.

**Preserved exactly (zero changes):**
- Every financial calculation and formula (Budget 50/30/20, Expense stats/budget, InvestMatch annuity-due FV + horizon-aware risk, ParkSmart post-tax ranking, PeerCompare logistic percentiles, Goal Planner SIP + step-up binary search, LifeMap wealth/score/health simulation and decisions engine).
- Every `localStorage` key (`fx_expenses`, `fx_budget`, `fx_budgets`, `fx_bb_data`, `fx_currency`, `fx_lifemap`, `fx_investmatch`, `fx_parksmart`, `fx_peercompare`, `fx_goals`, `fx_last_tool`, `fx_last_uid`) — so existing users' saved data and cloud rows keep working untouched.
- Supabase auth, the RLS-protected `tool_data` JSONB row, and the pull/push cloud-sync logic (`src/tools/cloudSync.ts` is byte-for-byte the same; only its doc comment was updated).
- The V3 dark/gold design system, Geist fonts, ambient backdrop, glass cards, and the 40-currency system (Budget/Expense/LifeMap stay currency-aware; the other four stay INR — exactly as before).

**Improved:**
- One cohesive application — navigating to a tool is now an in-app route (`/tools/budget`, `/tools/expenses`, …), not an iframe boundary. The scroll/focus quirk at the old frame edge is gone (normal document flow).
- Route-level code-splitting: each tool is its own lazy chunk (Chart.js loads only when LifeMap is opened).
- A single design-token layer, single router, single component library — no duplicate CSS/JS/tokens.

---

## 2. New architecture

```
src/tools/
  ToolsLayout.tsx      Unified shell: app bar, tool nav, currency selector, mobile
                       drawer, and the cloud-sync bridge (seed on mount, debounced push).
  ToolsIndex.tsx       /tools → redirect to last-used tool (honours legacy #/tool links).
  ToolRoute.tsx        /tools/:toolId → renders the tool's React page.
  CurrencyContext.tsx  Reactive currency state (persists fx_currency; INR-only tools unaffected).
  cloudSync.ts         Unchanged pull/push to Supabase (SYNC_KEYS, RLS row).
  tools.css            V3 design tokens + primitives, scoped under `.fx-tools`.
  lib/                 Pure, typed ports of every calculation + data table:
    format, storage, month, budget, expense, investmatch,
    parksmart, peercompare, goals, lifemap
  ui/                  Shared components: Icon (SVG sprite), Toast (fxNotify),
                       MonthNav, PageHead, common.
  pages/               BudgetPage, ExpensePage, InvestMatchPage, ParkSmartPage,
                       PeerComparePage, GoalPlannerPage, LifeMapPage.
```

Routing (`src/App.tsx`): `/tools` is now a layout route (`ToolsLayout`) with an index redirect and a `:toolId` child. The old `#/budget` hash deep-links still resolve.

**Cloud-sync bridge detail:** the old design relied on the cross-context `storage` event the iframe fired. Native tools write in the same document, where that event doesn't fire — so the storage wrapper (`lib/storage.ts`) dispatches a `fx:write` event on every write, and `ToolsLayout` listens to both `fx:write` (same-tab) and `storage` (cross-tab) to trigger the identical debounced push. Sync behaviour is unchanged.

---

## 3. How "no calculation changed" is proven

Every tool has a **parity test** that extracts the ORIGINAL functions and data tables straight from the source and compares them, across an input grid, to the ported React implementation. The reference is never transcribed by hand — it is executed from the frozen original — so any divergence fails the build.

- **Data tables** (allocations, tax options, city benchmarks, career boosts, categories, currencies, …) are deep-equal-checked against the source constants.
- **Standalone formulas** (`psTax`, `gpSip`, `gpStepUp`, `pcPct`, `pcBracket`, `fmt/cfmt/cfmtSh`, LifeMap `calcWealth/Score/Health` + decisions engine) are extracted and compared value-for-value.
- **DOM-coupled renders** (Budget `bbUpdate`, Expense `etRender`, InvestMatch `imBuild`, ParkSmart `psCalc`, PeerCompare `pcCompare`, Goal `gpCalc`) are run in jsdom and their rendered figures compared to the ported output.

The frozen original is preserved as a test fixture at `src/test/parity/__fixtures__/original-tools-app.html`, so the parity guarantee is permanent and independent of the shipped app.

**Coverage:** 518 tests (up from 7) — e.g. 216 Budget combinations, 78 ParkSmart, 42 PeerCompare, 39 Goal, 21 LifeMap profile×decision×age sets, plus format, component and end-to-end routing tests.

---

## 4. Files to delete on your machine (sandbox couldn't remove them)

This environment cannot delete files, so a few now-dead files remain physically present but are **not referenced by the running app**. Please remove them when you merge:

```bash
git rm public/tools-app.html          # retired; its math is preserved in the test fixture
git rm public/vendor/chart.umd.js     # only tools-app.html used it; LifeMap now uses npm chart.js
git rm src/pages/ToolsPage.tsx         # old iframe host (stubbed to `export {}`)
git rm src/tools/ToolFallback.tsx      # transitional iframe fallback (stubbed to `export {}`)
```

Everything still builds and all tests pass with these present; deleting them is pure cleanup. (`chart.js` was moved from devDependencies to dependencies since LifeMap now imports it at runtime.)

---

## 5. Verify locally

```bash
npm install        # ensures chart.js is present as a dependency
npm run build      # tsc -b && vite build — must succeed
npm test           # 518 tests must pass
npm run dev        # click through /tools/budget … /tools/lifemap, guest + signed-in
```

---

## 6. Remaining V4 scope (not started — migration first, per plan)

Items 2–15 of the V4 brief are the next workstream and were intentionally deferred until the migration was complete and green: global-nav polish, first-run login modal, hero trust-strip (dynamic currency count), full decimal-input pass, the new Budget category set, PDF/Excel/CSV exports, local-time display, the a11y/perf/responsive audit, and final QA. The React foundation now makes each of these a contained, single-codebase change.
