"""Synthesise the music bed + sound effects for one film and mix them under the voiceover.

usage: python3 audio/mix.py <tool>
reads  out/<tool>/{timeline.json, cues.json, vo.wav}
writes out/<tool>/mix.wav (44.1 kHz stereo, pre-loudnorm)

Everything is generated here — no samples, no licences. The arrangement follows
the scene moods the film exports, and the beat grid is phased so a downbeat lands
exactly on the product reveal.
"""
import json
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve, resample_poly

SR = 44100
BPM = 112
BEAT = 60 / BPM
rng = np.random.default_rng(7)


# ---------------------------------------------------------------- helpers
def t_axis(d):
    return np.arange(int(d * SR)) / SR


def env_exp(d, k):
    return np.exp(-t_axis(d) * k)


def adsr(d, a=0.005, r=0.05):
    n = int(d * SR)
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    e[-nr:] *= np.linspace(1, 0, nr)
    return e


def bp(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def noise(d):
    return rng.standard_normal(int(d * SR))


def sweep(d, f0, f1, curve="exp"):
    t = t_axis(d)
    if curve == "exp":
        f = f0 * (f1 / f0) ** (t / d)
    else:
        f = f0 + (f1 - f0) * (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def place(buf, x, t, gain=1.0, pan=0.0):
    """Add mono or stereo x into stereo buf at time t."""
    i = int(max(0, t) * SR)
    if i >= buf.shape[0]:
        return
    if x.ndim == 1:
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
        x = np.stack([x * l, x * r], 1) * np.sqrt(2)
    n = min(len(x), buf.shape[0] - i)
    buf[i:i + n] += x[:n] * gain


def reverb_ir(d=1.6, decay=3.2):
    n = int(d * SR)
    t = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)], 1) * np.exp(-t * decay)[:, None]
    ir = np.stack([lp(ir[:, 0], 6000), lp(ir[:, 1], 6000)], 1)
    return ir / np.abs(ir).sum(0).max() * 6


IR = reverb_ir()


def reverb(x, mix=0.25):
    wet = np.stack([fftconvolve(x[:, c], IR[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - mix) + wet * mix


# ---------------------------------------------------------------- instruments
def kick():
    d = 0.42
    t = t_axis(d)
    f = 44 + 110 * np.exp(-t * 30)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)
    x[:150] += noise(150 / SR) * 0.3 * np.linspace(1, 0, 150)
    return np.tanh(x * 1.6) * 0.9


def clap():
    d = 0.22
    x = bp(noise(d), 900, 3800) * env_exp(d, 22)
    for k in (0.008, 0.017):  # flam
        i = int(k * SR)
        m = len(x) - i
        x[i:] += bp(rng.standard_normal(m), 900, 3800) * np.exp(-np.arange(m) / SR * 40) * 0.6
    body = np.sin(2 * np.pi * 190 * t_axis(d)) * env_exp(d, 30) * 0.3
    return (x * 0.7 + body) * 0.8


def hat(open_=False):
    d = 0.18 if open_ else 0.05
    return hp(noise(d), 7500) * env_exp(d, 18 if open_ else 70) * 0.35


def pluck(f, d=0.6, bright=1.0):
    t = t_axis(d)
    x = np.zeros_like(t)
    for k in range(1, 9):
        x += (1 / k ** 1.25) * np.sin(2 * np.pi * f * k * t + k) * np.exp(-t * (3.2 + 2.2 * k / bright))
    return x * adsr(d, 0.002, 0.05) * 0.5


def pad_note(f, d):
    t = t_axis(d)
    x = np.zeros_like(t)
    for det in (-0.12, 0.0, 0.11):
        ff = f * 2 ** (det / 12)
        for k in range(1, 7):
            x += (1 / k ** 1.6) * np.sin(2 * np.pi * ff * k * t + det * 10 + k)
    return x * adsr(d, 0.6, 0.6) * 0.12


def bass_note(f, d):
    t = t_axis(d)
    x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return np.tanh(x * 1.3) * adsr(d, 0.006, 0.04) * 0.55


# F major vi–IV–I–V : Dm, Bb, F, C  (midi roots + triad)
CHORDS = [(50, [62, 65, 69]), (46, [58, 62, 65]), (53, [60, 65, 69]), (48, [60, 64, 67])]
ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1]
ARP_ON = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0]

