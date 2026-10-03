#!/bin/bash
# Review aid — usage: sheets.sh <tool>. Tiles out/<tool>/stills into 8x2 contact sheets with timestamps.
cd "$(dirname "$0")"
tool=$1; d=out/$tool/stills; rm -f out/$tool/sheet_*.png
list=$(mktemp); ls $d/*.jpg | sort -V > "$list"
i=0; n=0
mapfile -t files < "$list"
while [ $i -lt ${#files[@]} ]; do
  chunk=("${files[@]:$i:16}")
  args=(); f=""
  for k in "${!chunk[@]}"; do
    b=$(basename "${chunk[$k]}" .jpg); b=${b#t}
    args+=(-i "${chunk[$k]}"); f+="[$k:v]scale=240:426,drawtext=text='$b':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6[v$k];"
  done
  cnt=${#chunk[@]}; while [ $cnt -lt 16 ]; do args+=(-f lavfi -i color=black:s=240x426); f+="[$cnt:v]null[v$cnt];"; cnt=$((cnt+1)); done
  ins=""; for k in $(seq 0 15); do ins+="[v$k]"; done
  ffmpeg -v error -y "${args[@]}" -filter_complex "${f}${ins}xstack=inputs=16:grid=8x2" -frames:v 1 out/$tool/sheet_$n.png
  i=$((i+16)); n=$((n+1))
done
ls out/$tool/sheet_*.png
