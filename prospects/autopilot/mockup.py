"""Builds a concept homepage for one business from real data and writes it as an HTML page ready to screenshot.

    from mockup import build;  build(lead, out_dir)    # lead = merged dict (see run.py: assemble())

Photos: their own website's large images, then their Google business photos, then customer photos (food only).
Every photo is downloaded and scored (size, sharpness, exposure, colour, "looks like a flyer/menu") and the
best one becomes the hero. Accent colour comes from their logo when it has a clear brand colour.
"""
import colorsys, hashlib, io, json, os, re
import numpy as np
import requests
from PIL import Image, ImageFilter, ImageStat
import verticals

HERE = os.path.dirname(os.path.abspath(__file__))
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'}
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
SUFFIX = re.compile(r',?\s*\b(llc|l\.l\.c\.|inc\.?|corp\.?|co\.|pa|p\.a\.|pllc|ltd)\s*$', re.I)


def h(s): return int(hashlib.md5(str(s).encode()).hexdigest(), 16)


def clean_name(name, website=''):
    parts = [p.strip() for p in re.split(r'\s+[-|–—:]\s+|\s*\|\s*', name) if p.strip()]
    best = parts[0] if parts else name
    dom = re.sub(r'^www\.', '', re.sub(r'^https?://', '', website or '')).split('/')[0].split('.')[0].lower()
    best = SUFFIX.sub('', best).strip(' ,.')
    if best.isupper() and len(best) > 4: best = best.title().replace("'S ", "'s ")
    return best


def city_of(lead):
    return lead.get('city') or (lead.get('city_line') or '').split(',')[0] or 'Florida'


# ---------------------------------------------------------------- images
def fetch(url, cache):
    os.makedirs(cache, exist_ok=True)
    f = os.path.join(cache, hashlib.md5(url.encode()).hexdigest()[:16])
    if os.path.exists(f): return open(f, 'rb').read()
    try:
        r = requests.get(url, headers=UA, timeout=30)
        if r.status_code != 200 or len(r.content) < 3000: return None
        open(f, 'wb').write(r.content)
        return r.content
    except Exception:
        return None


def score_photo(img):
    """0..100: big, sharp, well exposed, colourful, not text-heavy."""
    w, hgt = img.size
    if min(w, hgt) < 500: return 0, {}
    sm = img.convert('RGB').resize((320, int(320 * hgt / w)))
    a = np.asarray(sm).astype(float)
    lum = a.mean(axis=2)
    bright = lum.mean(); contrast = lum.std()
    rg = a[..., 0] - a[..., 1]; yb = (a[..., 0] + a[..., 1]) / 2 - a[..., 2]
    colorful = np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2)
    edges = np.asarray(sm.convert('L').filter(ImageFilter.FIND_EDGES)).astype(float)
    sharp = edges.var()
    edge_density = (edges > 60).mean()
    white = (lum > 235).mean()
    s = 40
    s += min(20, (min(w, hgt) - 500) / 40)
    s += min(15, sharp / 120)
    s += min(15, colorful / 4)
    s -= abs(bright - 128) / 6
    if contrast < 35: s -= 15
    if white > 0.35: s -= 30                       # flyer / menu / screenshot / logo on white
    if edge_density > 0.22 and colorful < 30: s -= 25   # text-heavy
    if w / hgt > 2.6 or hgt / w > 2.2: s -= 20
    return max(0, s), dict(bright=round(bright), colorful=round(colorful), sharp=round(sharp), white=round(white, 2), ed=round(edge_density, 2))


