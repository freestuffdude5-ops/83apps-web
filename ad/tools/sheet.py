# Contact sheet of review stills: python3 tools/sheet.py out/sheet.png img1.png img2.png ...
import sys
from PIL import Image, ImageDraw
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
cols = min(len(ims), 4 if h > w else 3)
tw = 1600 // cols
th = int(h * tw / w)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 24)), (30, 30, 34))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * tw, (i // cols) * (th + 24)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 24))
    d.text((x + 6, y + 6), f.split('/')[-1], fill=(220, 220, 220))
sheet.save(out)
