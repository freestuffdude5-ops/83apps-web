// Phone view of the old site (not responsive: the desktop page shrunk to fit),
// callout chips and the incoming-request cards for the makeover film.
import { C, rr, text, icon, check, glassFill, label, measure } from './draw.js';
import { drawOldPage, OLD } from './oldsite.js';

let oldCanvas = null;
function oldPageImage(st) {
  if (!oldCanvas) { oldCanvas = document.createElement('canvas'); oldCanvas.width = OLD.W; oldCanvas.height = OLD.H; }
  drawOldPage(oldCanvas.getContext('2d'), OLD.W, OLD.H, st);
  return oldCanvas;
}

/**
 * Old site on the phone. st: { zoom, panX, panY (in page px), load 0..1,
 * marquee, touches: [[x,y,alpha],...], leave 0..1 (swipe-back), spinner }
 */
export function drawOldPhone(ctx, W, H, st = {}) {
  ctx.fillStyle = '#cfcfc8'; ctx.fillRect(0, 0, W, H);
  const leave = st.leave || 0;
  // "previous page" underneath, revealed by the swipe back: generic results
  if (leave > 0) {
    ctx.fillStyle = '#f3f3f3'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      const y = 250 + i * 210;
      rr(ctx, 44, y, W - 88, 170, 22); ctx.fillStyle = '#fff'; ctx.fill();
      rr(ctx, 72, y + 34, 300 - (i % 3) * 40, 22, 11); ctx.fillStyle = '#c9d4f5'; ctx.fill();
      rr(ctx, 72, y + 76, W - 180, 16, 8); ctx.fillStyle = '#e1e1e1'; ctx.fill();
      rr(ctx, 72, y + 108, W - 260, 16, 8); ctx.fillStyle = '#e1e1e1'; ctx.fill();
    }
    rr(ctx, 44, 130, W - 88, 76, 38); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.stroke();
    text(ctx, 'plumber near me', 110, 180, { size: 28, weight: 400, color: '#555' });
  }
  ctx.save();
  ctx.translate(leave * W * 1.05, 0);
  if (leave > 0) { ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 40; ctx.fillStyle = '#cfcfc8'; ctx.fillRect(0, 0, W, H); ctx.shadowBlur = 0; }
  // browser chrome
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 88, W, 86);
  rr(ctx, 30, 102, W - 60, 58, 29); ctx.fillStyle = '#e4e4e4'; ctx.fill();
  text(ctx, 'palmettoplumbing-fl.example', W / 2, 140, { size: 22, weight: 400, color: '#666', align: 'center' });
  // loading bar
  const load = st.load ?? 1;
  if (load < 1) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(0, 170, W * (0.15 + 0.85 * load), 5); }
  // page: the desktop layout squeezed into a phone, with pinch zoom
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 174, W, H - 174); ctx.clip();
  const base = W / OLD.W;
  const z = st.zoom || 1;
  ctx.translate(0, 174);
  ctx.scale(base * z, base * z);
  ctx.translate(-(st.panX || 0), -(st.panY || 0));
  ctx.drawImage(oldPageImage(st), 0, 0);
  ctx.restore();
  if (st.spinner > 0) {
    ctx.save(); ctx.globalAlpha = st.spinner;
    rr(ctx, W / 2 - 90, H / 2 - 90, 180, 180, 36); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + (st.spinPhase || 0);
      ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.85 * (i / 12)})`; ctx.lineWidth = 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * 30, H / 2 + Math.sin(a) * 30); ctx.lineTo(W / 2 + Math.cos(a) * 52, H / 2 + Math.sin(a) * 52); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  // status bar
  text(ctx, '9:41', 78, 66, { size: 26, weight: 600, color: '#111' });
  rr(ctx, W / 2 - 88, 26, 176, 50, 25); ctx.fillStyle = '#000'; ctx.fill();
  // touch points (screen-recording style)
  (st.touches || []).forEach(([x, y, a]) => {
    if (a <= 0) return;
    ctx.beginPath(); ctx.arc(x, y, 44, 0, 7);
    ctx.fillStyle = `rgba(255,255,255,${0.35 * a})`; ctx.fill();
    ctx.strokeStyle = `rgba(0,0,0,${0.25 * a})`; ctx.lineWidth = 3; ctx.stroke();
  });
}

/** Callout chip. st: { kind: 'bad'|'good', text, icon } */
export function drawChip(ctx, W, H, st) {
  const good = st.kind === 'good';
  glassFill(ctx, W, H, H / 2, { alpha: 0.72, glow: good ? 0.6 : 0 });
  const r = H / 2 - 22;
  const cx = 22 + r, cy = H / 2;
  if (good) check(ctx, cx, cy, r, st.p ?? 1, { lw: 5 });
  else {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fillStyle = 'rgba(233,184,102,0.16)'; ctx.fill();
    ctx.strokeStyle = C.amber; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const k = r * 0.38;
    ctx.beginPath(); ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k); ctx.stroke();
  }
  text(ctx, st.text, cx + r + 24, H / 2 + 13, { size: 36, weight: 600, color: C.text });
}

export const chipWidth = (ctx, s) => Math.ceil(measure(ctx, s, 36, 600) + 150);

/** Incoming request card. st: { i } */
const REQS = [
  { t: 'New booking request', b: 'Water heater · Today 2–4 PM · Daniel R.', ic: 'calendar' },
  { t: 'New quote request', b: 'Leak repair · Kitchen sink · Maria G.', ic: 'mail' },
  { t: 'New message', b: '“Can you look at a drain on Saturday?”', ic: 'chat' },
];
export function drawRequest(ctx, W, H, st) {
  const R = REQS[st.i];
  glassFill(ctx, W, H, 40, { alpha: 0.74, glow: st.glow || 0 });
  const p = 34;
  rr(ctx, p, p, 84, 84, 22);
  const g = ctx.createLinearGradient(p, p, p + 84, p + 84); g.addColorStop(0, '#12907E'); g.addColorStop(1, '#0B6B5E');
  ctx.fillStyle = g; ctx.fill();
  icon(ctx, R.ic, p + 20, p + 20, 44, '#fff', 3.4);
  text(ctx, 'PALMETTO PLUMBING', p + 110, p + 30, { size: 20, weight: 600, color: C.muted, ls: 1.5 });
  text(ctx, 'now', W - p, p + 30, { size: 22, weight: 400, color: C.muted, align: 'right' });
  text(ctx, R.t, p + 110, p + 72, { size: 34, weight: 600 });
  text(ctx, R.b, p + 110, p + 112, { size: 26, weight: 400, color: '#D6D6DE' });
}

/** Small caption chip, e.g. "Example requests". */
export function drawCaption(ctx, W, H, st) {
  label(ctx, st.text, W / 2, H / 2 + 8, { size: 22, color: C.muted, align: 'center' });
}
