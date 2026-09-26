"""Upbeat original music bed (≈120 BPM, D major), arranged to the edit.

Sections (seconds, from the cue sheet):
  grid0  first downbeat          drop   groove kicks in (website scene)
  build  riser into the brand    brand  full groove returns (infinity)
  logo   impact on the logo      final  last stab chord, rings out
Everything is synthesised here (no samples), so there is nothing to license.
"""
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(1983)

# D – A – Bm – G, one chord per bar, smooth voicings
PROG = [
    (38, [62, 66, 69]),  # D
    (33, [61, 64, 69]),  # A
    (35, [62, 66, 71]),  # Bm
    (31, [62, 67, 71]),  # G
]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def saw(f, n, phase=0.0):
    """band-limited (polyBLEP) sawtooth"""
    dt = f / SR
    ph = (phase + dt * np.arange(n)) % 1.0
    y = 2 * ph - 1
    t = ph / dt
    m = ph < dt
    y[m] -= (t[m] + t[m] - t[m] * t[m] - 1)
    t2 = (ph - 1) / dt
    m2 = ph > 1 - dt
    y[m2] -= (t2[m2] * t2[m2] + t2[m2] + t2[m2] + 1)
    return y


def tv_filter(x, fc_at, kind='low', blk=256, q=None):
    """time-varying 2nd-order filter; cutoff from fc_at(seconds); state carried across blocks"""
    out = np.empty_like(x)
    zi = np.zeros((1, 2))
    for a in range(0, len(x), blk):
        fc = fc_at(a / SR)
        if kind == 'low':
            sos = butter(2, min(fc, SR / 2 - 200), 'low', fs=SR, output='sos')
        else:
            sos = butter(1, [max(20, fc * 0.7), min(fc * 1.4, SR / 2 - 200)], 'band', fs=SR, output='sos')
        out[a:a + blk], zi = sosfilt(sos, x[a:a + blk], zi=zi)
    return out


def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x)


def put(buf, sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR))
    if i >= buf.shape[1] or i < 0:
        return
    s = sig[: buf.shape[1] - i] * gain
    l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    buf[0, i:i + len(s)] += s * l
    buf[1, i:i + len(s)] += s * r


# ------------------------------------------------------------------ voices
def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 56 + 120 * np.exp(-t * 42)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    y += 0.35 * hp(rng.standard_normal(n), 3000) * np.exp(-t * 180)  # click
    return np.tanh(y * 1.6)


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 900, 5200)
    env = np.zeros(n)
    for k, d in enumerate((0, 0.009, 0.019)):
        tt = np.clip(t - d, 0, None)
        env += (t >= d) * np.exp(-tt * (160 if k < 2 else 22))
    return noise * env * 0.6


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500) * np.exp(-t * (18 if open_ else 95))


def crash(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 4500) * np.exp(-t * 2.4) * np.minimum(1, t / 0.002)


