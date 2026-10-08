"""Pick the one email address we trust for a business, and prove its domain accepts mail.

Sources, best first: mailto links on their own live site (home + contact page), emails printed on the site,
then mailto/printed emails on the newest Wayback Machine copy of their site (for broken sites).
An address is used only if it belongs to the business: same domain as their website, or a personal mailbox
(gmail, yahoo, att...) published on their own site. Platform, developer, tracking and placeholder addresses
are rejected. Finally the domain must have MX records (dns.google).
"""
import json, re, time, os, sys, urllib.parse
import requests

FREE = {'gmail.com', 'yahoo.com', 'aol.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'me.com', 'msn.com', 'live.com',
        'att.net', 'bellsouth.net', 'comcast.net', 'verizon.net', 'cfl.rr.com', 'tampabay.rr.com', 'earthlink.net', 'cox.net',
        'embarqmail.com', 'centurylink.net', 'protonmail.com', 'proton.me', 'ymail.com', 'mail.com', 'gmx.com', 'sbcglobal.net',
        'charter.net', 'windstream.net', 'frontier.com', 'juno.com', 'netzero.net', 'mac.com', 'rocketmail.com', 'zoho.com'}
BAD_LOCAL = re.compile(r'^(no-?reply|do-?not-?reply|bugreport|abuse|postmaster|hostmaster|privacy|compliance|dmca|legal|webmaster|admin@wordpress|'
                       r'example|test|email|name|your(name|email)?|user|username|someone|john(doe)?|jane|sentry|wordpress|support@(wix|godaddy|squarespace))$', re.I)
BAD_DOMAIN = re.compile(r'(^|\.)(example|domain|email|yourdomain|sentry|sentry-next|wixpress|wix|squarespace|godaddy|godaddysites|moatable|chime|'
                        r'kvcore|boomtown|placester|sitebuilder|weebly|jimdo|duda|yola|mysite|mystore|website|company|booksy|vagaro|glossgenius|'
                        r'squareup|square|setmore|fresha|toasttab|facebook|fb|instagram|canva|schedulicity|styleseat|acuityscheduling|calendly|'
                        r'linktr|wixsite|google|schema|w3|ingest|menufy|yelp|yellowpages)\.|\.(png|jpe?g|gif|webp|svg|css|js)$', re.I)
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
_mx = {}


def host_of(url):
    try: h = urllib.parse.urlparse(url if '//' in url else 'http://' + url).hostname or ''
    except Exception: return ''
    return h.lower().removeprefix('www.')


def root(h):
    p = h.split('.')
    return '.'.join(p[-3:]) if len(p) > 2 and p[-2] in ('co', 'com', 'org', 'net') and len(p[-1]) == 2 else '.'.join(p[-2:])


def clean(e):
    e = urllib.parse.unquote(e).strip().strip('.,;:<>()[]"\'').lower()
    e = re.sub(r'^(mailto:|\d{3}-\d{4}|%20)+', '', e)
    return e if re.fullmatch(r'[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}', e) else None


def has_mx(domain):
    if domain in _mx: return _mx[domain]
    ok = None
    for _ in range(3):
        try:
            j = SESSION.get(f'https://dns.google/resolve?name={domain}&type=MX', timeout=15).json()
            ok = j.get('Status') == 0 and any(a.get('type') == 15 for a in j.get('Answer', []))
            break
        except Exception: time.sleep(1)
    _mx[domain] = ok
    return ok


def choose(found, website, name='', owned_page=False):
    """found = [(email, source, strength)] -> best (email, source, why) or (None, None, reason).
    owned_page: the emails were printed on the business's own booking/Facebook page, so a personal mailbox there is theirs."""
    site = root(host_of(website)) if website and not owned_page else ''
    tokens = {t for t in re.findall(r'[a-z]{4,}', (name or '').lower())} - {'llc', 'inc', 'services', 'service', 'company', 'florida'}
    best, reasons = None, []
    allc = {clean(r) for r, _, _ in found} - {None}
    for raw, src, strength in found:
        e = clean(raw)
        if not e: continue
        if any(o != e and e.endswith(o) and re.match(r'^[a-z]+$', e[:len(e) - len(o)]) for o in allc): continue   # "account" + email glued by page text
        if owned_page: strength = max(strength, 2)
        local, dom = e.split('@')
        if BAD_LOCAL.match(local) or BAD_LOCAL.match(e) or BAD_DOMAIN.search(dom): reasons.append(f'{e}: placeholder/platform'); continue
        if dom == site or root(dom) == site: score = 3
        elif dom in FREE and strength >= 2: score = 2          # personal mailbox linked on their own site
        elif dom in FREE and any(t in local for t in tokens): score = 2
        elif any(t in dom for t in tokens): score = 2           # e.g. joesplumbing.net while site is joesplumbingfl.com
        else: reasons.append(f'{e}: other company domain'); continue
        if local in ('info', 'contact', 'office', 'hello', 'service', 'sales', 'appointments', 'help'): score += 0.2
        cand = (score + strength / 10, e, src)
        if best is None or cand > best: best = cand
    if not best: return None, None, '; '.join(reasons[:3]) or 'no email found'
    e = best[1]
    mx = has_mx(e.split('@')[1])
    if mx is False: return None, None, f'{e}: domain has no mail server (would bounce)'
    return e, best[2], 'ok' if mx else 'MX lookup failed'


