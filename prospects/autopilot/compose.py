"""Writes the outreach email for one lead, in Hayden's voice, using only claims the browser check proved.

Returns dict(subject, alt_subject, body, followup_body, claims, skip). skip is set when there is nothing true
and specific to say (e.g. their website turned out to be fine), so the lead is not emailed.
"""
import re
from emails import host_of

SHOT = ("My sites start at $250 depending on what you need. You choose the look and what goes on it, and every site is set up "
        "so Google and AI search tools can read your services, hours and reviews.")
ASK = "Want me to send over the full page and a quick quote?"
PERSON = re.compile(r"^(?:Dr\.?\s+)?([A-Z][a-z]{2,})\s+(?:[A-Z]\.?\s+)?[A-Z][a-zA-Z'\-]+(?:,|\s+-|\s+(?:Realtor|PhD|Ph\.D|DDS|DMD|CPA|Esq|LMHC|LCSW|MD|PA|Photography|Photo|Insurance|Law|State Farm|Allstate|Events|Designs?|Studio|Consulting|Realty|Group|Tutoring|Training|Fitness|Coaching|Counseling|Therapy)\b|$)")


def _person_in_reviews(n, reviews):
    t = ' '.join(r.get('text') or '' for r in (reviews or []))
    return bool(re.search(rf"\b{n}\b('s)? (was|did|made|took|helped|and (her|his) team)\b|(thank you|thanks|ask for|owner|shout ?out to|recommend) {n}\b", t, re.I))


def greeting(raw_name, name, vertical, email='', reviews=()):
    """'Hi Belinda,' only when we're sure who reads the mailbox:
    - the address itself is a first name (belinda.roldan8@, michele@), or
    - the business is named after a person (Nailed By Nicole, Joe's, Tawanda Purdie) and the email or the reviews confirm it."""
    from names import FIRST
    local = (email or '').split('@')[0].lower()
    first_local = re.split(r'[._\-0-9]', local)[0]
    if first_local in FIRST and len(first_local) >= 3:
        return f'Hi {first_local.title()},', first_local.title()
    for m in re.finditer(r"\b(?:[Bb]y|[Ww]ith)\s+([A-Z][a-z]{2,})\b|\b([A-Z][a-z]{2,})'s\b|^(?:Dr\.?\s+)?([A-Z][a-z]{2,})\s+[A-Z][a-z]+(?:,|\s*$|\s+(?:Realtor|PA|P\.A\.|CPA|DDS|DMD|LMHC|Insurance|Law|Photography|Events|Designs?|Studio|Consulting|Tutoring|Training|Fitness|Coaching))", raw_name):
        n = next(g for g in m.groups() if g)
        if m.group(3) and not re.search(r',|Realtor|PA|CPA|DDS|DMD|LMHC', m.group(0)) and n.lower() not in FIRST: continue
        if (n.lower() in FIRST or _person_in_reviews(n, reviews)) and (n.lower() in (email or '').lower() or _person_in_reviews(n, reviews)):
            return f'Hi {n},', n
    return (f'Hi {name} team,' if len(name) <= 28 else 'Hi there,'), None


def where(county):
    return 'here in Volusia County' if (county or '').lower() == 'volusia' else 'based in Ormond Beach'


PLATFORMS = [('square.site', 'Square'), ('squareup.com', 'Square'), ('vagaro', 'Vagaro'), ('booksy', 'Booksy'), ('glossgenius', 'GlossGenius'),
             ('fresha', 'Fresha'), ('setmore', 'Setmore'), ('styleseat', 'StyleSeat'), ('schedulicity', 'Schedulicity'), ('toasttab', 'Toast'),
             ('acuityscheduling', 'Acuity'), ('calendly', 'Calendly'), ('linktr.ee', 'Linktree'), ('wixsite', 'free Wix'), ('sites.google', 'Google Sites'),
             ('godaddysites', 'GoDaddy starter'), ('business.site', 'Google Business'), ('canva', 'Canva'), ('instagram', 'Instagram'),
             ('yelp', 'Yelp'), ('weebly', 'Weebly'), ('carrd', 'Carrd'), ('mystrikingly', 'Strikingly'), ('doordash', 'DoorDash'), ('grubhub', 'Grubhub'),
             ('ubereats', 'Uber Eats'), ('clover', 'Clover'), ('housecall', 'Housecall Pro'), ('thumbtack', 'Thumbtack'), ('angi', 'Angi'), ('nextdoor', 'Nextdoor')]


def platform_of(url):
    u = (url or '').lower()
    return next((n for k, n in PLATFORMS if k in u), None)


