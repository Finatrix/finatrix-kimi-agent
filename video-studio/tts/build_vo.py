"""Render each script line with Kokoro, then lay the lines out on one timeline.

Writes out/<tool>/vo.wav and timeline.json (line start/end in seconds), which the
motion-graphics engine reads to sync every scene to the voice.

usage (from video-studio/): python3 tts/build_vo.py [voice|default] [speed|auto] [tool ...]
Model files go in .models/ (see README).
"""
import json, os, re, sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# "a=0.5,b=0.5" blends Kokoro voice styles; default is a deeper, stronger narrator.
VOICE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != "default" else "am_michael=0.5,am_onyx=0.5"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# "auto" reads per-tool pacing from tts/speeds.json (keeps every film in 50–55 s)
SPEED_ARG = sys.argv[2] if len(sys.argv) > 2 else "auto"
SPEEDS = json.load(open(os.path.join(ROOT, "tts", "speeds.json")))
ONLY = sys.argv[3:]
SR = 24000
# Spell out acronyms so the TTS says letters, not words.
# Brand pronunciation approved by the owner: the G2P reading of "Finatrix" (faɪnˈeɪtɹɪks).
SPOKEN = {"FinatriX": "Finatrix", "SIP": "S I P", "EMI": "E M I", "UPI": "U P I", "EPF": "E P F"}
BRAND_IPA = "faɪnˈeɪtɹɪks"
# Breathing room after the beats that land a point.
GAP_AFTER = {"lie": 0.45, "where": 0.35, "l4": 0.4, "night": 0.55, "stamp": 0.3, "feature": 0.5, "tag": 0.35}
DEFAULT_GAP = 0.2
LEAD, TAIL = 0.35, 1.8


def trim(a, thr=0.012):
    idx = np.where(np.abs(a) > thr)[0]
    return a[max(0, idx[0] - 240): idx[-1] + 480] if len(idx) else a


def voice_style(k, spec):
    if "=" not in spec:
        return k.get_voice_style(spec)
    parts = [x.split("=") for x in spec.split(",")]
    return sum(float(w) * k.get_voice_style(n) for n, w in parts)


def main():
    models = os.path.join(ROOT, ".models")
    k = Kokoro(os.path.join(models, "kokoro.onnx"), os.path.join(models, "voices.bin"))
    style = voice_style(k, VOICE)
    scripts = json.load(open(os.path.join(ROOT, "scripts.json")))
    for tool, lines in scripts.items():
        if ONLY and tool not in ONLY:
            continue
        speed = SPEEDS.get(tool, 1.06) if SPEED_ARG == "auto" else float(SPEED_ARG)
        t, chunks, timeline = LEAD, [np.zeros(int(LEAD * SR))], []
        for lid, text in lines:
            say = text
            for a, b in SPOKEN.items():
                say = re.sub(rf"\b{a}\b", b, say)
            ph = k.tokenizer.phonemize(say, "en-us")
            if "finatrix" in say.lower() and BRAND_IPA not in ph:
                raise SystemExit(f"unexpected brand pronunciation in: {ph}")
            s, _ = k.create(ph, voice=style, speed=speed, lang="en-us", is_phonemes=True)
            s = trim(s.astype(np.float32))
            d = len(s) / SR
            timeline.append({"id": lid, "text": text, "start": round(t, 3), "end": round(t + d, 3)})
            gap = GAP_AFTER.get(lid, DEFAULT_GAP)
            chunks += [s, np.zeros(int(gap * SR))]
            t += d + gap
        chunks.append(np.zeros(int(TAIL * SR)))
        audio = np.concatenate(chunks)
        audio = audio / max(1e-6, float(np.abs(audio).max())) * 0.89
        out = os.path.join(ROOT, "out", tool)
        os.makedirs(out, exist_ok=True)
        sf.write(os.path.join(out, "vo.wav"), audio, SR)
        dur = len(audio) / SR
        json.dump({"tool": tool, "duration": round(dur, 3), "lines": timeline},
                  open(os.path.join(out, "timeline.json"), "w"), indent=1)
        print(f"{tool:12s} {dur:5.1f}s")


if __name__ == "__main__":
    main()
