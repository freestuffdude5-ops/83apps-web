// Canvas 2D drawing primitives for the interface mockups (Geist type,
// hairlines, pills, icons). Everything is resolution independent: callers
// pass sizes in canvas pixels.

export const C = {
  bg: '#060608', panel: '#101014', text: '#F4F4F7', muted: '#A1A1AE', dim: '#6E6E7C',
  violet: '#BDA6FF', blue: '#8FB3FF', hair: 'rgba(255,255,255,0.09)', hair2: 'rgba(255,255,255,0.16)',
  amber: '#E9B866',
};

export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function font(ctx, size, weight = 500, family = 'Geist') {
  ctx.font = `${weight} ${size}px "${family}"`;
}

export function text(ctx, s, x, y, { size = 28, weight = 500, color = C.text, family = 'Geist', align = 'left', base = 'alphabetic', ls = 0, alpha = 1, maxW } = {}) {
  font(ctx, size, weight, family);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.letterSpacing = ls ? `${ls}px` : '0px';
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * alpha;
  if (maxW) ctx.fillText(s, x, y, maxW); else ctx.fillText(s, x, y);
  ctx.globalAlpha = a;
  ctx.letterSpacing = '0px';
}

export function measure(ctx, s, size, weight = 500, family = 'Geist') {
  font(ctx, size, weight, family);
  return ctx.measureText(s).width;
}

export function pill(ctx, x, y, w, h, { fill = 'rgba(255,255,255,0.06)', stroke = C.hair2, lw = 2 } = {}) {
  rr(ctx, x, y, w, h, h / 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

export function avatar(ctx, cx, cy, r, initials, { from = '#9E8BFF', to = '#6D8BFF', size } = {}) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, from); g.addColorStop(1, to);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  text(ctx, initials, cx, cy + 1, { size: size || r * 0.78, weight: 600, color: '#0B0B12', align: 'center', base: 'middle' });
}

/** A check mark inside a circle; p animates the stroke (0..1). */
export function check(ctx, cx, cy, r, p = 1, { color = C.violet, fill = 'rgba(189,166,255,0.14)', lw } = {}) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = lw || Math.max(2, r * 0.16); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pts = [[-0.42, 0.02], [-0.12, 0.32], [0.45, -0.3]];
  const L1 = Math.hypot(0.3, 0.3), L2 = Math.hypot(0.57, 0.62), tot = L1 + L2;
  const d = p * tot;
  ctx.beginPath();
  ctx.moveTo(cx + pts[0][0] * r, cy + pts[0][1] * r);
  if (d <= L1) { const f = d / L1; ctx.lineTo(cx + (pts[0][0] + (pts[1][0] - pts[0][0]) * f) * r, cy + (pts[0][1] + (pts[1][1] - pts[0][1]) * f) * r); }
  else {
    ctx.lineTo(cx + pts[1][0] * r, cy + pts[1][1] * r);
    const f = (d - L1) / L2;
    ctx.lineTo(cx + (pts[1][0] + (pts[2][0] - pts[1][0]) * f) * r, cy + (pts[1][1] + (pts[2][1] - pts[1][1]) * f) * r);
  }
  if (p > 0) ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Simple line icons drawn with strokes, sized to box s at (x,y) top-left. */
