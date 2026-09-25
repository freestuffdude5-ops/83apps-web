// Dark glass interface cards: the "busywork" fragments, the customer
// workspace (pipeline + record) and the automation steps. All data shown is
// fictional sample data.
import { C, rr, text, measure, avatar, check, icon, glassFill, label, pill } from './draw.js';
import { CUSTOMER } from './site.js';

const lerp = (a, b, t) => a + (b - a) * t;
const cl = (x) => Math.max(0, Math.min(1, x));

// ---------------------------------------------------------------- hook
export function drawInquiry(ctx, W, H, st) {
  glassFill(ctx, W, H, 44, { glow: st.ping || 0 });
  const p = 52;
  rr(ctx, p, p, 84, 84, 24); ctx.fillStyle = 'rgba(143,179,255,0.14)'; ctx.fill();
  icon(ctx, 'mail', p + 18, p + 18, 48, C.blue, 3.4);
  text(ctx, 'New inquiry', p + 116, p + 38, { size: 38, weight: 600 });
  text(ctx, 'Website form  ·  just now', p + 116, p + 80, { size: 27, weight: 400, color: C.muted });
  // unread badge
  const bx = W - p - 40;
  ctx.beginPath(); ctx.arc(bx, p + 30, 16, 0, 7); ctx.fillStyle = C.violet; ctx.fill();
  text(ctx, '“Hi! Do you offer weekly pool service?', p, p + 176, { size: 31, weight: 400, color: '#D9D9E2' });
  text(ctx, 'Can someone call me back?”', p, p + 220, { size: 31, weight: 400, color: '#D9D9E2' });
}

export function drawSheet(ctx, W, H, st) {
  glassFill(ctx, W, H, 44);
  const p = 48;
  icon(ctx, 'sheet', p, p - 4, 44, C.muted, 3);
  text(ctx, 'customers_FINAL_v3.xlsx', p + 62, p + 30, { size: 30, weight: 500, family: 'Geist Mono', color: '#D9D9E2' });
  const cols = [p, p + 250, p + 520, p + 760];
  const heads = ['Name', 'Phone', 'Service', 'Follow-up'];
  const rows = [
    ['Maya T.', '386-555-01…', 'pool??', ''],
    ['R. Alvarez', '', 'recovery', 'called?'],
    ['Chen', '386-555-0187', '', 'Tues'],
    ['D. Brooks', 'see email', 'weekly', ''],
  ];
  const top = p + 78, rh = 74;
  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(p - 8, top, W - p * 2 + 16, rh);
  heads.forEach((h, i) => text(ctx, h, cols[i], top + 48, { size: 25, weight: 600, color: C.muted }));
  rows.forEach((r, ri) => {
    const y = top + rh * (ri + 1);
    ctx.fillStyle = C.hair; ctx.fillRect(p - 8, y, W - p * 2 + 16, 2);
    r.forEach((c, i) => text(ctx, c, cols[i], y + 48, { size: 26, weight: 400, color: c.includes('?') || c.includes('…') ? C.amber : '#D0D0DA' }));
  });
  for (let i = 1; i < 4; i++) { ctx.fillStyle = C.hair; ctx.fillRect(cols[i] - 22, top, 2, rh * 5); }
  // one highlighted empty cell nobody filled in
  rr(ctx, cols[3] - 16, top + rh + 6, W - cols[3] - p + 20, rh - 12, 8); ctx.strokeStyle = 'rgba(233,184,102,0.75)'; ctx.lineWidth = 3; ctx.stroke();
}

export function drawTask(ctx, W, H, st) {
  glassFill(ctx, W, H, 44);
  const p = 50;
  rr(ctx, p, p + 6, 50, 50, 14); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3.5; ctx.stroke();
  text(ctx, 'Call Maya back', p + 78, p + 45, { size: 38, weight: 600 });
  text(ctx, 'Who’s handling this?', p + 78, p + 94, { size: 28, weight: 400, color: C.muted });
  const lw = measure(ctx, 'OVERDUE', 22, 500, 'Geist Mono') + 3 * 7 + 40;
  pill(ctx, p + 78, p + 126, lw, 48, { fill: 'rgba(233,184,102,0.12)', stroke: 'rgba(233,184,102,0.55)' });
  label(ctx, 'Overdue', p + 98, p + 158, { size: 22, color: C.amber });
}

