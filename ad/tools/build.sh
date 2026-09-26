#!/usr/bin/env bash
# Renders every deliverable for a film: 30s and 15s, vertical and landscape,
# each with and without the soundtrack.
#   ./tools/build.sh            → main film       (renders/83apps-*.mp4)
#   ./tools/build.sh makeover   → website makeover (renders/83apps-makeover-*.mp4)
set -euo pipefail
cd "$(dirname "$0")/.."
FILM=${1:-main}
PREFIX=$([ "$FILM" = main ] && echo "83apps" || echo "83apps-$FILM")
mkdir -p out/final
WORKERS=${WORKERS:-3}
for job in "vertical 30" "landscape 30" "vertical 15" "landscape 15"; do
  set -- $job
  fmt=$1; cut=$2
  name="${PREFIX}-${cut}s-${fmt}"
  node tools/render.mjs --film "$FILM" --format "$fmt" --cut "$cut" --workers "$WORKERS" --out "out/final/${name}-silent.mp4"
  node tools/cues.mjs "$cut" "$FILM" > "out/cues-${FILM}-${cut}.json"
  python3 tools/audio.py "out/cues-${FILM}-${cut}.json" "out/audio-${FILM}-${cut}.wav"
  node tools/mux.mjs "out/final/${name}-silent.mp4" "out/audio-${FILM}-${cut}.wav" "out/final/${name}.mp4"
done
ls -lh out/final
