#!/usr/bin/env bash
# Builds the delivery files from the editable source.
#   1. capture/  — plates already in assets/plates (re-run capture/0*.mjs to refresh)
#   2. audio     — node audio/synth.mjs           → audio/mix.wav
#   3. picture   — node render.mjs video          → renders/master/picture.mov (lossless)
#   4. this      — master audio, encode, mux      → renders/finatrix-launch-vertical.mp4
set -euo pipefail
cd "$(dirname "$0")"

[[ "${SKIP_PICTURE:-0}" == 1 ]] || node render.mjs video
node audio/synth.mjs

# Audio master: -14 LUFS integrated, true peak <= -1 dBTP. A limiter tames the
# transients first so the two-pass loudnorm can stay in linear mode.
PRE="volume=3dB,alimiter=limit=0.70:attack=2:release=60:level=false"
MEAS=$(ffmpeg -hide_banner -nostats -i audio/mix.wav -af "$PRE,loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
val() { echo "$MEAS" | grep "\"$1\"" | sed -E 's/.*: "([^"]+)".*/\1/'; }
ffmpeg -hide_banner -loglevel error -y -i audio/mix.wav -af "$PRE,loudnorm=I=-14:TP=-1.5:LRA=7:linear=true:\
measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset),\
aresample=48000" -c:a pcm_s24le renders/master/audio-master.wav

# Picture + sound: H.264 High, 1080x1920, 30p, yuv420p (BT.709), ~18 Mb/s,
# AAC-LC stereo 48 kHz, fast-start for web delivery.
ffmpeg -hide_banner -loglevel error -y \
  -i renders/master/picture.mov -i renders/master/audio-master.wav \
  -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slow -profile:v high -level:v 4.2 -pix_fmt yuv420p \
  -b:v 18M -maxrate 24M -bufsize 36M -g 30 -bf 2 -x264-params "aq-mode=3" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -r 30 -c:a aac -b:a 320k -ar 48000 -ac 2 \
  -movflags +faststart -metadata title="FinatriX — launch film" -shortest \
  renders/finatrix-launch-vertical.mp4

# Poster: the first fully settled product frame (SEE THE MONTH, frame 70).
ffmpeg -hide_banner -loglevel error -y -i renders/master/picture.mov -vf "select=eq(n\,70)" -frames:v 1 renders/finatrix-launch-poster.png
echo "built renders/finatrix-launch-vertical.mp4"
