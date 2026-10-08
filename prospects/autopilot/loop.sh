#!/bin/bash
# Keeps filling the ready-to-send pool: nearby counties first, then the rest of Florida.
# Each round takes a mix of lead types (best email yield first), browser-checks them, finds emails,
# builds the concept images and emails, and pushes to the Sheet if autopilot/.env exists.
cd "$(dirname "$0")"
NEAR="Volusia,Flagler,St. Johns,Seminole,Brevard,Orange,Lake,Putnam,Marion,Osceola"
pick() {  # kind count
  n=$(python3 run.py select --count "$2" --county "$NEAR" --kinds "$1" | grep -o 'selected [0-9]*' | grep -o '[0-9]*')
  [ "${n:-0}" -lt "$2" ] && python3 run.py select --count $(( $2 - ${n:-0} )) --kinds "$1" > /dev/null
}
while true; do
  pick broken 40; pick booking 40; pick facebook 40; pick site 25; pick working 15; pick nosite 40
  python3 run.py probe --workers 5
  python3 run.py emails
  python3 run.py build
  [ -f .env ] && python3 run.py push
  python3 run.py status
  sleep 20
done