# mood → stem gains + low-pass cutoff on the music bus
MOODS = {
    "intro":   dict(kick=0.0, clap=0.0, hat=0.35, bass=0.0, pluck=0.55, pad=0.9, cut=1600),
    "hit":     dict(kick=0.0, clap=0.0, hat=0.0, bass=0.0, pluck=0.0, pad=0.35, cut=900),
    "tension": dict(kick=0.85, clap=0.0, hat=0.55, bass=0.75, pluck=0.6, pad=0.35, cut=1500),
    "groove":  dict(kick=1.0, clap=0.7, hat=0.8, bass=0.9, pluck=0.8, pad=0.25, cut=5200),
    "dark":    dict(kick=0.0, clap=0.0, hat=0.0, bass=0.35, pluck=0.0, pad=1.0, cut=800),
    "drop":    dict(kick=1.0, clap=1.0, hat=1.0, bass=1.0, pluck=1.0, pad=0.4, cut=11000),
    "warm":    dict(kick=0.6, clap=0.45, hat=0.6, bass=0.75, pluck=0.95, pad=0.5, cut=6500),
    "lift":    dict(kick=1.0, clap=1.0, hat=1.0, bass=1.0, pluck=1.0, pad=0.6, cut=13000),
    "outro":   dict(kick=0.0, clap=0.0, hat=0.25, bass=0.4, pluck=0.7, pad=0.8, cut=5000),
}
STEMS = ["kick", "clap", "hat", "bass", "pluck", "pad"]


def music(duration, scenes):
    n = int(duration * SR)
    reveal = next((s["start"] for s in scenes if s["at"] == "reveal"), 0.0)
    phase = reveal % (BEAT * 4)  # a bar starts exactly on the reveal
    stems = {k: np.zeros((n, 2)) for k in STEMS}
    K, CL = kick(), clap()
    bar_len = BEAT * 4
    first = phase - bar_len * np.ceil(phase / bar_len)
    b = 0
    t_bar = first
    while t_bar < duration:
        root, triad = CHORDS[b % 4]
        for step in range(16):
            ts = t_bar + step * BEAT / 4
            if ts < -0.5 or ts >= duration:
                continue
            if step % 4 == 0:
                place(stems["kick"], K, ts)
            if step in (4, 12):
                place(stems["clap"], CL, ts, pan=0.05)
            if step % 2 == 0:
                place(stems["hat"], hat(step % 8 == 6), ts + 0.006, gain=0.8 if step % 4 else 0.5, pan=0.25)
            if step % 2 == 0:
                place(stems["bass"], bass_note(midi(root - 12), BEAT / 2 * 0.9), ts, gain=0.7 if step % 4 else 1.0)
            if ARP_ON[step]:
                f = midi(triad[ARP[step]] + 12)
                place(stems["pluck"], pluck(f, 0.55, 1.2), ts, gain=0.55, pan=0.3 * np.sin(step))
        place(stems["pad"], np.stack([sum(pad_note(midi(x), bar_len + 0.6) for x in triad)] * 2, 1), t_bar)
        b += 1
        t_bar += bar_len

    # sidechain: duck everything but kick on each beat
    sc = np.ones(n)
    k_env = 1 - 0.55 * np.exp(-t_axis(BEAT) * 9)
    t = first
    while t < duration:
        i = int(max(0, t) * SR)
        j = min(n, i + len(k_env))
        if j > i:
            sc[i:j] = np.minimum(sc[i:j], k_env[: j - i])
        t += BEAT

    # mood automation
    order = sorted(scenes, key=lambda s: s["start"])
    gains = {k: np.zeros(n) for k in STEMS + ["cut"]}
    for i, s in enumerate(order):
        a = int(s["start"] * SR)
        e = int(order[i + 1]["start"] * SR) if i + 1 < len(order) else n
        m = MOODS.get(s["mood"], MOODS["groove"])
        for k in STEMS:
            gains[k][a:e] = m[k]
        gains["cut"][a:e] = m["cut"]
    smooth = np.ones(int(0.12 * SR)) / int(0.12 * SR)
    for k in gains:
        gains[k] = np.convolve(gains[k], smooth, mode="same")

    mix = np.zeros((n, 2))
    for k in STEMS:
        g = gains[k][:, None]
        if k not in ("kick", "pad"):
            g = g * sc[:, None]
        mix += stems[k] * g * {"kick": 0.9, "clap": 0.5, "hat": 0.45, "bass": 0.6, "pluck": 0.55, "pad": 0.7}[k]
    # time-varying low-pass in blocks (one-pole per channel)
    out = np.zeros_like(mix)
    state = np.zeros(2)
    blk = 256
    for i in range(0, n, blk):
        fc = gains["cut"][min(i, n - 1)]
        a = np.exp(-2 * np.pi * fc / SR)
        seg = mix[i:i + blk]
        y = np.empty_like(seg)
        for c in range(2):
            s_ = state[c]
            # vectorised one-pole via lfilter-equivalent recursion
            from scipy.signal import lfilter
            yc, zf = lfilter([1 - a], [1, -a], seg[:, c], zi=[s_ * a])
            y[:, c] = yc
            state[c] = yc[-1]
        out[i:i + blk] = y
    out = reverb(out, 0.18)
    # fade the tail
    fade = int(1.4 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    return out


# ---------------------------------------------------------------- sound effects
def sfx_whoosh(d=0.42, f0=250, f1=3200, down=False):
    x = noise(d)
    t = t_axis(d)
    centre = f0 * (f1 / f0) ** (t / d) if not down else f1 * (f0 / f1) ** (t / d)
    y = np.zeros_like(x)
    blk = 512
    for i in range(0, len(x), blk):
        c = centre[i]
        y[i:i + blk] = bp(x[i:i + blk + 2048], max(60, c * 0.6), min(16000, c * 1.6))[: len(x[i:i + blk])]
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.6
    yl = y * e
    pan = np.linspace(-0.7, 0.7, len(yl))
    return np.stack([yl * np.sqrt(0.5 * (1 - pan)), yl * np.sqrt(0.5 * (1 + pan))], 1) * 1.6


def sfx_pop():
    d = 0.12
    x = sweep(d, 500, 1500) * env_exp(d, 35)
    return x * 0.6


def sfx_boing():
    d = 0.5
    t = t_axis(d)
    f = 220 * (1 + 0.35 * np.sin(2 * np.pi * 14 * t) * np.exp(-t * 6)) * (1 + t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 6) * 0.35


def sfx_impact():
    d = 1.4
    t = t_axis(d)
    sub = np.sin(2 * np.pi * np.cumsum(30 + 90 * np.exp(-t * 12)) / SR) * np.exp(-t * 3.2)
    crack = lp(noise(d), 2500) * np.exp(-t * 14)
    metal = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * k) for f, k in ((310, 7), (523, 9), (811, 11))) * 0.15
    return np.tanh((sub * 1.2 + crack * 0.8 + metal) * 1.4) * 0.9


