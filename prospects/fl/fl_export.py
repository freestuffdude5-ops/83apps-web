"""Final stage: merge crawl + website checks + review activity into one clean database and export it.
    python3 fl_export.py [--db data/fl.db] [--out data/export]
Writes: <out>/florida_businesses.db (SQLite, table `businesses`), florida_all.csv, florida_leads.csv, by_county/<County>.csv,
        summary.md.  A "lead" = independent, open, 2+ Google reviews, active in the last 12 months, and no working website
        (none / Facebook-or-booking page only / broken / needs checking).
"""
import csv, json, os, re, sqlite3, sys, argparse, time, collections, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('--db', default=os.path.join(HERE, 'data', 'fl.db'))
ap.add_argument('--out', default=os.path.join(HERE, 'data', 'export'))
ap.add_argument('--minreviews', type=int, default=2)
args = ap.parse_args()
sys.argv = ['x', '--db', args.db]
from fl_sites import kind_of

src = open(os.path.join(HERE, '..', 'gmaps', 'targets.py')).read()
CHAIN = re.compile(re.search(r'CHAIN = re\.compile\(r"([^"]+)"', src).group(1), re.I)
SKIPCAT = re.compile(r'church|government|school|park|library|post office|hospital|city hall|association|non-profit|atm|apartment|condominium|hotel|motel|resort|gas station|real estate rental|mobile home|cemetery|courthouse|police|fire station|university|college|clinic|medical center|urgent care|emergency|department of|county|bank|credit union|storage unit|shopping|mall|plaza|business park|office park|industrial|airport|stadium|arena|amusement|tourist attraction|campground|rv park|lodging|bed & breakfast|golf course|convention|community center|senior center|nursing home|assisted living|rehabilitation|marina|vacation home|holiday home|timeshare|property management|housing|residential|neighborhood|subdivision|home owners|homeowners|gated community|trailer park|manufactured home|community', re.I)
geo = json.load(open(os.path.join(HERE, 'fl_geo.json')))
z2c = geo['zip2county']
city2county = {}
for l in sorted(geo['locations'], key=lambda x: x['pop']):
    city2county[re.sub(r'\s*[†‡*].*$', '', l['name']).strip().lower()] = l['county']

db = sqlite3.connect(args.db, timeout=120)
db.row_factory = sqlite3.Row
sites = {r['url']: r for r in db.execute('SELECT * FROM sites')}
act = {r['cid']: r for r in db.execute('SELECT * FROM activity WHERE err IS NULL')}
P = [dict(r) for r in db.execute('SELECT * FROM places')]


zip_city = collections.defaultdict(collections.Counter)
for p in P:
    if p['zip'] and p['city']: zip_city[p['zip']][p['city']] += 1
zip_city = {z: c.most_common(1)[0][0] for z, c in zip_city.items()}


def norm(n): return re.sub(r'[^a-z0-9 ]', '', (n or '').lower().replace('&', ' and ')).strip()


name_count = collections.Counter(norm(p['name']) for p in P)
dom_count = collections.Counter()
for p in P:
    w = p.get('website') or ''
    if kind_of(w) == 'own site':
        m = re.match(r'https?://(?:www\.)?([^/?#]+)', w); p['_dom'] = m.group(1).lower() if m else None
        if p['_dom']: dom_count[p['_dom']] += 1


def age_text(d):
    if d is None: return 'unknown'
    return 'this week' if d < 7 else f'~{d // 7} weeks ago' if d < 30 else f'~{d // 30} months ago' if d < 365 else f'~{d // 365} year(s) ago'


