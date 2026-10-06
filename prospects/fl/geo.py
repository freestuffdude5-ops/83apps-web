"""Builds fl_geo.json: Florida counties, ZIP->county, and search locations (cities + CDPs) with population.
    python3 geo.py <dir with downloaded raw files>
Sources: US Census ZCTA-county relationship file (2020), Wikipedia lists of FL municipalities, CDPs and counties.
"""
import json, re, sys, os, glob
from collections import defaultdict
from bs4 import BeautifulSoup

raw = sys.argv[1]
def find(size_hint=None, marker=None):
    for f in glob.glob(os.path.join(raw, '*.dat')):
        t = open(f, 'rb').read(4000).decode('utf-8', 'ignore')
        if marker in t: return f
zip_f = find(marker='GEOID_ZCTA5_20')
cdp_f = find(marker='census-designated places in Florida')
muni_f = find(marker='List of municipalities in Florida')
cty_f = find(marker='List of counties in Florida')

# ZIP -> county (largest land overlap)
best = {}
for ln in open(zip_f, encoding='utf-8-sig'):
    p = ln.rstrip('\n').split('|')
    if len(p) < 18 or not p[9].startswith('12') or not p[1].strip(): continue
    z, cf, cn, area = p[1].strip(), p[9], p[10], int(p[16] or 0)
    if z not in best or area > best[z][2]: best[z] = (cf, cn.replace(' County', ''), area)
zip2county = {z: v[1] for z, v in best.items()}
print('zips', len(zip2county))

def table_rows(path, want):
    soup = BeautifulSoup(open(path, encoding='utf-8', errors='ignore').read(), 'lxml')
    for t in soup.select('table.wikitable'):
        hdr = [re.sub(r'\[.*?\]|\s+', ' ', th.get_text(' ', strip=True)).strip().lower() for th in t.select('tr')[0].find_all(['th', 'td'])]
        if want(hdr):
            for tr in t.select('tr')[1:]:
                cells = [re.sub(r'\[.*?\]', '', c.get_text(' ', strip=True)).strip() for c in tr.find_all(['th', 'td'])]
                yield hdr, cells

def num(s):
    s = re.sub(r'[^\d]', '', s or ''); return int(s) if s else 0

counties = {}
for hdr, c in table_rows(cty_f, lambda h: any('county seat' in x for x in h) and any('population' in x for x in h)):
    row = dict(zip(hdr, c)); name = re.sub(r' County$', '', c[0])
    pop = next((num(v) for k, v in row.items() if 'population' in k), 0)
    counties[name] = dict(name=name, seat=row.get('county seat', ''), pop=pop)
print('counties', len(counties))

locs = {}
def add_locs(path, typ, want):
    for hdr, c in table_rows(path, want):
        if not c or len(c) < len(hdr) - 1: continue
        row = dict(zip(hdr, c))
        ni = next((k for k, h in enumerate(hdr) if 'name' in h or 'census' in h or 'municipality' in h), 0)
        name = c[ni]; cty = next((v for k, v in row.items() if k.startswith('county')), '')
        pop = next((num(v) for k, v in row.items() if k.startswith('population') and 'rank' not in k), 0)
        cs = [re.sub(r' County$', '', x.strip()) for x in re.split(r'[&•,/]|\band\b', cty) if x.strip()]
        if name and cs and name.lower() != 'place name': locs[(name, typ)] = dict(name=name, county=cs[0], counties=cs, pop=pop, type=typ)
add_locs(muni_f, 'city', lambda h: any('county' in x for x in h) and any('population' in x for x in h) and any('place' in x for x in h))
add_locs(cdp_f, 'cdp', lambda h: any('county' in x for x in h) and any('population' in x for x in h))
L = list(locs.values())
print('locations', len(L), 'cities', sum(1 for x in L if x['type'] == 'city'), 'cdps', sum(1 for x in L if x['type'] == 'cdp'))
bad = [x for x in L if x['county'] not in counties]
print('unmatched county names:', len(bad), bad[:6])
json.dump(dict(counties=counties, zip2county=zip2county, locations=L), open('fl_geo.json', 'w'))
