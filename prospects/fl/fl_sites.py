"""Stage 2: quick website check for every business whose Google profile links its own website.
DNS (Google DoH, cross-checked with Cloudflare) + one HTTP request, classified with the same rules as gmaps/check_sites.mjs.
Verdicts: OK / BROKEN / CHECK / UNVERIFIABLE. BROKEN and CHECK are later confirmed with a real browser (fl_confirm.py).

    python3 fl_sites.py [--db data/fl.db] [--workers 24] [--limit N]
Resumable: sites already in the `sites` table are skipped.
"""
import json, re, sqlite3, subprocess, sys, os, time, threading, argparse, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--db', default=os.path.join(HERE, 'data', 'fl.db'))
ap.add_argument('--workers', type=int, default=24)
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--minreviews', type=int, default=0, help='skip sites whose businesses all have fewer reviews (unknown counts are kept)')
ap.add_argument('--shard', default='', help='i/n: process only every n-th site starting at i (run several processes in parallel)')
ap.add_argument('--quality', action='store_true', help='re-fetch working sites that have no quality signals yet (active businesses, most reviews first)')
args, _unknown = ap.parse_known_args()

SOCIAL = re.compile(r'facebook\.com|instagram\.com|linktr\.ee|yelp\.com|nextdoor\.com|tiktok\.com|twitter\.com|x\.com/|youtube\.com|linkedin\.com|pinterest\.com', re.I)
BOOKING = re.compile(r'booksy|vagaro|styleseat|glossgenius|square\.site|squareup|fresha|schedulicity|gocheckin|vidobooking|mindbody|toasttab|clover\.com|doordash|ubereats|grubhub|menufy|chownow|order\.online|business\.site|wixsite|godaddysites|sites\.google|weebly\.com|localsearch\.com|edan\.io|jany\.io|setmore|acuity|opentable|resy\.com|booking\.com|airbnb|vrbo|offeringtree|linkin\.bio|carrd\.co|beacons\.ai|bit\.ly|google\.com/maps|goo\.gl|maps\.app', re.I)
BROKEN = [
    (re.compile(r'buy this domain|domain is for sale|this domain (name )?(may be|is) for sale|make an offer on this domain|afternic|hugedomains|dan\.com|sedo\.com', re.I), 'Domain parked / for sale'),
    (re.compile(r'this domain has expired|domain has expired|renew now|website expired|site has expired|subscription expired', re.I), 'Website or domain expired'),
    (re.compile(r'account (has been )?suspended|domain temporarily disabled|this site has been suspended|hosting account.*(suspended|disabled)', re.I), 'Hosting suspended'),
    (re.compile(r"isn.t connected to a site|connectyourdomain|site not found|this site is not published|does not have a domain assigned|there is no site here|domain not configured|reconnect your domain", re.I), 'Builder error: site not connected / not found'),
    (re.compile(r'welcome to nginx|apache2 (ubuntu|debian) default page|http server test page|default web page|future home of something quite cool|parked free, courtesy of godaddy', re.I), 'Blank server / parked default page'),
    (re.compile(r'web server is down|error code 52[0-6]|origin (is )?unreachable|connection timed out.*cloudflare|dns resolution error', re.I), 'Server down (Cloudflare error)'),
]
WALL = re.compile(r'just a moment|verify you are human|attention required|checking your browser|access denied|request forbidden|captcha|enable javascript and cookies', re.I)
SPAM = re.compile(r'slot gacor|togel|judi|casino online|situs|sabung|betting', re.I)
PROXY = re.compile(r'upstream connect error|upstream request failed|tunnel|proxy', re.I)
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

db = sqlite3.connect(args.db, check_same_thread=False, timeout=120)
db.execute('PRAGMA journal_mode=WAL')
db.execute('CREATE TABLE IF NOT EXISTS sites(url TEXT PRIMARY KEY, host TEXT, dns INTEGER, status INTEGER, final TEXT, title TEXT, verdict TEXT, why TEXT, method TEXT, ts REAL)')
for _c, _t in (('https', 'INTEGER'), ('viewport', 'INTEGER'), ('generator', 'TEXT'), ('copyright', 'INTEGER'), ('bytes', 'INTEGER'), ('ms', 'INTEGER'), ('emails', 'TEXT'), ('facebook', 'TEXT'), ('instagram', 'TEXT')):
    try: db.execute(f'ALTER TABLE sites ADD COLUMN {_c} {_t}')
    except sqlite3.OperationalError: pass