def sfx_shatter():
    d = 1.2
    out = np.zeros((int(d * SR), 2))
    burst = hp(noise(0.25), 3000) * env_exp(0.25, 16)
    place(out, burst, 0, 0.6)
    for _ in range(46):
        f = rng.uniform(2500, 8000)
        dd = rng.uniform(0.04, 0.35)
        tink = np.sin(2 * np.pi * f * t_axis(dd)) * env_exp(dd, rng.uniform(15, 40))
        place(out, tink, rng.uniform(0, 0.6) ** 1.6, rng.uniform(0.05, 0.16), rng.uniform(-0.9, 0.9))
    return out


def sfx_thud():
    d = 0.35
    t = t_axis(d)
    x = np.sin(2 * np.pi * np.cumsum(40 + 70 * np.exp(-t * 20)) / SR) * np.exp(-t * 11)
    x[:200] += noise(200 / SR) * 0.4 * np.linspace(1, 0, 200)
    return np.tanh(x * 2) * 0.8


def sfx_drip():
    d = 0.16
    return sweep(d, 1500, 380) * env_exp(d, 22) * 0.45


def sfx_flip():
    out = np.zeros(int(0.15 * SR))
    for k in (0, 0.05):
        c = hp(noise(0.02), 2000) * env_exp(0.02, 200)
        out[int(k * SR):int(k * SR) + len(c)] += c
    return out * 0.5


def sfx_slide():
    return sfx_whoosh(0.3, 300, 1500)[:, 0] * 0.5


def sfx_chomp():
    d = 0.2
    out = np.zeros(int(d * SR))
    for k in (0, 0.035, 0.07):
        c = bp(noise(0.05), 400, 2600) * env_exp(0.05, 70)
        out[int(k * SR):int(k * SR) + len(c)] += c * (1 - k * 6)
    out += np.sin(2 * np.pi * 120 * t_axis(d)) * env_exp(d, 25) * 0.4
    return out * 0.9


def sfx_coin():
    d = 0.6
    t = t_axis(d)
    a = np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t * 8)
    b = np.zeros_like(t)
    o = int(0.07 * SR)
    b[o:] = np.sin(2 * np.pi * 1975.5 * t[: len(t) - o]) * np.exp(-t[: len(t) - o] * 6)
    return (a + b) * 0.22


