#!/bin/bash
# Full Google-first pipeline for one area; resumable at every step.
#   ./run_area.sh <key> <pages> "<City|City>" "<Area label>"
set -u
k=$1; pages=$2; cities=$3; label=$4
PAGES=$pages python3 crawl.py queries-$k.txt places-$k.json > crawl-$k.log 2>&1
python3 targets.py places-$k.json targets-$k.json "$cities" > targets-$k.log 2>&1
python3 -c "import json; json.dump([x for x in json.load(open('targets-$k.json')) if x['kind']=='own site'], open('own-$k.json','w'))"
node check_sites.mjs own-$k.json checked-$k.json > check-$k.log 2>&1
python3 report.py "$label" $k > report-$k.txt 2>&1
echo "DONE $k" >> areas.done
