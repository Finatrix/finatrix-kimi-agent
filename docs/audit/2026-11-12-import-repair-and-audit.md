# Expense Tracker import repair and engineering audit

12 November 2026 · released from branch `fix/expense-import-repair`, which is production `main` plus this work. The security-audit branch is not part of this release (see C8).

## A. Executive summary

**Overall health is good.** Before any change the merged tree was lint-clean, type-clean, built, and passed 4,377 unit and integration tests. The code has no `any`, no `@ts-ignore`, no `dangerouslySetInnerHTML`, no unused dependencies, and Row Level Security is enabled on all 82 database tables.

The defects were concentrated in one place the tests did not reach: whole files going through the statement importer, at real sizes, in the shapes real bank exports have.

| | Count |
|---|---|
| Issues identified | 27 |
| Fixed and verified | 20 |
| Written, not yet applied to production | 1 (C5) |
| Still open | 5 |

**One thing needs your attention first.** While reproducing the bug I tested on `localhost:3000`, where the preview browser turned out to be signed in to a real account (`f***@gmail.com`). My test imports synced **1,912 synthetic transactions** into that account's cloud ledger. The ledger was empty before, so every row is mine, and I checked each one against my test data. My first attempt to remove them was blocked by a permission check. They were removed the next day on your approval; see C1.

**The branch.** The work was developed on `fix/expense-import-and-audit-2026-11` (the security-audit branch with `origin/main` merged in) and then moved, unchanged, onto `fix/expense-import-repair`, which is `origin/main` plus this work only. None of the files touched here overlap with the security-audit commits. That branch needs a production migration and a Stripe webhook change before it can ship, so it was left out of this release on purpose. Both older branches are untouched.

**Later the same day**, on your instruction to fix the rest: C2, C6 and C7 below are fixed, and the migration for C5 is written but not applied (the deploy workflow does not run SQL).

## B. Issues fixed

### Import (Priority 1)

| # | Severity | Problem | Root cause | Fix |
|---|---|---|---|---|
| 1 | High | Pressing Import replaced the whole app with "A small glitch on our end" | The importer is a chunk fetched on first use. On a tab opened before a deploy (every push to main ships) or offline, the fetch fails; `React.lazy` throws that at the only error boundary, at the app root | The button loads the chunk itself and reports a failure in place. A stale build reloads the page once, automatically (`src/lib/chunkRecovery.ts`) |
| 2 | High | A long statement lost its last rows with no warning | Statement text went through `sanitizeText`, whose default 200,000-character cap was written for CVs. A 5,000-row CSV stopped at row 4,425 and still showed "Reconciled" | Statement text is never shortened. Over the ceiling (20,000 rows, the limit the spreadsheet reader already had) is refused by name |
| 3 | High | "Imported N transactions" when nothing was saved | A failed `localStorage` write (full disk) is shadowed in memory and reported nowhere; the rows vanished on reload | Storage writes now report whether they persisted. Import is all-or-nothing: the sheet stays open and says why. Other edits warn once |
| 4 | High | An import appeared to do nothing | Statements are for months that have ended; the tracker opens on the current month and stayed there | The tracker goes to the latest month that received rows and says so |
| 5 | High | Spending read as "money in" while an account was overdrawn | The running balance's sign was dropped: `-150.00` and `150.00 Dr` were read as `+150` | Balances keep their sign in CSV, spreadsheet and PDF text |
| 6 | High | Every purchase on a card statement read as "money in", every refund as spending, and it still "reconciled" | A card's balance is what you owe and rises when you spend. The balance check assumed a bank balance and overrode the bank's own Debit/Credit columns | The importer works out what the balance counts from the directions the bank stated, and reads the steps accordingly |
| 7 | High | Newest-first statements "failed" to reconcile, and a repeated amount flipped direction | The balance chain was walked top-down regardless of the order the bank printed | The order is read from the arithmetic and the chain is walked oldest-first |
| 8 | Medium | Closing the sheet threw away the review | ✕, Escape, the backdrop and "Choose another file" all deleted the staged review, including one staged on an earlier visit | Only the Cancel button discards. A stray backdrop click no longer closes a review in progress |
| 9 | Medium | Keyboard and screen-reader users were stranded | Focus stayed on the inert page behind the dialog; the file control was a `<label>` over a hidden input with no focus ring | Focus moves into the dialog; the control is a real button |
| 10 | Medium | Files named `.xls` were always refused | Rejected on the name alone | Tab-separated text, web-page tables and modern workbooks under the `.xls` name are read. Binary Excel 97 is still declined |
| 11 | Low | A CSV with no extension was "unsupported" | Only the filename was consulted | The browser-reported type is used when the name has no accepted extension |
| 12 | Medium | Large statements froze the tab | Duplicate detection compared every row with every row | Indexed by amount; 20,000 rows against a 20,000-row ledger takes about 25 ms |
| 13 | Low | No sign anything was happening after pressing Import | Nothing rendered until the chunk arrived | The button shows it is busy and ignores a second press |

