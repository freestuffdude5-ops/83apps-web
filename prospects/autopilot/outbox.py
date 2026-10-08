"""Sending queue for the Gmail connector (Claude sends each email with the Gmail tool; this file decides what and when).

    python3 outbox.py host                 # copy new concept images to ../../previews/<random>.jpg (published on GitHub)
    python3 outbox.py next [--n 2]         # JSON of the emails due now (follow-ups first), within the window and today's limit
    python3 outbox.py sent <cid> <threadId> [followup]
    python3 outbox.py mark <email> replied|optout|bounced
    python3 outbox.py status

Window: Mon-Fri 9:00-16:00 America/New_York. Ramp: 15/25/40/60 emails a day by week (follow-ups count).
"""
import json, os, secrets, shutil, sqlite3, subprocess, sys, time, html
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PREV = os.path.join(REPO, 'previews')
RAW = 'https://raw.githubusercontent.com/freestuffdude5-ops/83apps-web/{sha}/previews/{f}'
TZ = ZoneInfo('America/New_York')
RAMP = [15, 25, 40, 60]
FOLLOWUP_DAYS = 5
SIGN = 'Hayden<br>83 App Studio<br>Hayden@83appstudio.com<br>83 APPS LLC, PO BOX 730331, ORMOND BEACH FL 32174'
SIGN_TXT = SIGN.replace('<br>', '\n')
OPTOUT = "If you'd rather not hear from me, just reply and let me know."

db = sqlite3.connect(os.path.join(HERE, 'data', 'autopilot.db'), timeout=60)
db.row_factory = sqlite3.Row
for c, t in (('drafted_at', 'REAL'), ('hosted', 'TEXT'), ('sent_at', 'REAL'), ('thread_id', 'TEXT'), ('followup_at', 'REAL'), ('outcome', 'TEXT')):
    try: db.execute(f'ALTER TABLE leads ADD COLUMN {c} {t}')
    except sqlite3.OperationalError: pass
db.execute('CREATE TABLE IF NOT EXISTS suppression(email TEXT PRIMARY KEY, reason TEXT, ts REAL)')
db.execute('CREATE TABLE IF NOT EXISTS sendlog(ts REAL, cid TEXT, email TEXT, what TEXT)')
db.execute('CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT)')
db.commit()


def meta(k, v=None):
    if v is None:
        r = db.execute('SELECT v FROM meta WHERE k=?', (k,)).fetchone(); return r[0] if r else None
    db.execute('INSERT OR REPLACE INTO meta VALUES(?,?)', (k, v)); db.commit()


def host():
    os.makedirs(PREV, exist_ok=True)
    rows = db.execute("SELECT cid, mail FROM leads WHERE stage IN ('built','pushed') AND hosted IS NULL").fetchall()
    added = {}
    for r in rows:
        m = json.loads(r['mail'])
        names = []
        for f in m['image_file'].split(','):
            n = secrets.token_hex(10) + '.jpg'
            shutil.copy(os.path.join(m['dir'], f), os.path.join(PREV, n)); names.append(n)
        added[r['cid']] = names
    if not added: print('nothing new to host'); return
    run = lambda *a: subprocess.run(a, cwd=REPO, check=True, capture_output=True, text=True).stdout.strip()
    run('git', 'add', 'previews')
    run('git', 'commit', '-q', '-m', f'Previews: {len(added)} concept images for outreach emails')
    for i in range(4):
        try: run('git', 'push', '-q', 'origin', 'HEAD'); break
        except subprocess.CalledProcessError: time.sleep(2 ** (i + 1))
    sha = run('git', 'rev-parse', 'HEAD')
    for cid, names in added.items():
        db.execute('UPDATE leads SET hosted=? WHERE cid=?', (json.dumps([RAW.format(sha=sha, f=n) for n in names]), cid))
    db.commit()
    print(f'hosted {len(added)} leads at {sha[:8]}')


def today():
    return datetime.now(TZ).strftime('%Y-%m-%d')


def sent_today():
    start = datetime.now(TZ).replace(hour=0, minute=0, second=0).timestamp()
    return db.execute('SELECT COUNT(*) FROM sendlog WHERE ts>=? AND what IN ("first","followup")', (start,)).fetchone()[0]


def quota():
    s = meta('start_date')
    if not s: return RAMP[0]
    weeks = (datetime.now(TZ).date() - datetime.fromisoformat(s).date()).days // 7
    return RAMP[min(weeks, len(RAMP) - 1)]


def in_window():
    n = datetime.now(TZ)
    return n.isoweekday() <= 5 and 9 <= n.hour < 16


def html_of(body, imgs):
    paras = [p.strip() for p in body.split('\n\n') if p.strip()]
    at = next((i for i, p in enumerate(paras) if 'screenshot' in p.lower()), len(paras) - 2)
    out = []
    for i, p in enumerate(paras):
        out.append('<p>' + html.escape(p).replace('\n', '<br>') + '</p>')
        if i == at:
            for u in imgs:
                out.append(f'<p><img src="{u}" alt="Concept homepage" width="600" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e3e0da"></p>')
    out.append(f'<p>{SIGN}</p><p style="color:#888;font-size:12px">{OPTOUT}</p>')
    return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' + ''.join(out) + '</div>'


