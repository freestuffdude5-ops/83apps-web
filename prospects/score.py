"""Scores audited websites and builds the prospect spreadsheet.
    python3 score.py out/audit.json
Every point comes from an objective, re-checkable measurement in audit.json.
"""
import json, sys, re, os, shutil
from verdicts import VERIFIED, FINE, LOW_FIT_DOWN
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

rows = json.load(open(sys.argv[1]))
fb = json.load(open('facebook_only.json'))

HOME = re.compile(r'plumb|hvac|ac repair|air|pool|pest|lawn|landscap|electric|auto|clean|pressure|handyman|roof|car_repair|gardener|tyres|painter|carpenter', re.I)
PRACTICE = re.compile(r'dent|chiro|vet|med spa|physical|therapy|attorney|lawyer|cpa|tax|accountant|beauty|hairdresser|massage|alternative|doctors|clinic|optometrist|counselling|fitness|pet', re.I)


def fit(trade):
    t = trade or ''
    if HOME.search(t): return 1.0, 'Home service'
    if PRACTICE.search(t): return 0.9, 'Local practice'
    if re.search(r'estate_agent|insurance|company', t): return 0.6, 'Other'
    return 0.75, 'Other'


def score(r):
    pts, why = 0, []
    def add(n, msg):
        nonlocal pts
        pts += n; why.append(msg)
    if r.get('freeSubdomain'):
        add(20, 'Runs on a free builder subdomain, not its own web address')
    if r.get('viewport') is False:
        add(30, 'Not built for phones (no mobile layout)')
    if (r.get('overflowPx') or 0) > 20:
        add(15, f"Page is wider than a phone screen by {r['overflowPx']}px (sideways scrolling)")
    st = r.get('smallTextPct')
    if st is not None and st >= 60: add(15, f'{st}% of text is too small to read on a phone')
    elif st is not None and st >= 40: add(8, f'{st}% of text is small on a phone')
    if r.get('telLinks') == 0: add(12, 'No tap-to-call phone link anywhere')
    elif r.get('telAbove') is False: add(4, 'Tap-to-call not visible without scrolling')
    if not r.get('ctaCount'): add(8, 'No "book / schedule / quote" button')
    elif r.get('ctaAbove') is False: add(3, 'No booking/quote button on the first screen')
    if not r.get('forms'): add(5, 'No contact or request form on the homepage')
    if r.get('finalHttps') is False: add(15, 'Not secure: browsers show "Not secure" (no https)')
    elif r.get('httpsOk') is False and not r.get('httpsErr', '').startswith('page.goto: Timeout'):
        add(10, 'Security certificate problem on https')
    cy = r.get('copyright')
    if cy and cy <= 2019: add(12, f'Copyright year {cy}: looks unmaintained')
    elif cy and cy <= 2022: add(6, f'Copyright year {cy}')
    if (r.get('retro') or 0) >= 6: add(8, 'Dated page code (table/font layout)')
    if r.get('flash'): add(10, 'Uses Flash (dead technology)')
    ls = r.get('loadSec') or 0
    if r.get('loadTimeout') or ls > 10: add(12, f'Slow: {ls}s to load')
    elif ls > 6: add(7, f'Slowish: {ls}s to load')
    if (r.get('pageKB') or 0) > 8000: add(5, f"Heavy page: {round(r['pageKB'] / 1024, 1)} MB")
    b = r.get('builders') or []
    if any(x in b for x in ['Vistaprint', 'Homestead', 'hibu', 'template vendor']): add(5, f"Built on a dated template service ({', '.join(b)})")
    if not r.get('metaDesc'): add(3, 'No search description (basic SEO missing)')
    if (r.get('words') or 0) < 150: add(5, 'Very little content')
    if r.get('mixedContent'): add(3, 'Insecure images or scripts on a secure page')
    return pts, why