lock = threading.Lock()
dns_cache = {}

EMAIL_RE = re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}')
JUNK = ('sentry', 'wixpress', 'example.', 'domain.com', 'email.com', 'yourdomain', 'schema.org', '.png', '.jpg', '.gif', '.webp', '.svg', 'u003', 'your@', 'name@', 'user@', 'sample', 'test@', 'godaddy', 'wordpress')
BUILDERS = [(r'wixstatic|wix\.com|x-wix', 'Wix'), (r'squarespace', 'Squarespace'), (r'godaddysites|websitebuilder\.godaddy|img1\.wsimg\.com', 'GoDaddy'), (r'weebly', 'Weebly'),
            (r'wp-content|wp-includes', 'WordPress'), (r'cdn\.shopify|shopify', 'Shopify'), (r'multiscreensite|dudaone|duda\.co', 'Duda'), (r'sites\.google\.com', 'Google Sites'), (r'webflow', 'Webflow'), (r'jimdo', 'Jimdo')]


def quality(body, final, ms):
    """Website quality signals from the homepage HTML we already fetched."""
    b = body[:400000]; low = b.lower()
    gen = next((n for p, n in BUILDERS if re.search(p, low)), None)
    years = [int(y) for y in re.findall(r'(?:©|&copy;|&#169;|copyright)[^<0-9]{0,40}((?:19|20)\d{2})', b, re.I) if 1996 <= int(y) <= 2027]
    emails = []
    for e in EMAIL_RE.findall(b):
        e = e.lower().strip('.')
        if any(j in e for j in JUNK) or e in emails: continue
        emails.append(e)
    fb = re.search(r'https?://(?:www\.)?facebook\.com/(?!tr\?|sharer|plugins|dialog|share)[A-Za-z0-9._/-]{3,}', b)
    ig = re.search(r'https?://(?:www\.)?instagram\.com/(?!p/|explore)[A-Za-z0-9._/-]{2,}', b)
    return dict(https=int(final.startswith('https')), viewport=int('name="viewport"' in low or "name='viewport'" in low), generator=gen,
                copyright=max(years) if years else None, bytes=len(body), ms=ms, emails=','.join(emails[:3]), facebook=fb.group(0) if fb else None, instagram=ig.group(0) if ig else None)


def doh(host):
    if host in dns_cache: return dns_cache[host]
    st = None
    for base in ('https://dns.google/resolve?name=%s&type=A', 'https://cloudflare-dns.com/dns-query?name=%s&type=A'):
        for _ in range(2):
            try:
                req = urllib.request.Request(base % host, headers={'accept': 'application/dns-json'})
                st = json.load(urllib.request.urlopen(req, timeout=12)).get('Status'); break
            except Exception:
                time.sleep(1)
        if st is not None: break
    dns_cache[host] = st
    return st


def fetch(url):
    cmd = ['curl', '-sS', '-L', '-m', '20', '--max-redirs', '6', '-A', UA, '-H', 'Accept-Language: en-US,en', '-o', '-', '-w', '\n@@%{http_code}@@%{url_effective}', '--max-filesize', '400000', url]
    r = subprocess.run(cmd, capture_output=True, text=True, errors='replace')
    out = r.stdout
    m = re.search(r'\n@@(\d+)@@(.*)$', out, re.S)
    body = out[:m.start()] if m else out
    return (int(m.group(1)) if m else 0), (m.group(2).strip() if m else ''), body, r.returncode, (r.stderr or '')[:200]


