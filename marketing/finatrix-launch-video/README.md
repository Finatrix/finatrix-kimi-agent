# FinatriX launch film (16 s, vertical)

| File | What it is |
| --- | --- |
| `renders/finatrix-launch-vertical.mp4` | **Final film.** H.264 High@4.2, 1080×1920, 30 fps progressive, yuv420p BT.709, ~18 Mb/s, AAC-LC 48 kHz stereo 320 kb/s, fast-start, exactly 16.000 s / 480 frames |
| `renders/finatrix-launch-poster.png` | Poster frame (frame 70: "See the month." over the real dashboard) |
| `src/film.html`, `src/film.js`, `src/timeline.json` | Editable motion source: a deterministic timeline; `FILM.seek(frame)` paints one frame |
| `audio/synth.mjs` | Original score and sound design, synthesized from code (no samples); cues read from `timeline.json` |
| `capture/0*.mjs` | Drive the real app with a fictional demo profile and capture the product plates |
| `assets/plates/` | The captured UI (4× device scale) plus `plates.json`, the boxes of every framed region |
| `render.mjs`, `build.sh` | Frame renderer (Chromium → lossless MOV) and the master/encode/mux step |

Audio master: −14.0 LUFS integrated, −3.3 dBTP, no clipping.

## Story and evidence

Every product pixel is a capture of the running app (`npm run dev`, phone viewport 390×844 at 4×,
dark theme, guest mode). The film crops, masks, moves and dims those captures. It never redraws
a control or changes an amount. The demo state was entered through the app's own UI: onboarding
at `/welcome`, the Budget Builder fields, and Expense Quick add.

| Time (s) | On screen | Source in the app | What the viewer sees |
| --- | --- | --- | --- |
| 0.00–0.90 | **WHERE DID IT GO?** | The figures are the five demo transactions logged below | −₹24,000 · −₹2,150 · −₹640 · −₹499 · −₹340 whip past, then a hard stop |
| 0.90–3.17 | **SEE THE MONTH.** | `/tools/dashboard`, `DashboardPage` hero | Budgeted income ₹85,000 → planned savings rate 32% → recorded spending ₹27,629 → income less spending ₹57,371 |
| 3.17–5.47 | **TRACK WHAT YOU SPEND.** | `/tools/expenses`, `ui/QuickAddBar.tsx` + `lib/quickAdd.ts` | 14 real keystroke states of "340 lunch upi", which the live parser reads as ₹340 · Eating Out · Today · UPI. Then Add, the real "Added ✓", and the Overview tiles: ₹27,629 spent, ₹55,571 remaining |
| 5.47–7.73 | **BUILD YOUR BUDGET.** + 50 / 30 / 20 | `/tools/budget`, "Your budget split" (`#bb-pct-*`) | The blocks land on the real 50 / 30 / 20 fields. The real allocation bar shows Needs ₹42,500 · Wants ₹25,500 · Save ₹17,000 (of ₹85,000) |
| 7.73–10.00 | **TURN GOALS INTO A PLAN.** | `/tools/goals`, `GoalPlannerPage` | Inputs ₹15,00,000 and 5 years, then "Show me the path". Result: ₹20.07 L in 5 years (inflation-adjusted from ₹15 L). Aggressive path ₹23,020/mo (~14% CAGR), then Moderate ₹24,336/mo (~12%) |
| 10.00–12.73 | **SEE THE LONG VIEW.** + *Illustrative model* | `/tools/lifemap`, Wealth projection canvas | The real chart for a demo profile (age 28). A dim-and-scan reveal passes over the real pixels; no line is redrawn |
| 12.73–16.00 | **FinatriX** · tagline · CTA | `public/images/finatrix-logo.png` (24% radius, as `BrandLogo`), wordmark as `LandingNav` ("Finatri" + gold "X", Geist), tagline = `LandingHero` h1 | The brand and CTA are fully readable for the final 2.2 s |

Disclosures in the film: "Demo data" on the screens; "Illustrative example · returns assumed, not
guaranteed" on Goals; "Illustrative model" and "A simulation of demo inputs — not a forecast" on
LifeMap; "Educational tools · Illustrative screens" on the end card.

## Deliberate deviations from the brief

- **Cut times** sit on a 132 BPM grid: 0.90 / 3.17 / 5.47 / 7.73 / 10.00 / 12.73 s. Every cut is
  within 0.10 s of the brief.
- **Tool-name kickers** were added above each headline. Headline copy is unchanged.
- **The 50 / 30 / 20 dividers** are gold rules, not slash glyphs, so the blocks can morph onto the
  real fields.
- **The screens are the mobile web app.** This repository has no `android/` or `ios/` project, no
  store screenshots, and none of `docs/MOBILE_RELEASE_READINESS.md`, `APP_STORE_SUBMISSION.md`,
  `ANDROID.md` or `IOS.md`.
- **The CTA "Coming to the App Store & Google Play" is the brief's wording.** It is not verified
  from this repository. Confirm the native release status before publishing.
- **The reference MP4 and the motion-graphics starter kit were not available** in the build
  environment. The rhythm follows the brief's written description of the reference. No kit fonts
  or SFX were used; all audio is original.

## Rebuild

```bash
npm run dev                                  # from the repo root, on :3000
node marketing/finatrix-launch-video/capture/01-onboard.mjs   # then 02, 03, 04 in order
node marketing/finatrix-launch-video/capture/05-shots.mjs     # writes assets/plates/
marketing/finatrix-launch-video/build.sh                      # render + score + master + encode
node marketing/finatrix-launch-video/render.mjs stills 0,95,382   # spot frames → renders/review/
node marketing/finatrix-launch-video/render.mjs safe              # copy-in-safe-zone check, all frames
```

The render uses Playwright's Chromium (`CHROMIUM=/path/to/chrome` overrides the path) and
`ffmpeg`. A full render takes about 4 minutes. The plates depend on the current date: the demo
month is the month of capture.
