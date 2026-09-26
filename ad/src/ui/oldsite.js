// The "before" website for the fictional Palmetto Plumbing Co.: a dated,
// cluttered early-2000s page. Drawn in blocks so the rebuild can lift each
// piece off the screen. All content is fictional.
import { rr } from './draw.js';

export const OLD = { W: 1600, H: 1000 };

// Rects in canvas px. Together they cover every piece of content on the page.
export const OLD_BLOCKS = {
  header: [0, 0, 1600, 196],
  nav: [16, 212, 250, 612],
  photo: [290, 212, 430, 330],
  text: [742, 212, 842, 470],
  coupon: [290, 562, 430, 262],
  footer: [16, 840, 1568, 144],
};

const serif = (w, s, it = false) => `${it ? 'italic ' : ''}${w} ${s}px "Tinos", "Times New Roman", serif`;
const comic = (w, s) => `${w} ${s}px "Comic Neue", "Comic Sans MS", cursive`;

let tile = null;
function bgPattern(ctx) {
  if (!tile) {
    tile = document.createElement('canvas');
    tile.width = tile.height = 24;
    const t = tile.getContext('2d');
    t.fillStyle = '#cfcfc8'; t.fillRect(0, 0, 24, 24);
    t.fillStyle = '#c3c3bb';
    for (let i = 0; i < 24; i += 6) { t.fillRect(i, 0, 2, 24); t.fillRect(0, i, 24, 1); }
  }
  return ctx.createPattern(tile, 'repeat');
}

let pix = null;
/** Pixelated, over-compressed "photo of our van": a tiny mosaic scaled up. */
function pixelPhoto() {
  if (pix) return pix;
  const w = 26, h = 20;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#8fb7d8'); sky.addColorStop(0.55, '#c7d9e4'); sky.addColorStop(0.56, '#6c7a64'); sky.addColorStop(1, '#4d5a47');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  x.fillStyle = '#f1f1ea'; x.fillRect(4, 7, 15, 7);           // van body
  x.fillStyle = '#d9dce0'; x.fillRect(16, 8, 5, 6);
  x.fillStyle = '#5b86c6'; x.fillRect(17, 9, 3, 2);          // window
  x.fillStyle = '#c7312c'; x.fillRect(5, 10, 10, 1);          // stripe
  x.fillStyle = '#222'; x.fillRect(6, 14, 3, 2); x.fillRect(15, 14, 3, 2);
  x.fillStyle = '#e8c35a'; x.fillRect(2, 2, 3, 2);            // sun
  pix = c;
  return c;
}

function wrench(ctx, x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  ctx.fillStyle = '#b9bcc2'; ctx.strokeStyle = '#3d3d3d'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-6, -40); ctx.lineTo(6, -40); ctx.lineTo(6, 22); ctx.arc(0, 36, 16, -Math.PI / 2 + 0.4, Math.PI * 1.5 - 0.4); ctx.lineTo(-6, 22); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6a4bd0'; ctx.beginPath(); ctx.arc(0, 36, 7, 0, 7); ctx.fill();
  ctx.restore();
}

/** Page background (what shows once the blocks lift away). */
export function drawOldBackground(ctx, W, H) {
  ctx.fillStyle = bgPattern(ctx); ctx.fillRect(0, 0, W, H);
}

/**
 * Full old page. st: { marquee (px offset), blink (bool), load (0..1 image
 * reveal), counter }.
 */