def yellowpages(name, city, phone):
    """Email from the business's YellowPages listing, matched by phone number, or by near-identical name in the same city."""
    from difflib import SequenceMatcher
    digits = re.sub(r'\D', '', phone or '')[-10:]
    norm = lambda x: ' '.join(re.sub(r'\b(inc|llc|corp|co|the|and|of)\b', '', re.sub(r'[^a-z0-9 ]', '', x.lower().replace('&', ' and '))).split())
    try:
        r = SESSION.get('https://www.yellowpages.com/search', params={'search_terms': name, 'geo_location_terms': f'{city}, FL'}, timeout=30)
    except Exception:
        return []
    for b in re.split(r'<div class="result"', r.text)[1:10]:
        ph = re.sub(r'\D', '', ' '.join(re.findall(r'class="phones phone primary"[^>]*>([^<]+)', b)))
        bn = re.findall(r'class="business-name"[^>]*>(?:<span>)?([^<]+)', b)
        loc = ' '.join(re.findall(r'class="locality"[^>]*>([^<]+)', b)).lower()
        by_phone = bool(digits) and ph[-10:] == digits
        if not (by_phone or (SequenceMatcher(None, norm(name), norm(bn[0] if bn else '')).ratio() >= 0.9 and (city or '').lower() in loc)): continue
        em = re.findall(r'mailto:([^"?]+)', b)
        link = re.search(r'href="(/[^"]+/mip/[^"]+)"', b)
        if not em and link:
            time.sleep(0.6)
            try: em = re.findall(r'mailto:([^"?]+)', SESSION.get('https://www.yellowpages.com' + link.group(1), timeout=30).text)
            except Exception: em = []
        how = 'phone match' if by_phone else 'name+city match'
        return [(x, f'YellowPages listing ({how})', 3 if by_phone else 2) for x in em]
    return []


def from_probe(r):
    out = []
    for e in r.get('mailto') or []: out.append((e, 'mailto on homepage', 3))
    for e in r.get('contact_mailto') or []: out.append((e, 'mailto on contact page', 3))
    for e in (r.get('emails_in_html') or []) + (r.get('contact_emails') or []): out.append((e, 'printed on site', 1))
    return out


EMAIL_RE = re.compile(r'(?:mailto:)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})')


def wayback(website, pages=('', 'contact', 'contact-us', 'about')):
    """Emails from the newest archived copy of the site's homepage and contact page.
    Uses the plain snapshot redirect (/web/2y/...) because the availability API rate-limits hard. Be gentle: 1-2 threads."""
    h = host_of(website)
    if not h: return [], None
    found, snap = [], None
    for p in pages:
        for attempt in range(3):
            try:
                r = SESSION.get(f'https://web.archive.org/web/2026id_/http://{h}/{p}', timeout=40, allow_redirects=True)
            except Exception:
                time.sleep(3); continue
            if r.status_code == 429: time.sleep(20 * (attempt + 1)); continue
            break
        else:
            continue
        if r.status_code != 200: continue
        m = re.search(r'/web/(\d{14})', r.url); ts = m.group(1) if m else '?'
        snap = snap or ts
        html = r.text
        mt = re.findall(r'mailto:([^"\'?>\s]+)', html)
        for e in mt: found.append((e, f'mailto on archived site ({ts[:4]}) {p or "home"}', 3))
        for e in EMAIL_RE.findall(re.sub(r'<[^>]+>', ' ', html)): found.append((e, f'printed on archived site ({ts[:4]})', 1))
        time.sleep(1.5)
        if mt: break
    return found, snap


if __name__ == '__main__':
    f, s = wayback(sys.argv[1])
    print(s, f[:10]); print(choose(f, sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''))
