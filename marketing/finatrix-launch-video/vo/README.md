# Narration

The voiceover is synthesized offline with **Kokoro-82M** (Apache-2.0), using the
`af_heart` voice. The script lives in `script.json`: `text` is the line as written,
and `say` is what the model reads. "FinatriX" is respelled "Finna-trix" so it is
spoken FIN-uh-trix. **Confirm that pronunciation before publishing.**

| File | What it is |
| --- | --- |
| `script.json` | The 18 lines, the voice, and the brand respelling |
| `lines/*.wav` | The rendered lines (24 kHz mono float), committed so the mix rebuilds without the model |
| `lines.json`, `extents.json` | Each line's file length and its speech start and end, used to place it on the timeline |
| `generate.mjs` | Renders every line from `script.json` |
| `kokoro.mjs`, `kokoro-vocab.json` | The runner: kokoro-js phonemizer and voices, the ONNX graph on onnxruntime-node, and Kokoro's 114-symbol vocabulary |
| `setup-tts.sh` | Builds the toolchain from the npm registry only, and checks the weights' SHA-256 |

## Regenerate

```bash
vo/setup-tts.sh /tmp/finatrix-tts                     # about 330 MB, one time
TTS_DIR=/tmp/finatrix-tts node vo/generate.mjs        # writes lines/ and lines.json
```

`extents.json` must be recomputed if a line changes. It is the first and last 10 ms
frame within 38 dB of the line's peak.

## How it was checked

Without listening, the narration was checked by machine. Every line, and then the
whole final mix, was transcribed with Whisper-base. The transcript matches the
script line for line. Two wordings were changed because the first take transcribed
wrongly:
- "Log a spend" was heard as "Log is spent", so it became "Log any spend".
- On its own, the brand line was heard with a "V", so the brand name now opens the
  tagline sentence.

The brand line also starts 0.3 s after the brand hit, so the impact no longer masks
the "F".
