// Fictional client website ("Seaside Pool Co.") drawn for the desktop display
// and the phone. Both layouts read the same form state so they stay in sync.
import { rr, text, measure, icon, check, typed } from './draw.js';

const S = {
  bg: '#F5F7FA', ink: '#0D1728', sub: '#4B5870', faint: '#8994A8', line: '#E2E7EF',
  brand: '#1F5FE0', brand2: '#3D8BFF', field: '#FFFFFF', chip: '#EEF3FB',
};

export const CUSTOMER = { name: 'Maya Torres', first: 'Maya', phone: '(386) 555-0142', service: 'Weekly pool care', initials: 'MT' };

let water = null;
/** Procedural pool-water photo substitute (rendered once and cached). */
function waterImage() {
  if (water) return water;
  const w = 480, h = 300;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w, v = y / h;
      let k = 0;
      for (let l = 0; l < 3; l++) {
        const f = 9 + l * 5.5;
        const a = Math.sin(u * f * 1.7 + Math.sin(v * f * 1.1 + l * 2.1) * 1.8 + l);
        const b = Math.sin(v * f * 1.9 + Math.sin(u * f * 0.9 - l * 1.3) * 1.6 - l * 0.7);
        k += Math.pow(1 - Math.abs(a * b), 10) * (0.7 - l * 0.15);
      }
      const depth = 0.55 + 0.45 * v;
      const r = 20 + 30 * (1 - depth) + 200 * k;
      const g = 120 + 70 * (1 - depth) + 110 * k;
      const bl = 200 + 40 * (1 - depth) + 55 * k;
      const i = (y * w + x) * 4;
      img.data[i] = Math.min(255, r); img.data[i + 1] = Math.min(255, g); img.data[i + 2] = Math.min(255, bl); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  water = c;
  return c;
}

function logo(ctx, x, y, s) {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, S.brand2); g.addColorStop(1, S.brand);
  rr(ctx, x, y, s, s, s * 0.3); ctx.fillStyle = g; ctx.fill();
  icon(ctx, 'drop', x + s * 0.2, y + s * 0.18, s * 0.6, '#FFFFFF', s * 0.075);
}

function field(ctx, x, y, w, h, lab, value, p, active, sc, caretOn) {
  text(ctx, lab, x, y - 12 * sc, { size: 17 * sc, weight: 500, color: S.sub });
  rr(ctx, x, y, w, h, 12 * sc);
  ctx.fillStyle = S.field; ctx.fill();
  ctx.strokeStyle = active ? S.brand : S.line; ctx.lineWidth = active ? 3 * sc : 2 * sc; ctx.stroke();
  if (active) { rr(ctx, x - 4 * sc, y - 4 * sc, w + 8 * sc, h + 8 * sc, 15 * sc); ctx.strokeStyle = 'rgba(31,95,224,0.16)'; ctx.lineWidth = 5 * sc; ctx.stroke(); }
  typed(ctx, value, p, x + 20 * sc, y + h / 2 + 8 * sc, { size: 23 * sc, weight: 500, color: S.ink, caretColor: S.brand }, active, caretOn);
}

/**
 * The quote form. st: { name, phone, service, press, sent, focus } all 0..1
 * (focus: 0 none, 1 name, 2 phone, 3 service), caret blink boolean.
 */