rows = []
for p in P:
    addr = p['address'] or ''
    am = re.search(r',\s*([A-Z]{2})\s+(\d{5})', addr)
    if am and am.group(1) != 'FL': continue                 # out-of-state result near the border
    qz = re.search(r'(\d{5})$', p['first_query'] or '')
    service_area = not addr                                 # no public street address (service-area business)
    zipc = p['zip'] or (am.group(2) if am else '') or (qz.group(1) if qz else '')
    if not zipc: continue
    p['zip'] = zipc; p['city'] = p['city'] or zip_city.get(zipc, '')
    w = p.get('website') or ''
    kind = kind_of(w)
    a = act.get(p['cid'])
    s = sites.get(w) if kind == 'own site' else None
    cats = json.loads(p['cats'] or '[]')
    catstr = ', '.join(cats[:3])
    qz = re.search(r'(\d{5})$', p['first_query'] or '')
    county = z2c.get(p['zip']) or city2county.get((p['city'] or '').lower()) or (z2c.get(qz.group(1)) if qz else '') or ''
    reviews = p['reviews'] if p['reviews'] is not None else (a['total_reviews'] if a else None)
    closed = bool(p['closed'] or (a and a['perm_closed']))
    temp = bool(p['temp_closed'] or (a and a['temp_closed']))
    days = a['newest_days'] if a else None
    is_chain = bool(CHAIN.search(p['name'] or '') or name_count[norm(p['name'])] >= 6 or (p.get('_dom') and dom_count[p['_dom']] >= 4))
    excluded = bool(SKIPCAT.search(catstr))
    # website state
    if kind == 'none': wsite, wwhy, wby = 'No website', 'Google profile has no website link', ''
    elif kind == 'social': wsite, wwhy, wby = 'Facebook/social page only', 'Website link goes to a social media page', ''
    elif kind == 'booking/free page': wsite, wwhy, wby = 'Booking/free page only', 'Website link goes to a booking, ordering or free-builder page', ''
    elif s is None: wsite, wwhy, wby = 'Not yet checked', '', ''
    else:
        wsite = {'OK': 'Working website', 'BROKEN': 'Broken website', 'CHECK': 'Needs checking', 'UNVERIFIABLE': 'Could not verify'}[s['verdict']]
        wwhy = s['why'] or ''; wby = s['method']
    weak = []
    if wsite == 'Working website' and s is not None and s['viewport'] is not None:
        if s['viewport'] == 0: weak.append('not mobile-friendly')
        if s['https'] == 0: weak.append('no HTTPS (browsers show "Not secure")')
        if s['copyright'] and s['copyright'] <= 2018: weak.append(f'footer says © {s["copyright"]}')
        if s['ms'] and s['ms'] > 6000: weak.append('slow to load')
    fb_url = (w if 'facebook.com' in w else '') or (s['facebook'] if s is not None and s['facebook'] else '')
    ig_url = (w if 'instagram.com' in w else '') or (s['instagram'] if s is not None and s['instagram'] else '')
    site_emails = (s['emails'] if s is not None and s['emails'] else '')
    active = 'closed' if closed else 'active' if days is not None and days <= 365 else 'stale' if days is not None else 'unknown'
    no_site = wsite in ('No website', 'Facebook/social page only', 'Booking/free page only', 'Broken website', 'Needs checking')
    independent = not is_chain and not excluded
    lead = independent and not closed and not temp and (reviews or 0) >= args.minreviews and active == 'active' and no_site
    weak_lead = int(bool(weak) and independent and not closed and not temp and (reviews or 0) >= args.minreviews and active == 'active')
    pr = ''
    if lead:
        strong = (reviews or 0) >= 10 and days is not None and days <= 180
        pr = 'A' if (wsite == 'Broken website' and strong) or (wsite == 'No website' and strong and (reviews or 0) >= 20) else 'B' if strong or wsite == 'Broken website' else 'C'
    note = []
    if wsite == 'Broken website': note.append(f'Website link on Google fails: {wwhy} ({"verified in a browser" if wby == "browser" else "dns/http check"}).')
    elif wsite == 'Needs checking': note.append(f'Website may be broken ({wwhy}): confirm on Google Maps before contacting.')
    elif wsite == 'Could not verify': note.append(f'Site could not be verified from our network ({wwhy}).')
    elif wsite in ('No website', 'Facebook/social page only', 'Booking/free page only'): note.append(wsite + ' on the Google profile: confirm there is no newer site.')
    if weak: note.append('Website works but is outdated: ' + ', '.join(weak) + '.')
    if a and a['claimed'] == 0: note.append('Google profile is unclaimed.')
    if reviews and days is not None: note.append(f'{reviews} reviews, newest {age_text(days)}.')
    if service_area: note.append('No public street address (service-area business): location is the ZIP it was found in.')
    if is_chain: note.append('Looks like a chain / multi-location business.')
    if excluded: note.append('Category excluded (church/school/government/etc).')
    if closed: note.append('Closed on Google.')
    rows.append(dict(
        cid=p['cid'], place_id=p['place_id'] or '', name=p['name'], category=catstr, address=(p['address'] or '').replace(', United States', ''), city=p['city'], zip=p['zip'],
        service_area=int(service_area), county=county, lat=p['lat'], lng=p['lng'], phone=p['phone'] or '', rating=p['rating'], reviews=reviews,
        newest_review_days=days, newest_review=age_text(days), activity=active, website=w, website_type=kind, website_status=wsite, website_detail=wwhy,
        website_verified_by=wby, site_builder=(s['generator'] if s is not None else '') or '', site_mobile_friendly=(s['viewport'] if s is not None else None),
        site_https=(s['https'] if s is not None else None), site_copyright=(s['copyright'] if s is not None else None), site_load_ms=(s['ms'] if s is not None else None),
        weak_website=int(bool(weak)), weak_reasons='; '.join(weak), weak_lead=weak_lead, email_on_site=site_emails, facebook=fb_url, instagram=ig_url,
        profile_claimed=(a['claimed'] if a else None), photos=(a['photos'] if a else None), hours=(a['hours'] if a else '') or '', attributes=(a['attrs'] if a else '') or '',
        business_description=(a['descr'] if a else '') or '', times_seen_in_search=p['nq'],
        lead=int(lead), priority=pr, chain=int(is_chain), excluded=int(excluded), closed=int(bool(closed or temp)),
        maps_url=(f'https://www.google.com/maps/place/?q=place_id:{p["place_id"]}' if p['place_id'] else f'https://www.google.com/maps/search/?api=1&query={(p["name"] or "").replace(" ", "+")}+{p["zip"] or ""}'),
        notes=' '.join(note)))

