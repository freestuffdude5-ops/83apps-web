"""Statewide Florida crawl: for every ZIP code, search the most productive business categories on Google Maps
and store every business (name, address, phone, website link, rating, review count, categories, coordinates)
in a SQLite database. Resumable: finished (zip, category) searches are skipped.

    python3 fl_crawl.py [--db data/fl.db] [--workers 8] [--cats 100] [--zips 32114,32174] [--pages 5] [--county Volusia]

Order of work: round k searches category k in every ZIP that is not yet "saturated". A ZIP is saturated when
the last SAT_ROUNDS categories added fewer than SAT_NEW new businesses, so empty rural ZIPs finish early.
"""
import json, re, sqlite3, sys, os, time, threading, argparse, random
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gmaps'))
import crawl as _crawl
from crawl import search_url, page, find_places, extract, sg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fastget
_crawl.get = fastget.get      # reuse connections: ~3x less CPU than spawning curl per request

SAT_ROUNDS, SAT_NEW, MIN_ROUNDS = 5, 3, 12
HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser()
ap.add_argument('--db', default=os.path.join(HERE, 'data', 'fl.db'))
ap.add_argument('--workers', type=int, default=8)
ap.add_argument('--cats', type=int, default=100)
ap.add_argument('--zips', default='')
ap.add_argument('--county', default='')
ap.add_argument('--pages', type=int, default=5)
args = ap.parse_args()
os.makedirs(os.path.dirname(args.db), exist_ok=True)

db = sqlite3.connect(args.db, check_same_thread=False, timeout=60)
db.execute('PRAGMA journal_mode=WAL')
db.executescript('''
CREATE TABLE IF NOT EXISTS places(cid TEXT PRIMARY KEY, place_id TEXT, name TEXT, address TEXT, zip TEXT, city TEXT, lat REAL, lng REAL,
  phone TEXT, cats TEXT, rating REAL, reviews INTEGER, website TEXT, closed INTEGER, temp_closed INTEGER, nq INTEGER DEFAULT 1, first_query TEXT);
CREATE TABLE IF NOT EXISTS done(q TEXT PRIMARY KEY, n INTEGER, new INTEGER, ts REAL);
''')
lock = threading.Lock()

geo = json.load(open(os.path.join(HERE, 'fl_geo.json')))
z2c = geo['zip2county']
zips = sorted(z2c)
if args.zips: zips = [z for z in args.zips.split(',') if z]
elif args.county: zips = [z for z in zips if z2c[z] == args.county]
cats = [c for c, _ in json.load(open(os.path.join(HERE, 'categories.json')))][:args.cats]


def parse_addr(a):
    m = re.search(r',\s*([^,]+),\s*FL\s*(\d{5})', a or '')
    return (m.group(1).strip(), m.group(2)) if m else ('', '')


def save(e, q):
    sg_ = lambda *i: None
    city, z = parse_addr(e.get('address'))
    with lock:
        cur = db.execute('SELECT 1 FROM places WHERE cid=?', (e['cid'],)).fetchone()
        if cur:
            db.execute('UPDATE places SET nq=nq+1, website=COALESCE(NULLIF(website,\'\'),?), phone=COALESCE(NULLIF(phone,\'\'),?), '
                       'rating=COALESCE(rating,?), reviews=COALESCE(reviews,?), place_id=COALESCE(place_id,?), '
                       'closed=MAX(closed,?), temp_closed=MAX(temp_closed,?) WHERE cid=?',
                       (e.get('website'), e.get('phone'), e.get('rating'), e.get('reviews'), e.get('place_id'), int(bool(e.get('closed'))), int(bool(e.get('temp_closed'))), e['cid']))
            return 0
        db.execute('INSERT INTO places VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)',
                   (e['cid'], e.get('place_id'), e.get('name'), e.get('address'), z, city, e.get('lat'), e.get('lng'), e.get('phone'),
                    json.dumps(e.get('cats') or []), e.get('rating'), e.get('reviews'), e.get('website'),
                    int(bool(e.get('closed'))), int(bool(e.get('temp_closed'))), q))
        return 1


def one(task):
    z, c = task
    q = f'{c} {z}'
    for attempt in range(3):
        try:
            url = search_url(q)
            if not url:
                time.sleep(15 + random.random() * 10); continue
            n = new = 0
            for off in range(0, 20 * args.pages, 20):
                ps = None
                for _t in range(4):
                    d = page(url, off)
                    if d is None: break
                    ps = find_places(d, [])
                    es = [extract(p) for p in ps]
                    if not any(x['rating'] for x in es) or any(x['reviews'] is not None for x in es if x['rating']): break
                    time.sleep(0.3)   # stripped-down response variant without review counts: ask again
                if d is None or not ps: break
                for p in ps:
                    e = extract(p)
                    if not e['cid']: continue
                    e['place_id'] = sg(p, 78); e['lat'] = sg(p, 9, 2); e['lng'] = sg(p, 9, 3)
                    n += 1; new += save(e, q)
                if len(ps) < 15: break
                time.sleep(0.4)
            with lock:
                db.execute('INSERT OR REPLACE INTO done VALUES(?,?,?,?)', (q, n, new, time.time())); db.commit()
            return z, n, new
        except Exception as ex:
            time.sleep(5)
    return z, -1, 0   # failed: not marked done, retried on next run


done = {r[0] for r in db.execute('SELECT q FROM done')}
recent = {z: [] for z in zips}
t0 = time.time(); total_q = 0
with ThreadPoolExecutor(args.workers) as ex:
    for k, c in enumerate(cats):
        active = [z for z in zips if not (k >= MIN_ROUNDS and len(recent[z]) >= SAT_ROUNDS and sum(recent[z][-SAT_ROUNDS:]) < SAT_NEW)]
        todo = [(z, c) for z in active if f'{c} {z}' not in done]
        res = list(ex.map(one, todo)) if todo else []
        fails = sum(1 for r in res if r[1] < 0)
        newmap = {}
        for z, n, new in res: newmap[z] = new
        for z in active:
            if z in newmap: recent[z].append(newmap[z])
            else:   # already done earlier: use stored value
                r = db.execute('SELECT new FROM done WHERE q=?', (f'{c} {z}',)).fetchone()
                recent[z].append(r[0] if r else 0)
        total_q += len(todo)
        tot = db.execute('SELECT COUNT(*) FROM places').fetchone()[0]
        print(f'round {k + 1}/{len(cats)} [{c}] zips active {len(active)} searched {len(todo)} fails {fails} places {tot} elapsed {int(time.time() - t0)}s', flush=True)
print('DONE', db.execute('SELECT COUNT(*) FROM places').fetchone()[0], 'places')