def check(url):
    try: host = urllib.parse.urlparse(url).hostname or ''
    except Exception: host = ''
    if not host: return dict(url=url, host='', dns=None, status=0, final='', title='', verdict='UNVERIFIABLE', why='bad URL')
    st = None          # DNS is only looked up if the page can't be loaded (saves a TLS handshake per site)
    last = None
    for i in range(2):
        _t0 = time.time()
        status, final, body, rc, err = fetch(url)
        _ms = int((time.time() - _t0) * 1000)
        title = (re.search(r'<title[^>]*>(.*?)</title>', body, re.S | re.I) or [None, ''])[1]
        title = re.sub(r'\s+', ' ', title).strip()[:100]
        text = re.sub(r'\s+', ' ', re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', body, flags=re.S | re.I))
        text = re.sub(r'<[^>]+>', ' ', text)[:3000]
        hay = f'{title} {text}'
        last = dict(url=url, host=host, dns=st, status=status, final=final[:300], title=title)
        if status and status < 400 and not any(r.search(hay) for r, _ in BROKEN) and not WALL.search(hay) and not PROXY.search(hay[:400]):
            last.update(verdict='CHECK' if SPAM.search(hay) else 'OK', why='shows spam (may be cloaked)' if SPAM.search(hay) else 'loads'); last.update(quality(body, final, _ms)); return last
        if i == 0: time.sleep(2)
    st = doh(host); last['dns'] = st
    if st == 3: return dict(url=url, host=host, dns=3, status=0, final='', title='', verdict='BROKEN', why='Domain does not exist (expired)')
    hay = f'{title} {text} {err}'
    rule = next((w for r, w in BROKEN if r.search(hay)), None)
    if status == 0 and rc == 6 or (status == 0 and 'resolve' in err.lower()):
        last.update(verdict='BROKEN' if st in (3, 2) else 'UNVERIFIABLE', why='Domain does not resolve' if st in (3, 2) else 'our network could not reach it')
    elif rule: last.update(verdict='BROKEN', why=rule)
    elif PROXY.search(hay) or (status == 0 and rc in (56, 7)): last.update(verdict='UNVERIFIABLE', why='our network could not reach it')
    elif WALL.search(hay) or status in (401, 403, 429): last.update(verdict='UNVERIFIABLE', why='bot protection page')
    elif status in (404, 410): last.update(verdict='BROKEN', why=f'Homepage returns "not found" (HTTP {status})')
    elif status >= 500: last.update(verdict='CHECK', why=f'Server error HTTP {status}')
    elif status == 0 and rc == 28: last.update(verdict='CHECK', why='Timed out')
    elif status == 0 and rc in (35, 51, 58, 60): last.update(verdict='CHECK', why='Certificate/TLS error')
    elif status == 0: last.update(verdict='CHECK', why=f'Could not load (curl {rc})')
    else: last.update(verdict='CHECK', why=f'HTTP {status}')
    return last


def kind_of(w):
    if not w: return 'none'
    if SOCIAL.search(w): return 'social'
    if BOOKING.search(w): return 'booking/free page'
    return 'own site'


if __name__ == '__main__':
    done = {r[0] for r in db.execute('SELECT url FROM sites')}
    urls = [w for (w, _) in db.execute("SELECT website, MAX(COALESCE(reviews, 2)) m FROM places WHERE website IS NOT NULL AND website<>'' AND closed=0 GROUP BY website HAVING m >= ? ORDER BY m DESC", (args.minreviews,))]
    todo = [u for u in urls if kind_of(u) == 'own site' and u not in done]
    if args.quality:
        okq = {u for (u,) in db.execute("SELECT url FROM sites WHERE verdict='OK' AND viewport IS NULL")}
        act = {c for (c,) in db.execute('SELECT cid FROM activity WHERE newest_days<=365')}
        ranked = db.execute("SELECT website, MAX(COALESCE(reviews,1)) m FROM places WHERE website<>'' AND closed=0 AND cid IN (SELECT cid FROM activity WHERE newest_days<=365) GROUP BY website ORDER BY m DESC").fetchall()
        todo = [u for u, _ in ranked if u in okq]
    if args.shard:
        _i, _n = map(int, args.shard.split('/')); todo = todo[_i::_n]
    if args.limit: todo = todo[:args.limit]
    print(len(todo), 'sites to check;', len(done), 'already done', flush=True)
    n = 0
    def work(u):
        global n
        r = check(u)
        with lock:
            db.execute('INSERT OR REPLACE INTO sites(url,host,dns,status,final,title,verdict,why,method,ts,https,viewport,generator,copyright,bytes,ms,emails,facebook,instagram) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                       (r['url'], r['host'], r['dns'], r['status'], r['final'], r['title'], r['verdict'], r['why'], 'curl', time.time(),
                        r.get('https'), r.get('viewport'), r.get('generator'), r.get('copyright'), r.get('bytes'), r.get('ms'), r.get('emails'), r.get('facebook'), r.get('instagram')))
            db.commit()
            n += 1
            if n % 200 == 0: print(n, flush=True)
    with ThreadPoolExecutor(args.workers) as ex: list(ex.map(work, todo))
    db.commit()
    from collections import Counter
    print(Counter(v for (v,) in db.execute('SELECT verdict FROM sites')))
