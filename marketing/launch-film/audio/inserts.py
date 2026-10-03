"""Sound for the insert shots, cut to each insert's own cue sheet (cues/<name>.json).

  month-loop    room tone, an accelerating clock, a marker squeak per crossed day,
                and a warm chime as payday is circled
  day-ten       the same clock and marker, then a low, sour note on the 10th
  phone-bills   a haptic buzz and a soft alert per notification, the phone
                sleeping overnight, a tension bed that tightens as debits land
  phone-day10   one more debit, then the low-balance thud

Usage: python inserts.py   → <name>-mix.wav for every insert whose cue sheet exists
"""

import json
from pathlib import Path

import numpy as np
import soundfile as sf

from synth import SR, bandpass_sweep, bell, boom, lowpass, pad, place, reverb, rng, sub, t_axis, whoosh

HERE = Path(__file__).resolve().parent


def room_tone(seconds, level=0.012):
    """The sound of a quiet room: very low, filtered noise with a faint hum."""
    t = t_axis(seconds)
    air = lowpass(rng.standard_normal(len(t)), 500) * level
    hum = 0.002 * np.sin(2 * np.pi * 50 * t)  # Indian mains hum, 50 Hz
    x = air + hum
    return np.stack([x, np.roll(x, 300)], axis=1)


def tick(level=1.0):
    """A wall clock's tick: a short, bright click with a wooden body."""
    t = t_axis(0.06)
    click = bandpass_sweep(rng.standard_normal(len(t)), 3500, 2500, q=1.4) * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * 900 * t) * np.exp(-t / 0.01) * 0.3
    return (click + body) * 0.5 * level


def squeak(seconds=0.14):
    """A felt-tip marker dragged across paper: narrow-band noise, gliding and rough."""
    t = t_axis(seconds)
    x = bandpass_sweep(rng.standard_normal(len(t)), 2600, 3600, q=1.15)
    grain = 1 + 0.6 * np.sin(2 * np.pi * 95 * t + rng.uniform(0, 6))
    return x * grain * np.sin(np.pi * np.clip(t / seconds, 0, 1)) * 0.5


def haptic(seconds=0.16):
    """A phone's vibration motor on a table: a buzzy 170 Hz with a rattle."""
    t = t_axis(seconds)
    x = np.sign(np.sin(2 * np.pi * 170 * t)) * 0.3 + np.sin(2 * np.pi * 170 * t) * 0.5
    return lowpass(x, 900) * np.sin(np.pi * np.clip(t / seconds, 0, 1)) ** 0.5 * 0.55


def alert(note="E6"):
    """A soft notification tone: two quick glassy notes."""
    x = bell(note, 0.9, 0.5) * 0.6
    second = bell(note.replace("6", "7") if note.endswith("6") else note, 0.9, 0.4) * 0.35
    out = np.zeros(int(1.0 * SR))
    out[: len(x)] += x[: len(out)]
    off = int(0.09 * SR)
    out[off: off + len(second)] += second[: len(out) - off]
    return out


def finish(track, name):
    track = reverb(track, 1.6, 0.18, damp=6000)
    peak = np.abs(track).max()
    track *= min(1.0, 0.5 / max(peak, 1e-6))  # inserts sit under the film's dialogue-free bed; leave headroom
    sf.write(HERE / f"{name}-mix.wav", track.astype(np.float32), SR, subtype="PCM_24")
    print(f"{name}-mix.wav  {len(track) / SR:.2f}s")


def calendar(name, resolve):
    cues = json.loads((HERE / "cues" / f"{name}.json").read_text())
    dur, crosses, circle = cues["duration"], cues["cues"]["crosses"], cues["cues"]["circle"]
    track = room_tone(dur)
    place(track, pad(["A2", "E3", "A3"], dur, brightness=5, attack=1.2, release=0.6), 0, 0.22)
    for i, at in enumerate(crosses):
        place(track, tick(0.8), at - 0.03, 0.5)
        place(track, squeak(0.1 + 0.06 * rng.random()), at, 0.32)
        place(track, squeak(0.08 + 0.05 * rng.random()), at + 0.09, 0.26)
    if resolve == "payday":
        for note, g, dt in (("C5", 0.2, 0), ("E5", 0.16, 0.08), ("G5", 0.15, 0.16), ("C6", 0.12, 0.24)):
            place(track, bell(note, 3.0, 0.6), circle + 0.15 + dt, g)
        place(track, pad(["C3", "G3", "E4"], dur - circle, brightness=6, attack=0.6, release=0.8), circle, 0.2)
    else:  # day ten: the circle closes on a sour, low note
        place(track, sub(boom(2.2, 60, 30, 0.9), 160), circle + 0.2, 0.9)
        place(track, bell("A#3", 3.0, 0.3), circle + 0.25, 0.22)
        place(track, bell("A3", 3.0, 0.3), circle + 0.25, 0.22)
    finish(track, name)


def phone(name):
    cues = json.loads((HERE / "cues" / f"{name}.json").read_text())
    dur, cards, sleep = cues["duration"], cues["cues"]["cards"], cues["cues"].get("sleep")
    track = room_tone(dur, 0.01)
    for i, at in enumerate(cards):
        last = i == len(cards) - 1
        place(track, haptic(), at - 0.02, 0.6)
        if name == "phone-bills" and i == 0:  # the salary: a brighter, kinder tone
            place(track, alert("G6"), at, 0.32)
        elif name == "phone-day10" and last:  # the low-balance alert
            place(track, sub(boom(1.8, 58, 30, 0.7), 160), at, 0.8)
            place(track, alert("D#5"), at, 0.3)
        else:
            place(track, alert("E6"), at, 0.24)
    if sleep:  # the phone sleeps overnight and wakes to the bills
        place(track, whoosh(sleep["to"] - sleep["from"], 1800, 400), sleep["from"], 0.18)
    if name == "phone-bills":
        first_bill = cards[1]
        place(track, pad(["A2", "E3", "A#3"], dur - first_bill + 0.3, brightness=6, attack=2.0, release=0.4), first_bill - 0.3, 0.3)
    finish(track, name)


for name, make in (
    ("month-loop", lambda: calendar("month-loop", "payday")),
    ("day-ten", lambda: calendar("day-ten", "gone")),
    ("phone-bills", lambda: phone("phone-bills")),
    ("phone-day10", lambda: phone("phone-day10")),
):
    if (HERE / "cues" / f"{name}.json").exists():
        make()
