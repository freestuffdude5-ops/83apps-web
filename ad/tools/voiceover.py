"""Voiceover with ElevenLabs, timed to the film, mixed over the soundtrack.

    export ELEVENLABS_API_KEY=...        # never commit the key
    python3 tools/voiceover.py 30        # → out/vo/audio-30-vo.wav
    node tools/mux.mjs renders/83apps-30s-vertical-silent.mp4 out/vo/audio-30-vo.wav out.mp4

Each line is generated separately (with neighbouring lines passed as context
so the read stays consistent), trimmed, levelled and placed at its cue. The
music and effects duck under the voice.
"""
import json, os, subprocess, sys, urllib.request
import numpy as np
from scipy.signal import butter, sosfilt
import imageio_ffmpeg
sys.path.insert(0, os.path.dirname(__file__))
import audio

SR = audio.SR
FF = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = os.environ.get('VO_VOICE', 'nPczCjzI2devNBz1zQrb')  # Brian: deep, resonant, comforting (American)
MODEL = 'eleven_multilingual_v2'
SETTINGS = {'stability': 0.55, 'similarity_boost': 0.8, 'style': 0.12, 'use_speaker_boost': True, 'speed': 1.0}

# (start seconds, text as spoken, latest end seconds). Numbers are spelled out
# so the brand and URL are pronounced "eighty-three app studio".
SCRIPT = {
    30: [
        (0.55, 'Inquiries. Spreadsheets. Follow-ups... it all adds up.', 3.7),
        (4.95, 'Eighty-three App Studio builds websites that turn visitors into real inquiries.', 9.3),
        (10.8, 'Every customer lands in one organized place, with a clear next step.', 16.0),
        (17.4, 'And the repeat work, like confirmations and reminders, happens automatically.', 22.3),
        (23.6, 'Smarter systems. Better ways to work.', 26.0),
        (26.1, 'Book a free consultation at eighty-three app studio dot com.', 29.7),
    ],
    15: [
        (0.3, 'Too much busywork?', 2.3),
        (2.8, 'Eighty-three App Studio builds websites, business tools, and automations that handle it for you.', 10.1),
        (11.2, 'Book a free consultation at eighty-three app studio dot com.', 14.85),
    ],
}


def tts(text, prev, nxt, path, speed):
    body = {'text': text, 'model_id': MODEL, 'voice_settings': {**SETTINGS, 'speed': speed}}
    if prev: body['previous_text'] = prev
    if nxt: body['next_text'] = nxt
    req = urllib.request.Request(
        f'https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128',
        data=json.dumps(body).encode(), headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        open(path, 'wb').write(r.read())


def load(path):
    """decode to 48k mono float, trim leading/trailing silence"""
    raw = subprocess.run([FF, '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).astype(float)
    env = np.convolve(np.abs(x), np.ones(480) / 480, 'same')
    on = np.where(env > 0.01 * env.max())[0]
    a, b = max(0, on[0] - int(0.02 * SR)), min(len(x), on[-1] + int(0.08 * SR))
    return x[a:b]


def main(cut):
    os.makedirs('out/vo', exist_ok=True)
    lines = SCRIPT[cut]
    voice = []
    for i, (t0, text, t1) in enumerate(lines):
        path = f'out/vo/{cut}-{i}.mp3'
        slot = t1 - t0
        speed = 1.0
        for _ in range(3):  # regenerate slightly faster if a read overruns its slot
            if not os.path.exists(path):
                tts(text, lines[i - 1][1] if i else None, lines[i + 1][1] if i + 1 < len(lines) else None, path, speed)
            x = load(path)
            if len(x) / SR <= slot or speed >= 1.08:
                break
            speed = round(min(1.08, speed * (len(x) / SR) / slot + 0.01), 2)
            os.remove(path)
        dur = len(x) / SR
        print(f'line {i}: {dur:.2f}s in a {slot:.2f}s slot (speed {speed})  "{text}"')
        voice.append((t0, x))

    cfg = json.load(open(f'out/cues-{cut}.json'))
    music, fx = audio.build(cfg, stems=True)
    n = music.shape[1]
    # voice bus: high-pass, level each line to the same RMS, gentle compression
    hp = butter(2, 90, 'high', fs=SR, output='sos')
    vo = np.zeros(n)
    active = np.zeros(n)
    for t0, x in voice:
        x = sosfilt(hp, x)
        x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 0.1
        x = np.tanh(x * 2.2) / 2.2  # soft-knee peak control
        i = int(t0 * SR)
        m = min(len(x), n - i)
        vo[i:i + m] += x[:m]
        active[max(0, i - int(0.18 * SR)):min(n, i + m + int(0.3 * SR))] = 1
    # smooth ducking envelope (≈ -10 dB music, -5 dB effects under the voice)
    k = int(0.15 * SR)
    duck = np.convolve(active, np.ones(k) / k, 'same')
    ref = np.max(np.abs(music + fx)) / 0.8
    mix = (music * (1 - 0.68 * duck) + fx * (1 - 0.44 * duck)) / ref * 0.55
    mix += vo[None, :] * 1.0
    mix /= max(1e-9, np.max(np.abs(mix))) / 0.9
    out = f'out/vo/audio-{cut}-vo.wav'
    audio.write_wav(out, mix)
    print('wrote', out)


if __name__ == '__main__':
    main(int(sys.argv[1]))
