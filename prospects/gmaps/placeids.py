"""Adds Google place IDs to candidates.json (needed to open the full profile). Resumable.
    python3 placeids.py
"""
import json, os, time
from concurrent.futures import ThreadPoolExecutor
from crawl import search_url, page, find_places, sg

C = json.load(open('candidates.json'))
cache = json.load(open('placeids.json')) if os.path.exists('placeids.json') else {}


def look(r):
    if r['cid'] in cache: return
    q = f"{r['name']} {(r.get('address') or '').split(',')[0]} {r.get('city') or ''} FL"
    for attempt in range(2):
        try:
            u = search_url(q)
            d = page(u, 0) if u else None
            for p in find_places(d or [], []):
                if sg(p, 10) == r['cid']: cache[r['cid']] = sg(p, 78); return
            break
        except Exception:
            time.sleep(3)
    cache[r['cid']] = None


todo = [r for r in C if r['cid'] not in cache]
print(len(todo), 'to look up')
for i in range(0, len(todo), 30):
    with ThreadPoolExecutor(3) as ex: list(ex.map(look, todo[i:i + 30]))
    json.dump(cache, open('placeids.json', 'w'))
    print(i + 30, flush=True)
for r in C: r['placeId'] = cache.get(r['cid'])
json.dump(C, open('candidates.json', 'w'))
print('found', sum(1 for r in C if r.get('placeId')), 'of', len(C))
