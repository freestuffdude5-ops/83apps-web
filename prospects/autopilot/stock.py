"""Fallback photos per kind of business: public-domain (CC0) photos from Openverse, hand-checked once.

    python3 stock.py fetch            # download candidates per vertical into data/stock_cand/<key>/ + contact sheets
    python3 stock.py approve roof 1,4,7 ...   # keep these (recorded in stock_picks.json, which is committed)
    python3 stock.py sync             # download every approved photo into data/stock/<key>/ (on a new machine)

Used only when a business has no usable photo of its own (or its own photos were rejected in review).
"""
import json, os, sys, hashlib, io, requests
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
PICKS = os.path.join(HERE, 'stock_picks.json')
Q = {
    'roof': ['roofer shingles roof', 'roof tiles house'], 'auto': ['auto mechanic garage', 'car repair engine'], 'detail': ['car detailing polish', 'clean car shine'],
    'plumb': ['plumber pipes', 'plumbing repair sink'], 'hvac': ['air conditioner unit outdoor', 'hvac technician'], 'elec': ['electrician wiring', 'electrical panel'],
    'build': ['construction framing house', 'home renovation kitchen', 'carpenter woodwork'], 'sign': ['print shop printing', 'signage storefront'],
    'boat': ['boat marina florida', 'outboard motor boat'], 'tow': ['tow truck', 'roadside assistance car'], 'gym': ['gym weights training', 'boxing gym'],
    'lawn': ['lawn mowing green grass', 'landscaping garden yard'], 'tree': ['tree trimming arborist', 'tree cutting chainsaw'], 'pool': ['swimming pool clear water backyard', 'pool water'],
    'clean': ['house cleaning', 'clean living room interior', 'pressure washing'], 'pest': ['house exterior florida', 'pest control'], 'paint': ['house painting wall roller', 'painted house exterior'],
    'handy': ['tools workbench', 'home repair tools'], 'food': ['restaurant food plate', 'restaurant interior'], 'breakfast': ['breakfast pancakes eggs', 'diner breakfast'],
    'pizza': ['pizza', 'pizza oven'], 'mex': ['tacos', 'mexican food'], 'sea': ['seafood platter', 'grilled fish plate', 'shrimp dish'], 'bbq': ['barbecue ribs', 'bbq smoker brisket'],
    'bake': ['bakery pastries', 'cupcakes', 'bread bakery'], 'cafe': ['coffee latte cafe', 'coffee shop'], 'bar': ['bar drinks cocktails', 'beer taps pub'], 'cater': ['catering buffet', 'banquet table food'],
    'pet': ['dog grooming', 'happy dog', 'puppy'], 'hair': ['hair salon', 'hairdresser styling'], 'nail': ['manicure nails', 'beauty salon'], 'spa': ['spa massage stones', 'spa relaxation'],
    'yoga': ['yoga class', 'yoga studio'], 'photo': ['camera photographer', 'wedding photography'], 'event': ['wedding reception table', 'party decorations'], 'rental': ['party tent event', 'party decorations balloons'],
    'flower': ['flower bouquet', 'florist flowers'], 'shop': ['boutique shop interior', 'store shelves products'], 'kids': ['children classroom', 'kids playing toys'],
    'dent': ['dental office', 'dentist chair'], 'chiro': ['physical therapy', 'massage therapy back'], 'mind': ['calm office plants armchair', 'calm interior plants'], 'med': ['doctor office', 'medical clinic'],
    'realtor': ['florida house exterior', 'modern home living room', 'house with pool florida'], 'mortgage': ['house keys', 'new home exterior'], 'ins': ['family home exterior', 'office desk meeting'],
    'tax': ['office desk documents calculator', 'accountant office'], 'law': ['law books office', 'office conference room'], 'notary': ['signing documents pen', 'office desk documents'],
    'tech': ['computer repair', 'laptop desk technology'], 'biz': ['office interior', 'storefront'], 'vet': ['veterinarian dog', 'cat veterinarian'], 'dj': ['dj mixer party', 'dance party lights'],
    'tattoo': ['tattoo artist', 'tattoo studio'], 'moto': ['motorcycle garage', 'bicycle shop'],
}


