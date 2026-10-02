#!/usr/bin/env bash
# Builds the delivery files from the editable source.
#   ./build.sh            → the 56.6 s launch film (src/film2.*, audio/synth2.mjs, vo/)
#   ./build.sh teaser     → the 16 s teaser       (src/film.*,  audio/synth.mjs)
# Steps: render the picture (lossless MOV) → synthesize and mix the audio →
# master to -14 LUFS / <= -1 dBTP → encode H.264 High + AAC with fast-start.
# SKIP_PICTURE=1 reuses an existing picture master.
set -euo pipefail
cd "$(dirname "$0")"
CUT="${1:-launch}"

if [[ "$CUT" == teaser ]]; then
  FILM=film; PIC=renders/master/picture.mov; SYNTH=audio/synth.mjs; MIX=audio/mix.wav
  OUT=renders/finatrix-teaser-16s.mp4; POSTER=renders/finatrix-teaser-poster.png; POSTER_FRAME=70
  TITLE="FinatriX — teaser"
else
  FILM=film2; PIC=renders/master/film2-picture.mov; SYNTH=audio/synth2.mjs; MIX=audio/mix2.wav
  OUT=renders/finatrix-launch-vertical.mp4; POSTER=renders/finatrix-launch-poster.png; POSTER_FRAME=470
  TITLE="FinatriX — launch film"
  # The narration lines are resampled from Kokoro's 24 kHz to the mix rate.
  mkdir -p vo/48k
  for f in vo/lines/*.wav; do
    ffmpeg -hide_banner -loglevel error -y -i "$f" -af "aresample=48000:resampler=soxr" -c:a pcm_f32le "vo/48k/$(basename "$f")"
  done
fi

[[ "${SKIP_PICTURE:-0}" == 1 ]] || FILM=$FILM node render.mjs video
node "$SYNTH"

# Audio master: a limiter tames transients so two-pass loudnorm can stay linear.
PRE="volume=3dB,alimiter=limit=0.70:attack=2:release=60:level=false"
MEAS=$(ffmpeg -hide_banner -nostats -i "$MIX" -af "$PRE,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
val() { echo "$MEAS" | grep "\"$1\"" | sed -E 's/.*: "([^"]+)".*/\1/'; }
MASTER="renders/master/${FILM}-audio-master.wav"
ffmpeg -hide_banner -loglevel error -y -i "$MIX" -af "$PRE,loudnorm=I=-14:TP=-1.5:LRA=11:linear=true:\
measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset),\
aresample=48000" -c:a pcm_s24le "$MASTER"

ffmpeg -hide_banner -loglevel error -y \
  -i "$PIC" -i "$MASTER" -map 0:v -map 1:a \
  -vf "scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p" \
  -c:v libx264 -preset slow -profile:v high -level:v 4.2 -pix_fmt yuv420p \
  -b:v 18M -maxrate 24M -bufsize 36M -g 30 -bf 2 -x264-params "aq-mode=3" \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv \
  -r 30 -c:a aac -b:a 320k -ar 48000 -ac 2 \
  -movflags +faststart -metadata title="$TITLE" -shortest "$OUT"

ffmpeg -hide_banner -loglevel error -y -i "$PIC" -vf "select=eq(n\,$POSTER_FRAME)" -frames:v 1 "$POSTER"
echo "built $OUT"
