# FinatriX audit and fixes — 10 September 2026

This audit covers the existing React application and its live domain, https://finatrix.co. The workspace contained extensive pre-existing modifications and new files; those were preserved. This report distinguishes the changes made during this audit from that earlier work.

## Fixes delivered

| Area | Reproduced or inspected defect | Resolution |
| --- | --- | --- |
| Document security | Mammoth resolved to `@xmldom/xmldom@0.8.13`, with newly reported high-severity parsing vulnerabilities. | Updated the locked dependency to 0.8.15. The production dependency gate passes. [Upstream advisory](https://github.com/advisories/GHSA-93r5-fhx6-vmg9). |
| Development dependencies | High-severity advisories affected brace-expansion, js-yaml, and nanoid. | Updated the affected transitive packages within their existing compatible version ranges. |
| Score readability | The small coloured score badge failed WCAG text contrast. It also caused the command-palette page audit to fail because the underlying page remains present. | Kept the grade tint and border, and used the theme's high-contrast text colour for the label. Scores and grade thresholds are unchanged. |
| Market navigation | “Change your market” used decorative gold that failed contrast on light backgrounds. | Switched to the accessible accent text token. |
| Malformed links | A URL such as `/pricing#%E0%A4%A` threw `URIError` from scroll restoration and could take down the app. | Invalid percent encoding now falls back to a literal fragment. A regression test failed before this fix and passes after it. |
| Invalid tool URLs | The tool registry accepted inherited object properties such as `__proto__` and `constructor` as if they were tool components. | Only own entries can resolve to a tool. Invalid paths use the existing fallback. |
| Breadcrumbs | Home and FinatriX both linked to `/`, even inside the Careers and money workspaces. | Workspace breadcrumbs link to Money tools or Careers; top-level pages have a direct Home → page trail. |
| Spreadsheet memory safety | A small compressed workbook could expand without a memory ceiling before the row limit was applied. | Enforced expanded XML limits before and during decompression, plus archive-entry and directory bounds. |
| Spreadsheet data loss | More than 20,000 rows or 64 cells were silently truncated. A sparse cell beyond column 64 could be appended under the wrong header. | Oversized sheets produce an actionable error instead of a partial or shifted import. |
| Spreadsheet fidelity | The reader picked the lowest-numbered sheet filename, rather than the first workbook tab, and ignored the 1904 date system. | Followed the workbook relationship for the first tab and respected its date system. Amounts remain numeric; no calculator formula changed. |
| Damaged spreadsheets | Truncated directories, duplicate entries, mismatched sizes, and invalid compression could result in obscure errors or incomplete reads. | Added bounded validation and readable errors; external worksheet relationships are rejected. |
| Release checks | An obsolete lint suppression caused the zero-warning release gate to fail. The test setup also emitted false `scrollTo` errors. | Removed the obsolete suppression and corrected the jsdom scroll shim. |
| Deployment reliability | The deployment workflow could publish while the independent browser-test workflow failed. | Added browser/accessibility checks before Cloudflare publishing, with the real build-time configuration preserved. |

No financial formulas, scoring calculations, financial assumptions, calculator purposes, or educational logic were changed in this audit. Spreadsheet dates and worksheet selection were corrected at the file-import boundary. The existing calculator parity suites pass.

## Verification

| Check | Result |
| --- | --- |
| Initial unit suite | 2,714 passed; 15 pre-existing skips |
| Final unit suite | 2,733 passed across 168 files; 15 pre-existing skips |
| New regression coverage | 19 tests covering spreadsheet safety/fidelity and navigation |
| Type-check and production build | Passed |
| Lint with zero warnings | Passed |
| Production dependency gate | Passed, with the existing export-only xlsx exception described below |
| Initial desktop/mobile browser suite | 987 passed; 13 failures, all attributable to the two contrast defects above |
| Final desktop/mobile browser suite | 1,000 passed, zero failures |
| Account-entry and navigation browser checks | 16 passed: light/dark login, signup, recovery and invalid-link handling on desktop/mobile |
| Deployment configuration tests | 50 passed; updated workflow also parses successfully |
| Cloudflare deployment dry run | Passed |
| Live domain checks | 145 sitemap URLs returned correctly and self-canonicalised; HTTPS/www redirects, HSTS, robots, JSON-LD, icons, share image and real 404 passed |
| Live backend checks | All 10 required database relations present; analytics ingest returned 204; function-source comparison stalled and was stopped, so source parity is unverified |
| Live auth configuration | Frontend configuration present; login/recovery landing URLs and five browser-facing functions' CORS checks passed |

The browser suite covers public pages, WCAG 2.2 AA automated rules, desktop/mobile layouts, narrow-screen overflow, command-palette keyboard navigation, transaction add/edit/delete/undo/persistence, net worth, offline behaviour, and initial-load asset budgets. It is not a claim that all possible user journeys were exercised.

## Remaining limits and risks

- A signed-in test account and controlled billing/provider fixtures are needed to verify actual account creation, email delivery, cross-device sync, live job-provider results, AI responses, checkout, subscription provisioning, and cancellation end to end. Configuration and mock-backed unit tests do not establish those outcomes.
- Automated accessibility scans do not replace VoiceOver/NVDA testing or native Safari/Firefox checks. This browser suite uses Chromium, including mobile emulation.
- The 15 skipped tests remain visible and were not converted to passes. They include intentionally disabled feature tests and an environment-specific check.
- The locked `xlsx@0.18.5` still has a known high-severity advisory. Its vulnerable reader is not used: exports use its writer, and a regression guard prohibits adding reader calls. The separate import reader does not use SheetJS. This is an explicit existing exception, not a claim of zero dependency advisories.
- Two moderate development-only advisories remain in Vitest and its mocker. Removing them requires a major-version migration; the app's production bundle does not include the test runner.
- Market assumptions and FX baselines are dated June 2026. They were preserved under the engineering charter. The existing stale-rate messaging remains; fresh financial assumptions need an explicitly reviewed update.
- There is no defensible “zero bugs forever” guarantee. The meaningful result is fixed known defects, passing stated checks, and a release gate that prevents those defects returning unnoticed.

## Suggested upgrades, in priority order

1. **Add a staging environment and complete account/payment journeys.** Use dedicated test users, Stripe test mode, repeatable job/AI responses, and two browser sessions for sync conflict tests. Require these checks before releases.
2. **Refresh financial reference data through a reviewed process.** Store sources, effective dates and review dates for each market; separate live FX data from educational assumptions. Keep historical scenarios reproducible.
3. **Improve homepage clarity.** Replace the ambiguous ParkSmart “Smart parking made simple” description with language about idle cash, reconcile India-only copy with the four-market offering, and state clearly which finance features are free and which Careers plans are paid.
4. **Reduce the reading burden below calculators.** Keep methodology available, but prioritise a few related guides and offer a clearly labelled expansion for the full list. Check completion rates and reading behaviour with privacy-preserving events.
5. **Retire the remaining dependency exceptions.** Evaluate a maintained spreadsheet exporter with representative export fixtures, and migrate Vitest separately so its major-version changes receive focused validation.
6. **Expand release evidence.** Add Safari/Firefox runs, manual screen-reader checks, signed-in Careers accessibility scans, measured field performance, and alerting for material error-rate or sync failures.
7. **Keep releases reproducible.** Commit reviewed source changes, retain a version identifier and rollback reference with each deployment, and bound backend-verification commands so a network stall cannot leave a release check running indefinitely.

## Release record

Status: published successfully to both finatrix.co and www.finatrix.co; post-deployment domain checks passed on 11 September 2026. Source and workflow changes remain in the local working tree; the workflow gate reaches GitHub when those changes are committed and pushed.

Previous Cloudflare version: `f2b649d4-083b-4b1d-ba75-a0572ec8020a` (100% deployment before this audit).

Deployed Cloudflare version: `7cdcb186-64de-4b70-816d-fba13d3fcc2b`.

The live entry asset `/assets/index-xpyHRpN0.js` matches the locally tested production build. All 145 live sitemap URLs and the remaining production verification checks passed after deployment. Live browser inspection also confirmed the corrected Money tools breadcrumb and readable score badge.
