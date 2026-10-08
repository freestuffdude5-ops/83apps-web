"""Autopilot: turns leads from the Florida database into ready-to-send emails with a custom concept image.

    python3 run.py select  --count 200 [--county Volusia,Flagler] [--kinds site,broken] [--vertical roof,food]
    python3 run.py probe                 # real-browser check of each selected lead's website (claims, emails, logo, photos)
    python3 run.py emails                # pick the one trustworthy address (site mailto / Wayback), MX check
    python3 run.py build  [--limit 50]   # Google data + concept page + screenshots + email text
    python3 run.py sheet                 # data/review.html contact sheet of everything built (for a quick look)
    python3 run.py push   [--limit 50]   # send ready leads + images to the Google Sheet (web app URL in .env)
    python3 run.py all --count 50        # everything above in order
    python3 run.py status

State lives in data/autopilot.db (gitignored). Every step is resumable and skips work already done.
"""
import argparse, base64, json, os, re, sqlite3, subprocess, sys, time, html
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
DATA = os.path.join(HERE, 'data')
EXPORT = os.path.join(HERE, '..', 'fl', 'data', 'export', 'florida_businesses.db')
os.makedirs(DATA, exist_ok=True)

ap = argparse.ArgumentParser()
ap.add_argument('step')
ap.add_argument('--count', type=int, default=50)
ap.add_argument('--limit', type=int, default=0)
ap.add_argument('--county', default='')
ap.add_argument('--kinds', default='site,broken,booking,facebook,working,nosite')
ap.add_argument('--vertical', default='')
ap.add_argument('--cids', default='')
ap.add_argument('--workers', type=int, default=4)
ap.add_argument('--rebuild', action='store_true')
ap.add_argument('--hero', default=None)
ap.add_argument('--p2', default=None)
ap.add_argument('--drop', default='')
args = ap.parse_args()

import threading
LOCK = threading.Lock()
db = sqlite3.connect(os.path.join(DATA, 'autopilot.db'), timeout=60, check_same_thread=False)
db.row_factory = sqlite3.Row
db.execute('PRAGMA journal_mode=WAL')
db.execute('''CREATE TABLE IF NOT EXISTS leads(cid TEXT PRIMARY KEY, name TEXT, kind TEXT, county TEXT, category TEXT, website TEXT,
  score REAL, stage TEXT, skip TEXT, email TEXT, email_src TEXT, probe TEXT, gp TEXT, built TEXT, mail TEXT, pushed_at REAL, updated REAL)''')
try: db.execute('ALTER TABLE leads ADD COLUMN override TEXT')
except sqlite3.OperationalError: pass


def set_(cid, **kw):
    kw['updated'] = time.time()
    with LOCK: _set(cid, kw)


def _set(cid, kw):
    db.execute(f"UPDATE leads SET {', '.join(k + '=?' for k in kw)} WHERE cid=?", (*[json.dumps(v) if isinstance(v, (dict, list)) else v for v in kw.values()], cid))
    db.commit()


def rows(stage, limit=0):
    q = 'SELECT * FROM leads WHERE stage=? ORDER BY score DESC' + (f' LIMIT {int(limit)}' if limit else '')
    return [dict(r) for r in db.execute(q, (stage,))]


# ---------------------------------------------------------------- select
DEALER = re.compile(r'dealer|dealership|hospital|government|city hall|county|school district|university|college|church|bank\b|credit union|'
                    r'apartment|hotel|motel|resort|gas station|grocery|supermarket|walmart|walgreens|cvs|publix|post office|library|park\b', re.I)