// ---------------------------------------------------------------- tools
const STAGES = ['New', 'Contacted', 'Scheduled', 'Active'];
const OTHERS = [
  [0, 'R. Alvarez', 'Pool recovery'],
  [1, 'Chen Family', 'Equipment repair'],
  [1, 'D. Brooks', 'Weekly pool care'],
  [2, 'K. Singh', 'Filter repair'],
  [3, 'L. Moreau', 'Weekly pool care'],
  [3, 'P. Grant', 'Heater repair'],
];

function miniCard(ctx, x, y, w, h, name, svc, { hi = 0, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha;
  rr(ctx, x, y, w, h, 18);
  ctx.fillStyle = hi > 0 ? `rgba(189,166,255,${0.10 + 0.08 * hi})` : 'rgba(255,255,255,0.045)'; ctx.fill();
  ctx.strokeStyle = hi > 0 ? `rgba(189,166,255,${0.35 + 0.5 * hi})` : C.hair; ctx.lineWidth = hi > 0 ? 3 : 2; ctx.stroke();
  text(ctx, name, x + 22, y + 44, { size: 26, weight: 600, color: hi > 0 ? C.text : '#CFCFD8' });
  text(ctx, svc, x + 22, y + 80, { size: 22, weight: 400, color: C.muted });
  ctx.restore();
}

/** Pipeline board. st: { arrive 0..1, move 0..1 (New→Scheduled), hi 0..1 } */
export function drawBoard(ctx, W, H, st) {
  glassFill(ctx, W, H, 44);
  const p = 48;
  icon(ctx, 'grid', p, p - 2, 40, C.muted, 3);
  text(ctx, 'Customer workspace', p + 58, p + 30, { size: 34, weight: 600 });
  const lw = measure(ctx, 'EXAMPLE WORKFLOW', 19, 500, 'Geist Mono') + 16 * 2.7 + 36;
  pill(ctx, W - p - lw, p - 8, lw, 46, { fill: 'rgba(255,255,255,0.04)', stroke: C.hair2 });
  label(ctx, 'Example workflow', W - p - lw + 18, p + 22, { size: 19, color: C.muted });
  const top = p + 84;
  const gap = 18;
  const cw = (W - p * 2 - gap * 3) / 4;
  const ch = 104, cg = 14;
  STAGES.forEach((s, i) => {
    const x = p + i * (cw + gap);
    rr(ctx, x, top, cw, H - top - p, 24); ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + 26, top + 36, 7, 0, 7);
    ctx.fillStyle = i === 2 ? C.violet : i === 0 ? C.blue : 'rgba(255,255,255,0.35)'; ctx.fill();
    text(ctx, s, x + 44, top + 45, { size: 24, weight: 600, color: '#DADAE3' });
  });
  const colX = (i) => p + i * (cw + gap) + 12;
  const slotY = (k) => top + 72 + k * (ch + cg);
  // Maya's card enters at the top of "New" and later moves to "Scheduled".
  const arrive = cl(st.arrive || 0), move = cl(st.move || 0);
  const counts = [0, 0, 0, 0];
  OTHERS.forEach(([c, n, s]) => {
    let k = counts[c]++;
    let push = 0;
    if (c === 0) push = arrive * (1 - move);
    if (c === 2) push = move;
    miniCard(ctx, colX(c), slotY(k + push), cw - 24, ch, n, s);
  });
  if (arrive > 0) {
    const e = move < 0.5 ? 4 * move ** 3 : 1 - Math.pow(-2 * move + 2, 3) / 2;
    const x = lerp(colX(0), colX(2), e);
    const y = slotY(0) - Math.sin(e * Math.PI) * 26;
    miniCard(ctx, x, y, cw - 24, ch, CUSTOMER.name, CUSTOMER.service, { hi: st.hi ?? 1, alpha: arrive });
  }
}