function form(ctx, x, y, w, sc, st) {
  const pad = 36 * sc;
  const h = 640 * sc;
  // card
  ctx.save();
  ctx.shadowColor = 'rgba(16,32,64,0.16)'; ctx.shadowBlur = 50 * sc; ctx.shadowOffsetY = 18 * sc;
  rr(ctx, x, y, w, h, 26 * sc); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.restore();
  rr(ctx, x, y, w, h, 26 * sc); ctx.strokeStyle = S.line; ctx.lineWidth = 2 * sc; ctx.stroke();

  const sent = st.sent;
  ctx.save();
  ctx.globalAlpha = 1 - sent;
  text(ctx, 'Request a free quote', x + pad, y + 64 * sc, { size: 32 * sc, weight: 650, color: S.ink, ls: -0.4 * sc });
  text(ctx, 'We reply the same business day.', x + pad, y + 100 * sc, { size: 18 * sc, weight: 400, color: S.faint });
  const fw = w - pad * 2, fh = 62 * sc;
  field(ctx, x + pad, y + 160 * sc, fw, fh, 'Name', CUSTOMER.name, st.name, st.focus === 1, sc, st.caret);
  field(ctx, x + pad, y + 270 * sc, fw, fh, 'Phone', CUSTOMER.phone, st.phone, st.focus === 2, sc, st.caret);
  // service chips
  text(ctx, 'What do you need?', x + pad, y + 368 * sc, { size: 17 * sc, weight: 500, color: S.sub });
  const chips = ['Weekly pool care', 'Repair', 'Green-to-clean'];
  let cx = x + pad;
  chips.forEach((c, i) => {
    const cw = measure(ctx, c, 19 * sc, 500) + 36 * sc;
    const sel = i === 0 ? st.service : 0;
    rr(ctx, cx, y + 386 * sc, cw, 50 * sc, 25 * sc);
    ctx.fillStyle = sel > 0 ? `rgba(31,95,224,${0.1 + 0.9 * sel})` : S.chip; ctx.fill();
    if (sel > 0 && sel < 1) { ctx.strokeStyle = S.brand; ctx.lineWidth = 2 * sc; ctx.stroke(); }
    text(ctx, c, cx + 18 * sc, y + 418 * sc, { size: 19 * sc, weight: 500, color: sel > 0.5 ? '#FFFFFF' : S.sub });
    cx += cw + 10 * sc;
  });
  // button
  const bp = st.press;
  const by = y + 480 * sc, bh = 72 * sc;
  const shrink = Math.sin(Math.min(1, bp) * Math.PI) * 6 * sc;
  rr(ctx, x + pad + shrink, by + shrink / 2, fw - shrink * 2, bh - shrink, 18 * sc);
  const g = ctx.createLinearGradient(x, by, x + w, by + bh);
  g.addColorStop(0, S.brand2); g.addColorStop(1, S.brand);
  ctx.fillStyle = g; ctx.fill();
  if (bp > 0 && bp < 1) {
    ctx.save(); rr(ctx, x + pad, by, fw, bh, 18 * sc); ctx.clip();
    ctx.beginPath(); ctx.arc(x + w * 0.62, by + bh / 2, fw * bp, 0, 7); ctx.fillStyle = `rgba(255,255,255,${0.25 * (1 - bp)})`; ctx.fill();
    ctx.restore();
  }
  text(ctx, 'Request a quote', x + w / 2, by + bh / 2 + 8 * sc, { size: 23 * sc, weight: 600, color: '#FFFFFF', align: 'center' });
  text(ctx, 'Sample form · no data is sent', x + w / 2, by + bh + 36 * sc, { size: 15 * sc, weight: 400, color: S.faint, align: 'center' });
  ctx.restore();

  if (sent > 0) {
    ctx.save();
    ctx.globalAlpha = sent;
    const cy = y + h * 0.36;
    check(ctx, x + w / 2, cy, 58 * sc, Math.min(1, sent * 1.4), { color: S.brand, fill: 'rgba(31,95,224,0.10)', lw: 7 * sc });
    text(ctx, `Thanks, ${CUSTOMER.first}!`, x + w / 2, cy + 128 * sc, { size: 36 * sc, weight: 650, color: S.ink, align: 'center', ls: -0.4 * sc });
    text(ctx, 'Your request is in.', x + w / 2, cy + 172 * sc, { size: 22 * sc, weight: 400, color: S.sub, align: 'center' });
    text(ctx, "We'll confirm a visit time shortly.", x + w / 2, cy + 204 * sc, { size: 22 * sc, weight: 400, color: S.sub, align: 'center' });
    ctx.restore();
  }
  return h;
}

function cursor(ctx, x, y, s, press) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s * (1 - 0.12 * press), s * (1 - 0.12 * press));
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 26); ctx.lineTo(6.5, 20); ctx.lineTo(11, 30); ctx.lineTo(15, 28.3); ctx.lineTo(10.6, 18.6); ctx.lineTo(19, 18.6); ctx.closePath();
  ctx.fillStyle = '#0D1728'; ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

