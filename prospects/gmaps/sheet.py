# Contact sheets of BROKEN screenshots for manual review:  python3 sheet.py <key>
import json, os, sys
from PIL import Image, ImageDraw
k = sys.argv[1]
T = {r['cid']: r for r in json.load(open(f'targets-{k}.json'))}
c = [x for x in json.load(open(f'checked-{k}.json')) if x['verdict'] == 'BROKEN' and x.get('shot') and os.path.exists(x['shot'])]
c.sort(key=lambda x: -(T.get(x['cid'], {}).get('reviews') or 0))
W, H, cols = 300, 200, 6
for part in range(0, len(c), 36):
    ch = c[part:part + 36]; rows = (len(ch) + cols - 1) // cols
    s = Image.new('RGB', (cols * W, rows * (H + 28)), 'white'); d = ImageDraw.Draw(s)
    for i, x in enumerate(ch):
        im = Image.open(x['shot']).convert('RGB'); im.thumbnail((W - 6, H)); X, Y = (i % cols) * W, (i // cols) * (H + 28)
        s.paste(im, (X + 3, Y)); d.text((X + 3, Y + H + 2), f"{part + i + 1}. {x['name'][:30]}", fill='black')
        d.text((X + 3, Y + H + 14), f"{x.get('status')} {x['website'][:36]}", fill='red')
    s.save(f'/tmp/claude-0/rev-{k}-{part // 36}.jpg', quality=80)
print(k, len(c), 'screenshots')
