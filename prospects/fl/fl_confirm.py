"""Stage 2b: re-check suspicious websites with a real browser (the same strict checker used for the hand-reviewed leads).
Takes BROKEN (non-DNS), CHECK and UNVERIFIABLE results from fl_sites.py for businesses that matter, and updates them.
    python3 fl_confirm.py [--db data/fl.db] [--chunk 300] [--limit N]
Domains that do not exist (DNS NXDOMAIN) are already definitive and are not re-checked.
"""
import json, os, re, sqlite3, subprocess, sys, argparse, time
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--db', default=os.path.join(HERE, 'data', 'fl.db'))
ap.add_argument('--chunk', type=int, default=300)
ap.add_argument('--limit', type=int, default=0)
args = ap.parse_args()
db = sqlite3.connect(args.db, timeout=120)
os.makedirs(os.path.join(HERE, 'data', 'shots'), exist_ok=True)
rows = db.execute("""SELECT DISTINCT s.url, s.host FROM sites s JOIN places p ON p.website = s.url
  WHERE s.method='curl' AND s.verdict IN ('BROKEN','CHECK','UNVERIFIABLE') AND COALESCE(s.dns,0)<>3 AND p.closed=0 AND (p.reviews IS NULL OR p.reviews>=2)""").fetchall()
if args.limit: rows = rows[:args.limit]
print(len(rows), 'sites to confirm in a browser', flush=True)
for i in range(0, len(rows), args.chunk):
    part = rows[i:i + args.chunk]
    inp, out = os.path.join(HERE, 'data', 'confirm-in.json'), os.path.join(HERE, 'data', 'confirm-out.json')
    json.dump([dict(cid=u, name=re.sub(r'[^a-z0-9]+', '-', h.lower())[:40], website=u) for u, h in part], open(inp, 'w'))
    if os.path.exists(out): os.remove(out)
    subprocess.run(['node', os.path.join(HERE, '..', 'gmaps', 'check_sites.mjs'), inp, out], cwd=os.path.join(HERE, 'data'), capture_output=True, timeout=7200)
    if not os.path.exists(out): print('chunk failed', i); continue
    for r in json.load(open(out)):
        db.execute('UPDATE sites SET verdict=?, why=?, status=?, final=?, title=?, method=?, ts=? WHERE url=?',
                   (r['verdict'], r.get('why'), r.get('status') or 0, (r.get('final') or '')[:300], r.get('title'), 'browser', time.time(), r['website']))
    db.commit()
    print(f'{i + len(part)}/{len(rows)}', flush=True)
print(db.execute("SELECT verdict, method, COUNT(*) FROM sites GROUP BY 1,2").fetchall())
