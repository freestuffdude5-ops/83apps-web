#!/bin/bash
# Keeps stages 2 and 3 running on newly crawled businesses until the crawl is finished, then does one final pass.
cd "$(dirname "$0")"
while pgrep -f "^python3 fl_(sites|recency)" > /dev/null; do sleep 30; done      # let any already-running stage finish
while true; do
  fin=0; [ -f data/crawl.finished ] && fin=1
  python3 fl_sites.py --workers 24 >> data/sites.log 2>&1
  python3 fl_recency.py --workers 12 >> data/recency.log 2>&1
  [ $fin = 1 ] && break
  sleep 120
done
touch data/stages.finished