def gather_photos(lead, arch, cache):
    cands = []
    pr = lead.get('probe') or {}
    for im in (pr.get('images') or []):
        cands.append((im['src'], 'website', 6))
    for u in (pr.get('bg') or [])[:5]:
        cands.append((u, 'website', 4))
    if pr.get('og'): cands.append((pr['og'], 'website', 3))
    for p in (lead.get('photos') or []):
        cands.append((p['url'], 'google' + (' owner' if p.get('owner') else ''), 8 if p.get('owner') else 5))
    if arch in ('edit',) or True:
        for p in (lead.get('customer_photos') or [])[:6]:
            cands.append((p['url'], 'google customer', 2 if arch == 'edit' else -6))
    out, seen = [], set()
    for url, src, bonus in cands:
        if not url or url in seen or url.startswith('data:') or re.search(r'\.(svg|gif)(\?|$)', url, re.I): continue
        seen.add(url)
        b = fetch(url, cache)
        if not b: continue
        try:
            img = Image.open(io.BytesIO(b)); img.load()
        except Exception:
            continue
        s, info = score_photo(img)
        if s <= 0: continue
        land = img.width >= img.height
        out.append(dict(url=url, src=src, score=s + bonus, land=land, w=img.width, h=img.height, bytes=b, info=info))
    out.sort(key=lambda x: -x['score'])
    return out


def save_jpg(b, path, maxw=1800):
    img = Image.open(io.BytesIO(b)).convert('RGB')
    if img.width > maxw: img = img.resize((maxw, int(img.height * maxw / img.width)), Image.LANCZOS)
    img.save(path, quality=86)