AREA = re.compile(r'ormond|daytona|holly hill|port orange|new smyrna|edgewater|oak hill|deland|debary|deltona|orange city|lake helen|pierson|palm coast|flagler|bunnell|ponce inlet|south daytona|^$', re.I)
LEADGEN = re.compile(r'the-company-lawyer\.com', re.I)
rows = [r for r in rows if AREA.search(r.get('city') or '') and not LEADGEN.search(r.get('url', ''))]
fb = [r for r in fb if AREA.search(r.get('city') or '')]
out = []
DOWN = ('NAME_NOT_RESOLVED', 'HTTP 404', 'HTTP 500', 'HTTP 530', 'HTTP 444')
for r in rows:
    e = r.get('blocked') or r.get('error') or ''
    if any(k in e for k in DOWN):
        # confirmed twice (browser + separate request): the website itself is down
        why = ['Website is DOWN: ' + ('the web address no longer exists' if 'NAME_NOT_RESOLVED' in e else f"homepage returns an error ({e.split()[-1] if e.startswith('HTTP') else e})"),
               'Check the business is still operating before reaching out']
        w, seg = fit(r.get('trade'))
        r.update(_need=80, _why=why, _segment=seg, _priority=round(80 * w, 1), _status='Audited', _down=True)
        out.append(r); continue
    if r.get('error') or r.get('blocked'):
        r['_status'] = 'Could not verify'
        out.append(r); continue
    need, why = score(r)
    w, seg = fit(r.get('trade'))
    r.update(_need=need, _why=why, _segment=seg, _priority=round(need * w, 1), _status='Audited')
    out.append(r)

aud = sorted([r for r in out if r['_status'] == 'Audited'], key=lambda r: -r['_priority'])
bad = [r for r in out if r['_status'] != 'Audited']

def pitch(r):
    w = ' '.join(r['_why']).lower()
    if r.get('_down'):
        return 'Their website is down: anyone who clicks it from Google or their card hits an error. Offer a fast replacement.'
    if 'not built for phones' in w or 'wider than a phone' in w:
        return 'Show them their site on a phone next to a mobile-first mockup: most of their customers search on phones.'
    if 'free builder subdomain' in w:
        return 'Offer a proper site on their own domain with booking; low price point, fast win.'
    if 'not secure' in w:
        return 'Lead with the "Not secure" warning customers see; fix with a modern secure rebuild.'
    if 'no tap-to-call' in w or 'book' in w:
        return 'Lead with lost calls/bookings: add tap-to-call and a 60-second request form.'
    return 'Refresh + speed and a clear booking path; follow up with automation (reminders, reviews).'

wb = Workbook()
hdr = Font(bold=True, color='FFFFFF'); fill = PatternFill('solid', fgColor='1F1F2A')
def sheet(ws, cols, data):
    ws.append([c[0] for c in cols])
    for c in ws[1]: c.font = hdr; c.fill = fill; c.alignment = Alignment(vertical='center')
    for r in data: ws.append([c[1](r) for c in cols])
    for i, c in enumerate(cols, 1): ws.column_dimensions[get_column_letter(i)].width = c[2]
    for row in ws.iter_rows(min_row=2):
        for c in row: c.alignment = Alignment(wrap_text=True, vertical='top')
    ws.freeze_panes = 'A2'

cols = [
    ('Rank', lambda r: aud.index(r) + 1, 6), ('Business', lambda r: r['name'], 30), ('Type', lambda r: r.get('trade', ''), 18),
    ('City', lambda r: r.get('city', ''), 14), ('Website', lambda r: r.get('finalUrl') or r['url'], 34),
    ('Priority', lambda r: r['_priority'], 9), ('What we found', lambda r: '• ' + '\n• '.join(r['_why']), 60),
    ('Suggested angle', pitch, 44), ('Load (s)', lambda r: r.get('loadSec'), 8), ('Mobile layout', lambda r: 'yes' if r.get('viewport') else 'NO', 8),
    ('Tap-to-call', lambda r: 'yes' if r.get('telLinks') else 'NO', 8), ('https', lambda r: 'yes' if r.get('finalHttps') else 'NO', 7),
    ('Copyright', lambda r: r.get('copyright') or '', 9), ('Builder', lambda r: ', '.join(r.get('builders') or []), 14),
    ('Manual review', lambda r: (VERIFIED[r['name']][0] if r['name'] in VERIFIED else 'Checked: not a prospect (' + FINE[r['name']] + ')' if r['name'] in FINE else 'Down, lower fit' if r['name'] in LOW_FIT_DOWN else ''), 26),
    ('Phone screenshot', lambda r: r.get('shotMobile', ''), 30), ('Source', lambda r: r.get('source', ''), 12), ('Notes', lambda r: r.get('notes', ''), 30),
]
# curated list: manual verdicts first, by tier then priority
by = {r['name']: r for r in aud}
ver = sorted([by[n] for n in VERIFIED], key=lambda r: (VERIFIED[r['name']][0], list(VERIFIED).index(r['name'])))
os.makedirs('pitch-shots', exist_ok=True)
for i, r in enumerate(ver, 1):
    for k in ('shotMobile', 'shotDesktop'):
        if r.get(k) and os.path.exists('out/' + r[k]):
            shutil.copy('out/' + r[k], f"pitch-shots/{i:02d}-{r['key'][:40]}-{'phone' if k == 'shotMobile' else 'desktop'}.jpg")
