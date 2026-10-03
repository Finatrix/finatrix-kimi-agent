"""Render the finale's voiceover and the timeline the 3D finale is cut to.

Every line is synthesised on its own and then laid end to end with a chosen
breath before it, so the gaps are directed rather than whatever the TTS model
happens to leave. The start and end of every line is written to
`../finale/timeline.json`; the 3D scene reads its cues from that file, so the
picture always lands on the word, even after a line is re-recorded.

Local and free: Kokoro-82M (Apache-2.0) via kokoro-onnx. Model files:
  https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
Usage:
  python voiceover.py --models <dir holding kokoro-v1.0.onnx and voices-v1.0.bin>
"""

import argparse
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
VOICE = "am_michael"
SPEED = 0.9
SAMPLE_RATE = 24000

# (cue id, spoken text, seconds of silence before the line).
# "Finnatricks" is a phonetic spelling: the model reads "FinatriX" as
# "fine-a-tree X". It lands as FIN-uh-tricks.
SCRIPT = [
    ("life", "Life gets hard...", 1.55),
    ("manage", "when you can't manage your money.", 0.3),
    ("budget", "Your budget.", 1.1),
    ("expenses", "Your expenses.", 0.4),
    ("investments", "Your investments.", 0.4),
    ("future", "Your plans for the future.", 0.4),
    ("networth", "And knowing what you're truly worth.", 0.45),
    ("converge", "What if one app could bring it all together...", 0.8),
    ("lift", "and lift you up?", 0.2),
    ("logo", "That's why you need Finnatricks.", 0.75),
    ("eight", "Eight tools.", 0.85),
    ("one", "One place.", 0.35),
    ("infinite", "Infinite solutions.", 0.35),
    ("available", "Available on the App Store and Google Play.", 0.9),
    ("date", "October fourteenth.", 0.3),
]
TAIL = 2.2  # the end card holds after the last word


def trim(audio: np.ndarray, threshold: float = 0.004) -> np.ndarray:
    """Cut the model's leading/trailing near-silence so gaps are ours alone."""
    loud = np.nonzero(np.abs(audio) > threshold)[0]
    if loud.size == 0:
        return audio
    pad = int(0.02 * SAMPLE_RATE)
    return audio[max(0, loud[0] - pad): loud[-1] + pad]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", required=True, type=Path)
    args = parser.parse_args()

    kokoro = Kokoro(str(args.models / "kokoro-v1.0.onnx"), str(args.models / "voices-v1.0.bin"))
    pieces, cues, cursor = [], {}, 0.0
    for cue, text, breath in SCRIPT:
        audio, sr = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        assert sr == SAMPLE_RATE
        audio = trim(audio)
        pieces.append(np.zeros(int(breath * SAMPLE_RATE), dtype=np.float32))
        cursor += breath
        start = cursor
        pieces.append(audio.astype(np.float32))
        cursor += len(audio) / SAMPLE_RATE
        cues[cue] = {"start": round(start, 3), "end": round(cursor, 3), "text": text}
    pieces.append(np.zeros(int(TAIL * SAMPLE_RATE), dtype=np.float32))
    duration = cursor + TAIL

    track = np.concatenate(pieces)
    track *= 0.89 / max(1e-6, float(np.abs(track).max()))  # peak at -1 dBFS
    sf.write(HERE / "vo.wav", track, SAMPLE_RATE, subtype="PCM_16")

    timeline = {"duration": round(duration, 3), "voice": VOICE, "cues": cues}
    (HERE.parent / "finale" / "timeline.json").write_text(json.dumps(timeline, indent=2) + "\n")
    for cue, c in cues.items():
        print(f"{cue:12s} {c['start']:6.2f} - {c['end']:6.2f}  {c['text']}")
    print(f"duration {duration:.2f}s")


if __name__ == "__main__":
    main()
