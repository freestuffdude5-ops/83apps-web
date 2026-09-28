"""For popular 'No website' leads, tries likely domains (businessname.com etc.). If one loads a page that
names the business, the business probably has a site that just isn't linked on Google. Cache: guesses.json
    python3 site_guess.py
"""
import json, os, re, subprocess
from concurrent.futures import ThreadPoolExecutor

C = json.load(open('candidates.json'))
R = json.load(open('recency.json'))
cache = json.load(open('guesses.json')) if os.path.exists('guesses.json') else {}
STOP = {'the', 'and', 'of', 'llc', 'inc', 'co', 'company', 'services', 'service', 'fl', 'florida', 'daytona', 'beach', 'ormond',
        'port', 'orange', 'palm', 'coast', 'deland', 'holly', 'hill', 'new', 'smyrna', 'south', 'shores', 'at', 'by', 'in', 'on'}


def words(name):
    return [w for w in re.sub(r"[^a-z0-9 ]", ' ', name.lower().replace('&', ' and ').replace("'", '')).split() if w]


def guesses(r):
    w = words(r['name']); core = [x for x in w if x not in STOP] or w
    city = re.sub(r'[^a-z]', '', (r.get('city') or '').lower())
    s = {''.join(w), ''.join(core), ''.join(w[:3]), ''.join(core[:2])}
    out = []
    for b in s:
        if len(b) < 4: continue
        out += [f'{b}.com', f'{b}fl.com', f'{b}{city}.com', f'{b}.net']
    return list(dict.fromkeys(out))[:10]


def fetch(url):
    try:
        return subprocess.run(['curl', '-sSL', '-m', '12', '-A', 'Mozilla/5.0', url], capture_output=True, text=True, timeout=20).stdout[:60000]
    except Exception:
        return ''


def check(r):
    if r['cid'] in cache: return
    key = [x for x in words(r['name']) if x not in STOP and len(x) > 3][:2] or words(r['name'])[:1]
    found = None
    for d in guesses(r):
        h = fetch('http://' + d)
        if not h: continue
        t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h)).lower()
        if re.search(r'for sale|parked|buy this domain|domain has expired|godaddy', t): continue
        if all(k in t for k in key): found = d; break
    cache[r['cid']] = found


todo = [r for r in C if r['lead'] == 'No website' and (r.get('reviews') or 0) >= 50
        and (R.get(r['cid'], {}).get('newestDays') or 9999) <= 365 and r['cid'] not in cache]
print(len(todo), 'to check')
with ThreadPoolExecutor(8) as ex: list(ex.map(check, todo))
json.dump(cache, open('guesses.json', 'w'))
print('probably have an unlinked site:', sum(1 for v in cache.values() if v))
