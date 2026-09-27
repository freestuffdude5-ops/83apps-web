"""Collects every lead (verified broken website + no website / social-only with 5+ reviews) across areas
into candidates.json, applying the same filters as report.py.   python3 gather.py
"""
import json, re

AREAS = {'': 'Ormond Beach', 'po': 'Port Orange', 'db': 'Daytona Beach area', 'hh': 'Holly Hill',
         'nsb': 'New Smyrna Beach area', 'pc': 'Palm Coast area', 'dl': 'DeLand'}
src = open('report.py').read()
SKIPCAT = re.compile(re.search(r"SKIPCAT = re\.compile\(r'([^']+)'", src).group(1), re.I)
DROP = re.compile(re.search(r'DROP = re\.compile\(r"([^"]+)"', src).group(1), re.I)

out = {}
for k, area in AREAS.items():
    sfx = f'-{k}' if k else ''
    T = json.load(open(f'targets{sfx}.json'))
    C = {c['cid']: c for c in json.load(open(f'checked{sfx}.json'))}
    for r in T:
        cats = ', '.join((r.get('cats') or [])[:2])
        if SKIPCAT.search(cats) or DROP.search(r['name']): continue
        rv = r.get('reviews') or 0
        if r['kind'] == 'own site':
            c = C.get(r['cid'])
            if not c or c['verdict'] != 'BROKEN': continue
            lead = 'Broken website'
            r = {**r, 'why': c.get('why'), 'shot': c.get('shot')}
        elif r['kind'] == 'none' and rv >= 5: lead = 'No website'
        elif r['kind'] in ('social', 'booking/free page') and rv >= 5: lead = 'Facebook/booking page only'
        else: continue
        r['lead'] = lead; r['area'] = area; r['city'] = r.get('city') or ('Ormond Beach' if not k else '')
        out[r['cid']] = r
json.dump(list(out.values()), open('candidates.json', 'w'))
from collections import Counter
print(len(out), Counter(r['lead'] for r in out.values()))