def select():
    ex = sqlite3.connect(EXPORT); ex.row_factory = sqlite3.Row
    kinds = set(args.kinds.split(','))
    have = {r[0] for r in db.execute('SELECT cid FROM leads')}
    where = ["chain=0", "excluded=0", "closed=0", "reviews>=5", "(newest_review_days IS NULL OR newest_review_days<=365)"]
    if args.county: where.append('county IN (%s)' % ','.join("'%s'" % c.strip().replace("'", '') for c in args.county.split(',')))
    if args.cids: where = ['cid IN (%s)' % ','.join("'%s'" % c for c in args.cids.split(','))]
    alts = []
    if 'site' in kinds: alts.append("(website_type='own site' AND (weak_lead=1 OR website_status='Needs checking'))")
    if 'broken' in kinds: alts.append("(website_type='own site' AND website_status='Broken website')")
    if 'booking' in kinds: alts.append("(website_status='Booking/free page only')")
    if 'facebook' in kinds: alts.append("(website_status='Facebook/social page only' AND website LIKE '%facebook.com%')")
    if 'working' in kinds: alts.append("(lead=0 AND website_type='own site' AND email_on_site!='')")
    if 'nosite' in kinds: alts.append("(website_status='No website')")
    if not args.cids: where.append('(' + ' OR '.join(alts) + ')')
    q = 'SELECT * FROM businesses WHERE ' + ' AND '.join(where)
    import verticals
    vfilter = set(v for v in args.vertical.split(',') if v)
    picked = []
    for r in ex.execute(q):
        if r['cid'] in have or DEALER.search(r['category'] or '') or DEALER.search(r['name'] or ''): continue
        if vfilter and verticals.pick([c.strip() for c in (r['category'] or '').split(',')])['key'] not in vfilter: continue
        pr = {'A': 30, 'B': 15}.get(r['priority'], 0)
        rec = 20 if (r['newest_review_days'] or 999) <= 60 else 10 if (r['newest_review_days'] or 999) <= 180 else 0
        score = pr + rec + min(25, (r['reviews'] or 0) / 8) + ((r['rating'] or 0) - 4) * 10 + {'Broken website': 10, 'Booking/free page only': 8, 'Facebook/social page only': 6}.get(r['website_status'], 0)
        picked.append((score, r))
    picked.sort(key=lambda x: -x[0])
    n = 0
    for score, r in picked[:args.count]:
        kind = {'Broken website': 'broken', 'Booking/free page only': 'booking', 'Facebook/social page only': 'facebook', 'No website': 'nosite'}.get(r['website_status'], 'site')
        db.execute('INSERT OR IGNORE INTO leads(cid,name,kind,county,category,website,score,stage,email,email_src,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                   (r['cid'], r['name'], kind, r['county'], r['category'], r['website'], round(score, 1), 'new', None, None, time.time()))
        n += 1
    db.commit()
    print(f'selected {n} new leads ({len(picked)} matched)')


# ---------------------------------------------------------------- probe
BROKEN = [(re.compile(p, re.I), w) for p, w in [
    (r'buy this domain|domain is for sale|may be for sale|make an offer on this domain|afternic|hugedomains|dan\.com|sedo', 'now shows a "domain for sale" page'),
    (r'domain has expired|this domain has expired|renew now|website expired|site has expired|subscription expired', 'shows an "expired" page'),
    (r'account (has been )?suspended|site has been suspended|temporarily disabled', 'shows a "suspended" page'),
    (r"isn.t connected to a site|site not found|not published|there is no site here|domain not configured", 'shows a "site not found" page'),
    (r'welcome to nginx|apache2 .*default page|it works!|default web page|parked free', "shows a blank server page instead of your site"),
    (r'error code 52[0-6]|web server is down|origin is unreachable', 'shows a server error page')]]
PROXY = re.compile(r'upstream connect error|ERR_TUNNEL|ERR_PROXY|just a moment|verify you are human|captcha|access denied', re.I)


def site_state(p, website):
    """('ok'|'broken'|'unknown', why)"""
    from emails import has_mx, host_of
    err = p.get('error') or ''
    hay = f"{p.get('title') or ''} {(p.get('text') or '')[:1500]} {err}"
    if PROXY.search(hay): return 'unknown', 'bot wall / network'
    if 'ERR_NAME_NOT_RESOLVED' in err:
        try:
            import requests
            j = requests.get(f'https://dns.google/resolve?name={host_of(website)}&type=A', timeout=15).json()
            if j.get('Status') == 3: return 'broken', "didn't load (the domain no longer exists)"
        except Exception: pass
        return 'broken', "didn't load"
    if re.search(r'ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_SSL|ERR_CERT', err): return 'broken', "didn't load"
    if 'Timeout' in err: return 'unknown', 'timeout'
    if err: return 'unknown', err[:80]
    for rx, why in BROKEN:
        if rx.search(hay): return 'broken', why
    st = p.get('status') or 200
    if st in (404, 410): return 'broken', 'shows a "page not found" error'
    if st >= 500: return 'broken', 'shows a server error page'
    if len((p.get('text') or '').strip()) < 40 and (p.get('html_len') or 0) < 2000: return 'broken', 'loads a blank page'
    return 'ok', ''


def probe():
    todo = rows('new', args.limit)
    for r in [x for x in todo if x['kind'] == 'nosite']: set_(r['cid'], stage='probed', probe={'state': 'none'})
    todo = [x for x in todo if x['kind'] != 'nosite']
    if not todo: print('nothing to probe'); return
    inp = os.path.join(DATA, 'probe_in.json'); outp = os.path.join(DATA, 'probe_out.jsonl')
    json.dump([dict(cid=r['cid'], website=r['website']) for r in todo], open(inp, 'w'))
    env = dict(os.environ, PROBE_WORKERS=str(args.workers))
    subprocess.run(['node', os.path.join(HERE, 'siteprobe.mjs'), inp, outp, os.path.join(DATA, 'siteshots')], cwd=HERE, env=env)
    got = {}
    for l in open(outp):
        try: r = json.loads(l); got[r['cid']] = r
        except Exception: pass
    for r in todo:
        p = got.get(r['cid'])
        if not p: continue
        if r['kind'] in ('booking', 'facebook'):
            p['state'] = 'page'
            if r['kind'] == 'facebook': p['logo'] = None; p['images'] = []; p['bg'] = []
            if p.get('error'): set_(r['cid'], stage='skipped', skip='could not open their page: ' + p['error'][:80], probe=p); continue
            set_(r['cid'], stage='probed', probe=p); continue
        state, why = site_state(p, r['website'])
        p['state'], p['why'] = state, why
        if state == 'unknown': set_(r['cid'], stage='skipped', skip=f'could not verify the website ({why})', probe=p); continue
        if r['kind'] == 'broken' and state == 'ok': set_(r['cid'], kind='site')
        if r['kind'] == 'site' and state == 'broken': set_(r['cid'], kind='broken')
        set_(r['cid'], stage='probed', probe=p)
    print('probed', len(got))


# ---------------------------------------------------------------- emails
def emails_step():
    import emails as E
    todo = rows('probed', args.limit)

    exdb = sqlite3.connect(EXPORT, check_same_thread=False)

    def one(r):
        p = json.loads(r['probe'])
        owned = r['kind'] in ('booking', 'facebook')
        found = E.from_probe(p) if p.get('state') in ('ok', 'page') else []
        src_note = ''
        if r['kind'] in ('site', 'broken', 'working') and (not found or p.get('state') == 'broken'):
            wb, snap = E.wayback(r['website']); found += wb; src_note = f' (Wayback {snap})' if snap else ''
        e, src, why = E.choose(found, r['website'], r['name'], owned_page=owned)
        if not e:
            with LOCK: b = exdb.execute('SELECT city, phone FROM businesses WHERE cid=?', (r['cid'],)).fetchone()
            yp = E.yellowpages(r['name'], b[0], b[1]) if b else []
            if yp: e, src, why = E.choose(yp, r['website'] if r['kind'] in ('site', 'broken', 'working') else '', r['name'], owned_page=False); src_note = ''
        if not e: set_(r['cid'], stage='skipped', skip='no trustworthy email: ' + why); return
        if src and r['kind'] in ('booking', 'facebook') and not src.startswith('YellowPages'):
            src = src.replace('homepage', 'page').replace('printed on site', 'printed') + (' on their Facebook page' if r['kind'] == 'facebook' else ' on their booking page')
        set_(r['cid'], stage='emailed', email=e, email_src=(src or '') + src_note)
    with ThreadPoolExecutor(3) as ex: list(ex.map(one, todo))
    print('emails done', len(todo))


# ---------------------------------------------------------------- build
def slug_of(r):
    return re.sub(r'[^a-z0-9]+', '-', r['name'].lower()).strip('-')[:40] + '-' + r['cid'][-6:]


def assemble(r):
    import gplace
    ex = sqlite3.connect(EXPORT); ex.row_factory = sqlite3.Row
    b = dict(ex.execute('SELECT * FROM businesses WHERE cid=?', (r['cid'],)).fetchone())
    gp = json.loads(r['gp']) if r.get('gp') else (gplace.place(r['cid']) or {})
    if gp and not r.get('gp'): set_(r['cid'], gp=gp)
    lead = {**b, **{k: v for k, v in gp.items() if v not in (None, [], {}, '')}}
    lead['probe'] = json.loads(r['probe']) if r.get('probe') else {}
    lead['address_short'] = b['address']
    lead['site_state'] = lead['probe'].get('state')
    lead['broken_why'] = lead['probe'].get('why')
    lead['broken_evidence'] = (lead['probe'].get('error') or f"HTTP {lead['probe'].get('status')}: {lead['probe'].get('title')}")[:160]
    lead['county'] = r['county']
    lead['kind'] = r['kind']
    lead['email'] = r.get('email') or ''
    lead['gp_website'] = gp.get('website')
    lead['gp_full'] = bool(gp.get('review_list') or gp.get('hours'))
    lead['override'] = json.loads(r['override']) if r.get('override') else {}
    if gp.get('closed'): lead['closed_now'] = True
    return lead


def build():
    import mockup, composite, compose
    todo = rows('emailed', args.limit) + (rows('built', args.limit) if args.rebuild else [])
    outdirs = []
    for r in todo:
        lead = assemble(r)
        if not compose.verified_issues(lead):
            why = ('website checked out fine in a real browser (secure, mobile-friendly, current), nothing honest to point out' if r['kind'] in ('site', 'broken', 'working')
                   else "could not confirm what their Google listing links to right now")
            set_(r['cid'], stage='skipped', skip=why); continue
        if lead.get('closed_now'): set_(r['cid'], stage='skipped', skip='Google now shows it as permanently closed'); continue
        d = os.path.join(DATA, 'out', slug_of(r))
        try:
            D = mockup.build(lead, d)
        except Exception as e:
            set_(r['cid'], stage='skipped', skip=f'build error: {e}'[:200]); continue
        outdirs.append((r, lead, D, d))
    for i in range(0, len(outdirs), 25):
        subprocess.run(['node', os.path.join(HERE, 'render.mjs')] + [x[3] for x in outdirs[i:i + 25]], cwd=HERE)
    for r, lead, D, d in outdirs:
        if not os.path.exists(os.path.join(d, 'desktop.png')): set_(r['cid'], stage='skipped', skip='render failed'); continue
        slug = slug_of(r)
        composite.hero(d, os.path.join(d, f'{slug}.jpg'), bg=BG.get(D['arch'], '#ecebe7'))
        rv = composite.reviews(d, os.path.join(d, f'{slug}-reviews.jpg')) if D.get('review_cards') else None
        mail = compose.compose(lead, D, bool(rv))
        if mail.get('skip'): set_(r['cid'], stage='skipped', skip=mail['skip'], built=D); continue
        mail['image_file'] = f'{slug}.jpg' + (f',{slug}-reviews.jpg' if rv else '')
        mail['dir'] = d
        set_(r['cid'], stage='built', built={k: v for k, v in D.items() if k != 'vars'}, mail=mail)
    print('built', len(outdirs))


BG = {'bold': '#e7e5e1', 'edit': '#ece6dd', 'soft': '#f3ece8', 'clean': '#e8ecf2', 'fresh': '#e6efe8'}


# ---------------------------------------------------------------- review sheet
def sheet():
    out = ['<!doctype html><meta charset=utf-8><title>Autopilot batch</title><style>body{font:14px system-ui;margin:24px;background:#f4f4f4}'
           '.c{background:#fff;border-radius:12px;padding:16px;margin:0 0 22px;display:grid;grid-template-columns:600px 1fr;gap:20px}'
           'img{width:600px;border-radius:8px}pre{white-space:pre-wrap;font:13px/1.5 system-ui;margin:0}.m{color:#666;font-size:12px}</style>']
    for r in db.execute("SELECT * FROM leads WHERE stage IN ('built','pushed') ORDER BY score DESC"):
        m = json.loads(r['mail']); d = m['dir']
        imgs = ''.join(f'<img src="{os.path.relpath(os.path.join(d, f), DATA)}">' for f in m['image_file'].split(','))
        out.append(f'<div class=c><div>{imgs}</div><div><b>{html.escape(r["name"])}</b> · {html.escape(r["category"] or "")} · {r["county"]}<br>'
                   f'<span class=m>To: {html.escape(r["email"])} ({html.escape(r["email_src"] or "")})<br>Claims: {html.escape("; ".join(m["claims"]))}</span>'
                   f'<p><b>{html.escape(m["subject"])}</b></p><pre>{html.escape(m["body"])}</pre></div></div>')
    open(os.path.join(DATA, 'review.html'), 'w').write('\n'.join(out))
    print('wrote data/review.html')


# ---------------------------------------------------------------- push to the Google Sheet
def env():
    e = {}
    f = os.path.join(HERE, '.env')
    if os.path.exists(f):
        for l in open(f):
            if '=' in l and not l.startswith('#'): k, v = l.strip().split('=', 1); e[k] = v
    e.update({k: v for k, v in os.environ.items() if k.startswith('OUTREACH_')})
    return e


def push():
    import requests
    E = env()
    url, token = E.get('OUTREACH_WEBAPP_URL'), E.get('OUTREACH_TOKEN')
    if not url or not token: sys.exit('Put OUTREACH_WEBAPP_URL and OUTREACH_TOKEN in autopilot/.env (see README).')
    todo = rows('built', args.limit)
    ok = 0
    for r in todo:
        m = json.loads(r['mail']); D = json.loads(r['built'])
        imgs = [dict(name=f, b64=base64.b64encode(open(os.path.join(m['dir'], f), 'rb').read()).decode()) for f in m['image_file'].split(',')]
        lead = dict(lead_id=r['cid'], business=D['name'], email=r['email'], subject=m['subject'], body=m['body'], followup_body=m['followup_body'],
                    image_file=m['image_file'], category=r['category'], county=r['county'], website=r['website'], claims=m.get('claim_keys', ''),
                    notes=f"Email from {r['email_src']}. Checked: {'; '.join(m['claims'])}. Alt subject: {m['alt_subject']}")
        for attempt in range(3):
            try:
                res = requests.post(url, data=json.dumps(dict(token=token, action='addLead', lead=lead, images=imgs)), timeout=120,
                                    headers={'Content-Type': 'text/plain'}).json()
                break
            except Exception as e:
                res = dict(ok=False, error=str(e)); time.sleep(5)
        if res.get('ok'):
            set_(r['cid'], stage='pushed', pushed_at=time.time()); ok += 1
        else:
            print('push failed', r['name'], res.get('error'))
            if 'duplicate' in str(res.get('error')): set_(r['cid'], stage='pushed', skip='already in sheet')
    print(f'pushed {ok}/{len(todo)}')


def thumbs():
    """Contact sheets of the finished email images (8 per sheet) for a quick visual check: data/thumbs-N.jpg"""
    from PIL import Image, ImageDraw
    rs = [dict(r) for r in db.execute("SELECT * FROM leads WHERE stage='built' ORDER BY score DESC")]
    for n in range(0, len(rs), 8):
        c = Image.new('RGB', (1200, 4 * 380), '#fff'); dr = ImageDraw.Draw(c)
        for k, r in enumerate(rs[n:n + 8]):
            m = json.loads(r['mail']); f = os.path.join(m['dir'], m['image_file'].split(',')[0])
            im = Image.open(f); im.thumbnail((596, 358)); x, y = (k % 2) * 600, (k // 2) * 380
            c.paste(im, (x + 2, y + 20)); dr.text((x + 6, y + 4), f"{r['cid'][-6:]}  {r['name'][:60]}", fill='#000')
        c.save(os.path.join(DATA, f'thumbs-{n // 8}.jpg'), quality=82)
    print('sheets:', (len(rs) + 7) // 8)


def fix():
    """python3 run.py fix --cids <cid-suffix> --hero 2|stock --p2 1|none|stock   or   --drop 'reason'"""
    for suf in args.cids.split(','):
        r = db.execute('SELECT * FROM leads WHERE cid LIKE ?', ('%' + suf,)).fetchone()
        if not r: print('no lead', suf); continue
        if args.drop: set_(r['cid'], stage='skipped', skip='review: ' + args.drop); print('dropped', r['name']); continue
        ov = json.loads(r['override']) if r['override'] else {}
        for k in ('hero', 'p2'):
            v = getattr(args, k)
            if v is not None: ov[k] = int(v) if v.isdigit() else v
        set_(r['cid'], override=ov, stage='emailed'); print('will rebuild', r['name'], ov)


def status():
    for r in db.execute('SELECT stage, kind, COUNT(*) n FROM leads GROUP BY 1,2 ORDER BY 1'): print(dict(r))
    for r in db.execute("SELECT skip, COUNT(*) n FROM leads WHERE stage='skipped' GROUP BY substr(skip,1,30) ORDER BY n DESC LIMIT 12"): print('  skip:', r['n'], r['skip'][:110])


STEPS = dict(select=select, probe=probe, emails=emails_step, build=build, sheet=sheet, push=push, status=status, thumbs=thumbs, fix=fix)
if args.step == 'all':
    for s in ('select', 'probe', 'emails', 'build', 'sheet'): STEPS[s]()
    if env().get('OUTREACH_WEBAPP_URL'): push()
else:
    STEPS[args.step]()