### Beyond import

| # | Severity | Problem | Fix |
|---|---|---|---|
| 14 | Medium | Any of the ~90 lazily loaded parts failing to load showed the crash screen and sent the user to the home page | Chunk failures are recognised app-wide: reload once, and only after confirming the server has a newer build (WebKit fails in-flight imports whenever a navigation starts, so a failed chunk alone proves nothing); otherwise a plain "didn't finish loading" screen that retries the same page |
| 15 | Medium | The service worker could store a web page as a script, after which that chunk could never load again | It refuses to store HTML under an asset URL and discards any it already holds |
| 16 | Medium | A failed save to the account was invisible below 1024px (the "Sync error" label is hidden on phones) | A notice is shown once per failure on every screen size |
| 17 | Process | The working branch lacked three production commits | Merged `origin/main` into a new branch |

**Files modified:** `src/lib/chunkRecovery.ts` (new), `src/components/ErrorBoundary.tsx`, `src/main.tsx`, `src/tools/pages/ExpensePage.tsx`, `src/tools/ui/StatementImport.tsx`, `src/tools/ui/SyncFailureNotice.tsx` (new), `src/tools/ToolsLayout.tsx`, `src/tools/lib/storage.ts`, `src/tools/lib/expense.ts`, `src/tools/lib/import/{extract,csv,statement,reconcile,fields,dedupe,types,useStatementImport}.ts`, `public/sw.js`, `.claude/launch.json` (a `vite-preview` entry).

**Tests added:** `importRepair.test.ts` (36), `importFlow.test.tsx` (20), `ExpensePage.import.test.tsx` (7), `ExpensePage.importChunk.test.tsx` (5), `chunkRecovery.test.tsx` (13), `syncFailureNotice.test.tsx` (3), four cases in `serviceWorker.runtime.test.ts`, and `e2e/import-resilience.spec.ts` (2 flows, desktop and phone).

## C. Issues requiring your approval

| # | What is wrong | Why it needs you | If left | Recommendation |
|---|---|---|---|---|
| C1 — **done** | 1,912 synthetic transactions (and 500 audit entries) from my tests are in the cloud ledger of `f***@gmail.com` | Removing them writes to a real account's cloud row; the attempt was blocked | Fake spending in that account, and it will sync to any other device signed in to it | Removed on 13 November with your approval: all 1,912 rows and their 500 history entries, each matched against the test data first, by compare-and-set on the cloud row. The October budget was not touched. The synced copies held by the preview browser on `localhost:3000` and `localhost:5173` were removed too, so nothing pushes them back. A device signed in to that account that synced in between could still return them (see C3) |
| C2 — **fixed** | In a single signed Amount column with no balance, a positive amount defaults to "spending" unless the description contains an inflow word | Fixing it means choosing a sign convention, and exports disagree (Chase prints purchases negative, Amex positive) | A deposit can be imported as an expense if ticked | Done as recommended: the side with more rows is read as spending, the balance overrules that wherever there is one (and settles the convention for rows it cannot reach), and the review sheet offers "Swap money in and out" when the file settled nothing |
| C3 | Deleting more than 1,000 transactions does not stick across devices | Tombstones are capped at 1,000 by design, to protect the sync payload | Someone who imports a large statement by mistake and deletes it gets most of it back from the cloud | Record one tombstone per import batch id rather than per row |
| C4 | The cloud row is capped at 1 MB (compressed) and the browser store at about 5 MB | Both limits were set when "real data is KB-scale" was true; the importer changed that | Past roughly 12,000 to 16,000 transactions, saving to the account fails for every tool. It is now announced (fix 16) but still fails | Decide a ledger budget: warn in the importer as it approaches, and move the ledger to its own table or IndexedDB |
| C5 — **migration written** | `feature_flag_overrides` is readable in full by every signed-in user | Needs a migration and a manual deploy | Any user can list other users' ids and which beta flags they hold | `supabase/migrations/20261112000100_scope_feature_flag_override_reads.sql` is in the repo. It is **not applied**: run it in the Supabase SQL editor, or tell me to |
| C6 — **fixed** | A CSV with no header row is refused | Reading columns by position is a guess | Some bank exports (CommBank, for one) have no header | Done where the file settles it: date + description + one amount column, or + a balance proved by its own arithmetic. Anything else is still refused, and the sheet says the columns were worked out |
| C7 — **fixed** | The picker offers `.xls`, but binary Excel 97 cannot be read | SheetJS's reader is excluded on purpose for its unpatched advisories | A clear message, but a dead end for those files | The picker now says "Excel (.xlsx)"; binary `.xls` is still declined with the same instruction |
| C8 | The security-audit commits and this work are not on `main` | Deploy prerequisites for the security branch are still open | Production keeps the import defects until this ships | Merge the security branch, then this one |
| C9 | Column headers are matched in English only | Product scope | A non-English export is refused with the "no header row" message | Leave until a non-English market is added |
| C10 | The first press after a failure can fail again in the same page | Browsers may remember a failed module until reload | One extra press: the next one reloads and it works | Accept |

