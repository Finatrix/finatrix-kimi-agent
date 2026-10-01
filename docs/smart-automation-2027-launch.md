# Smart entry and Careers launch lock

Implemented September 2026. Financial formulas and calculator assumptions are unchanged.

## Expense entry

- Merchant and Description recognize active categories without needing an amount.
- Quick entry previews a category from a name alone; saving still requires an amount.
- The full form explains automatic selections and supports a persistent manual override. Existing transactions retain their saved category unless the user changes it or explicitly enables automatic selection.
- Saved transaction history contributes to later suggestions. Each transaction casts at most one vote per learned phrase, even when Merchant and Description repeat it.
- More specific names distinguish Uber Eats from Uber and Amazon Prime from Amazon. Common Australian, UK and Singapore merchant names are supported alongside the existing vocabulary.
- Equally strong conflicting matches do not produce a category suggestion. Unrecognized names retain the visibly identified default for review. Recognition is heuristic, not a guarantee about the purchase.
- Automatic recognition stays on-device. It does not send merchant names to a model or change existing transactions in bulk.
- Impossible ISO dates no longer roll into a different month in quick entry. They remain visible in the description while the date preview defaults to today.

## Command search

Requests can match multiple words across a tool's title and aliases, ignoring conversational filler. Examples: “help me plan my salary”, “show my spending tracker”, and “please export my report”. Negative amounts offer a refund action through the existing preview and save flow.

## Careers

The shared launch switch lives in `supabase/functions/_shared/careersAvailability.ts` and is re-exported to the frontend. It is explicitly disabled, independent of the device's date.

- All Careers routes show the 2027 launch screen before the workspace, authentication gate or paid-plan gate mounts.
- Navigation, command search, public pricing, crawler copy and launch metadata reflect the lock.
- Deep Careers routes are noindex and excluded from the generated sitemap. Educational career articles remain available.
- The checkout function rejects new purchases before contacting Stripe. Existing payment webhooks and saved career data are preserved.

This is a website availability gate plus a server-side checkout guard; it does not revoke database access or disable every existing Careers API. Launch requires an explicit review and change of the shared switch. Deploy the frontend and updated `careers-billing-checkout` function together. The frontend and checkout guard have now been deployed to production; see the deployment record below.

## Verification

- Production build passed.
- Full unit/integration suite: 3,299 passed, 14 skipped, 186 test files passed.
- Four Playwright checks passed across desktop Chromium and mobile emulation, covering category selection, overrides, persistence, learning after reload and direct Careers access.
- Accessibility scans passed on the changed transaction form and launch page.
- Targeted lint and diff whitespace checks passed.
- Existing financial calculation parity tests passed as part of the full suite.

Post-launch routing, marketing and subscription tests explicitly enable the launch switch to retain coverage of the preserved workspace. `careers.launch-lock.test.tsx` exercises the actual disabled launch state.

## Production deployment

- Live site: https://finatrix.co
- Cloudflare Worker: `finatrix-co`
- Deployed version: `13c2c8a7-dad3-4223-8a9c-fb794c251a92`
- Previous version: `2490fb8e-6b91-4a9c-8aa5-d4abbe489481`
- Supabase project: `uspbsgbggurggsfsontq`; deployed `careers-billing-checkout` with its JWT setting preserved.
- Live checkout probe returned HTTP 503 with the 2027 launch message and the correct production CORS origin.
- The live entry asset `/assets/index-Bne7ECTJ.js` matches the locally verified production build.
- Full lint, production dependency audit and Cloudflare dry run passed.
- Full browser release run covered 1,146 cases: 1,136 passed initially. Nine failures were obsolete expectations that Careers pricing/deep pages remained open; one was floating-point noise measuring a 24px switch. Updated those test assertions and reran all affected Careers checks plus the complete finance accessibility floor: all 42 passed. No application change was needed for these release-test failures.
- Post-deploy checks passed: database relations, deployed function sources, production domain verification, and all four desktop/mobile smart-entry browser checks against the live site.
