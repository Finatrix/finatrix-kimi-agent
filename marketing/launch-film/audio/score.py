"""Synthesise the finale's score and sound design, cut to the picture's cue sheet.

Everything here is generated — no samples, no licences to clear. The cue sheet
(`cues/finale.json`) is exported by `render.mjs --cues` from the 3D scene itself, so
every hit lands on the frame it belongs to. The voiceover (`vo.wav`) is laid on
top and the music ducks under it.

Musical arc: A minor tension under "life gets hard"; a rising five-note motif
as the five ideas appear; a riser that resolves to C major as the mark locks;
three tonal hits for 8 / 1 / ∞; a warm, open C major chord for the launch card.

Usage: python score.py   → finale-mix.wav (48 kHz stereo, peak -1 dBFS)
"""

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

from synth import SR, bell, boom, highpass, impact, lowpass, pad, place, pluck, reverb, riser, sub, whoosh, heartbeat

HERE = Path(__file__).resolve().parent
cue_sheet = json.loads((HERE / "cues" / "finale.json").read_text())
C = cue_sheet["cues"]
DUR = cue_sheet["duration"]
N = int(DUR * SR)


# ─── The cue sheet, in sound ─────────────────────────────────────────────────

music = np.zeros((N, 2))
fx = np.zeros((N, 2))

# Doors: in, lock (with the node's glint), swing open.
place(fx, whoosh(0.7, 180, 1600), 0.0, 0.5)
place(fx, boom(2.0, 70, 30, 0.7), 0.52, 0.85)
place(fx, bell("C7", 2.0, 0.6), 0.6, 0.12)
place(fx, whoosh(0.85, 2400, 300), 0.9, 0.55)

# "Life gets hard": dark A minor, a slow heartbeat, then the drop.
place(music, pad(["A2", "E3", "A3", "C4"], C["converge"] - 0.6, brightness=6, attack=2.2, release=2.5), 0.8, 0.9)
heartbeat(6, 0.86, C["life"] + 0.1, fx, 0.35)
place(fx, sub(impact(), 220), C["hard"] + 0.62 * 0.42, 1.0)

# The five ideas: an ascending motif, one note per pillar; a thread of air between.
motif = ["A4", "C5", "E5", "G5", "A5"]
for at, note in zip(C["pillars"], motif):
    place(music, pluck(note), at - 0.04, 0.42)
    place(music, bell(note, 2.5, 0.4), at - 0.04, 0.08)
    place(fx, whoosh(0.6, 400, 2200), at - 0.55, 0.22)

# Convergence: lift, riser, and the major resolution as the mark locks.
place(music, pad(["C3", "G3", "C4", "E4"], C["dive"] - C["converge"] + 0.8, brightness=7, attack=2.0, release=0.8), C["converge"], 0.75)
place(fx, riser(C["snap"] - C["converge"]), C["converge"], 0.28)
place(fx, whoosh(1.3, 300, 3000), C["lift"] - 0.2, 0.3)
place(fx, sub(boom(3.0, 80, 28, 1.1)), C["snap"] - 0.02, 1.0)  # lands on "FinatriX": weight only
for note, g in (("C5", 0.18), ("E5", 0.14), ("G5", 0.14), ("C6", 0.12)):
    place(music, bell(note, 4.0, 0.7), C["snap"], g)

# Through the node: rushing air into white, and out the other side.
place(fx, whoosh(C["cross1"] - C["dive"] + 0.35, 200, 5000, swell=0.9), C["dive"], 0.4)
place(fx, bell("C7", 2.5, 0.5), C["cross1"] - 0.02, 0.1)

# 8 / 1 / ∞: three tonal hits climbing the C major triad; ∞ gets a shimmer.
for key, note in (("eight", "C4"), ("one", "E4"), ("infinite", "G4")):
    place(fx, sub(boom(1.6, 64, 36, 0.5)), C[key] - 0.03, 0.6)
    place(music, pluck(note), C[key] - 0.03, 0.5)
    place(music, bell(note.replace("4", "6"), 3.0, 0.5), C[key] - 0.03, 0.08)
place(music, pad(["E5", "G5", "B5", "D6"], 2.6, brightness=3, attack=0.9, release=1.4), C["infinite"] + 0.1, 0.22)
place(music, pad(["A2", "E3", "C4", "G4"], C["back"] - C["eight"] + 0.6, brightness=6, attack=0.8, release=0.6), C["eight"] - 0.2, 0.55)

# Back out to the launch card: a warm, open C major add9, the date gets a final glint.
place(fx, whoosh(C["cross2"] - C["back"] + 0.6, 4500, 250), C["back"], 0.4)
place(fx, sub(boom(3.2, 70, 28, 1.3)), C["cross2"], 0.75)
place(music, pad(["C3", "G3", "D4", "E4", "G4"], DUR - C["cross2"] + 0.2, brightness=7, attack=1.2, release=1.6), C["cross2"] - 0.1, 0.95)
for note, g, dt in (("G5", 0.16, 0.0), ("C6", 0.14, 0.12), ("E6", 0.12, 0.24), ("D6", 0.1, 0.36)):
    place(music, bell(note, 4.0, 0.6), C["date"] + dt, g)

# ─── Mix ─────────────────────────────────────────────────────────────────────

vo, vo_sr = sf.read(HERE / "vo.wav", dtype="float64")
vo = resample_poly(vo, SR, vo_sr)
vo = highpass(vo, 85)[:N]
vo = np.pad(vo, (0, N - len(vo)))

# Duck the bed under the voice from a smoothed VO envelope: music -9 dB, effects -5 dB at full voice.
level = np.sqrt(np.maximum(0, lowpass(vo ** 2, 6)))  # the filter can undershoot below zero
speaking = np.clip(level / 0.05, 0, 1)
duck_music = 1 - 0.65 * speaking
duck_fx = 1 - 0.45 * speaking

music = reverb(music, 3.2, 0.38)
fx = reverb(fx, 2.2, 0.22)
# Carve a pocket for the voice: dip the music where speech lives (~0.9–4 kHz).
music -= 0.5 * sosfilt(butter(2, [900, 4000], "band", fs=SR, output="sos"), music, axis=0)
music_bus = 0.45 * music * duck_music[:, None]
fx_bus = 0.55 * fx * duck_fx[:, None]
vo_bus = np.stack([vo, vo], axis=1) * 1.15
mix = music_bus + fx_bus + vo_bus

fade = np.clip((DUR - np.arange(N) / SR) / 0.9, 0, 1)
mix *= fade[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)  # gentle soft-clip glue
mix *= 0.89 / np.abs(mix).max()
sf.write(HERE / "finale-mix.wav", mix.astype(np.float32), SR, subtype="PCM_24")

# Stems at mix level, for the final edit (a colourist's timeline, a re-cut, a different VO).
stems = HERE / "stems"
stems.mkdir(exist_ok=True)
for name, stem in (("music", music_bus), ("fx", fx_bus), ("vo", vo_bus)):
    sf.write(stems / f"{name}.wav", (stem * fade[:, None]).astype(np.float32), SR, subtype="PCM_24")
print(f"finale-mix.wav  {DUR:.2f}s  peak -1 dBFS")
