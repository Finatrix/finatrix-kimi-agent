#!/usr/bin/env bash
# Builds the offline narration toolchain in $1 (default: /tmp/finatrix-tts).
# Everything comes from the npm registry: kokoro-js (phonemizer + voices) and the
# Kokoro-82M fp32 ONNX weights, which are published as byte-identical shards.
set -euo pipefail
DIR="${1:-/tmp/finatrix-tts}"; HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR" && cd "$DIR"
[[ -f package.json ]] || npm init -y >/dev/null
npm i --no-audit --no-fund kokoro-js@1.2.1 kokoro-fp32a-shards@1.0.0 kokoro-fp32b-shards@1.0.0 kokoro-fp32c-shards@1.0.0
cat $(for i in $(seq 0 18); do ls node_modules/kokoro-fp32*-shards/kokoro-fp32.part$i.bin; done) > kokoro-fp32.onnx
echo "8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb  kokoro-fp32.onnx" | sha256sum -c -
cp "$HERE/kokoro.mjs" "$HERE/kokoro-vocab.json" .
echo "Toolchain ready. Run: TTS_DIR=$DIR node $HERE/generate.mjs"