export function drawOldPage(ctx, W, H, st = {}) {
  drawOldBackground(ctx, W, H);
  const [hx, hy, hw, hh] = OLD_BLOCKS.header;
  // glossy dated header
  const g = ctx.createLinearGradient(0, hy, 0, hy + hh);
  g.addColorStop(0, '#2a49c9'); g.addColorStop(0.5, '#10299a'); g.addColorStop(0.51, '#0b1f7c'); g.addColorStop(1, '#3a5ee0');
  ctx.fillStyle = g; ctx.fillRect(hx, hy, hw, hh);
  ctx.fillStyle = '#ffd400'; ctx.fillRect(hx, hy + hh - 6, hw, 6);
  wrench(ctx, 92, 70, 1.25, -0.5);
  wrench(ctx, 1508, 70, 1.25, 0.5);
  ctx.font = serif(700, 70, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#b00000'; ctx.fillText('Welcome to Palmetto Plumbing!!!', 804, 104);
  ctx.fillStyle = '#ffe600'; ctx.fillText('Welcome to Palmetto Plumbing!!!', 800, 100);
  // marquee strip
  ctx.fillStyle = '#000'; ctx.fillRect(hx, hy + 128, hw, 50);
  ctx.save(); ctx.beginPath(); ctx.rect(hx, hy + 128, hw, 50); ctx.clip();
  ctx.font = serif(700, 30); ctx.fillStyle = '#ff2b2b'; ctx.textAlign = 'left';
  const msg = '*** CALL NOW FOR A FREE ESTIMATE!!! ***   10% OFF FOR SENIORS   *** WE ACCEPT CHECKS ***   ';
  const mw = ctx.measureText(msg).width;
  const off = ((st.marquee || 0) % mw + mw) % mw;
  for (let x = -off; x < hw; x += mw) ctx.fillText(msg, x, hy + 164);
  ctx.restore();

  // left nav: bevelled buttons, blue underlined links
  const [nx, ny, nw, nh] = OLD_BLOCKS.nav;
  ctx.fillStyle = '#e6e6e0'; ctx.fillRect(nx, ny, nw, nh);
  ctx.strokeStyle = '#8a8a86'; ctx.lineWidth = 2; ctx.strokeRect(nx + 1, ny + 1, nw - 2, nh - 2);
  ['Home', 'About Us', 'Services', 'Coupons!!', 'Links', 'Guestbook', 'Contact'].forEach((l, i) => {
    const by = ny + 22 + i * 70;
    ctx.fillStyle = '#d4d0c8'; ctx.fillRect(nx + 18, by, nw - 36, 52);
    ctx.fillStyle = '#fff'; ctx.fillRect(nx + 18, by, nw - 36, 3); ctx.fillRect(nx + 18, by, 3, 52);
    ctx.fillStyle = '#808080'; ctx.fillRect(nx + 18, by + 49, nw - 36, 3); ctx.fillRect(nx + nw - 21, by, 3, 52);
    ctx.font = serif(400, 25); ctx.fillStyle = i === 3 ? '#cc0000' : '#0000ee'; ctx.textAlign = 'center';
    ctx.fillText(l, nx + nw / 2, by + 35);
    const tw = ctx.measureText(l).width;
    ctx.fillRect(nx + nw / 2 - tw / 2, by + 39, tw, 2);
  });
  ctx.font = comic(700, 20); ctx.fillStyle = '#008000'; ctx.textAlign = 'center';
  ctx.fillText('NEW!! Now hiring', nx + nw / 2, ny + nh - 50);
  if (st.blink !== false) { ctx.fillStyle = '#ff00ff'; ctx.fillText('★ Click here ★', nx + nw / 2, ny + nh - 22); }

  // photo (low-res, loads top-down)
  const [px, py, pw, ph] = OLD_BLOCKS.photo;
  ctx.fillStyle = '#fff'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(px + 12, py + 12, pw - 24, ph - 72);
  ctx.save(); ctx.beginPath(); ctx.rect(px + 14, py + 14, pw - 28, (ph - 76) * (st.load ?? 1)); ctx.clip();
  ctx.imageSmoothingEnabled = false; ctx.drawImage(pixelPhoto(), px + 14, py + 14, pw - 28, ph - 76); ctx.imageSmoothingEnabled = true;
  ctx.restore();
  ctx.font = serif(400, 22, true); ctx.fillStyle = '#333'; ctx.textAlign = 'center';
  ctx.fillText('Our Van (2003)', px + pw / 2, py + ph - 24);

  // wall of low-contrast text
  const [tx, ty, tw_, th] = OLD_BLOCKS.text;
  ctx.fillStyle = '#f4f2e8'; ctx.fillRect(tx, ty, tw_, th);
  ctx.font = serif(700, 30); ctx.fillStyle = '#7a0000'; ctx.textAlign = 'left';
  ctx.fillText('About Our Company', tx + 20, ty + 44);
  ctx.font = serif(400, 17); ctx.fillStyle = '#8c8c86';
  const para = 'Palmetto Plumbing has been proudly serving the community for over twenty years. We do all kinds of plumbing work including but not limited to leaks, clogs, water heaters, toilets, faucets, sinks, garbage disposals, sewer lines, re-piping, remodels, gas lines, backflow testing, well pumps and much much more. Our trucks are fully stocked. Please call during business hours. Estimates are free for most jobs. We are family owned and operated. Satisfaction is our #1 priority. Ask about our coupons!! ';
  const words = (para + para + para).split(' ');
  let line = '', y = ty + 80;
  for (const w of words) {
    const test = line + w + ' ';
    if (ctx.measureText(test).width > tw_ - 40) { ctx.fillText(line, tx + 20, y); line = w + ' '; y += 23; if (y > ty + th - 70) break; } else line = test;
  }
  // under construction
  ctx.save(); ctx.translate(tx + 20, ty + th - 52);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#111' : '#ffcc00'; ctx.beginPath(); ctx.moveTo(i * 14, 0); ctx.lineTo(i * 14 + 14, 0); ctx.lineTo(i * 14, 34); ctx.lineTo(i * 14 - 14, 34); ctx.fill(); }
  ctx.font = comic(700, 22); ctx.fillStyle = '#111'; ctx.fillText('This page is UNDER CONSTRUCTION', 128, 25);
  ctx.restore();

  // coupon
  const [cx, cy, cw, ch] = OLD_BLOCKS.coupon;
  ctx.fillStyle = '#fff59a'; ctx.fillRect(cx, cy, cw, ch);
  ctx.setLineDash([12, 8]); ctx.strokeStyle = '#d10000'; ctx.lineWidth = 4; ctx.strokeRect(cx + 10, cy + 10, cw - 20, ch - 20); ctx.setLineDash([]);
  ctx.font = comic(700, 58); ctx.fillStyle = '#d10000'; ctx.textAlign = 'center';
  ctx.fillText('$10 OFF!!!', cx + cw / 2, cy + 92);
  ctx.font = serif(400, 22); ctx.fillStyle = '#222';
  ctx.fillText('Print this coupon and bring it', cx + cw / 2, cy + 142);
  ctx.fillText('to our office. Not valid w/ other', cx + cw / 2, cy + 170);
  ctx.fillText('offers. Some restrictions apply.', cx + cw / 2, cy + 198);
  ctx.font = serif(400, 30); ctx.fillText('✂ - - - - - - - - - - -', cx + cw / 2, cy + 240);

  // footer: the phone number, buried
  const [fx, fy, fw, fh] = OLD_BLOCKS.footer;
  ctx.fillStyle = '#e6e6e0'; ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = '#8a8a86'; ctx.fillRect(fx, fy, fw, 2);
  ctx.font = serif(400, 16); ctx.fillStyle = '#9a9a94'; ctx.textAlign = 'center';
  ctx.fillText('© 1998-2011 Palmetto Plumbing Co.  |  Call us: 386-555-0198 (M-F 9-4)  |  Email us!  |  Site Map  |  Links  |  Privacy', 800, fy + 42);
  ctx.fillText('Best viewed in Internet Explorer 6 at 800x600 resolution', 800, fy + 70);
  // hit counter
  const n = String(st.counter ?? 4821).padStart(6, '0');
  ctx.font = '700 22px "Geist Mono", monospace';
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = '#000'; ctx.fillRect(800 - 90 + i * 30, fy + 88, 26, 34);
    ctx.fillStyle = '#39ff14'; ctx.fillText(n[i], 800 - 77 + i * 30, fy + 113);
  }
  ctx.font = serif(400, 14); ctx.fillStyle = '#9a9a94'; ctx.fillText('visitors', 800 + 112, fy + 112);
}