os.makedirs(os.path.join(args.out, 'by_county'), exist_ok=True)
cols = list(rows[0].keys())
for f in ('florida_businesses.db',):
    if os.path.exists(os.path.join(args.out, f)): os.remove(os.path.join(args.out, f))
o = sqlite3.connect(os.path.join(args.out, 'florida_businesses.db'))
o.execute('CREATE TABLE businesses(' + ','.join(cols) + ')')
o.executemany(f'INSERT INTO businesses VALUES({",".join("?" * len(cols))})', [[r[c] for c in cols] for r in rows])
o.execute('CREATE INDEX i_county ON businesses(county, lead)'); o.execute('CREATE INDEX i_lead ON businesses(lead, priority)'); o.commit()


def write_csv(path, rs):
    with open(path, 'w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=cols); w.writeheader(); w.writerows(rs)


order = {'A': 0, 'B': 1, 'C': 2, '': 3}
leads = sorted([r for r in rows if r['lead']], key=lambda r: (order[r['priority']], -(r['reviews'] or 0)))
write_csv(os.path.join(args.out, 'florida_all.csv'), rows)
write_csv(os.path.join(args.out, 'florida_leads.csv'), leads)
weak_leads = sorted([r for r in rows if r['weak_lead']], key=lambda r: -(r['reviews'] or 0))
write_csv(os.path.join(args.out, 'florida_leads_outdated_websites.csv'), weak_leads)
bycounty = collections.defaultdict(list)
for r in rows: bycounty[r['county'] or 'Unknown'].append(r)
for c, rs in bycounty.items():
    write_csv(os.path.join(args.out, 'by_county', c.replace('/', '-') + '.csv'), sorted(rs, key=lambda r: (-r['lead'], order[r['priority']], -(r['reviews'] or 0))))

# summary
L = collections.Counter(r['website_status'] for r in rows)
with open(os.path.join(args.out, 'summary.md'), 'w') as fh:
    fh.write(f'# Florida business database, built {datetime.date.today()}\n\n')
    fh.write(f'- Businesses: {len(rows):,} ({sum(1 for r in rows if (r["reviews"] or 0) >= args.minreviews):,} with {args.minreviews}+ reviews)\n')
    fh.write(f'- Leads (independent, open, active in last 12 months, no working website): {len(leads):,}\n')
    fh.write(f'- Outdated-website leads (site works but weak): {len(weak_leads):,}\n')
    fh.write('- Priority A/B/C: ' + ', '.join(f'{k} {sum(1 for r in leads if r["priority"] == k):,}' for k in 'ABC') + '\n')
    fh.write('- Website status (all businesses): ' + ', '.join(f'{k} {v:,}' for k, v in L.most_common()) + '\n\n## Leads by county\n\n| County | Businesses | Leads | A | B | C |\n|---|---|---|---|---|---|\n')
    for c in sorted(bycounty, key=lambda c: -sum(r['lead'] for r in bycounty[c])):
        rs = bycounty[c]; fh.write(f'| {c} | {len(rs):,} | {sum(r["lead"] for r in rs):,} | ' + ' | '.join(str(sum(1 for r in rs if r['priority'] == k)) for k in 'ABC') + ' |\n')
print(open(os.path.join(args.out, 'summary.md')).read()[:1800])