def nxt(n):
    if not in_window(): print(json.dumps({'due': [], 'why': 'outside Mon-Fri 9-16 ET'})); return
    room = quota() - sent_today()
    if room <= 0: print(json.dumps({'due': [], 'why': f'daily limit {quota()} reached'})); return
    n = min(n, room)
    supp = {r[0] for r in db.execute('SELECT email FROM suppression')}
    due = []
    cutoff = time.time() - FOLLOWUP_DAYS * 86400
    for r in db.execute("SELECT * FROM leads WHERE sent_at IS NOT NULL AND sent_at<? AND followup_at IS NULL AND outcome IS NULL AND thread_id IS NOT NULL ORDER BY sent_at", (cutoff,)):
        if len(due) >= n: break
        if r['email'] in supp: continue
        m = json.loads(r['mail'])
        due.append(dict(cid=r['cid'], kind='followup', to=r['email'], threadId=r['thread_id'], subject='Re: ' + m['subject'],
                        body=m['followup_body'] + '\n\n' + SIGN_TXT + '\n\n' + OPTOUT,
                        html=html_of(m['followup_body'], [])))
    for r in db.execute("SELECT * FROM leads WHERE stage IN ('built','pushed') AND hosted IS NOT NULL AND sent_at IS NULL AND drafted_at IS NULL AND outcome IS NULL ORDER BY score DESC"):
        if len(due) >= n: break
        if r['email'] in supp or any(d['to'] == r['email'] for d in due): continue
        m = json.loads(r['mail']); imgs = json.loads(r['hosted'])
        body = m['body']
        if len(imgs) < 2: body = body.replace('There are two screenshots below: the homepage, and a reviews section built from your own Google reviews.', "There's a screenshot below.")
        due.append(dict(cid=r['cid'], kind='first', to=r['email'], subject=m['subject'], business=r['name'],
                        body=body + '\n\n' + SIGN_TXT + '\n\n' + OPTOUT, html=html_of(body, imgs)))
    print(json.dumps({'due': due, 'sent_today': sent_today(), 'limit': quota()}, indent=1))


def sent(cid, thread, follow=False):
    if not meta('start_date'): meta('start_date', today())
    r = db.execute('SELECT email FROM leads WHERE cid=?', (cid,)).fetchone()
    if follow: db.execute('UPDATE leads SET followup_at=? WHERE cid=?', (time.time(), cid))
    else: db.execute('UPDATE leads SET sent_at=?, thread_id=? WHERE cid=?', (time.time(), thread, cid))
    db.execute('INSERT INTO sendlog VALUES(?,?,?,?)', (time.time(), cid, r['email'] if r else '', 'followup' if follow else 'first'))
    db.commit(); print('recorded')


def mark(email, outcome):
    email = email.lower().strip()
    db.execute('UPDATE leads SET outcome=? WHERE lower(email)=?', (outcome, email))
    if outcome in ('optout', 'bounced'): db.execute('INSERT OR REPLACE INTO suppression VALUES(?,?,?)', (email, outcome, time.time()))
    db.commit(); print('marked', email, outcome)


def status():
    q = lambda s: db.execute(s).fetchone()[0]
    print(dict(ready=q("SELECT COUNT(*) FROM leads WHERE stage IN ('built','pushed') AND hosted IS NOT NULL AND sent_at IS NULL AND outcome IS NULL"),
               unhosted=q("SELECT COUNT(*) FROM leads WHERE stage IN ('built','pushed') AND hosted IS NULL"),
               sent=q('SELECT COUNT(*) FROM leads WHERE sent_at IS NOT NULL'), followed_up=q('SELECT COUNT(*) FROM leads WHERE followup_at IS NOT NULL'),
               replied=q("SELECT COUNT(*) FROM leads WHERE outcome='replied'"), optout=q("SELECT COUNT(*) FROM leads WHERE outcome='optout'"),
               bounced=q("SELECT COUNT(*) FROM leads WHERE outcome='bounced'"), sent_today=sent_today(), limit=quota(), window_open=in_window()))
    print('sent emails:', ' '.join(r[0] for r in db.execute('SELECT email FROM leads WHERE sent_at IS NOT NULL')))


def draftbody(cid):
    """Plain-text draft for Outreach.gs: hidden [[marker]] lines + the email + signature."""
    r = db.execute('SELECT * FROM leads WHERE cid LIKE ?', ('%' + cid,)).fetchone()
    m = json.loads(r['mail']); imgs = [u.split('83apps-web/', 1)[1] for u in json.loads(r['hosted'])]
    body = m['body']
    if len(imgs) < 2: body = body.replace('There are two screenshots below: the homepage, and a reviews section built from your own Google reviews.', "There's a screenshot below.")
    lines = ['[[83auto]]', '[[img:' + '|'.join(imgs) + ']]']
    if m.get('claim_keys'): lines += ['[[site:' + (r['website'] or '') + ']]', '[[claims:' + m['claim_keys'] + ']]']
    lines.append('[[followup:' + m['followup_body'].replace('\n', ' ') + ']]')
    print(json.dumps(dict(to=r['email'], subject=m['subject'], body='\n'.join(lines) + '\n' + body + '\n\n' + SIGN_TXT + '\n\n' + OPTOUT)))


def drafted(cid):
    db.execute('UPDATE leads SET drafted_at=? WHERE cid LIKE ?', (time.time(), '%' + cid)); db.commit()


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'host': host()
    elif a[0] == 'next': nxt(int(a[a.index('--n') + 1]) if '--n' in a else 2)
    elif a[0] == 'sent': sent(a[1], a[2] if len(a) > 2 else '', len(a) > 3 and a[3] == 'followup')
    elif a[0] == 'mark': mark(a[1], a[2])
    elif a[0] == 'status': status()
    elif a[0] == 'draftbody': draftbody(a[1])
    elif a[0] == 'drafted': drafted(a[1])
