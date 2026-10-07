#!/bin/bash
# Starts any pipeline stage that is not running (safe to run repeatedly). Stages resume from the database.
cd "$(dirname "$0")"
for i in 0 1; do
  pgrep -f "^python3 fl_recency.py .*--shard $i/2" >/dev/null || (nohup python3 fl_recency.py --shard $i/2 --workers 20 "$@" >> data/recency$i.log 2>&1 &)
done
for i in 0 1 2 3; do
  pgrep -f "^python3 fl_sites.py .*--shard $i/4" >/dev/null || (nohup nice -n 10 python3 fl_sites.py --shard $i/4 --workers 40 --minreviews 2 >> data/sites$i.log 2>&1 &)
done
