"""Stage 3: how recently has each business been reviewed (is it still active)? One lightweight request per business to
Google's place preview data (no browser): reads the visible reviews' exact timestamps and the closed flags.

    python3 fl_recency.py [--db data/fl.db] [--workers 12] [--scope leads|all] [--limit N]
`leads` = no website / social / booking page / broken or unverified own site, with 2+ Google reviews, not closed.
Resumable: businesses already in the `activity` table are skipped.
"""
import json, re, sqlite3, subprocess, sys, os, time, threading, argparse, random
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--db', default=os.path.join(HERE, 'data', 'fl.db'))
ap.add_argument('--workers', type=int, default=12)
ap.add_argument('--scope', default='leads')
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--minreviews', type=int, default=2)
args = ap.parse_args()

TEMPLATE = open(os.path.join(HERE, 'pb_template.txt')).read().strip()
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
from fl_sites import kind_of

db = sqlite3.connect(args.db, check_same_thread=False, timeout=120)
db.execute('PRAGMA journal_mode=WAL')
db.execute('CREATE TABLE IF NOT EXISTS activity(cid TEXT PRIMARY KEY, newest_ts REAL, newest_days INTEGER, seen INTEGER, perm_closed INTEGER, temp_closed INTEGER, total_reviews INTEGER, err TEXT, ts REAL)')
lock = threading.Lock()


def url_for(cid):
    hexid = cid.replace(':', '%3A')
    return 'https://www.google.com' + re.sub(r'0x[0-9a-f]+%3A0x[0-9a-f]+', hexid, TEMPLATE, count=1)


import fastget


def fetch(cid):
    return fastget.get(url_for(cid))


UNIT = {'hour': 0, 'day': 1, 'week': 7, 'month': 30, 'year': 365}


def rel_days(s):
    m = re.search(r'(a|an|\d+) (hour|day|week|month|year)s? ago', s)
    return None if not m else (1 if m.group(1) in ('a', 'an') else int(m.group(1))) * UNIT[m.group(2)]


def parse(txt):
    if not txt.startswith(")]}'"): return None
    stamps = [int(a) for a, b, rel in re.findall(r'\[null,(\d{16}),(\d{16}),"((?:Edited )?[^"]{0,30}ago)"', txt)]
    rel = [d for d in (rel_days(x) for x in re.findall(r'"((?:Edited )?[^"]{0,25} ago)"', txt)) if d is not None]
    now = time.time() * 1e6
    days = []
    if stamps: days.append(int((now - max(stamps)) / 864e8))
    if rel: days.append(min(rel))
    newest = max(stamps) / 1e6 if stamps else None
    tot = re.search(r'"([\d,]+) reviews?"', txt)
    return dict(newest_ts=newest, newest_days=min(days) if days else None, seen=max(len(stamps), len(rel)),
                perm_closed=int('Permanently closed' in txt), temp_closed=int('Temporarily closed' in txt),
                total_reviews=int(tot.group(1).replace(',', '')) if tot else None)


def work(cid):
    out = None; best = None
    for i in range(10):
        try:
            t = fetch(cid); out = parse(t)
            if out is not None:
                best = out
                if out['seen'] > 0: break      # full response; the stripped-down variant has no review list
            time.sleep(0.3 + random.random() * 0.7)
        except Exception:
            time.sleep(2)
    out = best
    with lock:
        if out is None:
            db.execute('INSERT OR REPLACE INTO activity(cid,err,ts) VALUES(?,?,?)', (cid, 'no data', time.time()))
        else:
            db.execute('INSERT OR REPLACE INTO activity VALUES(?,?,?,?,?,?,?,?,?)', (cid, out['newest_ts'], out['newest_days'], out['seen'], out['perm_closed'], out['temp_closed'], out['total_reviews'], None, time.time()))
        db.commit()
        work.n += 1
        if work.n % 300 == 0: print(work.n, flush=True)
work.n = 0


if __name__ == '__main__':
    done = {r[0] for r in db.execute('SELECT cid FROM activity WHERE err IS NULL')}
    sites = {u: v for u, v in db.execute('SELECT url, verdict FROM sites')}
    rows = db.execute('SELECT cid, website, reviews FROM places WHERE closed=0 AND (reviews IS NULL OR reviews>=?)', (args.minreviews,)).fetchall()
    def is_lead(w):
        k = kind_of(w)
        if k != 'own site': return True
        v = sites.get(w)
        return v is not None and v != 'OK'
    todo = [(c, r) for c, w, r in rows if c not in done and (args.scope == 'all' or is_lead(w))]
    todo.sort(key=lambda x: -(x[1] or 0))
    todo = [c for c, _ in todo]
    if args.limit: todo = todo[:args.limit]
    print(len(todo), 'to check', flush=True)
    with ThreadPoolExecutor(args.workers) as ex: list(ex.map(work, todo))
    db.commit()
    print('DONE', db.execute('SELECT COUNT(*) FROM activity WHERE err IS NULL').fetchone()[0])
