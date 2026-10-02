# FinatriX launch films (vertical)

Two cuts. Both are built from the same captures of the real app.

| File | What it is |
| --- | --- |
| `renders/finatrix-launch-vertical.mp4` | **The launch film.** 56.6 s, with voiceover. H.264 High@4.2, 1080×1920, 30 fps progressive, yuv420p BT.709, 12 Mb/s on average (16 Mb/s cap; SSIM 0.996 against the lossless master), AAC-LC 48 kHz stereo 320 kb/s, fast-start, 87.6 MB |
| `renders/finatrix-launch-poster.png` | Poster frame (frame 258: the bitten coin, "Where did it *all* go?") |
| `renders/finatrix-teaser-16s.mp4`, `renders/finatrix-teaser-poster.png` | The first 16 s cut: music only, no voiceover |
| `src/film2.html`, `src/film2.js`, `src/timeline2.json` | Editable source for the launch film. `FILM.seek(frame)` paints one frame; the timeline places every scene, word and sound cue |
| `src/film.*`, `src/timeline.json` | Editable source for the teaser |
| `audio/synth2.mjs` | The launch film's score, sound design and voice mix, synthesized from code (no samples) |
| `vo/` | The narration script, the rendered lines, and the offline TTS toolchain (see `vo/README.md`) |
| `capture/0*.mjs` | Drive the real app with a fictional profile and capture the plates (`assets/plates`, `assets/plates2`) |
| `render.mjs`, `build.sh` | The frame renderer, and the render → mix → master → encode step |

## The launch film

Its rhythm follows the supplied reference: a big-number hook, an "agitation"
beat where something eats the number, chaos, the product as the answer, a fast
run of features, then the brand. The look stays FinatriX's own: off-white and
gold for the problem, near-black and gold for the product, Geist with Instrument
Serif italic accents.

| Time (s) | Narration | Picture | Source of every number shown |
| --- | --- | --- | --- |
| 0.0–2.9 | "Payday. Eighty-five thousand rupees." | PAYDAY; a salary notification; a gold coin character with ₹85,000 pops in | Demo income entered in onboarding (`/welcome`) |
| 2.9–8.8 | "Two weeks later… where did it all go? Rent. Groceries. Rides. Subscriptions. That lunch." | Each expense bites the coin on its word; the coin counts down to ₹57,371; the receipts stack up | The five demo transactions logged with Quick add: ₹24,000 · ₹2,150 · ₹640 · ₹499 · ₹340. 85,000 − 27,629 = 57,371 |
| 8.8–12.9 | "Bank texts. Screenshots. A spreadsheet you stopped opening." | Dark iris; a 3D pile of generic bank texts, screenshots and a broken spreadsheet collapses into a point of light | Illustrative props; no bank or brand is named |
| 12.9–15.0 | "Meet FinatriX." | The real logo assembles from its nine tiles (geometry from `public/favicon.svg`); the wordmark wipes in | `public/images/finatrix-logo.png` |
| 15.0–17.4 | "Your whole month, on one screen." | The web dashboard in a browser window; the camera pushes onto Income less spending ₹57,371, and the coin lands in it | `/tools/dashboard` at 1440 px |
| 17.4–20.8 | "Log any spend in one line. It fills in the rest." | 14 real keystroke captures; the parsed chips (₹340 · Eating Out · Today · UPI) pop out of the phone; then "Added ✓" | Expense Tracker Quick add |
| 20.8–23.7 | "See where the month is heading, before it costs you." | Month-end forecast ₹63,842, then the "on track to exceed… ₹770 a day" advice | Expense Tracker → Analytics; the card itself says "projected" |
| 23.7–28.3 | "Build a budget that actually adds up. Fifty. Thirty. Twenty." | Budget Builder; the 50, 30 and 20 blocks slam in on each word and land on the real fields; the bar fills | ₹42,500 / ₹25,500 / ₹17,000 of ₹85,000 |
| 28.3–30.9 | "Turn any goal into a monthly plan." | ₹15 L in 5 years → ₹20.07 L inflation-adjusted → ₹23,020/mo (~14% CAGR path) | Reverse Goal Planner; labelled "returns assumed, not guaranteed" |
| 30.9–34.6 | "Then see the long view, and where today's choices could lead." | A scan reveals LifeMap's real wealth-projection chart | LifeMap; labelled "Illustrative model" and "not a forecast" |
| 34.6–41.2 | "Track your net worth. Match a portfolio to your risk. Find a home for idle cash. And see how you compare." | A 3D carousel of four phones turns on each phrase | Net Worth ₹5 L (3 demo accounts) · InvestMatch Moderate allocation · ParkSmart Arbitrage fund ₹2,130 on ₹1 L · PeerCompare 60th percentile |
| 41.2–45.7 | "Eight free money tools, for India, the US, the UK and the UAE." | The website's "Eight tools" section in a browser; market chips pop on each name | Landing page `#showcase`; markets from the site's own copy |
| 45.7–47.8 | "No account needed to start." | The website hero ("See where your money goes. Decide what comes next.") | Landing page hero |
| 47.8–56.6 | "FinatriX. See where your money goes. Decide what comes next. Coming soon to the App Store and Google Play." | A gold light line and bloom; logo, wordmark and tagline; then App Store and Google Play badges reading "Coming soon". The final ~4 s hold fully readable | Tagline from the landing hero. Store glyphs from `simple-icons` (CC0; see `assets/LICENSES.md`) |

Screen disclosures: "Demo data" on product screens; "returns assumed, not
guaranteed" (Goals); "Illustrative model" and "not a forecast" (LifeMap);
"Illustrative allocation · not investment advice" (InvestMatch); "Indicative
rates" (ParkSmart); "Benchmarks are medians" (PeerCompare); and
"Educational tools · Illustrative screens · Demo data" on the end card.

**Sound.** All music and sound effects are original and synthesized from code
(`audio/synth2.mjs`) at 120 BPM. The drop lands on "Meet FinatriX", and the brand
hit lands at 48.0 s. The voice ducks the music by up to ~9 dB. The master measures
−13.9 LUFS integrated with a −1.5 dBTP true peak and no clipping.

**Voice.** Kokoro-82M, run fully offline (see `vo/README.md`). Every line, and the
final mix, was transcribed back with Whisper to check intelligibility.

## Things to confirm before publishing

- **Store status.** This repository has no native project, so "coming soon to the
  App Store and Google Play" is the brief's claim, not one the code can verify.
  Once the listings are live, use Apple's and Google's official badge artwork
  under their guidelines.
- **Pronunciation.** The brand is spoken FIN-uh-trix.
- **Screens.** These are the mobile web app (390 px at 4×) and the desktop site
  (1440 px at 2×), with the web-only Careers tab and the assistant button
  cropped out.

## Rebuild

```bash
npm run dev                                          # repo root, :3000
for s in 01-onboard 02-budget 03-expenses 04-goals-lifemap 05-shots 06-more-flows 07-v2-plates; do
  node marketing/finatrix-launch-video/capture/$s.mjs
done
marketing/finatrix-launch-video/build.sh             # launch film (~20 min render)
marketing/finatrix-launch-video/build.sh teaser      # the 16 s teaser
FILM=film2 node marketing/finatrix-launch-video/render.mjs stills 0,390,1600   # spot frames
FILM=film2 node marketing/finatrix-launch-video/render.mjs safe                # copy-in-safe-zone check
```

The plates depend on the capture date, because the demo month is the month of
capture.
