// Loudness-normalise the soundtrack (-16 LUFS integrated, -1.5 dBTP) and mux
// it with a rendered video:  node tools/mux.mjs video.mp4 audio.wav out.mp4
import { spawnSync } from 'node:child_process';
import { ffmpegPath } from './ffmpeg.mjs';

const [video, audio, out] = process.argv.slice(2);
const ff = ffmpegPath();
const m = spawnSync(ff, ['-hide_banner', '-i', audio, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const I = +m.match(/I:\s+(-?[\d.]+) LUFS/g).pop().match(/-?[\d.]+/)[0];
const gain = (-16 - I).toFixed(2);
const r = spawnSync(ff, ['-y', '-loglevel', 'error', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
  '-af', `volume=${gain}dB,alimiter=limit=0.74:attack=2:release=50:level=disabled`,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);
console.log(`muxed ${out} (music measured ${I} LUFS, gain ${gain} dB)`);