/** Customer record. st: { reveal, stage (0 new → 1 scheduled), appt, next } */
export function drawRecord(ctx, W, H, st) {
  glassFill(ctx, W, H, 48, { glow: st.glow || 0 });
  const p = 56;
  avatar(ctx, p + 46, p + 46, 46, CUSTOMER.initials);
  text(ctx, CUSTOMER.name, p + 116, p + 40, { size: 44, weight: 600, ls: -0.6 });
  text(ctx, 'Customer record · from website form', p + 116, p + 82, { size: 25, weight: 400, color: C.muted });
  // stage pill crossfades New → Scheduled
  const sg = cl(st.stage || 0);
  const pw = 208, ph = 50, px = W - p - pw, py = p + 186;
  const rv = (i) => cl((st.reveal || 0) * 4 - i * 0.6);
  const rows = [
    ['phone', 'Phone', CUSTOMER.phone],
    ['drop', 'Service', CUSTOMER.service],
    ['user', 'Source', 'Website form · Today 9:41 AM'],
  ];
  rows.forEach(([ic, k, v], i) => {
    const y = p + 170 + i * 84;
    ctx.save(); ctx.globalAlpha = rv(i);
    ctx.translate(0, (1 - rv(i)) * 14);
    icon(ctx, ic, p, y + 4, 34, C.muted, 2.6);
    text(ctx, k, p + 56, y + 32, { size: 26, weight: 400, color: C.muted });
    text(ctx, v, p + 210, y + 32, { size: 28, weight: 500, color: '#E6E6EE' });
    ctx.restore();
  });
  ctx.save(); ctx.globalAlpha = rv(0);
  pill(ctx, px, py - 110, pw, ph, { fill: sg > 0.5 ? 'rgba(189,166,255,0.16)' : 'rgba(143,179,255,0.12)', stroke: sg > 0.5 ? 'rgba(189,166,255,0.6)' : 'rgba(143,179,255,0.5)' });
  ctx.beginPath(); ctx.arc(px + 26, py - 85, 7, 0, 7); ctx.fillStyle = sg > 0.5 ? C.violet : C.blue; ctx.fill();
  text(ctx, 'New', px + 46, py - 76, { size: 24, weight: 600, color: C.blue, alpha: 1 - sg });
  text(ctx, 'Scheduled', px + 46, py - 76, { size: 24, weight: 600, color: C.violet, alpha: sg });
  ctx.restore();

  const dy = p + 432;
  ctx.fillStyle = C.hair; ctx.fillRect(p, dy, W - p * 2, 2);
  // appointment
  const a = cl(st.appt || 0);
  ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 18);
  label(ctx, 'Appointment', p, dy + 58, { size: 21, color: C.dim });
  rr(ctx, p, dy + 82, W - p * 2, 108, 22); ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill(); ctx.strokeStyle = C.hair; ctx.lineWidth = 2; ctx.stroke();
  rr(ctx, p + 22, dy + 102, 68, 68, 16); ctx.fillStyle = 'rgba(143,179,255,0.14)'; ctx.fill();
  icon(ctx, 'calendar', p + 36, dy + 116, 40, C.blue, 3);
  text(ctx, 'Site visit', p + 112, dy + 128, { size: 29, weight: 600 });
  text(ctx, 'Thu, Oct 8  ·  9:30 AM', p + 112, dy + 166, { size: 25, weight: 400, color: C.muted });
  ctx.restore();
  // next step
  const n = cl(st.next || 0);
  ctx.save(); ctx.globalAlpha = n; ctx.translate(0, (1 - n) * 18);
  label(ctx, 'Next step', p, dy + 256, { size: 21, color: C.dim });
  rr(ctx, p, dy + 280, W - p * 2, 108, 22);
  ctx.fillStyle = `rgba(189,166,255,${0.08 + 0.06 * (st.nextGlow || 0)})`; ctx.fill();
  ctx.strokeStyle = `rgba(189,166,255,${0.35 + 0.45 * (st.nextGlow || 0)})`; ctx.lineWidth = 2.5; ctx.stroke();
  rr(ctx, p + 22, dy + 300, 68, 68, 16); ctx.fillStyle = 'rgba(189,166,255,0.16)'; ctx.fill();
  icon(ctx, 'arrow', p + 36, dy + 314, 40, C.violet, 3.2);
  text(ctx, 'Send estimate', p + 112, dy + 326, { size: 29, weight: 600 });
  text(ctx, 'Office team  ·  due Fri, Oct 9', p + 112, dy + 364, { size: 25, weight: 400, color: C.muted });
  ctx.restore();
}

// ---------------------------------------------------------------- automation
export function drawTrigger(ctx, W, H, st) {
  glassFill(ctx, W, H, 44, { glow: st.glow || 0 });
  const p = 48;
  label(ctx, 'When', p, p + 26, { size: 21, color: C.violet });
  text(ctx, 'A new website inquiry arrives', p, p + 80, { size: 34, weight: 600 });
  avatar(ctx, p + 30, p + 150, 30, CUSTOMER.initials, { size: 22 });
  text(ctx, `${CUSTOMER.name}  ·  ${CUSTOMER.service}`, p + 78, p + 160, { size: 27, weight: 400, color: C.muted });
}

