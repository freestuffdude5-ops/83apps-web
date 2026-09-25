// Deterministic frame renderer: drives the page in headless Chromium, captures
// each frame (WebGL canvas + typography layer) and encodes H.264 with ffmpeg.
//
//   node tools/render.mjs --format vertical --cut 30 --out out/83apps-30s-vertical.mp4
//   node tools/render.mjs --format landscape --stills 0,4.5,12 --scale 0.5   (review stills)
//
// Options: --format vertical|landscape  --cut 30|15  --workers N  --scale S
//          --from s --to s  --stills a,b,c  --out file  --crf 16
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';
import { ffmpegPath } from './ffmpeg.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']] : a), []));
const format = args.format || 'vertical';
const cut = +(args.cut || 30);
const scale = +(args.scale || 1);
const workers = +(args.workers || 1);
const FPS = 30;

const browserArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--force-color-profile=srgb', '--hide-scrollbars'];

async function openPage(browser, port) {
  const [W, H] = format === 'vertical' ? [1080, 1920] : [1920, 1080];
  const page = await browser.newPage({ viewport: { width: Math.round(W * scale), height: Math.round(H * scale) }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[page]', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/index.html?format=${format}&cut=${cut}&scale=${scale}`);
  await page.waitForFunction('window.AD && window.AD.ready', null, { timeout: 180000 });
  await page.evaluate(() => window.AD.ready);
  return page;
}

async function frame(page, t) {
  await page.evaluate((t) => window.AD.renderAt(t), t);
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
}

const { server, port } = await serve();
const browser = await chromium.launch({ args: browserArgs });
try {
  if (args.stills) {
    const page = await openPage(browser, port);
    const dir = args.dir || path.join(root, 'out', 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const s of args.stills.split(',')) {
      const t = +s;
      await frame(page, Math.max(0, t - 1 / FPS)); // warm caches with the previous frame
      const buf = await frame(page, t);
      const f = path.join(dir, `${format}-${cut}-${t.toFixed(2).padStart(5, '0')}.png`);
      fs.writeFileSync(f, buf);
      console.log(f);
    }
  } else {
    const dur = cut;
    const from = +(args.from || 0), to = +(args.to || dur);
    const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
    const out = path.resolve(args.out || path.join(root, 'out', `83apps-${cut}s-${format}.mp4`));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const per = Math.ceil((f1 - f0) / workers);
    const segs = [];
    const started = Date.now();
    let done = 0;
    await Promise.all(Array.from({ length: workers }, async (_, w) => {
      const a = f0 + w * per, b = Math.min(f1, a + per);
      if (a >= b) return;
      const seg = workers > 1 ? `${out}.part${w}.mp4` : out;
      segs[w] = seg;
      const ff = spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', String(args.crf || 16), '-profile:v', 'high', '-tune', 'film',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-r', String(FPS), '-movflags', '+faststart', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
      const page = await openPage(browser, port);
      for (let f = a; f < b; f++) {
        const buf = await frame(page, f / FPS);
        if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
        done++;
        if (done % 30 === 0) {
          const el = (Date.now() - started) / 1000;
          console.log(`${format} ${cut}s: ${done}/${f1 - f0} frames  ${(el / done).toFixed(2)} s/frame  eta ${(((f1 - f0 - done) * el) / done / 60).toFixed(1)} min`);
        }
      }
      ff.stdin.end();
      await new Promise((r, j) => ff.on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg exit ' + c)))));
      await page.close();
    }));
    if (workers > 1) {
      const list = `${out}.txt`;
      fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
      await new Promise((r, j) => spawn(ffmpegPath(), ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error('concat failed')))));
      segs.filter(Boolean).forEach((s) => fs.unlinkSync(s));
      fs.unlinkSync(list);
    }
    console.log('wrote', out, `in ${((Date.now() - started) / 60000).toFixed(1)} min`);
  }
} finally {
  await browser.close();
  server.close();
}