def sfx_sad():
    notes = [(55, 0.32), (54, 0.32), (53, 0.32), (52, 0.9)]
    out = []
    for m, d in notes:
        t = t_axis(d)
        f = midi(m) * (1 + (0.012 * np.sin(2 * np.pi * 6 * t) if d > 0.5 else 0))
        ph = 2 * np.pi * np.cumsum(f) / SR
        x = sum((1 / k) * np.sin(k * ph) for k in range(1, 9))
        out.append(lp(x, 1400) * adsr(d, 0.03, 0.12))
    return np.concatenate(out) * 0.22


def sfx_type():
    out = np.zeros(int(0.6 * SR))
    for k in range(7):
        c = hp(noise(0.015), 1500) * env_exp(0.015, 300)
        i = int((k * 0.075 + rng.uniform(0, 0.02)) * SR)
        out[i:i + len(c)] += c * rng.uniform(0.6, 1)
    return out * 0.5


def sfx_scratch():
    d = 0.35
    t = t_axis(d)
    c = 900 + 700 * np.sin(2 * np.pi * 5.5 * t)
    x = noise(d)
    y = np.zeros_like(x)
    for i in range(0, len(x), 256):
        y[i:i + 256] = bp(x[i:i + 2304], c[i] * 0.7, c[i] * 1.4)[:len(x[i:i + 256])]
    return y * np.sin(np.pi * t / d) * 0.7


def sfx_stamp():
    return sfx_thud() * 0.9 + np.pad(lp(noise(0.12), 3000) * env_exp(0.12, 30) * 0.5, (0, int(0.35 * SR) - int(0.12 * SR)))


def sfx_nope():
    out = []
    for f in (330, 262):
        d = 0.12
        out += [np.sin(2 * np.pi * f * t_axis(d)) * adsr(d, 0.005, 0.04) * 0.3, np.zeros(int(0.04 * SR))]
    return np.concatenate(out)


def sfx_spotlight():
    d = 1.0
    t = t_axis(d)
    clunk = sfx_thud()
    hum = np.sin(2 * np.pi * 110 * t) * (1 - np.exp(-t * 4)) * np.exp(-t * 2) * 0.15
    out = hum.copy()
    out[: len(clunk)] += clunk * 0.7
    return out


def bell(f, d=1.4, k=3.5):
    t = t_axis(d)
    return sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * k * r ** 0.5) for r, a in ((1, 1), (2.0, 0.4), (2.76, 0.25), (5.4, 0.1)))


def sfx_chime():
    out = np.zeros((int(2.2 * SR), 2))
    for i, m in enumerate((77, 81, 84, 89)):
        place(out, bell(midi(m)) * 0.16, i * 0.07, 1, -0.5 + i * 0.33)
    return out


def sfx_sparkle():
    out = np.zeros((int(1.0 * SR), 2))
    for _ in range(18):
        f = rng.uniform(3000, 7000)
        place(out, np.sin(2 * np.pi * f * t_axis(0.12)) * env_exp(0.12, 30), rng.uniform(0, 0.6), 0.07, rng.uniform(-0.8, 0.8))
    return out


def sfx_birds():
    out = np.zeros(int(1.2 * SR))
    for k, t0 in enumerate((0.0, 0.18, 0.7)):
        d = 0.09
        tt = t_axis(d)
        f = 3200 + 1400 * np.sin(2 * np.pi * 28 * tt)
        c = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / d)
        i = int(t0 * SR)
        out[i:i + len(c)] += c * 0.12
    return out


def sfx_swell():
    d = 0.7
    t = t_axis(d)
    return hp(noise(d), 4000) * (t / d) ** 2.5 * 0.5


def sfx_confetti():
    out = np.zeros((int(0.8 * SR), 2))
    for _ in range(26):
        c = bp(noise(0.012), 2000, 9000) * env_exp(0.012, 300)
        place(out, c, rng.uniform(0, 0.6), 0.25, rng.uniform(-1, 1))
    return out


def sfx_click():
    x = hp(noise(0.006), 3000) * env_exp(0.006, 600)
    body = np.sin(2 * np.pi * 180 * t_axis(0.05)) * env_exp(0.05, 60) * 0.5
    out = body.copy()
    out[: len(x)] += x
    return out * 0.8


def sfx_ding():
    return bell(midi(91), 1.2, 4) * 0.18


def sfx_drop():
    w = sfx_whoosh(0.4, 3000, 200, down=True)
    out = np.zeros((int(0.8 * SR), 2))
    place(out, w, 0)
    place(out, sfx_thud(), 0.36, 0.7)
    return out


def sfx_flash():
    d = 0.5
    t = t_axis(d)
    return hp(noise(d), 5000) * np.exp(-t * 7) * 0.4 + np.sin(2 * np.pi * 2093 * t) * np.exp(-t * 9) * 0.12