wv = wb.active; wv.title = 'Verified top prospects'
sheet(wv, [('#', lambda r: ver.index(r) + 1, 5), ('Tier', lambda r: VERIFIED[r['name']][0], 26), ('Business', lambda r: r['name'], 30),
           ('Type', lambda r: r.get('trade', ''), 16), ('City', lambda r: r.get('city', ''), 14), ('Phone', lambda r: r.get('phone', ''), 16),
           ('Website', lambda r: r.get('finalUrl') or r['url'], 36), ('What we saw', lambda r: VERIFIED[r['name']][1], 56),
           ('Pitch angle', lambda r: VERIFIED[r['name']][2], 48), ('Auto checks', lambda r: '• ' + '\n• '.join(r['_why']), 50),
           ('Contacted?', lambda r: '', 11), ('Notes', lambda r: '', 30)], ver)
ws = wb.create_sheet('Ranked prospects (all)')
sheet(ws, cols, aud)
ws2 = wb.create_sheet('No website (Facebook only)')
sheet(ws2, [('Business', lambda r: r['name'], 34), ('Type', lambda r: r.get('trade', ''), 18), ('City', lambda r: r.get('city', ''), 14),
            ('Facebook / notes', lambda r: r.get('notes', ''), 70)], fb)
ws3 = wb.create_sheet('Could not verify')
sheet(ws3, [('Business', lambda r: r['name'], 34), ('Type', lambda r: r.get('trade', ''), 18), ('City', lambda r: r.get('city', ''), 14),
            ('Website', lambda r: r['url'], 40), ('Reason', lambda r: r.get('blocked') or r.get('error', ''), 50)], bad)
ws4 = wb.create_sheet('How scoring works')
for line in [
    'Each site was opened in a real browser at iPhone 13 size (390x844) on ' + '2026-09-27' + '.',
    'Priority = website "needs help" points x fit (home services 1.0, local practices 0.9, other 0.6-0.75).',
    'Points: no mobile layout 30, free subdomain 20, sideways scrolling 15, tiny text 8-15, no https 15, no tap-to-call 12,',
    'old copyright (2019 or earlier) 12, slow load 7-12, no booking/quote button 3-8, no form 5, dated code 8, Flash 10, etc.',
    'The "Verified top prospects" sheet was reviewed by eye (phone + desktop screenshots in pitch-shots/). Down sites were confirmed twice.',
    'Sites that could not be loaded from our test network, or showed a bot check, are listed separately and NOT scored.',
    'Business lists come from web search results and OpenStreetMap (ODbL). Verify each business is independent and active before outreach.',
]: ws4.append([line])
ws4.column_dimensions['A'].width = 130
wb.save('83apps-prospects.xlsx')
json.dump(aud, open('out/ranked.json', 'w'), indent=1, default=str)
print('verified', len(ver), 'audited', len(aud), 'could not verify', len(bad), 'facebook-only', len(fb))
for r in aud[:30]:
    print(f"{aud.index(r)+1:>2}. {r['_priority']:>5}  {r['name'][:38]:38} {r.get('trade','')[:16]:16} {r.get('city','')[:12]:12} {r.get('finalUrl','')[:40]}")
