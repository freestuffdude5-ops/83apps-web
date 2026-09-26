// The redesigned Palmetto Plumbing Co. site (fictional): desktop layout drawn
// in blocks that match the rebuild choreography, and a responsive phone
// layout with a one-tap booking sheet.
import { rr, text, measure, icon, check } from './draw.js';

export const NEW = { W: 1600, H: 1000 };
const P = {
  bg: '#F6F8F7', ink: '#0B1B1A', sub: '#4A5B58', faint: '#8A9A97', line: '#E1E8E6',
  brand: '#0B6B5E', brand2: '#12907E', mint: '#E6F3EF', warm: '#F2B544',
};

export const NEW_BLOCKS = {
  nav: [0, 0, 1600, 104],
  hero: [56, 150, 780, 420],
  image: [872, 140, 672, 440],
  services: [56, 612, 1488, 196],
  band: [56, 836, 1488, 104],
  footer: [0, 956, 1600, 44],
};

let waterTeal = null;
function heroImage() {
  if (waterTeal) return waterTeal;
  const w = 560, h = 368;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    let k = 0;
    for (let l = 0; l < 3; l++) {
      const f = 8 + l * 5;
      const a = Math.sin(u * f * 1.6 + Math.sin(v * f * 1.2 + l * 2.3) * 1.9 + l);
      const b = Math.sin(v * f * 2.0 + Math.sin(u * f * 0.8 - l * 1.1) * 1.5 - l * 0.6);
      k += Math.pow(1 - Math.abs(a * b), 11) * (0.75 - l * 0.16);
    }
    const d = 0.45 + 0.55 * v;
    const i = (y * w + x) * 4;
    img.data[i] = Math.min(255, 10 + 30 * (1 - d) + 190 * k);
    img.data[i + 1] = Math.min(255, 105 + 70 * (1 - d) + 130 * k);
    img.data[i + 2] = Math.min(255, 118 + 60 * (1 - d) + 110 * k);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  waterTeal = c;
  return c;
}

function logo(ctx, x, y, s) {
  rr(ctx, x, y, s, s, s * 0.28);
  const g = ctx.createLinearGradient(x, y, x + s, y + s); g.addColorStop(0, P.brand2); g.addColorStop(1, P.brand);
  ctx.fillStyle = g; ctx.fill();
  icon(ctx, 'drop', x + s * 0.2, y + s * 0.18, s * 0.6, '#fff', s * 0.075);
}

