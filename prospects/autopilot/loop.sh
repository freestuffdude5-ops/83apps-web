#!/bin/bash
# Keeps filling the ready-to-send pool: nearby counties first, then the rest of Florida.
# Each round: pick 150 more leads, browser-check them, find emails, build concepts, push to the Sheet if connected.
cd "$(dirname "$0")"
NEAR="Volusia,Flagler,St. Johns,Seminole,Brevard,Orange,Lake,Putnam,Marion,Osceola"
while true; do
  n=$(python3 run.py select --count 150 --county "$NEAR" | grep -o 'selected [0-9]*' | grep -o '[0-9]*')
  [ "${n:-0}" -eq 0 ] && python3 run.py select --count 150
  python3 run.py probe --workers 5
  python3 run.py emails
  python3 run.py build
  [ -f .env ] && python3 run.py push
  python3 run.py status
  sleep 30
done