/** Desktop layout, 1600 x 1000 canvas. */
export function drawDesktop(ctx, W, H, st) {
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
  // browser bar
  ctx.fillStyle = '#E9EDF3'; ctx.fillRect(0, 0, W, 52);
  ['#D6DBE3', '#D6DBE3', '#D6DBE3'].forEach((c, i) => { ctx.beginPath(); ctx.arc(30 + i * 24, 26, 7, 0, 7); ctx.fillStyle = c; ctx.fill(); });
  rr(ctx, W / 2 - 230, 12, 460, 30, 15); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  text(ctx, 'Sample website · Seaside Pool Co.', W / 2, 33, { size: 15, weight: 500, color: S.faint, align: 'center' });
  // nav
  const ny = 52;
  logo(ctx, 64, ny + 22, 44);
  text(ctx, 'Seaside Pool Co.', 122, ny + 53, { size: 24, weight: 650, color: S.ink, ls: -0.3 });
  ['Services', 'Service areas', 'About', 'Contact'].forEach((l, i) => text(ctx, l, 700 + i * 150, ny + 51, { size: 18, weight: 500, color: S.sub }));
  rr(ctx, W - 214, ny + 20, 150, 48, 24); ctx.fillStyle = S.ink; ctx.fill();
  text(ctx, 'Get a quote', W - 139, ny + 51, { size: 18, weight: 600, color: '#fff', align: 'center' });
  ctx.fillStyle = S.line; ctx.fillRect(0, ny + 88, W, 2);
  // hero copy
  text(ctx, 'POOL CARE · REPAIR · RECOVERY', 64, 232, { size: 16, weight: 600, color: S.brand, ls: 2.5 });
  text(ctx, 'Crystal-clear pools,', 62, 310, { size: 64, weight: 700, color: S.ink, ls: -2 });
  text(ctx, 'without the hassle.', 62, 384, { size: 64, weight: 700, color: S.ink, ls: -2 });
  text(ctx, 'Weekly service, repairs and recovery,', 64, 438, { size: 22, weight: 400, color: S.sub });
  text(ctx, 'scheduled around you.', 64, 470, { size: 22, weight: 400, color: S.sub });
  // image block
  ctx.save(); rr(ctx, 64, 520, 760, 420, 26); ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(waterImage(), 64, 520, 760, 420);
  const sh = ctx.createLinearGradient(0, 520, 0, 940); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(8,24,60,0.35)');
  ctx.fillStyle = sh; ctx.fillRect(64, 520, 760, 420);
  ctx.restore();
  // badges on the image
  [['drop', 'Weekly service'], ['grid', 'Equipment repair'], ['spark', 'Green-to-clean']].forEach(([ic, l], i) => {
    const bx = 92 + i * 240, by = 870;
    rr(ctx, bx, by, 222, 48, 24); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    icon(ctx, ic, bx + 14, by + 12, 24, S.brand, 2.2);
    text(ctx, l, bx + 48, by + 31, { size: 17, weight: 600, color: S.ink });
  });
  // form
  form(ctx, 900, 200, 636, 1, st);
  if (st.cursor) cursor(ctx, st.cursor[0], st.cursor[1], 1.3, st.click || 0);
}

/** Phone layout, 780 x 1690 canvas (rounded screen mask applied by caller). */
export function drawPhone(ctx, W, H, st) {
  ctx.fillStyle = S.bg; ctx.fillRect(0, 0, W, H);
  // status bar
  text(ctx, '9:41', 78, 66, { size: 26, weight: 600, color: S.ink });
  rr(ctx, W / 2 - 88, 26, 176, 50, 25); ctx.fillStyle = '#000'; ctx.fill(); // island
  ctx.fillStyle = S.ink; rr(ctx, W - 118, 48, 44, 20, 5); ctx.fill();
  [0, 1, 2, 3].forEach((i) => { ctx.fillRect(W - 186 + i * 9, 64 - i * 5, 6, 6 + i * 5); });
  // header
  logo(ctx, 44, 110, 50);
  text(ctx, 'Seaside Pool Co.', 108, 145, { size: 28, weight: 650, color: S.ink, ls: -0.3 });
  ctx.fillStyle = S.ink; [0, 1, 2].forEach((i) => ctx.fillRect(W - 86, 124 + i * 11, 38, 4));
  // image band
  ctx.save(); rr(ctx, 28, 196, W - 56, 250, 28); ctx.clip();
  ctx.drawImage(waterImage(), 28, 196, W - 56, 250);
  ctx.restore();
  text(ctx, 'Crystal-clear pools,', 40, 530, { size: 50, weight: 700, color: S.ink, ls: -1.5 });
  text(ctx, 'without the hassle.', 40, 588, { size: 50, weight: 700, color: S.ink, ls: -1.5 });
  // form
  form(ctx, 28, 640, W - 56, 1.12, st);
  if (st.tap) {
    const [tx, ty, tp] = st.tap;
    if (tp > 0 && tp < 1) {
      ctx.beginPath(); ctx.arc(tx, ty, 26 + 50 * tp, 0, 7);
      ctx.fillStyle = `rgba(31,95,224,${0.22 * (1 - tp)})`; ctx.fill();
    }
  }
}

// Positions (canvas px) of the controls, for cursor / tap choreography.
export const DESKTOP_TARGETS = { name: [1100, 400], phone: [1100, 510], chip: [1010, 610], button: [1250, 713] };
export const PHONE_TARGETS = { name: [300, 855], phone: [300, 978], chip: [150, 1092], button: [390, 1219] };
