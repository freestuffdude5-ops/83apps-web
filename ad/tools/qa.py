# Motion QA: flags frames whose frame-to-frame change is far above the film's
# median (camera whips, pops, flashes).  python3 tools/qa.py video.mp4
import subprocess, sys, numpy as np, imageio_ffmpeg
F = imageio_ffmpeg.get_ffmpeg_exe()
for path in sys.argv[1:]:
    p = subprocess.run([F, '-loglevel', 'error', '-i', path, '-vf', 'scale=128:128', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True)
    d = np.frombuffer(p.stdout, np.uint8).reshape(-1, 128, 128).astype(float)
    diff = np.abs(np.diff(d, axis=0)).mean(axis=(1, 2))
    med = np.median(diff)
    flag = [(i + 1) / 30 for i in np.where(diff > max(6 * med, 8))[0]]
    runs = []
    for t in flag:
        if runs and t - runs[-1][1] < 0.1: runs[-1][1] = t
        else: runs.append([t, t])
    print(f'{path}: {len(d)} frames, median change {med:.2f}, max {diff.max():.2f} at {(diff.argmax()+1)/30:.2f}s')
    for a, b in runs: print(f'   fast motion {a:.2f}-{b:.2f}s  peak {diff[int(a*30)-1:int(b*30)].max():.1f}')
