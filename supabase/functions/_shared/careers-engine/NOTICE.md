# Notice

The FinatriX Careers engine contains portions derived from
[career-ops](https://github.com/career-ops-hq/career-ops) v1.38.0, licensed under the MIT License.
The derived portions were re-implemented in TypeScript; they are adaptations, not verbatim copies.
They reached this repository through `@finatrix/careers-engine` 0.1.0.

## Where each part comes from

| This folder | Upstream (career-ops) |
|---|---|
| `discovery/titleFilter.ts` | `title-keywords.mjs` |
| `discovery/providers/workday.ts` | `providers/workday.mjs` (market-only facet slicing is FinatriX's) |
| `discovery/providers/oraclecloud.ts` | `providers/oraclecloud.mjs` |
| `discovery/providers/pageup.ts` | `providers/pageup.mjs` |
| `discovery/providers/atsApis.ts` | `providers/greenhouse.mjs`, `lever.mjs`, `smartrecruiters.mjs` (Ashby, Workable and Recruitee are original) |
| `verification/urlKey.ts` | `web/src/lib/core/url-key.mjs` |
| `verification/listingKey.ts` | `listing-fingerprint.mjs` (`listing_v1_<sha256>` kept byte-compatible) |
| `verification/fingerprint.ts` | `fingerprint-core.mjs` |
| `verification/roleMatcher.ts` | `role-matcher.mjs` |
| `verification/reposts.ts` | `detect-reposts.mjs` |
| `verification/liveness.ts` | `liveness-core.mjs` |

Original to FinatriX: the market layer (`markets/`, generalised from the package's Australian layer to
US, UK, India, Australia and New Zealand), the posting store, the scan edge function and all tests.

## Upstream licence

MIT License

Copyright (c) 2026 Santiago Fernández de Valderrama

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
