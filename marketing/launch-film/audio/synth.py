"""Instruments and tools shared by the film's sound: the finale score and the inserts.

All synthesis — no samples. Every function returns a mono or stereo float array at SR.
"""

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
rng = np.random.default_rng(7)


def hz(note: str) -> float:
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    return 440.0 * 2 ** ((names[note[:-1]] + 12 * (int(note[-1]) - 4)) / 12)


def t_axis(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def place(track: np.ndarray, sound: np.ndarray, at: float, gain: float = 1.0) -> None:
    """Mix a mono or stereo sound into the stereo track at time `at`."""
    if sound.ndim == 1:
        sound = np.stack([sound, sound], axis=1)
    start = int(at * SR)
    if start >= len(track):
        return
    if start < 0:
        sound, start = sound[-start:], 0
    end = min(len(track), start + len(sound))
    track[start:end] += gain * sound[: end - start]


def lowpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "low", fs=SR, output="sos"), x)


def highpass(x, cutoff, order=2):
    return sosfilt(butter(order, cutoff, "high", fs=SR, output="sos"), x)


def bandpass_sweep(noise, f0, f1, q=1.6, block=512):
    """Noise through a band-pass whose centre glides f0 → f1 (exponentially)."""
    out = np.zeros_like(noise)
    blocks = int(np.ceil(len(noise) / block))
    for b in range(blocks):
        f = f0 * (f1 / f0) ** (b / max(1, blocks - 1))
        lo, hi = max(20, f / q), min(SR / 2 - 100, f * q)
        sos = butter(2, [lo, hi], "band", fs=SR, output="sos")
        seg = slice(b * block, (b + 1) * block)
        out[seg] = sosfilt(sos, noise[seg])
    return out


# ─── Instruments ─────────────────────────────────────────────────────────────

def pad(notes, seconds, brightness=8, attack=1.5, release=2.0):
    """Warm additive pad: soft harmonics, three slightly detuned voices per note, slow breathing."""
    t = t_axis(seconds)
    out = np.zeros((len(t), 2))
    for note in notes:
        f = hz(note)
        for v, (cents, pan) in enumerate([(-6, 0.25), (0, 0.5), (6, 0.75)]):
            fv = f * 2 ** (cents / 1200)
            phase = rng.uniform(0, 2 * np.pi)
            wave = sum(np.sin(2 * np.pi * fv * k * t + phase * k) / k ** 1.6 for k in range(1, brightness + 1))
            wave *= 1 + 0.08 * np.sin(2 * np.pi * (0.13 + 0.05 * v) * t)
            out[:, 0] += wave * (1 - pan)
            out[:, 1] += wave * pan
    e = np.clip(t / attack, 0, 1) ** 2 * np.clip((seconds - t) / release, 0, 1)
    return out * e[:, None] / (len(notes) * 3)


def bell(note, seconds=3.5, bright=1.0):
    """Struck-glass bell: inharmonic partials, each with its own decay."""
    t = t_axis(seconds)
    f = hz(note)
    partials = [(1.0, 1.0, 2.6), (2.76, 0.5 * bright, 1.6), (5.4, 0.28 * bright, 0.9), (8.93, 0.15 * bright, 0.5)]
    x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in partials)
    return x * np.clip(t / 0.003, 0, 1) * 0.5


def pluck(note, seconds=1.6):
    """A soft mallet: fundamental + octave, fast attack, warm decay."""
    t = t_axis(seconds)
    f = hz(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.25) + 0.12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.12)
    return x * np.exp(-t / 0.55) * np.clip(t / 0.004, 0, 1) * 0.6


def boom(seconds=2.2, f0=72, f1=32, decay=0.9):
    """Sub drop with a transient click — the weight under every hit."""
    t = t_axis(seconds)
    f = f1 + (f0 - f1) * np.exp(-t / 0.18)
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t / decay)
    click = lowpass(rng.standard_normal(len(t)), 3500) * np.exp(-t / 0.012) * 0.6
    return np.tanh(1.6 * (body + click)) * 0.9


def impact(seconds=2.4):
    """A heavy object landing: boom plus a short, dark crunch of noise."""
    t = t_axis(seconds)
    crunch = lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t / 0.09) * 0.9
    return boom(seconds, 90, 30, 0.75) + crunch


def whoosh(seconds, f0, f1, swell=0.6):
    """Air moving past the lens: noise through a gliding band-pass, swelling then gone."""
    t = t_axis(seconds)
    x = bandpass_sweep(rng.standard_normal(len(t)), f0, f1)
    e = np.sin(np.pi * np.clip(t / seconds, 0, 1)) ** 1.5
    e *= np.clip(t / (seconds * swell), 0, 1) ** 0.5
    left, right = x * e, np.roll(x, 240) * e  # a few ms apart: width
    return np.stack([left, right], axis=1) * 1.8


def riser(seconds):
    """Rising tension: noise lifting in pitch and level, with a gliding sine underneath."""
    t = t_axis(seconds)
    k = t / seconds
    air = bandpass_sweep(rng.standard_normal(len(t)), 300, 6000, q=2.2) * k ** 2.2
    f = 110 * 2 ** (2.5 * k)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * k ** 2 * 0.25
    return (air * 1.4 + tone) * 0.8


def sub(x, cutoff=140):
    """Keep only the weight of a hit, for hits that land under the voice: sub-bass doesn't mask speech."""
    return lowpass(x, cutoff, order=4)


def heartbeat(count, period, at, track, gain):
    for i in range(count):
        for off, g in ((0.0, 1.0), (0.24, 0.6)):
            place(track, lowpass(boom(0.5, 60, 40, 0.11), 180), at + i * period + off, gain * g)


def reverb(x, seconds=2.8, wet=0.32, damp=4500):
    """Convolution with a synthetic hall: decorrelated decaying noise per channel."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = x.copy()
    for ch in range(2):
        ir = lowpass(rng.standard_normal(n), damp) * np.exp(-t / (seconds / 5.5))
        ir[: int(0.012 * SR)] = 0  # pre-delay
        ir /= np.sqrt((ir ** 2).sum())
        out[:, ch] = (1 - wet) * x[:, ch] + wet * fftconvolve(x[:, ch], ir)[: len(x)]
    return out