const ACTIONS = [
  { icon: 'chat', title: 'Confirmation sent', meta: 'Text message · automatic' },
  { icon: 'bell', title: 'Reminder scheduled', meta: 'Wed, Oct 7 · 5:00 PM' },
  { icon: 'flow', title: 'Project status updated', meta: 'Visible to your team' },
];

/** One automation step. st: { i, on 0..1 (activation), appear 0..1 } */
export function drawAction(ctx, W, H, st) {
  const on = cl(st.on || 0);
  const A = ACTIONS[st.i];
  glassFill(ctx, W, H, 44, { glow: on * (1 - cl((st.settle || 0))) * 0.9 + on * 0.25, alpha: 0.66 });
  const p = 46;
  // icon tile
  rr(ctx, p, p, 76, 76, 20);
  ctx.fillStyle = on > 0 ? `rgba(189,166,255,${0.08 + 0.1 * on})` : 'rgba(255,255,255,0.05)'; ctx.fill();
  icon(ctx, A.icon, p + 17, p + 17, 42, on > 0.5 ? C.violet : C.muted, 3);
  text(ctx, A.title, p + 104, p + 34, { size: 34, weight: 600, color: on > 0.5 ? C.text : '#9A9AA8' });
  text(ctx, A.meta, p + 104, p + 72, { size: 25, weight: 400, color: C.muted });
  // status (right)
  const cx = W - p - 30, cy = p + 38;
  if (on <= 0) {
    ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(cx, cy, 26, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
  } else check(ctx, cx, cy, 28, cl(on * 1.2), { lw: 4.5 });
  // body
  const by = p + 118;
  ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * on;
  if (st.i === 0) {
    rr(ctx, p, by, W - p * 2, 112, 26); ctx.fillStyle = 'rgba(143,179,255,0.10)'; ctx.fill();
    text(ctx, 'Hi Maya, your site visit is confirmed for', p + 28, by + 46, { size: 26, weight: 400, color: '#DCDCE6' });
    text(ctx, 'Thu, Oct 8 at 9:30 AM. — Seaside Pool Co.', p + 28, by + 84, { size: 26, weight: 400, color: '#DCDCE6' });
  } else if (st.i === 1) {
    rr(ctx, p, by, W - p * 2, 112, 26); ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill();
    icon(ctx, 'clock', p + 26, by + 34, 44, C.blue, 3);
    text(ctx, 'Visit reminder for Maya', p + 92, by + 50, { size: 27, weight: 500, color: '#E6E6EE' });
    text(ctx, 'and the service team, the day before', p + 92, by + 86, { size: 24, weight: 400, color: C.muted });
  } else {
    const steps = ['Inquiry', 'Scheduled', 'Estimate', 'Service'];
    const sw = (W - p * 2) / 4;
    const lineY = by + 30;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(p + sw / 2, lineY - 2, sw * 3, 4);
    ctx.fillStyle = C.violet; ctx.fillRect(p + sw / 2, lineY - 2, sw * lerp(0, 1, cl(on * 1.3)), 4);
    steps.forEach((s, i) => {
      const x = p + sw * i + sw / 2;
      const done = i === 0 || (i === 1 && on > 0.6);
      ctx.beginPath(); ctx.arc(x, lineY, i === 1 && on > 0.6 ? 15 : 11, 0, 7);
      ctx.fillStyle = done ? C.violet : '#2A2A33'; ctx.fill();
      if (!done) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2.5; ctx.stroke(); }
      text(ctx, s, x, lineY + 62, { size: 24, weight: done ? 600 : 400, color: done ? C.text : C.muted, align: 'center' });
    });
  }
  ctx.restore();
}

/** The inquiry "token" that travels from the website to the workspace. */
export function drawToken(ctx, W, H, st) {
  glassFill(ctx, W, H, 40, { glow: 0.8 });
  const p = 40;
  avatar(ctx, p + 44, H / 2, 44, CUSTOMER.initials);
  text(ctx, CUSTOMER.name, p + 112, H / 2 - 8, { size: 40, weight: 600, ls: -0.5 });
  text(ctx, `${CUSTOMER.service}  ·  new inquiry`, p + 112, H / 2 + 38, { size: 27, weight: 400, color: C.muted });
}
