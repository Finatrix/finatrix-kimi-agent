# Seven-market validation

Verified and deployed 12 September 2026. No commits or Git operations were performed.

| Check | Result |
| --- | --- |
| Full unit and integration suite | 184 files; 3,252 passed, 14 existing skipped, zero failures |
| Focused parity, SEO and new-market tests | 585 passed; existing parity fixtures unchanged |
| TypeScript and production build | Passed; production build also rerun by the browser-test server |
| ESLint | Passed |
| New-market desktop/mobile browser suite | 68 passed, zero failures; Chromium desktop and Pixel 7 mobile emulation |
| Reference source identities | Exact URL and market match for every new summary |
| Archived evidence integrity | All six source/terms snapshots match their SHA-256 manifest |

Browser coverage includes all eight tools for AU, SG and Mainland CN on desktop and mobile; LifeMap result localization; user-entered cash rates; matched published peer summaries; seven-market settings and persistence; local-currency selection; page overflow; result accessibility; and FAQ structured-data consistency.

The initial browser pass exposed two test issues, both corrected: the test assumed market changes automatically change currency (the product intentionally provides a separate explicit currency action), and one contrast scan ran during a fading result-card animation. The final test waits for the actual animation promises to complete. No accessibility rules were disabled.

The original four-market peer-percentile implementation is unchanged and is not certified as a survey percentile. Tax and statutory-retirement calculations remain out of scope. See [activation notes](seven-market-activation.md) for the precise product behavior and remaining limits.

## Production release

Published to https://finatrix.co after explicit user authorization.

- Cloudflare Worker: `finatrix-co`
- Deployed version: `2490fb8e-6b91-4a9c-8aa5-d4abbe489481`
- Previous version for rollback: `c352190f-91a4-4799-b643-d212185fa6ee`
- Complete browser release suite: **1,142 passed**, zero failures (5.2 minutes).
- Production dependency audit: passed, retaining the existing reviewed write-only xlsx exception.
- Wrangler deployment dry run: passed; deployment preserved dashboard variables.
- Production domain verifier: passed, including canonical routing, security headers, sitemap, icons, authentication redirects, five function CORS checks and real frontend backend configuration.
- Live seven-market desktop/mobile suite: **68 passed**, zero failures (47.8 seconds).

The deployed entry bundle is `/assets/index-Ctqo8aFW.js`. All seven market options and the AU/SG/CN tool flows were exercised on the live domain. No backend functions or database migrations were required for this release.