## D. Expense Tracker import repair

**Original root cause.** There was no single one. The hard failure was fix 1: the importer's chunk failing to load took down the app. Around it were several ways an import could look as though it had not worked (fixes 2, 3, 4) or come out wrong (fixes 5, 6, 7). I did not have your exact reproduction, so I cannot say which of these you hit; all of them were reproduced before being fixed.

**Supported formats.** CSV, TSV, TXT; `.xlsx`; `.xls` when it is really text, an HTML table or a modern workbook; PDF with a text layer; scanned PDF and PNG/JPG/WebP/BMP through on-device text recognition. 15 MB and 20,000 rows per file.

**Validation.** Empty files, oversized files, unsupported types, a `.pdf` that is not a PDF, binary data under a text name, missing date or amount columns and files with no transactions are each refused with their own message. Rows with an unreadable date or amount are shown but cannot be ticked. Nothing reaches the ledger until Import is pressed.

**Duplicates.** Same amount to the cent, within a day, same merchant — against the existing ledger and within the file. Flagged rows arrive unticked and can be ticked back on. Re-importing the same file selects nothing.

**Scenarios tested**

| Scenario | Result |
|---|---|
| Valid CSV | Pass |
| Valid Excel (`.xlsx`) | Pass (existing suite); not re-run by hand in the browser |
| `.xls` as tab-separated text and as an HTML table | Pass |
| Empty file | Refused with a message |
| Invalid format (`.docx`, fake `.pdf`, binary as `.csv`) | Refused with a message |
| Missing required columns | Refused with a message |
| Unreadable dates | Rows shown, held back |
| Invalid amounts | Rows shown, held back |
| Duplicates and repeated import | All flagged, nothing selected |
| Large file (5,000 rows) | All 5,000 read in about 100 ms; 4,000 imported across 14 months |
| Over the row ceiling | Refused with a message |
| Cancelled file selection | No change |
| Storage write failure | Nothing imported, sheet stays open, ledger unchanged |
| Missing chunk (stale deploy) | Page reloads once; then a message; app intact |
| Phone and desktop widths | Pass |
| Existing records preserved | Pass |

Not tested: the Android and iOS apps, Firefox and Safari, real bank statements (all files were synthetic), and password-protected PDFs by hand.

## E. Technical improvements

- **Reliability:** chunk-load recovery for every lazy boundary; a service worker cache that cannot be poisoned.
- **Data integrity:** storage writes that report failure; an all-or-nothing import; signed balances; balance kind and row order read from the file.
- **Performance:** duplicate detection from quadratic to linear.
- **Accessibility:** focus management and a real button in the import dialog.
- **Maintainability:** `extractStatement` is now covered end to end. jsdom's `File` has no `text()`, which is why the truncation was never caught.
- **Security:** structural scan clean (RLS on every table, no definer functions without a pinned search path, every view `security_invoker`). One policy to tighten (C5).

## F. Test results

| Check | Before (merged tree) | After |
|---|---|---|
| TypeScript (`tsc -b`) | Pass | Pass |
| ESLint | 0 problems | 0 problems |
| Production build | Pass | Pass |
| Unit and integration (Vitest) | 264 files, 4,342 passed, 14 skipped (derived: the released branch minus the 88 tests added) | 270 files, 4,430 passed, 14 skipped |
| Dependency audit | Pass (xlsx knowingly accepted) | Pass (unchanged) |
| E2E (Playwright) | Not run | Full suite on desktop and phone: 1,237 passed, 1 skipped. WebKit project: 120 passed. The first release attempt failed one WebKit check in CI, which exposed fix 14 reloading on an interrupted import; it now reloads only when the server has a newer build |
| Import functionality | 13 defects reproduced | Each verified fixed in the production build |

For reference, the development tree (security-audit branch plus `main`) measured 268 files and 4,377 tests before any change, and 274 files and 4,450 tests after the first round of fixes.

## G. Remaining risks

- Direction for signed single-column exports without a balance (C2).
- Sync and storage ceilings for heavy importers (C3, C4).
- Nothing here has been run on the native apps or on WebKit and Firefox.
- The parser changes (balance sign, balance kind, row order) alter how some statements are read. They are covered by tests and the 138 existing import tests still pass, but they have only met synthetic files.
- `main` and this branch have diverged from the deployed security posture until C8 is done.