export function icon(ctx, name, x, y, s, color = C.muted, lw = Math.max(2, s * 0.08)) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s / 24, s / 24);
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = (lw * 24) / s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (name) {
    case 'mail': rr(ctx, 3, 5.5, 18, 13, 2.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4, 7); ctx.lineTo(12, 13); ctx.lineTo(20, 7); break;
    case 'calendar': rr(ctx, 3.5, 5, 17, 15.5, 2.5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(3.5, 10); ctx.lineTo(20.5, 10); ctx.moveTo(8, 3); ctx.lineTo(8, 7); ctx.moveTo(16, 3); ctx.lineTo(16, 7); break;
    case 'bell': ctx.moveTo(6, 16.5); ctx.lineTo(6, 11); ctx.bezierCurveTo(6, 7.5, 8.7, 5, 12, 5); ctx.bezierCurveTo(15.3, 5, 18, 7.5, 18, 11); ctx.lineTo(18, 16.5); ctx.lineTo(19.5, 18); ctx.lineTo(4.5, 18); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, 20.5); ctx.lineTo(14, 20.5); break;
    case 'chat': ctx.moveTo(4, 6.5); ctx.bezierCurveTo(4, 5.1, 5.1, 4, 6.5, 4); ctx.lineTo(17.5, 4); ctx.bezierCurveTo(18.9, 4, 20, 5.1, 20, 6.5); ctx.lineTo(20, 13.5); ctx.bezierCurveTo(20, 14.9, 18.9, 16, 17.5, 16); ctx.lineTo(10, 16); ctx.lineTo(6, 19.5); ctx.lineTo(6, 16); ctx.bezierCurveTo(4.9, 16, 4, 15.1, 4, 14); ctx.closePath(); break;
    case 'flow': ctx.arc(6, 6, 2.5, 0, 7); ctx.moveTo(20.5, 18); ctx.arc(18, 18, 2.5, 0, 7); ctx.moveTo(8.5, 6); ctx.lineTo(13, 6); ctx.bezierCurveTo(16, 6, 18, 8, 18, 11); ctx.lineTo(18, 15.5); break;
    case 'user': ctx.arc(12, 8.5, 4, 0, 7); ctx.moveTo(4.5, 20); ctx.bezierCurveTo(5.5, 16, 8.5, 14.5, 12, 14.5); ctx.bezierCurveTo(15.5, 14.5, 18.5, 16, 19.5, 20); break;
    case 'clock': ctx.arc(12, 12, 8.5, 0, 7); ctx.moveTo(12, 7.5); ctx.lineTo(12, 12); ctx.lineTo(15, 14); break;
    case 'arrow': ctx.moveTo(5, 12); ctx.lineTo(19, 12); ctx.moveTo(13.5, 6.5); ctx.lineTo(19, 12); ctx.lineTo(13.5, 17.5); break;
    case 'phone': ctx.moveTo(7, 3.5); ctx.lineTo(9.5, 3.5); ctx.lineTo(11, 8); ctx.lineTo(9, 9.5); ctx.bezierCurveTo(10, 12, 12, 14, 14.5, 15); ctx.lineTo(16, 13); ctx.lineTo(20.5, 14.5); ctx.lineTo(20.5, 17); ctx.bezierCurveTo(20.5, 19, 19, 20.5, 17, 20.5); ctx.bezierCurveTo(9.5, 20, 4, 14.5, 3.5, 7); ctx.bezierCurveTo(3.5, 5, 5, 3.5, 7, 3.5); break;
    case 'grid': rr(ctx, 4, 4, 7, 7, 1.5); ctx.moveTo(13, 4); rr(ctx, 13, 4, 7, 7, 1.5); rr(ctx, 4, 13, 7, 7, 1.5); rr(ctx, 13, 13, 7, 7, 1.5); break;
    case 'sheet': rr(ctx, 4, 4, 16, 16, 2); ctx.moveTo(4, 9.5); ctx.lineTo(20, 9.5); ctx.moveTo(4, 14.8); ctx.lineTo(20, 14.8); ctx.moveTo(10, 4); ctx.lineTo(10, 20); break;
    case 'task': rr(ctx, 4, 4, 16, 16, 3); break;
    case 'drop': ctx.moveTo(12, 3.5); ctx.bezierCurveTo(12, 3.5, 5.5, 10.5, 5.5, 14.5); ctx.bezierCurveTo(5.5, 18.1, 8.4, 21, 12, 21); ctx.bezierCurveTo(15.6, 21, 18.5, 18.1, 18.5, 14.5); ctx.bezierCurveTo(18.5, 10.5, 12, 3.5, 12, 3.5); ctx.closePath(); break;
    case 'spark': ctx.moveTo(12, 3); ctx.lineTo(13.8, 10.2); ctx.lineTo(21, 12); ctx.lineTo(13.8, 13.8); ctx.lineTo(12, 21); ctx.lineTo(10.2, 13.8); ctx.lineTo(3, 12); ctx.lineTo(10.2, 10.2); ctx.closePath(); break;
  }
  ctx.stroke();
  ctx.restore();
}

/** Dark glass panel fill used under every UI card. */
export function glassFill(ctx, W, H, r, { alpha = 0.66, edge = 0.14, glow = 0 } = {}) {
  rr(ctx, 1, 1, W - 2, H - 2, r);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(26,26,34,${alpha})`);
  g.addColorStop(1, `rgba(12,12,16,${alpha + 0.08})`);
  ctx.fillStyle = g; ctx.fill();
  // top sheen
  const s = ctx.createLinearGradient(0, 0, 0, H * 0.45);
  s.addColorStop(0, 'rgba(255,255,255,0.055)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s; ctx.fill();
  if (glow > 0) {
    const gg = ctx.createRadialGradient(W * 0.12, 0, 0, W * 0.12, 0, W * 0.9);
    gg.addColorStop(0, `rgba(189,166,255,${0.16 * glow})`); gg.addColorStop(1, 'rgba(189,166,255,0)');
    ctx.fillStyle = gg; ctx.fill();
  }
  // hairline edge, brighter on top
  const e = ctx.createLinearGradient(0, 0, 0, H);
  e.addColorStop(0, `rgba(255,255,255,${edge * 1.6})`); e.addColorStop(0.5, `rgba(255,255,255,${edge * 0.6})`); e.addColorStop(1, `rgba(255,255,255,${edge})`);
  ctx.strokeStyle = e; ctx.lineWidth = 2.5; rr(ctx, 1.5, 1.5, W - 3, H - 3, r - 1); ctx.stroke();
  if (glow > 0) { ctx.strokeStyle = `rgba(189,166,255,${0.55 * glow})`; ctx.lineWidth = 3; rr(ctx, 1.5, 1.5, W - 3, H - 3, r - 1); ctx.stroke(); }
}

export function label(ctx, s, x, y, { size = 20, color = C.dim, align = 'left' } = {}) {
  text(ctx, s.toUpperCase(), x, y, { size, weight: 500, family: 'Geist Mono', color, ls: size * 0.14, align });
}

/** Text that is typed in: shows the first n characters and a caret. */
export function typed(ctx, s, p, x, y, opts, caret = true, caretOn = true) {
  const n = Math.round(s.length * Math.max(0, Math.min(1, p)));
  const sub = s.slice(0, n);
  text(ctx, sub, x, y, opts);
  if (caret && caretOn) {
    const w = measure(ctx, sub, opts.size, opts.weight || 500, opts.family || 'Geist');
    ctx.fillStyle = opts.caretColor || '#2F6BFF';
    ctx.fillRect(x + w + 3, y - opts.size * 0.82, Math.max(2, opts.size * 0.07), opts.size * 1.0);
  }
}