# ---------------------------------------------------------------- logo & colour
def logo_info(b):
    """(usable, needs_chip, accent_hex or None)"""
    try:
        img = Image.open(io.BytesIO(b)); img.load()
    except Exception:
        return None
    if img.width < 60 or img.height < 24: return None
    rgba = img.convert('RGBA')
    a = np.asarray(rgba).astype(float)
    alpha = a[..., 3] > 40
    if alpha.mean() < 0.02: return None
    px = a[alpha][:, :3]
    transparent = alpha.mean() < 0.97
    lum = px.mean(axis=1)
    light = (lum > 200).mean(); dark = (lum < 60).mean()
    # accent: most common saturated colour
    acc = None
    sat = []
    for r, g_, bl in px[:: max(1, len(px) // 4000)]:
        hh, l, s = colorsys.rgb_to_hls(r / 255, g_ / 255, bl / 255)
        if s > 0.45 and 0.22 < l < 0.72: sat.append((round(hh * 24) % 24, r, g_, bl))
    if len(sat) > 0.04 * (len(px[:: max(1, len(px) // 4000)])):
        bins = {}
        for k, r, g_, bl in sat: bins.setdefault(k, []).append((r, g_, bl))
        k = max(bins, key=lambda k: len(bins[k]))
        r, g_, bl = np.mean(bins[k], axis=0)
        acc = '#%02x%02x%02x' % (int(r), int(g_), int(bl))
    is_light_logo = transparent and light > 0.6
    chip = (not transparent) or is_light_logo
    return dict(chip=bool(chip), light=bool(is_light_logo), dark=float(dark), accent=acc, w=img.width, h=img.height)


def lum_hex(c):
    r, g_, b = (int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))
    f = lambda x: x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g_) + 0.0722 * f(b)


def adjust(c, min_l=None, max_l=None):
    r, g_, b = (int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))
    hh, l, s = colorsys.rgb_to_hls(r, g_, b)
    if min_l is not None: l = max(l, min_l)
    if max_l is not None: l = min(l, max_l)
    r, g_, b = colorsys.hls_to_rgb(hh, l, max(s, .55))
    return '#%02x%02x%02x' % (int(r * 255), int(g_ * 255), int(b * 255))


# ---------------------------------------------------------------- text
def hours_rows(hours):
    if not hours: return []
    if isinstance(hours, str):
        ab = {d[:3]: d for d in DAYS}
        hours = {ab[p.split(' ', 1)[0]]: p.split(' ', 1)[1] for p in hours.split('; ') if ' ' in p and p.split(' ', 1)[0] in ab}
    seq = [(d, hours.get(d)) for d in DAYS if hours.get(d)]
    rows, i = [], 0
    while i < len(seq):
        j = i
        while j + 1 < len(seq) and seq[j + 1][1] == seq[i][1] and DAYS.index(seq[j + 1][0]) == DAYS.index(seq[j][0]) + 1: j += 1
        a, b = seq[i][0][:3], seq[j][0][:3]
        rows.append((a if i == j else f'{a}–{b}', seq[i][1].replace('-', '–').replace('Open 24 hours', '24 hours')))
        i = j + 1
    return rows


def hours_short(rows):
    if not rows: return None
    open_rows = [r for r in rows if r[1] != 'Closed']
    if len(open_rows) == 1 and open_rows[0][0] == 'Mon–Sun': return ('Open 7 days', open_rows[0][1])
    if not open_rows: return None
    span = lambda r: (DAYS.index(next(d for d in DAYS if d.startswith(r[0].split('–')[-1]))) - DAYS.index(next(d for d in DAYS if d.startswith(r[0][:3]))) + 1)
    best = max(open_rows, key=span)
    if len(rows) >= 5 and span(best) == 1: return ('Hours vary by day', best[1].split(',')[0] + '…' if ',' in best[1] else 'See hours')
    return (best[0], best[1])


def first_sentences(t, n=170):
    if not t: return None
    t = re.sub(r'\s+', ' ', t).strip()
    if sum(c.isupper() for c in t) > 0.4 * sum(c.isalpha() for c in t): return None
    out = ''
    t = re.sub(r'\b(Dr|Mr|Mrs|Ms|St|Jr|Sr|Inc|Co|Ave|Blvd)\.\s', lambda mm: mm.group(1) + '\u2024 ', t)
    for s in re.split(r'(?<=[.!?])\s+', t):
        s = s.replace('\u2024', '.')
        if len(out) + len(s) > n: break
        out = (out + ' ' + s).strip()
    if not out and len(t) <= n: out = t
    out = out.replace('\u2024', '.')
    if re.search(r'\b(Dr|Mr|Mrs|Ms|St)\.$', out or ''): out = None
    if out and not out.endswith(('.', '!', '?')): out += '.'
    return out or None


def who(author):
    if not author: return 'Google reviewer'
    p = author.split()
    if len(p) >= 2 and len(p[-1]) > 1: return f'{p[0].title()} {p[-1][0].upper()}.'
    return author.strip().title()


NEG = re.compile(r"\b(but|however|although|unfortunately|disappoint|rude|wait(ed)? (for )?\d|never again|worst|terrible|horrible|refund|manager|complain|issue|problem)\b", re.I)


def snippet(text, n=150):
    t = re.sub(r'\s+', ' ', text).strip()
    out = ''
    for s in re.split(r'(?<=[.!?])\s+', t):
        if NEG.search(s): continue
        if len(out) + len(s) + 1 > n: break
        out = (out + ' ' + s).strip()
    return out if len(out) >= 40 else None


def pick_reviews(rl, k=3):
    good = []
    for r in rl or []:
        if (r.get('stars') or 0) < 5 or not r.get('text'): continue
        s = snippet(r['text'], 150); s2 = snippet(r['text'], 230)
        if s: good.append(dict(text=s, long=s2 or s, who=who(r.get('author')), ago=r.get('ago')))
    return good[:k]


# ---------------------------------------------------------------- build
def build(lead, out_dir, variant=0):
    os.makedirs(out_dir, exist_ok=True)
    cache = os.path.join(HERE, 'data', 'imgcache')
    cats = lead.get('cats') or [c.strip() for c in (lead.get('category') or '').split(',')]
    V = verticals.pick(cats)
    arch = V['arch']
    A = verticals.ARCH[arch]
    seed = h(lead['cid']) + variant
    name = clean_name(lead['name'], lead.get('website'))
    city = city_of(lead)
    D = dict(arch=arch, name=name, wordmark=name, phone=lead.get('phone'), address=lead.get('address_short'), links=V['links'],
             cta=V['cta'], cta_short=V['cta_short'], rating=lead.get('rating'), reviews=lead.get('reviews') or 0)
    if not D['rating'] or D['rating'] < 4.3 or D['reviews'] < 5: D['rating'] = None
    vars_ = dict(A['vars'])

    # logo
    pr = lead.get('probe') or {}
    lg = None
    for src in [(pr.get('logo') or {}).get('src')]:
        if src and not src.startswith('data:'):
            b = fetch(src, cache)
            if b:
                if src.lower().split('?')[0].endswith('.svg'):
                    open(os.path.join(out_dir, 'logo.svg'), 'wb').write(b); lg = dict(file='logo.svg', chip=arch in ('bold', 'edit'), accent=None)
                else:
                    info = logo_info(b)
                    if info:
                        Image.open(io.BytesIO(b)).convert('RGBA').save(os.path.join(out_dir, 'logo.png'))
                        on_dark = arch in ('bold', 'edit')
                        opaque = info['chip'] and not info['light']
                        info['chip'] = 'light' if (opaque or (on_dark and not info['light'])) else ('dark' if (not on_dark and info['light']) else False)
                        lg = dict(file='logo.png', **info)
    if lg:
        D['logo'] = lg['file']; D['logo_chip'] = lg['chip']
    else:
        D['wordmark_sub'] = f"{V['eyebrow']} · {city}"

    # palette
    accent = A['accents'][seed % len(A['accents'])]
    if lg and lg.get('accent'): accent = lg['accent']
    if A.get('light_on_dark'): accent = adjust(accent, min_l=.5)
    else: accent = adjust(accent, max_l=.48)
    vars_['accent'] = accent
    vars_['on-accent'] = '#15110e' if lum_hex(accent) > 0.42 else '#ffffff'
    vars_['accent-2'] = accent
    vars_['eyebrow'] = accent
    vars_['em-color'] = accent
    r, g_, b = (int(accent[i:i + 2], 16) for i in (1, 3, 5))
    vars_['blob'] = f'rgba({r},{g_},{b},.10)'
    D['vars'] = vars_

    # photos (override = choices from the review step: {"hero": index|"stock", "p2": index|"none"|"stock"})
    photos = gather_photos(lead, arch, cache)
    ov = lead.get('override') or {}
    photos = [p for p in photos if p['url'] not in set(ov.get('reject', []))]
    need_land = arch == 'bold'
    stock_list = None
    def stock_pick(k):
        nonlocal stock_list
        import stock
        if stock_list is None: stock_list = stock.for_vertical(V['key']) or stock.for_vertical('biz')
        if not stock_list: return None
        c = stock_list[(seed + k) % len(stock_list)]
        return dict(url=c['url'], src='stock CC0: ' + (c.get('creator') or '') + ' ' + (c.get('landing') or ''), score=0, bytes=open(c['file'], 'rb').read())
    if isinstance(ov.get('hero'), int) and ov['hero'] < len(photos): hero = photos[ov['hero']]
    elif ov.get('hero') == 'stock' or not photos: hero = stock_pick(0)
    else: hero = next((p for p in photos if p['land'] or not need_land), None) or (photos[0] if photos else None)
    rest = [p for p in photos if p is not hero and p['score'] >= 45]
    if isinstance(ov.get('p2'), int) and ov['p2'] < len(photos): p2 = photos[ov['p2']]
    elif ov.get('p2') == 'none': p2 = None
    elif ov.get('p2') == 'stock' or (not rest and hero and hero['src'].startswith('stock')): p2 = stock_pick(1)
    else: p2 = rest[0] if rest else None
    if hero:
        save_jpg(hero['bytes'], os.path.join(out_dir, 'p1.jpg')); D['p1'] = 'p1.jpg'; D['p1pos'] = 'center 40%'
    if p2:
        save_jpg(p2['bytes'], os.path.join(out_dir, 'p2.jpg'), 900); D['p2'] = 'p2.jpg'; D['p2pos'] = 'center'
    D['photo_sources'] = [dict(url=p['url'], src=p['src'], score=round(p['score'])) for p in (hero, p2) if p]
    D['photo_cands'] = [dict(i=i, url=p['url'], src=p['src'], score=round(p['score'])) for i, p in enumerate(photos[:10])]
    for i, p in enumerate(photos[:10]):
        try:
            im = Image.open(io.BytesIO(p['bytes'])).convert('RGB'); im.thumbnail((360, 240)); im.save(os.path.join(out_dir, f'cand{i}.jpg'), quality=70)
        except Exception: pass

    # copy
    cat0 = next((c for c in cats if c and not re.search(r'establishment|^store$|point of interest|supplier', c, re.I)), None) or (cats[0] if cats else None)
    label = cat0 if cat0 and len(cat0) <= 26 else V['eyebrow']
    D['eyebrow'] = f"{city} · {label}" if len(city) < 18 else label
    h1s = V['h1']
    D['h1'] = h1s[(seed // 7) % len(h1s)].replace('{city}', city)
    sub = first_sentences(lead.get('descr'), 175) or first_sentences(lead.get('summary'), 175)
    if not sub:
        cat = (cats[0] if cats else V['eyebrow']).lower()
        art = 'an' if cat[:1] in 'aeiou' else 'a'
        sub = f"{name} is {art} {cat} in {city}. " + {'bold': 'Call or request your free estimate online in under a minute.',
                                                       'edit': 'Stop in, call ahead, or see what\'s on the menu.',
                                                       'soft': 'Book online in a few taps, any time.',
                                                       'clean': 'Reach out online or by phone to get started.',
                                                       'fresh': 'Request a free quote online in under a minute.'}[arch]
        if V['cta'] in ('See the menu',) or 'estimate' not in V['cta'].lower():
            sub = sub.replace('your free estimate', 'service')
    D['sub'] = sub
    rows = hours_rows(lead.get('hours'))
    D['hours_rows'] = rows[:4]
    D['info_title'] = 'Office hours'
    facts = []
    if D['rating'] and arch in ('bold', 'soft', 'fresh', 'clean'):
        facts.append(dict(icon='star', b=f"{D['rating']:.1f} on Google", s=f"{D['reviews']:,} reviews"))
    hs = hours_short(rows)
    if hs: facts.append(dict(icon='clock', b=hs[1], s=hs[0]))
    if lead.get('street'): facts.append(dict(icon='pin', b=lead['street'], s=city))
    else: facts.append(dict(icon='pin', b=f'Serving {city}', s='and nearby'))
    D['facts'] = facts[:3]
    revs = pick_reviews(lead.get('review_list'))
    D['quote'] = dict(text=revs[0]['text'], who=revs[0]['who']) if revs else None
    D['review_cards'] = [dict(text=r['long'], who=r['who'], ago=r['ago']) for r in revs[:3]] if len(revs) >= 2 else []
    D['reviews_h2'] = V['reviews_h2']
    topics = [t for t in (lead.get('topics') or []) if not re.search(r'\b(price|prices|parking|staff|service|wait|line|owner|music|atmosphere|bathroom|clean|friendly|quality|portion|value|tip)\b', t)]
    D['loves'] = topics[:4] if arch == 'edit' else []
    D['services'] = [dict(b=c, s=f'Ask about {c.lower()} in {city}.') for c in cats[:6] if c.lower() not in ('service establishment', 'store', 'establishment', 'point of interest')]
    D['services_eyebrow'] = 'Services' if arch != 'edit' else 'Favorites'
    D['services_h2'] = V['services_h2']
    if V.get('form'): D['form_title'], D['form_sub'] = V['form']
    D['mono'] = ''.join(w[0] for w in re.findall(r'[A-Za-z]+', name)[:2]).upper()
    D['vertical'] = V['key']

    html = open(os.path.join(HERE, 'template.html')).read()
    html = html.replace('FONTS/', os.path.relpath(os.path.join(HERE, 'fonts'), out_dir) + '/')
    html = html.replace('__DATA__', json.dumps({k: v for k, v in D.items() if k not in ('photo_sources', 'photo_cands')}))
    open(os.path.join(out_dir, 'index.html'), 'w').write(html)
    json.dump(D, open(os.path.join(out_dir, 'data.json'), 'w'), indent=1)
    return D
