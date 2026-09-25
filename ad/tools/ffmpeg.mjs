// Locate an ffmpeg with libx264 + AAC: $FFMPEG, then the imageio-ffmpeg
// static build (pip install imageio-ffmpeg), then ffmpeg on PATH.
import { execSync } from 'node:child_process';
import fs from 'node:fs';

export function ffmpegPath() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  try {
    const p = execSync('python3 -c "import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())"', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return 'ffmpeg';
}
