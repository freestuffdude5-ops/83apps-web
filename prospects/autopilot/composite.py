"""Email images: desktop + phone hero side by side (1200x720 JPG), and the reviews strip (1200 wide)."""
import os
from PIL import Image, ImageDraw, ImageFilter


def hero(d, out, bg='#ecebe7', phone_left=False):
    dk = Image.open(os.path.join(d, 'desktop.png')).convert('RGB'); ph = Image.open(os.path.join(d, 'phone.png')).convert('RGB')
    W, H = 1200, 720
    c = Image.new('RGB', (W, H), bg)
    dw = 960; dk = dk.resize((dw, int(dk.height * dw / dk.width)), Image.LANCZOS)
    sh = Image.new('L', (dw + 80, dk.height + 80), 0); ImageDraw.Draw(sh).rounded_rectangle((40, 40, dw + 40, dk.height + 40), 10, fill=70)
    sh = sh.filter(ImageFilter.GaussianBlur(18))
    x0 = 210 if phone_left else 24
    c.paste(Image.new('RGB', sh.size, '#000'), (x0 - 40, 40 - 30), sh)
    m = Image.new('L', dk.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, *dk.size), 8, fill=255)
    c.paste(dk, (x0, 40), m)
    phh = 540; ph = ph.resize((int(ph.width * phh / ph.height), phh), Image.LANCZOS)
    fx, fy = (34 if phone_left else W - ph.width - 34), H - phh - 34
    fr = Image.new('RGB', (ph.width + 20, phh + 20), '#111')
    fm = Image.new('L', fr.size, 0); ImageDraw.Draw(fm).rounded_rectangle((0, 0, *fr.size), 30, fill=255)
    s2 = Image.new('L', (fr.width + 60, fr.height + 60), 0); ImageDraw.Draw(s2).rounded_rectangle((30, 30, fr.width + 30, fr.height + 30), 30, fill=130)
    s2 = s2.filter(ImageFilter.GaussianBlur(14))
    c.paste(Image.new('RGB', s2.size, '#000'), (fx - 40, fy - 20), s2)
    c.paste(fr, (fx - 10, fy - 10), fm)
    pm = Image.new('L', ph.size, 0); ImageDraw.Draw(pm).rounded_rectangle((0, 0, *ph.size), 22, fill=255)
    c.paste(ph, (fx, fy), pm)
    c.save(out, quality=84, optimize=True, progressive=True)
    return out


def reviews(d, out):
    f = os.path.join(d, 'reviews.png')
    if not os.path.exists(f): return None
    im = Image.open(f).convert('RGB')
    im = im.crop((0, 40, im.width, im.height - 20))
    w = 1200; im = im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)
    im.save(out, quality=84, optimize=True, progressive=True)
    return out
