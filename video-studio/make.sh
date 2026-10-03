#!/bin/bash
# Build one finished film: render frames → synthesise + mix audio → mux (loudness-normalised) → share copy.
set -e
tool=$1
cd "$(dirname "$0")"
node render.mjs "$tool" 2>&1 | grep -v "404" | tail -1
python3 audio/mix.py "$tool"
ffmpeg -v error -y -i out/$tool/silent.mp4 -i out/$tool/mix.wav -map 0:v -map 1:a -c:v copy \
  -af "loudnorm=I=-14:TP=-1.2:LRA=9" -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart out/$tool/master.mp4
ffmpeg -v error -y -i out/$tool/master.mp4 -c:v libx264 -preset slow -tune film -crf 23 -maxrate 5M -bufsize 10M \
  -pix_fmt yuv420p -c:a copy -movflags +faststart out/$tool/FinatriX-$tool.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 out/$tool/FinatriX-$tool.mp4 | tr '\n' ' '; echo
