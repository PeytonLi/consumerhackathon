#!/usr/bin/env bash
set -euo pipefail
video=${1:-"$HOME/.capy/work/nickel-video/final.mp4"}
output=${2:-"$HOME/.capy/work/nickel-video/contact-sheet.png"}
mkdir -p "$(dirname "$output")"
ffmpeg -hide_banner -loglevel error -i "$video" -vf "fps=20/74.25,scale=480:-1:flags=lanczos,tile=4x5:padding=14:margin=12:color=0xf2f3fa" -frames:v 1 -update 1 "$output" -y