def verified_issues(lead):
    """Each issue: (key, sentence fragment, evidence). Only what the browser saw, or what the live Google listing shows."""
    p = lead.get('probe') or {}
    out = []
    kind = lead.get('kind')
    gw = lead.get('gp_website')
    if kind in ('booking', 'facebook', 'nosite'):
        if not lead.get('gp_full'): return out          # Google sent the stripped listing: can't confirm what it links to
        if kind == 'nosite' and not gw:
            return [('nosite', "your Google listing doesn't have a website linked at all", 'Google listing has no website field')]
        if kind == 'facebook' and gw and 'facebook.com' in gw:
            return [('facebook', 'the only website on your Google listing is your Facebook page', f'Google listing website = {gw}')]
        plat = platform_of(gw)
        if kind == 'booking' and plat:
            what = f'your {plat} page' if plat not in ('Instagram', 'Yelp') else f'your {plat} profile'
            return [('booking', f'your Google listing sends people to {what} rather than a website of your own', f'Google listing website = {gw}')]
        return out
    dom = host_of(lead.get('website') or '')
    st = lead.get('site_state')
    if st == 'broken':
        why = lead.get('broken_why') or "didn't load"
        out.append(('broken', f"I tapped the Website button on your Google listing and {dom} {why}", lead.get('broken_evidence', '')))
        return out
    if p.get('error'): return out
    final = p.get('final') or ''
    if final.startswith('http://'):
        out.append(('not_secure', f'when I opened {dom} from your Google listing, Chrome marked it "Not secure"', f'final URL {final}'))
    m = p.get('mobile') or {}
    if m and (not m.get('viewport') or (m.get('sw') or 0) > (m.get('vw') or 390) + 40):
        out.append(('not_mobile_vp' if not m.get('viewport') else 'not_mobile_ov', f'on a phone, {dom} shows up as the shrunk-down desktop page, so people have to pinch and zoom to read it',
                    f"viewport meta={m.get('viewport')} scrollWidth={m.get('sw')} vs {m.get('vw')}"))
    cy = p.get('copyright')
    if cy and cy <= 2019:
        out.append((f'old_{cy}', f'the footer on {dom} still says © {cy}, so it looks like the site hasn\'t had much love in a while', f'copyright {cy}'))
    return out


FEATURE = {
    'bold': 'your services up front, a tap-to-call button, and a quick "{cta}" form so new customers can reach you without playing phone tag',
    'edit': 'your food front and center, your hours and a tap-to-call button, and what your guests rave about in their reviews',
    'soft': 'a clean, calm look with your photos, real reviews, and a simple "{cta}" button so people can reach you any time',
    'clean': 'a clear, trustworthy layout, your hours and contact info up top, and a simple "{cta}" button for new clients',
    'bar': 'your menu and specials front and center, your hours and a tap-to-call button, and what your guests rave about in their reviews',
    'realtor': 'a clean, professional look, your reviews front and center, and a simple "let\'s talk" button so buyers and sellers can reach you',
    'fresh': 'a quote request right on the homepage, a tap-to-call button, and your Google reviews front and center',
}


def compliment(lead):
    r, n = lead.get('rating'), lead.get('reviews') or 0
    if r and r >= 4.4 and n >= 10: return f'{n:,} Google reviews and a {r:.1f} rating'
    return None


def compose(lead, D, has_reviews_img):
    name = D['name']
    issues = verified_issues(lead)
    hi, first = greeting(lead['name'], name, D.get('vertical'), lead.get('email', ''), lead.get('review_list'))
    if not issues:
        return dict(skip='website checked out fine in a real browser (secure, mobile-friendly, current), nothing honest to point out')
    key = issues[0][0]
    issue = issues[0][1]
    used = [key]
    if key != 'broken' and len(issues) > 1 and issues[1][0].startswith(('not_secure', 'not_mobile')):
        issue += ', and ' + issues[1][1].replace(f"{host_of(lead.get('website') or '')} ", 'it ', 1); used.append(issues[1][0])
    comp = compliment(lead)
    feat = FEATURE.get(D.get('vertical'), FEATURE[D['arch']]).replace('{cta}', D['cta'].lower())
    NEWSITE = {'nosite': "There's a lot of good stuff on your listing, so I put together a quick concept of what a website for " + name + ' could look like: ',
               'facebook': 'Facebook is great, but not every customer is on it, so I put together a quick concept of what a website of your own could look like: ',
               'booking': 'Booking pages are great for appointments, but a site of your own gives your work, reviews and services a real home (with your booking link right on it). So I put together a quick concept: '}
    if key in NEWSITE:
        opener = f"I'm Hayden, a web designer {where(lead.get('county'))}. I was looking at {name} on Google" + (f" ({comp}, nice work)" if comp else '') + f" and noticed that {issue}."
        lead_in = NEWSITE[key] + feat + '.'
    elif key == 'broken':
        opener = f"I'm Hayden, a web designer {where(lead.get('county'))}. {issue}" + (f", which is a shame for a business with {comp}." if comp else '.')
        lead_in = 'So I put together a quick concept of what a new homepage for ' + name + ' could look like: ' + feat + '.'
    else:
        opener = f"I'm Hayden, a web designer {where(lead.get('county'))}. I was looking at {name} online" + (f" ({comp}, nice work)" if comp else '') + f" and noticed that {issue}."
        lead_in = 'So I put together a quick concept of what a refreshed homepage could look like: ' + feat + '.'
    shots = ("There are two screenshots below: the homepage, and a reviews section built from your own Google reviews."
             if has_reviews_img else "There's a screenshot below.")
    body = f"{hi}\n\n{opener}\n\n{lead_in}\n\n{SHOT} {shots}\n\n{ASK}"
    follow = (f"Hi{(' ' + first) if first else ''}, just following up on the homepage concept I sent over for {name}. Sites start at $250, "
              f"and you decide the look and what goes on it. Want me to send the full page (it opens right in your browser) and a quick quote?")
    if key == 'broken':
        subject, alt = 'The website link on your Google listing', f'A homepage idea for {name}'
    elif key in NEWSITE:
        subject, alt = f'A website idea for {name}', f'Quick idea for {name}'
    else:
        subject, alt = f'A homepage idea for {name}', f'Quick idea for the {name} website'
    return dict(subject=subject, alt_subject=alt, body=body, followup_body=follow, claims=[f'{k}: {e}' for k, _, e in issues if k in used], claim_keys=','.join(k for k in used if k not in NEWSITE), skip=None)