def sfx_riser():
    d = 1.6
    t = t_axis(d)
    return (hp(noise(d), 2500) * 0.25 + sweep(d, 180, 900) * 0.12) * (t / d) ** 2


def sfx_tick():
    return hp(noise(0.01), 2500) * env_exp(0.01, 400) * 0.5 + np.sin(2 * np.pi * 2400 * t_axis(0.01)) * env_exp(0.01, 300) * 0.2


SFX = {
    "whoosh": lambda: sfx_whoosh(), "swoosh": lambda: sfx_whoosh(0.3, 600, 5000), "whooshDown": lambda: sfx_whoosh(0.5, 200, 2500, True),
    "pop": sfx_pop, "boing": sfx_boing, "impact": sfx_impact, "shatter": sfx_shatter, "thud": sfx_thud, "drip": sfx_drip,
    "flip": sfx_flip, "slide": sfx_slide, "chomp": sfx_chomp, "coin": sfx_coin, "sad": sfx_sad, "type": sfx_type,
    "scratch": sfx_scratch, "stamp": sfx_stamp, "nope": sfx_nope, "spotlight": sfx_spotlight, "chime": sfx_chime,
    "sparkle": sfx_sparkle, "birds": sfx_birds, "swell": sfx_swell, "confetti": sfx_confetti, "click": sfx_click,
    "ding": sfx_ding, "drop": sfx_drop, "flash": sfx_flash, "riser": sfx_riser, "tick": sfx_tick,
}
SFX_GAIN = 0.55


# ---------------------------------------------------------------- voice
def compress(x, thr_db=-24.0, ratio=3.5, tc=0.025, smooth=0.06):
    """RMS compressor: steadier level so the narrator sounds forward and strong."""
    from scipy.signal import lfilter
    a = np.exp(-1 / (tc * SR))
    env = lfilter([1 - a], [1, -a], x * x)
    lvl = 10 * np.log10(env + 1e-12)
    gr = np.maximum(0, lvl - thr_db) * (1 - 1 / ratio)
    b = np.exp(-1 / (smooth * SR))
    gr = lfilter([1 - b], [1, -b], gr)
    return x * 10 ** (-gr / 20)


def voice_chain(vo):
    vo = hp(vo, 70)
    vo = vo + (10 ** (2.5 / 20) - 1) * lp(vo, 170)          # chest / warmth
    vo = vo + (10 ** (3.5 / 20) - 1) * bp(vo, 2500, 5500)   # presence / clarity
    vo = compress(vo)
    vo = vo / (np.abs(vo).max() + 1e-9)
    return np.tanh(vo * 1.8) / np.tanh(1.8)                 # gentle saturation


# ---------------------------------------------------------------- mix
def main(tool):
    base = f"out/{tool}"
    tl = json.load(open(f"{base}/timeline.json"))
    cues = json.load(open(f"{base}/cues.json"))
    dur = tl["duration"]
    n = int(dur * SR)

    vo, vsr = sf.read(f"{base}/vo.wav")
    vo = resample_poly(vo, SR, vsr)[:n]
    vo = np.pad(vo, (0, n - len(vo)))
    vo = voice_chain(vo)
    vo_st = np.stack([vo, vo], 1)

    mus = music(dur, cues["scenes"])[:n]
    if len(mus) < n:
        mus = np.pad(mus, ((0, n - len(mus)), (0, 0)))

    # duck music under the voice
    env = np.abs(vo)
    win = int(0.08 * SR)
    env = np.convolve(env, np.ones(win) / win, mode="same")
    env = env / (env.max() + 1e-9)
    duck = 1 - 0.7 * np.clip(env * 4, 0, 1)
    duck = np.convolve(duck, np.ones(int(0.15 * SR)) / int(0.15 * SR), mode="same")

    fx = np.zeros((n, 2))
    for ev in cues["events"]:
        f = SFX.get(ev["type"])
        if not f:
            print("unknown sfx", ev["type"])
            continue
        place(fx, f(), ev["t"], ev.get("gain", 1) * SFX_GAIN)
    fx = reverb(fx, 0.15)

    mix = vo_st * 1.0 + mus * 0.2 * duck[:, None] + fx
    peak = np.abs(mix).max()
    mix = mix / max(peak, 1e-9) * 0.95
    sf.write(f"{base}/mix.wav", mix.astype(np.float32), SR)
    print(f"{tool}: mix {dur:.1f}s, {len(cues['events'])} sfx")


if __name__ == "__main__":
    main(sys.argv[1])
