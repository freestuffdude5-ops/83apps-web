"""Original soundtrack + sound design, synthesised from scratch (no samples,
no third-party music), synced to the cue sheet from tools/cues.mjs.

    node tools/cues.mjs 30 > out/cues-30.json
    python3 tools/audio.py out/cues-30.json out/audio-30.wav
    python3 tools/audio.py out/cues-30.json out/audio-30.wav --track licensed.mp3 --start 8
"""
import json, os, sys, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import music as music_mod
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

    # --- music: upbeat original track arranged to the edit (tools/music.py),
    # or a licensed track supplied with --track (sound effects stay on top)
    if cfg.get("track"):
        import subprocess, imageio_ffmpeg
        raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", cfg["track"], "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
        tr = np.frombuffer(raw, np.float32).reshape(-1, 2).T.astype(float)[:, int(cfg.get("track_start", 0) * SR):]
        drums = np.zeros((2, n)); drums[:, : min(n, tr.shape[1])] = tr[:, :n] * 1.6
        tonal = np.zeros((2, n)); mfx = np.zeros((2, n))
    else:
        drums, tonal, mfx = music_mod.score(sec, n)
    # --- fx
    for c in cfg["cues"]:
        tt, ty, v = c["t"], c["type"], c.get("v", 1)
        if ty == "whoosh":
            add(fx, whoosh(1.2, 0.11 * v), tt - 0.55, pan=-0.2)
            add(fx, whoosh(1.2, 0.08 * v), tt - 0.5, pan=0.25)
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
        elif ty == "logo":
            for j, m in enumerate([74, 81, 86, 90]):
                add(fx, bell(midi(m), 2.6, 0.05), tt + j * 0.03, pan=(j - 1.5) * 0.25)

    # reverb sends: short and subtle on drums, lusher on the tonal parts and fx
    ir = reverb_ir(1.6)
    rv = lambda x: np.stack([convolve(x[0], ir[0]), convolve(x[1], ir[1])])
    wet_f = rv(fx)
    music_bus = drums + rv(drums) * 0.12 + tonal + rv(tonal) * 0.35 + mfx + rv(mfx) * 0.4
    music_bus *= 0.55
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
    if "--track" in sys.argv:  # e.g. --track licensed.mp3 [--start 12.5]
        cfg["track"] = sys.argv[sys.argv.index("--track") + 1]
        if "--start" in sys.argv:
            cfg["track_start"] = float(sys.argv[sys.argv.index("--start") + 1])
    write_wav(sys.argv[2], build(cfg))
    print("wrote", sys.argv[2])
