# FinatriX video studio

Fifty-second vertical (1080×1920) motion-graphics explainers, one per money tool,
for Reels, Shorts and TikTok. Each film follows the same arc:

hook → "LYING." slam → the problem in numbers → the leak → the 2 a.m. moment →
FinatriX reveal → the tool doing its job → morning payoff → tagline → CTA.

Everything is generated: the visuals are drawn on a canvas at exact times, and the
music and sound effects are synthesised. Nothing is stock or licensed.

## Accuracy

Every number on screen comes from the tool's own code or its published worked
example. Nothing is invented for effect.

| Film | Source |
| --- | --- |
| Budget Builder | `TOOL_GUIDES.budget.worked` (₹80,000 take-home, 50/30/20) |
| Expense Tracker | `TOOL_GUIDES.expenses.worked` (₹4,000 guessed vs ₹11,200 logged, 34 orders) |
| InvestMatch | `computeInvestMatch` (aggressive, ₹20,000/mo, horizons `10+` and `1-3`); allocation tables and risk note verbatim |
| ParkSmart | `computeParkSmart(500000, '6-12', slab)` at 5% and 30%: the winner flips |
| PeerCompare | `computePeerCompare` (age 30, ₹75,000/mo spend, Mumbai vs Indore) and `PC_CITIES` multipliers |
| Reverse Goal Planner | `computeGoalPlanner` (₹30 L, 15 yrs): ₹71,89,675 target, ₹5,946 → ₹14,249 SIP, paths and step-up |
| LifeMap | `calcWealth` smart vs impulsive curves; `calcScore` 24 → 38 for one decision |
| Net Worth | `TOOL_GUIDES.networth.worked` (₹59,70,000 − ₹32,00,000 = ₹27,70,000) |

If a formula or worked example changes, update the matching story in `stories/`.
Market paths and trend lines that are only illustrative are labelled as such on
screen.

## Build

Requirements: Node 20+, Python 3.10+, ffmpeg.

```bash
cd video-studio
npm install                              # playwright (uses its Chromium, or set CHROMIUM_PATH)
pip install kokoro-onnx soundfile numpy scipy

# Kokoro TTS model (Apache-2.0), once:
mkdir -p .models
curl -L -o .models/kokoro.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
curl -L -o .models/voices.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

python3 tts/build_vo.py default auto     # all eight voiceovers + timelines → out/<tool>/
./make.sh budget                         # one film → out/budget/FinatriX-budget.mp4
```

`make.sh` renders the frames, synthesises and mixes the audio, normalises loudness
to −14 LUFS, and writes two files: `master.mp4` (high bitrate) and
`FinatriX-<tool>.mp4` (about 15 MB, for sharing).

To review a cut, render stills and tile them into contact sheets:

```bash
node render.mjs goals --stills 0,0.5,1,1.5,2
./sheets.sh goals                        # out/goals/sheet_*.png
```

## How it fits together

- `scripts.json`: the voiceover, line by line. Line ids (`hook`, `lie`, `lands`,
  …) are what scenes attach to.
- `tts/build_vo.py`: synthesises each line and lays the lines out on one timeline.
  The voice is a blend of Kokoro's `am_michael` and `am_onyx`. `speeds.json`
  keeps each film between 50 and 55 seconds.
- `engine/`: the renderer. `film.js` schedules scenes against the timeline and
  handles transitions (whip, zoom, flash, drop, iris). `draw.js` has the glossy
  spheres, critters, melt, shards and particles. `text.js` does kinetic type,
  with a contrast guard for accent words. `ui.js` draws product UI, and
  `scenes.js` holds the shared beats.
- `stories/<tool>.js`: one storyboard per tool.
- `audio/mix.py`: music and sound-effect synthesis, ducking and the final mix. The
  arrangement follows each scene's `mood`, and a downbeat lands on the FinatriX
  reveal.

Brand assets (Geist fonts and the logo) are served from `../public`, so the films
always match the site. Instrument Serif Italic is bundled under the SIL OFL
(`fonts/InstrumentSerif-OFL.txt`).