def picks():
    return json.load(open(PICKS)) if os.path.exists(PICKS) else {}


def fetch():
    keys = sys.argv[2].split(',') if len(sys.argv) > 2 else list(Q)
    for key in keys:
        d = os.path.join(HERE, 'data', 'stock_cand', key); os.makedirs(d, exist_ok=True)
        cands = []
        for q in Q[key]:
            try:
                j = requests.get('https://api.openverse.org/v1/images/', params=dict(q=q, license='cc0', category='photograph', page_size=12, aspect_ratio='wide'), timeout=30).json()
            except Exception:
                continue
            for r in j.get('results', []):
                if (r.get('width') or 0) < 1000: continue
                cands.append(dict(url=r['url'], title=r.get('title'), creator=r.get('creator'), landing=r.get('foreign_landing_url'), q=q))
        seen, keep = set(), []
        for c in cands:
            if c['url'] in seen: continue
            seen.add(c['url'])
            try:
                b = requests.get(c['url'], timeout=30).content
                im = Image.open(io.BytesIO(b)).convert('RGB')
            except Exception:
                continue
            if im.width < 900: continue
            c['file'] = f"{len(keep)}.jpg"; im.thumbnail((1800, 1800)); im.save(os.path.join(d, c['file']), quality=86)
            keep.append(c)
            if len(keep) >= 16: break
        json.dump(keep, open(os.path.join(d, 'cands.json'), 'w'), indent=1)
        sheet(d, keep, key)
        print(key, len(keep))


def sheet(d, keep, key):
    W, cols = 300, 4
    rows = (len(keep) + cols - 1) // cols
    c = Image.new('RGB', (W * cols, max(1, rows) * 210), '#fff')
    dr = ImageDraw.Draw(c)
    for i, k in enumerate(keep):
        im = Image.open(os.path.join(d, k['file'])); im.thumbnail((W - 6, 196))
        x, y = (i % cols) * W, (i // cols) * 210
        c.paste(im, (x + 3, y + 3)); dr.rectangle((x + 3, y + 3, x + 30, y + 24), fill='#000'); dr.text((x + 8, y + 7), str(i), fill='#fff')
    c.save(os.path.join(HERE, 'data', 'stock_cand', f'sheet-{key}.jpg'), quality=80)


def approve():
    key, idx = sys.argv[2], [int(x) for x in sys.argv[3].split(',') if x != '']
    cands = json.load(open(os.path.join(HERE, 'data', 'stock_cand', key, 'cands.json')))
    p = picks(); p[key] = [{k: cands[i][k] for k in ('url', 'title', 'creator', 'landing')} for i in idx]
    json.dump(p, open(PICKS, 'w'), indent=1)
    sync([key])


def sync(keys=None):
    p = picks()
    for key in keys or p:
        d = os.path.join(HERE, 'data', 'stock', key); os.makedirs(d, exist_ok=True)
        for i, c in enumerate(p[key]):
            f = os.path.join(d, f'{i}.jpg')
            if os.path.exists(f): continue
            try:
                im = Image.open(io.BytesIO(requests.get(c['url'], timeout=30).content)).convert('RGB'); im.thumbnail((1800, 1800)); im.save(f, quality=86)
            except Exception as e:
                print('failed', key, i, e)


def for_vertical(key):
    """Approved stock files for a vertical (synced on demand)."""
    p = picks()
    if key not in p: return []
    d = os.path.join(HERE, 'data', 'stock', key)
    if not os.path.isdir(d) or len(os.listdir(d)) < len(p[key]): sync([key])
    return [dict(file=os.path.join(d, f'{i}.jpg'), **c) for i, c in enumerate(p[key]) if os.path.exists(os.path.join(d, f'{i}.jpg'))]


if __name__ == '__main__':
    {'fetch': fetch, 'approve': approve, 'sync': lambda: sync()}[sys.argv[1]]()