def pluck(m, dur, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = 0.6 * saw(hz(m), n) + 0.4 * saw(hz(m) * 1.004, n, 0.3)
    # filter envelope: bright attack that closes quickly (block-wise cutoff)
    out = tv_filter(y, lambda s: 400 + 5200 * bright * np.exp(-s * 14))
    return out * np.exp(-t * 6) * np.minimum(1, t / 0.003)


def pad(notes, dur, cutoff=2800):
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for m in notes:
        for d in (-0.1, -0.04, 0.03, 0.09):
            y += saw(hz(m) * 2 ** (d / 12), n, rng.uniform())
    y = lp(y / (len(notes) * 4), cutoff)
    a, r = int(0.04 * SR), int(0.25 * SR)
    env = np.ones(n)
    env[:a] = np.linspace(0, 1, a)
    env[-r:] *= np.linspace(1, 0, r)
    return y * env


def bass(m, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * hz(m) * t)
    body = lp(saw(hz(m), n), 950)
    env = np.minimum(1, t / 0.004) * np.exp(-t * 3.5)
    r = int(0.02 * SR)
    env[-r:] *= np.linspace(1, 0, r)
    return (0.5 * sub + 0.7 * body) * env


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = tv_filter(x, lambda s: 300 + 7000 * (s / dur) ** 2, kind='band', blk=512)
    return out * (t / dur) ** 2


def impact():
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    f = 38 + 80 * np.exp(-t * 20)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    return np.tanh(y * 1.4)


# ------------------------------------------------------------------ arrangement
def score(sec, n):
    g0, drop, build, brand, logo, final = (sec[k] for k in ('grid0', 'drop', 'build', 'brand', 'logo', 'final'))
    end = sec['duration']
    drums = np.zeros((2, n))
    tonal = np.zeros((2, n))   # sidechained by the kick
    fxb = np.zeros((2, n))
    kicks = []

    def chord_at(t):
        return PROG[int(np.floor((t - g0) / BAR)) % len(PROG)]

    arp = [0, 1, 2, 1, 3, 2, 1, 2]  # indexes into [root, 3rd, 5th, octave]
    t = g0
    step = 0
    while t < final - 1e-6:
        beat_in_bar = step % 16  # 16th-note steps
        root, ch = chord_at(t)
        groove = drop <= t < build or brand <= t < final
        intro = t < drop
        building = build <= t < brand
        # --- drums
        if groove and beat_in_bar % 4 == 0 and not (logo <= t < logo + BEAT * 0.9):
            put(drums, kick(), t, 0.62)
            kicks.append(t)
        if groove and beat_in_bar in (4, 12):
            put(drums, clap(), t, 0.75, 0.05)
        if (groove or (intro and t >= drop - BAR)) and beat_in_bar % 4 == 2:
            put(drums, hat(), t, 0.34 if groove else 0.16, 0.3)
        if groove and beat_in_bar % 2 == 1:
            put(drums, hat(), t, 0.13, -0.35)
        if building:
            # claps accelerate into the brand drop: quarters → eighths → sixteenths
            frac = (t - build) / (brand - build)
            div = 4 if frac < 0.5 else 2 if frac < 0.75 else 1
            if beat_in_bar % div == 0:
                put(drums, clap(), t, 0.12 + 0.25 * frac, 0.0)
        # --- bass: offbeat eighths in the groove, whole notes in the build
        if groove and beat_in_bar % 2 == 0:
            put(tonal, bass(root + 12 if beat_in_bar % 4 == 2 else root, BEAT / 2 * 0.95), t, 0.2)
        # --- chords: one pad per bar
        if beat_in_bar == 0:
            bar_end = min(t + BAR, final)
            cut = 1400 if intro else 3600 if groove else 2000 + 2500 * ((t - build) / max(1e-3, brand - build))
            put(tonal, pad(ch + ([ch[0] + 12] if t >= brand else []), bar_end - t, cut), t, 0.42 if groove else 0.32)
        # --- pluck arpeggio (16ths), brighter once the groove starts
        tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]
        m = tones[arp[step % 8]]
        bright = 0.35 if intro else 1.0 if groove else 0.6
        put(tonal, pluck(m, BEAT * 0.9, bright), t, 0.3 if intro else 0.3, 0.25 * np.sin(step * 0.9))
        t += BEAT / 4
        step += 1

    # --- transitions
    put(fxb, riser(drop - max(0, drop - BAR)), max(0, drop - BAR), 0.10)
    put(fxb, riser(brand - build), build, 0.13)
    for tt in (drop, brand):
        put(fxb, crash(), tt, 0.13, 0.1)
    put(fxb, impact(), logo, 0.55)
    put(fxb, crash(2.6), logo, 0.1, -0.1)
    # --- final stab: everything hits the tonic and rings out
    root, ch = PROG[0]
    put(drums, kick(), final, 0.9)
    put(fxb, crash(end - final + 0.5), final, 0.12)
    put(tonal, pad([50] + [62, 66, 69, 74], end - final, 3200) * np.exp(-np.arange(int((end - final) * SR)) / SR * 1.2), final, 0.3)
    put(tonal, bass(38, end - final), final, 0.35)
    for k, m in enumerate([74, 78, 81, 86]):
        put(tonal, pluck(m, end - final, 1.0), final + k * 0.012, 0.1, (k - 1.5) * 0.3)

    # --- sidechain pump on the tonal bus from every kick
    sc = np.ones(n)
    for kt in kicks:
        i = int(kt * SR)
        L = int(0.28 * SR)
        seg = 1 - 0.55 * np.exp(-np.arange(L) / (0.07 * SR))
        sc[i:i + L] = np.minimum(sc[i:i + L], seg[: max(0, min(L, n - i))])
    tonal *= sc
    # phones can't reproduce deep sub: keep the low end tight and audible
    tight = butter(2, 38, 'high', fs=SR, output='sos')
    drums, tonal, fxb = (np.stack([sosfilt(tight, b[0]), sosfilt(tight, b[1])]) for b in (drums, tonal, fxb))
    return drums, tonal, fxb
