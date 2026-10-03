# FinatriX launch film — "Day 10"

An 88-second cinematic spot for the 14 October 2026 launch. No UI, no feature
tour: one middle-class month, told honestly, and then the turn.

> A young salaried professional wakes to the last squeeze of toothpaste, rushes a
> 9-to-5 he can't breathe in, eats instant ramen standing up, and sleeps in his
> clothes. The days cross themselves off. Salary lands — a small smile — and by
> the next morning the bills have taken it. By day 10 his balance is ₹1,240:
> exactly where it was before payday. Then the screen closes into gold.

## Structure

| Time | Act | What we see | Source |
| --- | --- | --- | --- |
| 0:00–0:09 | I · Morning | alarm → last of the toothpaste → shower (fade to white) → formals → office | AI video, S01–S06 |
| 0:09–0:27 | I · The day | the pile, the meeting, lunch tapped on the phone, last one in, the drive, ramen, collapse | AI video, S07–S14 |
| 0:27–0:33 | I · The month | a wall calendar crossed off in a light time-lapse; the 30th circled green | **rendered**, I01 |
| 0:33–0:44 | I · Payday | the smile; "Salary credited"; overnight the bills land, faster and faster | S16 + **rendered** I02 |
| 0:44–0:54 | I · Day 10 | paying, paying; the 10th circled red; "Low balance ₹1,240"; his face | S18, **rendered** I03 + I04, S19 |
| 0:54–1:28 | II · The turn | gold doors, LIFE GETS HARD, five ideas as five of the mark's tiles, the mark assembles, through the node to 8 / 1 / ∞, out to the launch card | **rendered**, finale |

Act I is framed 2.39:1 — the frame itself is tight. The bars open as Act II
begins. `edit.json` is the cut: every shot, its duration, transition, source,
and for the AI shots the storyboard frame and the motion prompt.

## Voiceover (Act II)

> Life gets hard… when you can't manage your money.
> Your budget. Your expenses. Your investments. Your plans for the future.
> And knowing what you're truly worth.
> What if one app could bring it all together… and lift you up?
> That's why you need FinatriX.
> Eight tools. One place. Infinite solutions.
> Available on the App Store and Google Play. October fourteenth.

Read by Kokoro (`am_michael`), rendered locally and free. "FinatriX" is said
*FIN-uh-tricks*; the TTS spells it phonetically (`audio/voiceover.py`). A human
VO can replace `audio/vo.wav` line for line — the picture's cues follow
`finale/timeline.json`, which `voiceover.py` writes.

## What's in this folder

| Path | What it is |
| --- | --- |
| `finale/` | Act II, a three.js scene. The FinatriX mark is rebuilt from `public/images/finatrix-lockup.png`: tile boxes measured from the artwork, glyphs and wordmark lifted from it, not redrawn. |
| `inserts/calendar.*` | The month and Day 10: a paper calendar on a plaster wall, window light once per day, felt-tip crosses (`?month=sep` / `?month=oct`). |
| `inserts/phone.*` | Payday, the bills, the low-balance alert (`?mode=bills` / `?mode=day10`). Generic lock screen and bank alerts — no real bank, OS or FinatriX UI. Balances are computed from the bills, so they add up. |
| `shared/` | Easing and handheld motion (`motion.js`), the film finish — grain, vignette, fringing (`film.js`). |
| `audio/` | `voiceover.py` (VO + timeline), `score.py` (finale score and sound design), `inserts.py` (insert sound), `synth.py` (the instruments). All synthesised: no samples, nothing to license. |
| `render.mjs` | Renders any scene frame by frame in headless Chromium → `out/<name>.mp4`, muxing `audio/<name>-mix.wav` when present. |
| `assemble.py` | Cuts the film from `edit.json` → `out/film.mp4`, or `out/film-animatic.mp4` while AI shots are missing. |

## Making it

```bash
cd marketing/launch-film
npm install                      # three, fonts, opentype, playwright (uses the preinstalled Chromium)

# Sound (Python 3.11+: pip install kokoro-onnx soundfile numpy scipy)
python audio/voiceover.py --models <dir with kokoro-v1.0.onnx + voices-v1.0.bin>
node render.mjs --cues                                    # finale cue sheet → audio/cues/finale.json
python audio/score.py                                     # → audio/finale-mix.wav

# Picture (≈20 min for the finale on CPU; seconds per insert)
node render.mjs                                           # → out/finale.mp4
node render.mjs --page "inserts/calendar.html?month=sep" --name month-loop
node render.mjs --page "inserts/calendar.html?month=oct" --name day-ten
node render.mjs --page "inserts/phone.html?mode=bills"   --name phone-bills
node render.mjs --page "inserts/phone.html?mode=day10"   --name phone-day10
python audio/inserts.py   # insert sound; run each insert with --cues first, then render again to mux

node render.mjs --stills 2.5,12.6,21.1     # single frames for review
python3 assemble.py                        # the cut
```

## Generating Act I (the live-action shots)

The 16 AI shots are image-to-video from storyboard frames already generated on
Higgsfield (Soul 2.0, character locked to the reference photo). Each
`edit.json` clip shot carries its `storyboard_job` (the start frame) and its
`motion` prompt.

- **Model:** Kling 3.0, `pro`, 5 s, `sound: on` (native ambience), 16:9 — 12.5 credits a shot,
  ~200 credits for all 16, ~260 with retakes. Needs a Higgsfield Basic plan or higher.
- **Prompt:** the shot's `motion` + "Photorealistic, natural motion, consistent face, no text,
  no subtitles, no watermark." Keep the camera move in the prompt; it sells the realism.
- **Then:** save each take as `clips/<id>.mp4` and run `python3 assemble.py`. The `in` point
  skips the first half-second, where image-to-video still holds the start frame.

## Notes

- **The loop.** Payday shows *Avl bal ₹63,240* (₹1,240 + ₹62,000). Day 10 lands on ₹1,240
  again. The month ends where it began — that's the problem FinatriX answers.
- **The toothpaste.** S02 squeezes out the last of it. `alternates` → S20 answers it with a
  full tube: an optional button after the end card.
- **Store names.** The end card names the App Store and Google Play in text. If official
  badges are wanted, use Apple's and Google's badge artwork as supplied, unaltered.
- **Disclaimer.** The end card carries "Educational tools — not financial advice.", matching
  the product's own positioning.
- **Rights.** The lead is generated from a reference photo; confirm you have the person's
  consent to use their likeness in advertising before release.
