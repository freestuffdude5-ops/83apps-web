"""Google Maps crawl: every business Google shows for a set of category searches, with the exact
website link, rating and review count from each Google Business Profile.
    python3 crawl.py queries.txt places.json
Resumable: queries already in places.json's _done list are skipped.
"""
import json, re, sys, time, html, subprocess, urllib.parse, os

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"


def get(url):
    return subprocess.run(["curl", "-sSL", "-m", "30", "-A", UA, "-H", "Accept-Language: en-US,en", url],
                          capture_output=True, text=True).stdout


def sg(a, *idx):
    try:
        for i in idx: a = a[i]
        return a
    except Exception:
        return None


def find_places(x, acc):
    if isinstance(x, list):
        if len(x) > 100 and isinstance(sg(x, 11), str) and isinstance(sg(x, 10), str) and re.match(r'0x[0-9a-f]+:0x[0-9a-f]+', sg(x, 10)):
            acc.append(x); return acc
        for y in x: find_places(y, acc)
    return acc


def search_url(q):
    h = get("https://www.google.com/maps/search/" + urllib.parse.quote_plus(q) + "?hl=en")
    m = re.search(r'/search\?tbm=map[^"]+', h)
    return html.unescape(m.group(0)) if m else None


def page(url, offset):
    u = url.replace('%217i20', f'%217i20%218i{offset}') if offset else url
    t = get("https://www.google.com" + u)
    if '\n' not in t: return None
    try: return json.loads(t[t.index('\n') + 1:])
    except Exception: return None


def extract(p):
    s = json.dumps(p)
    rev = sg(p, 4, 8)
    if rev is None:
        m = re.search(r'"(\d[\d,]*) reviews?"', s); rev = int(m.group(1).replace(',', '')) if m else None
    return dict(cid=sg(p, 10), name=sg(p, 11), rating=sg(p, 4, 7), reviews=rev, website=sg(p, 7, 0),
                address=sg(p, 39) or sg(p, 18), phone=sg(p, 178, 0, 0), cats=sg(p, 13),
                closed='Permanently closed' in s, temp_closed='Temporarily closed' in s)


def merge(a, b):
    for k, v in b.items():
        if a.get(k) in (None, [], '') and v not in (None, [], ''): a[k] = v
    a['closed'] = a.get('closed') or b.get('closed'); a['temp_closed'] = a.get('temp_closed') or b.get('temp_closed')
    return a


if __name__ == '__main__':
    qfile, out = sys.argv[1:3]
    queries = [q.strip() for q in open(qfile) if q.strip()]
    state = json.load(open(out)) if os.path.exists(out) else {'places': {}, '_done': []}
    P = state['places']
    for q in queries:
        if q in state['_done']: continue
        url = search_url(q)
        if not url: print('NO URL (blocked?)', q); time.sleep(20); continue
        got = 0
        for off in (0, 20, 40):
            d = page(url, off)
            if d is None: break
            ps = find_places(d, [])
            if not ps: break
            for p in ps:
                e = extract(p)
                if not e['cid']: continue
                e.setdefault('queries', [])
                P[e['cid']] = merge(P.get(e['cid'], {'queries': []}), e)
                if q not in P[e['cid']]['queries']: P[e['cid']]['queries'].append(q)
                got += 1
            if len(ps) < 15: break
            time.sleep(1.5)
        state['_done'].append(q)
        json.dump(state, open(out, 'w'))
        print(f'{got:>3} {len(P):>5}  {q}', flush=True)
        time.sleep(1.5)
