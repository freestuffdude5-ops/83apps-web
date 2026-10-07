#!/bin/bash
# Starts any pipeline stage that is not running (safe to run repeatedly). Stages resume from the database.
cd "$(dirname "$0")"
pgrep -f '^python3 fl_sites.py' >/dev/null || (nohup python3 fl_sites.py "$@" --workers 110 >> data/sites.log 2>&1 &)
pgrep -f '^python3 fl_recency.py' >/dev/null || (nohup python3 fl_recency.py --workers 28 >> data/recency.log 2>&1 &)