function button(ctx, x, y, w, h, label, { fill = P.brand, color = '#fff', stroke, ic, size = 20, press = 0 } = {}) {
  const sh = Math.sin(Math.min(1, press) * Math.PI) * 4;
  rr(ctx, x + sh, y + sh / 2, w - sh * 2, h - sh, h / 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
  const tw = measure(ctx, label, size, 600) + (ic ? size * 1.3 : 0);
  let tx = x + w / 2 - tw / 2;
  if (ic) { icon(ctx, ic, tx, y + h / 2 - size * 0.55, size * 1.1, color, 2.2 * size / 20); tx += size * 1.3; }
  text(ctx, label, tx, y + h / 2 + size * 0.36, { size, weight: 600, color });
  if (press > 0 && press < 1) {
    ctx.save(); rr(ctx, x, y, w, h, h / 2); ctx.clip();
    ctx.beginPath(); ctx.arc(x + w * 0.5, y + h / 2, w * press, 0, 7); ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - press)})`; ctx.fill();
    ctx.restore();
  }
}

export function drawNewBackground(ctx, W, H) {
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
}

/** Full new desktop page. st: { glint 0..1 } */
export function drawNewPage(ctx, W, H, st = {}) {
  drawNewBackground(ctx, W, H);
  // nav
  let [x, y, w, h] = NEW_BLOCKS.nav;
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = P.line; ctx.fillRect(x, y + h - 2, w, 2);
  logo(ctx, 56, 26, 52);
  text(ctx, 'Palmetto Plumbing Co.', 124, 62, { size: 27, weight: 700, color: P.ink, ls: -0.4 });
  ['Services', 'Pricing', 'Service area', 'About'].forEach((l, i) => text(ctx, l, 640 + i * 142, 60, { size: 19, weight: 500, color: P.sub }));
  icon(ctx, 'phone', 1178, 38, 26, P.brand, 2.4);
  text(ctx, '(386) 555-0198', 1212, 60, { size: 20, weight: 600, color: P.ink });
  button(ctx, 1384, 26, 164, 52, 'Book a visit', { size: 19 });

  // hero copy
  [x, y, w, h] = NEW_BLOCKS.hero;
  rr(ctx, x, y + 6, 330, 42, 21); ctx.fillStyle = P.mint; ctx.fill();
  ctx.beginPath(); ctx.arc(x + 22, y + 27, 6, 0, 7); ctx.fillStyle = P.brand2; ctx.fill();
  text(ctx, 'Open today · Same-day service', x + 38, y + 34, { size: 18, weight: 600, color: P.brand });
  text(ctx, 'Plumbing problems,', x - 2, y + 128, { size: 68, weight: 700, color: P.ink, ls: -2.2 });
  text(ctx, 'fixed today.', x - 2, y + 206, { size: 68, weight: 700, color: P.ink, ls: -2.2 });
  text(ctx, 'Upfront pricing, friendly local pros, and', x, y + 262, { size: 22, weight: 400, color: P.sub });
  text(ctx, 'appointments that fit your day.', x, y + 294, { size: 22, weight: 400, color: P.sub });
  button(ctx, x, y + 334, 224, 64, 'Book a visit', { size: 21 });
  button(ctx, x + 240, y + 334, 250, 64, 'Call now', { fill: '#fff', color: P.ink, stroke: P.line, ic: 'phone', size: 21 });

  // hero image with availability card
  [x, y, w, h] = NEW_BLOCKS.image;
  ctx.save(); rr(ctx, x, y, w, h, 28); ctx.clip();
  ctx.drawImage(heroImage(), x, y, w, h);
  const gg = ctx.createLinearGradient(0, y, 0, y + h); gg.addColorStop(0.5, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(4,40,36,0.35)');
  ctx.fillStyle = gg; ctx.fillRect(x, y, w, h);
  ctx.restore();
  ctx.save(); ctx.shadowColor = 'rgba(8,40,36,0.22)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  rr(ctx, x + 30, y + h - 128, 360, 96, 20); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  rr(ctx, x + 50, y + h - 108, 56, 56, 14); ctx.fillStyle = P.mint; ctx.fill();
  icon(ctx, 'calendar', x + 62, y + h - 96, 32, P.brand, 2.6);
  text(ctx, 'Next available', x + 124, y + h - 82, { size: 17, weight: 500, color: P.faint });
  text(ctx, 'Today, 2–4 PM', x + 124, y + h - 50, { size: 25, weight: 700, color: P.ink });

  // services
  [x, y, w, h] = NEW_BLOCKS.services;
  const cards = [['drop', 'Leaks & repairs', 'From a drip to a burst pipe'], ['spark', 'Water heaters', 'Repair and replacement'], ['flow', 'Drains & sewer', 'Clogs cleared, lines inspected']];
  const cw = (w - 40) / 3;
  cards.forEach(([ic, t, s], i) => {
    const cx = x + i * (cw + 20);
    rr(ctx, cx, y, cw, h, 24); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.stroke();
    rr(ctx, cx + 30, y + 34, 64, 64, 18); ctx.fillStyle = P.mint; ctx.fill();
    icon(ctx, ic, cx + 45, y + 49, 34, P.brand, 2.6);
    text(ctx, t, cx + 30, y + 138, { size: 27, weight: 700, color: P.ink, ls: -0.4 });
    text(ctx, s, cx + 30, y + 170, { size: 19, weight: 400, color: P.sub });
    icon(ctx, 'arrow', cx + cw - 64, y + 52, 30, P.brand, 2.6);
  });

  // trust band + CTA
  [x, y, w, h] = NEW_BLOCKS.band;
  rr(ctx, x, y, w, h, 26); ctx.fillStyle = P.brand; ctx.fill();
  ['Upfront pricing', 'Licensed local team', 'Weekend appointments'].forEach((t, i) => {
    const bx = x + 40 + i * 330;
    check(ctx, bx + 16, y + h / 2, 16, 1, { color: '#fff', fill: 'rgba(255,255,255,0.16)', lw: 3 });
    text(ctx, t, bx + 44, y + h / 2 + 8, { size: 21, weight: 600, color: '#fff' });
  });
  button(ctx, x + w - 290, y + 22, 256, 60, 'Get a free quote', { fill: '#fff', color: P.brand, size: 20 });

  // footer
  [x, y, w, h] = NEW_BLOCKS.footer;
  text(ctx, '© Palmetto Plumbing Co.  ·  Sample redesign for a fictional business', 800, y + 28, { size: 15, weight: 400, color: P.faint, align: 'center' });

  if (st.glint > 0 && st.glint < 1) {
    const gx = -400 + st.glint * (W + 800);
    const lg = ctx.createLinearGradient(gx - 260, 0, gx + 260, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.45)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = lg; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
}

// ------------------------------------------------------------------ phone
export const PHONE_UI = { book: [48, 1034, 684, 96], call: [48, 1146, 684, 96] };

/**
 * Phone layout 780 x 1690. st: { scroll px, tapBook 0..1, sheet 0..1,
 * svc 0..1, when 0..1, name 0..1, send 0..1, sent 0..1, tap:[x,y,p] }
 */
export function drawNewPhone(ctx, W, H, st = {}) {
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(0, -(st.scroll || 0));
  // header
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 200);
  logo(ctx, 40, 110, 58);
  text(ctx, 'Palmetto Plumbing', 114, 150, { size: 31, weight: 700, color: P.ink, ls: -0.4 });
  rr(ctx, W - 124, 106, 70, 70, 35); ctx.fillStyle = P.brand; ctx.fill();
  icon(ctx, 'phone', W - 107, 123, 36, '#fff', 3);
  ctx.fillStyle = P.line; ctx.fillRect(0, 198, W, 2);
  // hero
  ctx.save(); rr(ctx, 32, 232, W - 64, 300, 30); ctx.clip();
  ctx.drawImage(heroImage(), 32, 232, W - 64, 300); ctx.restore();
  rr(ctx, 56, 460, 330, 52, 26); ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(84, 486, 7, 0, 7); ctx.fillStyle = P.brand2; ctx.fill();
  text(ctx, 'Next available: 2–4 PM', 102, 494, { size: 21, weight: 600, color: P.ink });
  text(ctx, 'Plumbing problems,', 44, 640, { size: 58, weight: 700, color: P.ink, ls: -1.8 });
  text(ctx, 'fixed today.', 44, 708, { size: 58, weight: 700, color: P.ink, ls: -1.8 });
  text(ctx, 'Upfront pricing · Same-day service', 46, 770, { size: 25, weight: 400, color: P.sub });
  // big thumb-friendly actions
  const [bx, by, bw, bh] = PHONE_UI.book, [cx, cy, cw, ch] = PHONE_UI.call;
  const pb = st.tapBook || 0;
  button(ctx, bx, by - 220, bw, bh, 'Book a visit', { size: 30, press: pb });
  button(ctx, cx, cy - 220, cw, ch, 'Call (386) 555-0198', { fill: '#fff', color: P.ink, stroke: P.line, ic: 'phone', size: 28 });
  // services list
  [['drop', 'Leaks & repairs'], ['spark', 'Water heaters'], ['flow', 'Drains & sewer'], ['calendar', 'Weekend appointments']].forEach(([ic, t], i) => {
    const y = 1090 + i * 118;
    rr(ctx, 32, y, W - 64, 100, 24); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.stroke();
    rr(ctx, 56, y + 20, 60, 60, 16); ctx.fillStyle = P.mint; ctx.fill();
    icon(ctx, ic, 70, y + 34, 32, P.brand, 2.6);
    text(ctx, t, 140, y + 62, { size: 29, weight: 600, color: P.ink });
    icon(ctx, 'arrow', W - 104, y + 34, 32, P.faint, 2.4);
  });
  rr(ctx, 32, 1570, W - 64, 120, 26); ctx.fillStyle = P.brand; ctx.fill();
  text(ctx, 'Licensed local team · Upfront pricing', W / 2, 1640, { size: 25, weight: 600, color: '#fff', align: 'center' });
  ctx.restore();

  // status bar (fixed)
  text(ctx, '9:41', 78, 66, { size: 26, weight: 600, color: P.ink });
  rr(ctx, W / 2 - 88, 26, 176, 50, 25); ctx.fillStyle = '#000'; ctx.fill();
  ctx.fillStyle = P.ink; rr(ctx, W - 118, 48, 44, 20, 5); ctx.fill();
  [0, 1, 2, 3].forEach((i) => ctx.fillRect(W - 186 + i * 9, 64 - i * 5, 6, 6 + i * 5));

  // booking bottom sheet
  const s = st.sheet || 0;
  if (s > 0) {
    ctx.fillStyle = `rgba(6,20,18,${0.38 * s})`; ctx.fillRect(0, 0, W, H);
    const top = H - 1090 * s;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 40;
    rr(ctx, 0, top, W, 1200, 44); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    rr(ctx, W / 2 - 40, top + 18, 80, 8, 4); ctx.fillStyle = P.line; ctx.fill();
    const sent = st.sent || 0;
    ctx.save(); ctx.globalAlpha = 1 - sent;
    text(ctx, 'Book a visit', 48, top + 108, { size: 44, weight: 700, color: P.ink, ls: -0.8 });
    text(ctx, 'Takes about a minute.', 48, top + 152, { size: 24, weight: 400, color: P.faint });
    const chipRow = (label, opts, sel, y) => {
      text(ctx, label, 48, y, { size: 23, weight: 600, color: P.sub });
      let x = 48;
      opts.forEach((o, i) => {
        const w = measure(ctx, o, 25, 600) + 48;
        const on = i === 0 ? sel : 0;
        rr(ctx, x, y + 20, w, 64, 32);
        ctx.fillStyle = on > 0.5 ? P.brand : P.mint; ctx.fill();
        if (on > 0 && on < 1) { ctx.strokeStyle = P.brand; ctx.lineWidth = 3; ctx.stroke(); }
        text(ctx, o, x + 24, y + 62, { size: 25, weight: 600, color: on > 0.5 ? '#fff' : P.brand });
        x += w + 14;
      });
    };
    chipRow('What do you need?', ['Water heater', 'Leak', 'Drain'], st.svc || 0, top + 230);
    chipRow('When works?', ['Today 2–4 PM', 'Tomorrow AM'], st.when || 0, top + 370);
    text(ctx, 'Your name', 48, top + 510, { size: 23, weight: 600, color: P.sub });
    rr(ctx, 48, top + 530, W - 96, 76, 18); ctx.fillStyle = P.bg; ctx.fill();
    ctx.strokeStyle = (st.name || 0) > 0 && (st.name || 0) < 1 ? P.brand : P.line; ctx.lineWidth = 2.5; ctx.stroke();
    const nm = 'Daniel R.';
    text(ctx, nm.slice(0, Math.round(nm.length * (st.name || 0))), 72, top + 580, { size: 28, weight: 500, color: P.ink });
    button(ctx, 48, top + 660, W - 96, 96, 'Request visit', { size: 30, press: st.send || 0 });
    text(ctx, 'Sample form · no data is sent', W / 2, top + 800, { size: 20, weight: 400, color: P.faint, align: 'center' });
    ctx.restore();
    if (sent > 0) {
      ctx.save(); ctx.globalAlpha = sent;
      check(ctx, W / 2, top + 250, 76, Math.min(1, sent * 1.3), { color: P.brand, fill: P.mint, lw: 9 });
      text(ctx, 'Request sent!', W / 2, top + 410, { size: 46, weight: 700, color: P.ink, align: 'center', ls: -0.8 });
      text(ctx, 'Water heater · Today 2–4 PM', W / 2, top + 466, { size: 27, weight: 400, color: P.sub, align: 'center' });
      text(ctx, "We'll text you to confirm.", W / 2, top + 506, { size: 27, weight: 400, color: P.sub, align: 'center' });
      ctx.restore();
    }
  }
  // focus rings: the answers a visitor wants, up front
  if (st.hi > 0 && !(st.sheet > 0)) {
    [[46, 450, 350, 72], [30, 736, 560, 50], [22, 1080, 736, 474]].forEach((r, i) => {
      const a = Math.max(0, Math.min(1, st.hi * 3 - i));
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a;
      rr(ctx, r[0], r[1] - (st.scroll || 0), r[2], r[3], 28); ctx.strokeStyle = '#8B6CFF'; ctx.lineWidth = 7; ctx.stroke();
      rr(ctx, r[0] - 9, r[1] - 9 - (st.scroll || 0), r[2] + 18, r[3] + 18, 36); ctx.strokeStyle = 'rgba(139,108,255,0.28)'; ctx.lineWidth = 10; ctx.stroke();
      ctx.restore();
    });
  }
  if (st.tap) {
    const [tx, ty, tp] = st.tap;
    if (tp > 0 && tp < 1) {
      ctx.beginPath(); ctx.arc(tx, ty, 34 + 40 * tp, 0, 7); ctx.fillStyle = `rgba(11,107,94,${0.25 * (1 - tp)})`; ctx.fill();
      ctx.beginPath(); ctx.arc(tx, ty, 30, 0, 7); ctx.fillStyle = `rgba(20,20,20,${0.18 * (1 - tp)})`; ctx.fill();
    }
  }
}
