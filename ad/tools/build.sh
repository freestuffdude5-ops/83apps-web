#!/usr/bin/env bash
# Renders every deliverable: 30s vertical, 30s landscape, 15s vertical and
# 15s landscape, each with and without the soundtrack.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out/final
WORKERS=${WORKERS:-3}
for job in "vertical 30" "landscape 30" "vertical 15" "landscape 15"; do
  set -- $job
  fmt=$1; cut=$2
  name="83apps-${cut}s-${fmt}"
  node tools/render.mjs --format "$fmt" --cut "$cut" --workers "$WORKERS" --out "out/final/${name}-silent.mp4"
  node tools/cues.mjs "$cut" > "out/cues-${cut}.json"
  python3 tools/audio.py "out/cues-${cut}.json" "out/audio-${cut}.wav"
  node tools/mux.mjs "out/final/${name}-silent.mp4" "out/audio-${cut}.wav" "out/final/${name}.mp4"
done
ls -lh out/final
