"""Everything Google Maps shows about one business, from a single place-preview request (no browser).

    from gplace import place;  p = place('0x88e69d95f906b757:0x8c74940188c434e5')

Returns name, address, phone, categories, rating, review count, hours, Google's own summary, the owner's
description, "people often mention" topics, the logo/profile photo, business photos, customer photos
from reviews, and the visible reviews (author, stars, text, age). Google answers with either a full or a
stripped variant at random, so this retries until the reviews block is present.
"""
import json, os, re, sys, time, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'fl'))
import fastget

TEMPLATE = open(os.path.join(HERE, '..', 'fl', 'pb_template.txt')).read().strip()


def _g(x, *path):
    for k in path:
        try: x = x[k]
        except (IndexError, KeyError, TypeError): return None
    return x


def url_for(cid):
    return 'https://www.google.com' + re.sub(r'0x[0-9a-f]+%3A0x[0-9a-f]+', cid.replace(':', '%3A'), TEMPLATE, count=1)


def big(u, w=1600, h=1200):
    """Full-size version of a googleusercontent photo URL."""
    if not u: return u
    u = u if u.startswith('http') else 'https:' + u
    return re.sub(r'=[^/=]*$', '', u) + f'=w{w}-h{h}-k-no'


def _photo(ph):
    u = _g(ph, 6, 0); dims = _g(ph, 6, 2)
    if not u or 'googleusercontent' not in u or '/a-/' in u or '/a/' in u: return None
    src = _g(ph, 21, 6, 5, 2) or ''
    return dict(url=big(u), w=_g(dims, 0), h=_g(dims, 1), kind=_g(ph, 20) or 'Photo', owner=src.startswith('bizbuilder'))


def parse(txt):
    if not txt.startswith(")]}'"): return None
    d = json.loads(txt[txt.index('\n') + 1:])
    p = d[6] if isinstance(d, list) and len(d) > 6 else None
    if not p: return None
    out = dict(cid=_g(p, 10), place_id=_g(p, 78), name=_g(p, 11), cats=_g(p, 13) or [],
               address=_g(p, 39), street=_g(p, 2, 0), city_line=_g(p, 2, 1),
               phone=_g(p, 178, 0, 1, 0, 0), rating=_g(p, 4, 7), reviews=_g(p, 4, 8),
               summary=_g(p, 32, 1, 1) or _g(p, 32, 0, 1), descr=_g(p, 154, 0, 0),
               website=_g(p, 7, 0), lat=_g(p, 9, 2), lng=_g(p, 9, 3),
               star_hist=_g(p, 175, 3), closed='Permanently closed' in txt, claimed='Claim this business' not in txt)
    logo = _g(p, 157)
    if logo and logo.startswith('//'): logo = 'https:' + logo
    out['logo'] = (re.sub(r'/s\d+[^/]*/photo\.jpg$', '/s512-p-k-no-ns-nd/photo.jpg', logo) if logo and logo.endswith('/photo.jpg') else big(logo, 512, 512)) if logo else None
    hrs = {}
    for day in (_g(p, 203, 0) or []):
        name = _g(day, 0); slots = _g(day, 3) or []
        if name: hrs[name] = ', '.join(_g(s, 0) for s in slots if _g(s, 0)).replace(' ', ' ').replace(' ', ' ').replace('–', '-') or 'Closed'
    out['hours'] = hrs
    out['topics'] = [t for t in ((_g(x, 1)) for x in (_g(p, 153, 0) or [])) if t]
    photos, seen = [], set()
    for ph in (_g(p, 51, 0) or []) + (_g(p, 72, 0) or []):
        f = _photo(ph)
        if f and f['kind'] == 'Photo' and f['url'] not in seen: seen.add(f['url']); photos.append(f)
    out['photos'] = photos
    reviews, cust = [], []
    for r in (_g(p, 175, 9, 0, 0) or []):
        text = _g(r, 0, 2, 15, 0, 0)
        rev = dict(author=_g(r, 0, 1, 4, 5, 0), stars=_g(r, 0, 2, 0, 0), text=text, ago=_g(r, 0, 1, 6), ts=_g(r, 0, 1, 2))
        if text: reviews.append(rev)
        for ph in (_g(r, 0, 2, 2) or []):
            f = _photo(_g(ph, 1))
            if f and f['url'] not in seen: seen.add(f['url']); f['by'] = rev['author']; cust.append(f)
    out['review_list'] = reviews
    out['customer_photos'] = cust
    links = re.findall(r'"(https://[^"]+)",\["https://[^"]+",null,null,null,",AOvVaw', txt)
    out['action_links'] = list(dict.fromkeys(l for l in links if 'google.' not in l))[:6]
    return out


def place(cid, tries=12):
    best = None
    for i in range(tries):
        try:
            out = parse(fastget.get(url_for(cid)))
        except Exception:
            out = None
        if out:
            if best is None or len(out['review_list']) + len(out['photos']) > len(best['review_list']) + len(best['photos']): best = out
            if out['review_list'] and out['photos']: break
            if out['reviews'] is not None and out['reviews'] < 2 and i >= 2: break
        time.sleep(0.3 + random.random() * 0.5)
    return best


if __name__ == '__main__':
    print(json.dumps(place(sys.argv[1]), indent=1)[:6000])
