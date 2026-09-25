"""Original soundtrack + sound design, synthesised from scratch (no samples,
no third-party music), synced to the cue sheet from tools/cues.mjs.

    node tools/cues.mjs 30 > out/cues-30.json
    python3 tools/audio.py out/cues-30.json out/audio-30.wav
"""
import json, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
rng = np.random.default_rng(83)


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na) ** 2
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e


def lowpass(x, fc):
    """one-pole low-pass; fc may be an array (time-varying cutoff)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def pad_voice(f, dur, amp):
    """warm additive saw-ish tone, three detuned voices, soft top end"""
    t = np.arange(int(dur * SR)) / SR
    out = np.zeros_like(t)
    for det in (-0.07, 0.0, 0.07):
        ff = f * 2 ** (det / 12)
        ph = rng.uniform(0, 2 * np.pi)
        for h in range(1, 9):
            out += np.sin(2 * np.pi * ff * h * t + ph * h) / (h ** 1.35)
    return out * amp / 3


def bell(f, dur=1.6, amp=1.0):
    t = np.arange(int(dur * SR)) / SR
    parts = [(1, 1.0, 1.5), (2.76, 0.42, 3.2), (5.4, 0.2, 6.0), (8.93, 0.08, 9.0)]
    y = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in parts)
    y *= np.minimum(1, t / 0.004)
    return y * amp


def tick(freq=2600, dur=0.05, amp=1.0):
    t = np.arange(int(dur * SR)) / SR
    y = np.sin(2 * np.pi * freq * t) * np.exp(-t * 90) + 0.3 * rng.standard_normal(len(t)) * np.exp(-t * 400)
    return y * amp


def whoosh(dur=1.1, amp=1.0, peak=0.55):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    shape = np.where(t < peak * dur, (t / (peak * dur)) ** 2.2, np.exp(-(t - peak * dur) * 6))
    fc = 300 + 5200 * shape
    y = lowpass(x, fc) - lowpass(x, fc * 0.25)
    return y * shape * amp * 0.9


def sub_hit(dur=0.9, amp=1.0, f0=62):
    t = np.arange(int(dur * SR)) / SR
    f = f0 * (1 + 1.2 * np.exp(-t * 28))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 5.5) * np.minimum(1, t / 0.003) * amp


def reverb_ir(sec=2.6):
    n = int(sec * SR)
    t = np.arange(n) / SR
    irs = []
    for _ in range(2):
        x = rng.standard_normal(n) * np.exp(-t * 3.1)
        x = lowpass(x, 5500)
        x[: int(0.012 * SR)] = 0
        irs.append(x / np.sqrt(np.sum(x ** 2)))
    return irs


def convolve(x, h):
    n = len(x) + len(h) - 1
    N = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(h, N), N)[: len(x)]


def add(buf, sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= buf.shape[1] or i + len(sig) <= 0:
        return
    s = sig[: buf.shape[1] - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i : i + len(s)] += s * gain * l * 1.41
    buf[1, i : i + len(s)] += s * gain * r * 1.41


def build(cfg, stems=False):
    sec = cfg["sections"]
    D = sec["duration"]
    n = int((D + 0.5) * SR)
    music = np.zeros((2, n))
    fx = np.zeros((2, n))

    # --- harmony: D major colour, calm and open (Dmaj9 → Bm11 → Gmaj9 → A6sus → Dmaj9)
    prog = [[50, 57, 61, 64, 66], [47, 54, 57, 62, 64], [43, 50, 54, 57, 62], [45, 52, 57, 59, 62], [50, 57, 62, 64, 69]]
    end_in = sec["endIn"]
    bounds = np.linspace(0, end_in, len(prog))  # last chord lands on the end card
    for k, chord in enumerate(prog):
        start = bounds[k] - (0.6 if k else 0)
        stop = bounds[k + 1] + 0.9 if k + 1 < len(prog) else D + 0.4
        dur = stop - start
        for j, m in enumerate(chord):
            v = pad_voice(midi(m), dur, 0.05 if j == 0 else 0.035)
            v *= env_adsr(len(v), 0.9 if k else 1.6, 1.2)
            add(music, v, max(0, start), pan=(j - 2) * 0.22)
    # gentle movement: slow filtered arpeggio over the product scenes
    arp_notes = [74, 76, 78, 81, 78, 76]
    beat = 60 / 96
    t = sec["pulseIn"]
    i = 0
    while t < sec["pulseOut"]:
        k = min(len(prog) - 1, int(np.searchsorted(bounds, t) - 1))
        base = prog[max(0, k)]
        note = base[2 + (i % 3)] + 12 if i % 2 == 0 else arp_notes[i % len(arp_notes)]
        add(music, bell(midi(note), 1.2, 0.035), t, pan=0.35 * np.sin(i * 1.3))
        t += beat / 2
        i += 1
    # soft heartbeat pulse under the product scenes
    t = sec["pulseIn"]
    while t < sec["pulseOut"]:
        add(music, sub_hit(0.7, 0.16), t)
        t += beat * 2
    # music sidechain-ish breath: dip slightly on each pulse
    # --- fx
    for c in cfg["cues"]:
        tt, ty, v = c["t"], c["type"], c.get("v", 1)
        if ty == "whoosh":
            add(fx, whoosh(1.2, 0.18 * v), tt - 0.55, pan=-0.2)
            add(fx, whoosh(1.2, 0.14 * v), tt - 0.5, pan=0.25)
        elif ty == "type":
            add(fx, tick(3200 + rng.uniform(-300, 300), 0.03, 0.05 * v), tt, pan=0.1)
        elif ty == "tap":
            add(fx, tick(1800, 0.06, 0.12 * v), tt)
        elif ty == "chime":
            for j, m in enumerate([81, 86]):
                add(fx, bell(midi(m), 1.8, 0.12 * v), tt + j * 0.09)
        elif ty == "dock":
            add(fx, sub_hit(0.5, 0.25 * v, 90), tt)
            add(fx, tick(1400, 0.08, 0.1), tt)
        elif ty == "tick":
            add(fx, bell(midi(93), 0.5, 0.045 * v), tt, pan=0.2)
        elif ty == "pulse":
            sw = whoosh(0.65, 0.06, 0.8)
            add(fx, sw, tt, pan=-0.3)
        elif ty == "step":
            m = [79, 83, 86][c.get("i", 0) % 3]
            add(fx, bell(midi(m), 1.6, 0.1 * v), tt, pan=[-0.25, 0.0, 0.25][c.get("i", 0) % 3])
        elif ty == "swell":
            nn = int(2.6 * SR)
            tt2 = np.arange(nn) / SR
            sh = sum(np.sin(2 * np.pi * midi(m) * tt2 + rng.uniform(0, 6)) for m in (86, 90, 93, 98))
            sh *= (np.sin(np.pi * np.minimum(1, tt2 / 2.6)) ** 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 5.5 * tt2))
            add(fx, sh * 0.02, tt)
            add(fx, whoosh(2.0, 0.1, 0.7), tt, pan=0.1)
        elif ty == "logo":
            add(fx, sub_hit(1.8, 0.4, 48), tt)
            for j, m in enumerate([62, 69, 74, 78]):
                add(fx, bell(midi(m), 3.2, 0.07), tt + j * 0.03, pan=(j - 1.5) * 0.25)

    # soften the pad/arp bus: gentle 2nd-order low-pass so nothing sounds buzzy
    sos = butter(2, 2400, 'low', fs=SR, output='sos')
    music = np.stack([sosfilt(sos, music[0]), sosfilt(sos, music[1])])
    # reverb: music wetter than fx
    ir = reverb_ir()
    wet_m = np.stack([convolve(music[0], ir[0]), convolve(music[1], ir[1])])
    wet_f = np.stack([convolve(fx[0], ir[0]), convolve(fx[1], ir[1])])
    music_bus = music * 0.7 + wet_m * 0.9
    fx_bus = fx * 0.85 + wet_f * 0.45
    fade_in = np.minimum(1, np.arange(n) / (0.25 * SR))
    tail = np.clip((D - np.arange(n) / SR) / 1.4, 0, 1) ** 1.5
    lowcut = butter(2, 28, 'high', fs=SR, output='sos')  # rumble
    buses = []
    for bus in (music_bus, fx_bus):
        bus = np.stack([sosfilt(lowcut, bus[0]), sosfilt(lowcut, bus[1])]) * fade_in * tail
        buses.append(bus[:, : int(D * SR)])
    if stems:
        return buses  # [music, fx], unnormalised, same scale
    mix = buses[0] + buses[1]
    mix /= max(1e-9, np.max(np.abs(mix))) / 0.8
    return mix


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    pcm = (x.T * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    cfg = json.load(open(sys.argv[1]))
    write_wav(sys.argv[2], build(cfg))
    print("wrote", sys.argv[2])
