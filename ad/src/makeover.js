// 83 APPS — "Website makeover" film. A dated small-business site is pulled
// apart in 3D and rebuilt as a modern, mobile-first site, then a visitor
// books in one tap and requests start arriving (fictional example data).
// Same engine, look and render tooling as the main film (src/main.js).
import * as THREE from 'three';
import { Post } from './post.js';
import { buildEnvironment } from './env.js';
import { Ribbon } from './ribbon.js';
import { makeChrome, setPulses, makeInfinityGlass } from './materials.js';
import { Panel, Display, Phone } from './objects.js';
import { drawOldPage, drawOldBackground, OLD_BLOCKS, OLD } from './ui/oldsite.js';
import { drawNewPage, drawNewBackground, drawNewPhone, NEW_BLOCKS, NEW } from './ui/newsite.js';
import { drawOldPhone, drawChip, chipWidth, drawRequest } from './ui/makeover-cards.js';
import { rr } from './ui/draw.js';
import { Overlay } from './overlay.js';
import { clamp, lerp, invLerp, smooth, smoother, win, easeOutCubic, easeInOutCubic, easeInCubic, track, noise1, spline, resample, v3 } from './util.js';
import { M, COPY30, COPY15, remap, FPS, DURATION } from './makeover-timeline.js';

const q = new URLSearchParams(location.search);
const FORMAT = q.get('format') === 'landscape' ? 'landscape' : 'vertical';
const V = FORMAT === 'vertical';
const CUT = q.get('cut') === '15' ? 15 : 30;
const SCALE = +(q.get('scale') || 1);
const [W, H] = V ? [1080, 1920] : [1920, 1080];
const RW = Math.round(W * SCALE), RH = Math.round(H * SCALE);

// ------------------------------------------------------------------ renderer
const stage = document.getElementById('stage');
stage.style.width = W + 'px'; stage.style.height = H + 'px';
stage.style.transform = `scale(${SCALE})`;
document.body.classList.add(FORMAT);
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(RW, RH, false);
renderer.domElement.style.width = W + 'px';
renderer.domElement.style.height = H + 'px';
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.transmissionResolutionScale = 0.5;
stage.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#060608').convertSRGBToLinear();
scene.environment = buildEnvironment(renderer);
const post = new Post(renderer, RW, RH);
const camera = new THREE.PerspectiveCamera(V ? 30 : 23, W / H, 0.1, 80);

// ------------------------------------------------------------------ layout
const L = V ? {
  display: [v3(0, 0.3, -0.8), [0.01, -0.16, 0]],
  phone: [v3(0.52, -0.98, 0.5), [0.02, -0.2, 0]],
  E: v3(0, -0.35, -1.5), infA: 0.95,
  shiftY: -150, shiftX: 0,
  stackX: -0.5, chipSide: 1,
} : {
  display: [v3(0, 0.22, -0.6), [0.01, -0.14, 0]],
  phone: [v3(1.62, -0.42, 0.45), [0.02, -0.32, 0]],
  E: v3(0.62, 0.0, -1.3), infA: 1.25,
  shiftY: 0, shiftX: -300,
  stackX: -0.82, chipSide: 1,
};
const SW = 2.56, SH = 1.6; // display screen size (world units)
const U = 1 / 620;

// ------------------------------------------------------------------ devices
const snapOld = document.createElement('canvas'); snapOld.width = OLD.W; snapOld.height = OLD.H;
const snapNew = document.createElement('canvas'); snapNew.width = NEW.W; snapNew.height = NEW.H;
const MARQUEE = (t) => t * 95;

function drawScreen(ctx, cw, ch, st) {
  if (st.mode === 'old') drawOldPage(ctx, cw, ch, st);
  else if (st.mode === 'bg') {
    drawOldBackground(ctx, cw, ch);
    if (st.mix > 0) { ctx.globalAlpha = st.mix; drawNewBackground(ctx, cw, ch); ctx.globalAlpha = 1; }
  } else {
    drawNewPage(ctx, cw, ch, st);
    if (st.hi) highlight(ctx, st.hi);
  }
}
/** soft violet focus rings on the parts of the new page that answer questions up front */
function highlight(ctx, h) {
  const rects = [[900, 400, 380, 120], [56, 836, 1030, 104], [56, 612, 1488, 196]];
  rects.forEach((r, i) => {
    const a = clamp(h * 3 - i);
    if (a <= 0) return;
    ctx.save();
    ctx.globalAlpha = a;
    rr(ctx, r[0] - 10, r[1] - 10, r[2] + 20, r[3] + 20, 30);
    ctx.strokeStyle = '#8B6CFF'; ctx.lineWidth = 6; ctx.stroke();
    rr(ctx, r[0] - 18, r[1] - 18, r[2] + 36, r[3] + 36, 36);
    ctx.strokeStyle = 'rgba(139,108,255,0.25)'; ctx.lineWidth = 10; ctx.stroke();
    ctx.restore();
  });
}

const display = new Display({ w: SW, h: SH, px: [OLD.W, OLD.H], draw: drawScreen });
scene.add(display.group);

function drawPhoneScreen(ctx, cw, ch, st) {
  if (st.mode === 'old') drawOldPhone(ctx, cw, ch, st);
  else if (st.mode === 'new') drawNewPhone(ctx, cw, ch, st);
  else {
    // scan-line swap old → new
    drawOldPhone(ctx, cw, ch, st.old);
    const y = ch * st.p;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cw, y); ctx.clip();
    drawNewPhone(ctx, cw, ch, st.nw);
    ctx.restore();
    const g = ctx.createLinearGradient(0, y - 60, 0, y + 6);
    g.addColorStop(0, 'rgba(189,166,255,0)'); g.addColorStop(1, 'rgba(189,166,255,0.9)');
    ctx.fillStyle = g; ctx.fillRect(0, y - 60, cw, 66);
  }
}
const phone = new Phone({ h: 1.62, px: [780, 1690], draw: drawPhoneScreen });
scene.add(phone.group);

// ------------------------------------------------------------------ rebuild blocks
const texOld = new THREE.CanvasTexture(snapOld), texNew = new THREE.CanvasTexture(snapNew);
[texOld, texNew].forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; });
const edgeMat = new THREE.MeshPhysicalMaterial({ color: '#1c1d22', metalness: 0.9, roughness: 0.25, clearcoat: 1, envMapIntensity: 1.2 });
const PAIRS = [['header', 'nav'], ['nav', 'footer'], ['photo', 'image'], ['text', 'hero'], ['coupon', 'services'], ['footer', 'band']];
const toLocal = ([x, y, w, h]) => ({ x: (x + w / 2) / OLD.W * SW - SW / 2, y: SH / 2 - (y + h / 2) / OLD.H * SH, w: w / OLD.W * SW, h: h / OLD.H * SH });
function uvPlane([x, y, w, h], tex) {
  const g = new THREE.PlaneGeometry(1, 1);
  const u0 = x / OLD.W, u1 = (x + w) / OLD.W, v0 = 1 - (y + h) / OLD.H, v1 = 1 - y / OLD.H;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
}
const blocks = PAIRS.map(([o, n], i) => {
  const group = new THREE.Group();
  const front = uvPlane(OLD_BLOCKS[o], texOld);
  const back = uvPlane(NEW_BLOCKS[n], texNew);
  front.position.z = 0.008;
  back.position.z = -0.008; back.rotation.y = Math.PI;
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.998, 0.998, 0.014), edgeMat);
  group.add(front, back, edge);
  display.group.add(group);
  return { group, front, back, edge, from: toLocal(OLD_BLOCKS[o]), to: toLocal(NEW_BLOCKS[n]), dir: i % 2 ? -1 : 1, i };
});

// ------------------------------------------------------------------ callouts & requests
const measureCtx = document.createElement('canvas').getContext('2d');
const mkChip = (kind, text) => new Panel({ px: [chipWidth(measureCtx, text), 110], unit: U, draw: drawChip, radiusPx: 55, depth: 0.03 });
const painChips = [['Slow to load', [-0.1, 0.5, 0.3]], ['Tiny text on phones', [0.08, 0.02, 0.34]], ['Phone number buried', [-0.06, -0.46, 0.32]]]
  .map(([t, pos]) => ({ panel: mkChip('bad', t), text: t, pos }));
painChips.forEach((c) => phone.group.add(c.panel.group));
const requests = [0, 1, 2].map(() => new Panel({ px: [1000, 190], unit: U, draw: drawRequest, radiusPx: 40, depth: 0.035 }));
requests.forEach((r) => phone.group.add(r.group));

// ------------------------------------------------------------------ ribbons
const heroMat = makeChrome({ pulseColor: '#a9bcff' });
const hero = new Ribbon({ rings: 460, width: 0.19, thickness: 0.016, material: heroMat, taper: 0.07, samples: 800 });
scene.add(hero.mesh);
const N = 800;
const dP = L.display[0];
const scanPath = resample(spline([v3(-3.4, 1.9, -1.4), v3(-1.9, 1.2, -0.35), v3(-0.4, 0.55, -0.12), v3(1.1, -0.15, -0.18), v3(2.4, -0.8, -0.45), v3(3.8, -1.5, -1.4)].map((p) => v3(p.x * (V ? 0.6 : 1), p.y * (V ? 0.9 : 1), p.z).add(v3(dP.x, dP.y - 0.25, dP.z + 0.6))), 400), N);
const bgPath = resample(spline((V
  ? [[-2.4, 2.4, -2.4], [-1.3, 1.6, -1.8], [0.9, 1.4, -1.9], [1.7, 0.2, -1.6], [0.6, -0.6, -1.2], [-1.0, -1.3, -0.9], [-0.2, -2.5, -0.4], [2.2, -3.1, -1.2]]
  : [[-3.4, 1.6, -2.4], [-1.8, 1.25, -1.9], [0.4, 1.35, -1.9], [1.9, 0.6, -1.7], [2.7, -0.3, -1.0], [1.4, -1.0, -0.8], [-0.6, -1.2, -1.2], [3.2, -1.9, -1.4]]
).map(([x, y, z]) => v3(x, y, z)), 400), N);
const heroPts = Array.from({ length: N }, () => new THREE.Vector3());
const lerpPts = (a, b, w) => { for (let i = 0; i < N; i++) heroPts[i].lerpVectors(a[i], b[i], w); return heroPts; };

const band = new Ribbon({ rings: 460, capSeg: 8, width: 0.4 * L.infA, thickness: 0.07 * L.infA, material: makeInfinityGlass(), closed: true, taper: 0.08, samples: 900 });
const rail2 = new Ribbon({ rings: 460, capSeg: 6, width: 0.052 * L.infA, thickness: 0.052 * L.infA, material: makeChrome({ roughness: 0.08 }), closed: true, taper: 0.05, samples: 900 });
scene.add(band.mesh, rail2.mesh);
function lemniscate(a, n = 600) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2, d = 1 + Math.sin(th) ** 2;
    pts.push(v3((a * Math.cos(th)) / d, ((a * Math.sin(th) * Math.cos(th)) / d) * 1.12, 0.27 * a * Math.sin(th)));
  }
  pts.push(pts[0].clone());
  return pts;
}
band.setPath(lemniscate(L.infA), v3(0, 0, 1));
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _W = new THREE.Vector3(), _B = new THREE.Vector3();
const railBuf = { 1: Array.from({ length: 900 }, () => new THREE.Vector3()), [-1]: Array.from({ length: 900 }, () => new THREE.Vector3()) };
function railPath(side, twist, origin) {
  const out = railBuf[side], off = band.width / 2 + rail2.width * 0.2;
  for (let k = 0; k < 900; k++) {
    const s = k / 899;
    band._sample(s, _P, _T, _W, _B);
    const th = twist(s), c = Math.cos(th), sn = Math.sin(th);
    out[k].set(_P.x + (_W.x * c + _B.x * sn) * off * side, _P.y + (_W.y * c + _B.y * sn) * off * side, _P.z + (_W.z * c + _B.z * sn) * off * side);
    if (origin) out[k].add(origin);
  }
  return origin ? resample(out, N) : out;
}

// ------------------------------------------------------------------ camera
const TAN = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
function shot(t, tg, frameH, { az = 0, el = 0, ap = 0.5, sx = L.shiftX, sy = L.shiftY } = {}) {
  const d = frameH / TAN;
  return { t, v: [tg[0] + Math.sin(az) * Math.cos(el) * d, tg[1] + Math.sin(el) * d, tg[2] + Math.cos(az) * Math.cos(el) * d, ...tg, ap, sx, sy] };
}
const at = (p, x = 0, y = 0, z = 0) => [p.x + x, p.y + y, p.z + z];
const pP = L.phone[0], E = L.E;
// point on the display surface from canvas px
const onScreen = (px, py) => { display.group.updateMatrixWorld(true); const w = display.group.localToWorld(v3((px / OLD.W - 0.5) * SW, (0.5 - py / OLD.H) * SH, 0)); return [w.x, w.y, w.z]; };
const CAM = V ? [
  shot(0.0, onScreen(560, 92), 0.62, { az: -0.34, el: 0.06, ap: 2.0, sy: 0 }),
  shot(1.6, at(dP, 0.0, -0.05), 4.75, { az: -0.1, el: 0.03, ap: 0.6, sy: -280 }),
  shot(2.75, at(dP, 0.15, -0.4, 0.3), 5.0, { az: -0.04, el: 0.02, ap: 0.6, sy: -250 }),
  shot(3.85, at(pP, 0.02), 2.85, { az: -0.1, el: 0.01, ap: 0.9, sy: -215 }),
  shot(6.45, at(pP, 0.02, -0.02), 2.75, { az: -0.13, el: 0.0, ap: 0.9, sy: -215 }),
  shot(7.6, at(dP, 0.0, -0.05), 4.55, { az: -0.08, el: 0.02, ap: 0.5, sy: -60 }),
  shot(8.9, at(dP, 0.0, -0.05, 0.35), 4.4, { az: 0.46, el: 0.16, ap: 0.6, sy: -60 }),
  shot(10.0, at(dP, 0.0, -0.05), 4.45, { az: -0.07, el: 0.02, ap: 0.5, sy: -170 }),
  shot(11.8, at(dP, 0.0, -0.05), 4.4, { az: -0.1, el: 0.01, ap: 0.5, sy: -170 }),
  shot(12.6, at(dP, 0.28, -0.55, 0.4), 4.6, { az: 0.02, el: 0.02, ap: 0.6 }),
  shot(13.45, at(dP, 0.22, -0.55, 0.4), 4.5, { az: -0.04, el: 0.01, ap: 0.6 }),
  shot(14.55, at(pP, 0.02), 2.85, { az: -0.1, el: 0.01, ap: 0.9, sy: -215 }),
  shot(19.6, at(pP, 0.02, -0.02), 2.75, { az: -0.13, el: 0.0, ap: 0.9, sy: -215 }),
  shot(20.6, at(pP, -0.36, 0.0, 0.1), 3.75, { az: -0.02, el: 0.02, ap: 0.7, sy: -175 }),
  shot(23.1, at(pP, -0.34, -0.02, 0.1), 3.65, { az: -0.08, el: 0.0, ap: 0.7, sy: -175 }),
  shot(24.4, at(E), 4.7, { az: 0.06, el: 0.05, ap: 0.4 }),
  shot(25.9, at(E), 4.5, { az: -0.05, el: 0.02, ap: 0.4 }),
  shot(27.4, at(E, 0, 0.45), 6.2, { az: 0, el: 0.02, ap: 1.0, sy: 0 }),
  shot(30.0, at(E, 0, 0.45), 6.35, { az: 0, el: 0.02, ap: 1.0, sy: 0 }),
] : [
  shot(0.0, onScreen(560, 92), 0.5, { az: -0.34, el: 0.06, ap: 2.0, sx: 0 }),
  shot(1.6, at(dP, 0.3, -0.1, 0.2), 2.95, { az: -0.1, el: 0.03, ap: 0.6, sx: -500 }),
  shot(2.75, at(dP, 0.5, -0.2, 0.3), 3.15, { az: -0.06, el: 0.02, ap: 0.6, sx: -480 }),
  shot(3.85, at(pP, 0.0), 2.05, { az: -0.22, el: 0.01, ap: 0.9, sx: -380 }),
  shot(6.45, at(pP, 0.0, -0.02), 1.98, { az: -0.26, el: 0.0, ap: 0.9, sx: -380 }),
  shot(7.6, at(dP, 0.0, -0.02), 2.55, { az: -0.1, el: 0.02, ap: 0.5, sx: -120 }),
  shot(8.9, at(dP, 0.0, -0.02, 0.35), 2.95, { az: 0.44, el: 0.15, ap: 0.6, sx: -120 }),
  shot(10.0, at(dP, 0.0, -0.02), 2.95, { az: -0.08, el: 0.02, ap: 0.5, sx: -420 }),
  shot(11.8, at(dP, 0.0, -0.02), 2.9, { az: -0.11, el: 0.01, ap: 0.5, sx: -420 }),
  shot(12.6, at(dP, 0.62, -0.25, 0.4), 3.15, { az: 0.0, el: 0.02, ap: 0.6, sx: -400 }),
  shot(13.45, at(dP, 0.58, -0.25, 0.4), 3.1, { az: -0.05, el: 0.01, ap: 0.6, sx: -400 }),
  shot(14.55, at(pP, 0.0), 2.05, { az: -0.22, el: 0.01, ap: 0.9, sx: -380 }),
  shot(19.6, at(pP, 0.0, -0.02), 1.98, { az: -0.26, el: 0.0, ap: 0.9, sx: -380 }),
  shot(20.6, at(pP, -0.5, 0.02, 0.1), 2.45, { az: -0.1, el: 0.02, ap: 0.7, sx: -330 }),
  shot(23.1, at(pP, -0.5, 0.0, 0.1), 2.4, { az: -0.14, el: 0.0, ap: 0.7, sx: -330 }),
  shot(24.4, at(E, -0.25), 4.2, { az: 0.06, el: 0.05, ap: 0.4 }),
  shot(25.9, at(E, -0.25), 4.05, { az: -0.05, el: 0.02, ap: 0.4 }),
  shot(27.4, at(E, 0, 0.2), 4.3, { az: 0, el: 0.02, ap: 1.2, sx: 0 }),
  shot(30.0, at(E, 0, 0.2), 4.4, { az: 0, el: 0.02, ap: 1.2, sx: 0 }),
];

// ------------------------------------------------------------------ overlay
const COPY = CUT === 15 ? COPY15 : COPY30;
const overlay = new Overlay(document.getElementById('overlay'), { format: FORMAT, blocks: COPY.blocks, endcard: COPY.endcard });

// ------------------------------------------------------------------ helpers
function place(obj, [pos, rot]) { obj.position.copy(pos); obj.rotation.set(rot[0], rot[1], rot[2]); obj.scale.setScalar(1); }
function drift(obj, t, seed, amp = 1) {
  obj.position.y += noise1(t * 0.35 + seed * 13.1) * 0.02 * amp;
  obj.position.x += noise1(t * 0.3 + seed * 7.7) * 0.012 * amp;
  obj.rotation.x += noise1(t * 0.25 + seed * 3.3) * 0.015 * amp;
  obj.rotation.y += noise1(t * 0.22 + seed * 5.9) * 0.02 * amp;
}
const bump = (t, c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
const tokenPos = new THREE.Vector3();

// ------------------------------------------------------------------ frame
function update(T) {
  // ---------- devices
  place(display.group, L.display); drift(display.group, T, 1, 0.5);
  place(phone.group, L.phone); drift(phone.group, T, 2, 0.6);
  const out = win(T, M.brand[0], M.brand[0] + 1.1, easeInOutCubic);
  display.group.position.z -= out * 1.4; display.group.position.y += out * 0.15;
  phone.group.position.z -= out * 1.1; phone.group.position.y -= out * 0.1;
  const devO = smooth(invLerp(0, 0.4, T)) * (1 - smooth(invLerp(M.brand[0] + 0.3, M.brand[0] + 1.1, T)));
  display.setOpacity(devO); phone.setOpacity(devO);
  // dim the desktop while the phone is the subject (it sits behind the headline)
  const dim = Math.max(win(T, 3.3, 3.9) * (1 - win(T, 6.55, 7.65)), win(T, 13.75, 14.6) * (1 - win(T, M.brand[0], M.brand[0] + 0.6)));
  display.screenMat.color.setScalar(1 - (V ? 0.82 : 0.9) * dim);
  display.group.updateMatrixWorld(true);

  // ---------- display screen + rebuild blocks
  const [r0, r1] = M.rebuild;
  if (T < r0) display.update({ mode: 'old', marquee: Math.round(MARQUEE(T)), blink: Math.floor(T * 2.5) % 2 === 0, load: 1, counter: 4821 });
  else if (T < r1) display.update({ mode: 'bg', mix: +win(T, r0 + 0.6, r0 + 1.6).toFixed(3) });
  else display.update({ mode: 'new', glint: +invLerp(M.glint[0], M.glint[1], T).toFixed(3) });
  const rebuilding = T >= r0 && T < r1;
  blocks.forEach((b) => {
    b.group.visible = rebuilding && devO > 0.01;
    if (!b.group.visible) return;
    const tl = r0 + b.i * 0.1;
    const e1 = easeOutCubic(invLerp(tl, tl + 0.5, T));
    const e2 = easeInOutCubic(invLerp(tl + 0.35, tl + 1.3, T));
    const e3 = easeInOutCubic(invLerp(tl + 1.2, tl + 1.5, T));
    const lift = (0.55 + 0.12 * b.i) * e1;
    const mx = lerp(b.from.x, b.to.x, e2), my = lerp(b.from.y, b.to.y, e2);
    const rl = Math.hypot(mx, my) || 1, spread = 0.38 * Math.sin(Math.min(1, e1 * 0.6 + e2 * 0.7) * Math.PI) * (1 - e3);
    const x = mx + (mx / rl) * spread, y = my + (my / rl) * spread * 0.8;
    const z = 0.009 + lift * (1 - e3) + Math.sin(e2 * Math.PI) * 0.22 * (1 - e3);
    b.group.position.set(x, y, z);
    const ang = b.dir * Math.PI * e2;
    b.group.rotation.set(0.22 * Math.sin(e1 * Math.PI / 2) * (1 - e3), ang, 0.07 * Math.sin(e2 * Math.PI) * b.dir);
    const flipped = Math.abs(ang) > Math.PI / 2;
    const sz = flipped ? b.to : b.from;
    b.group.scale.set(sz.w, sz.h, 1);
  });

  // ---------- phone screen
  const P = M;
  if (T < P.phoneSwap[0]) {
    const pinch = easeInOutCubic(invLerp(P.pinch[0], P.pinch[1], T));
    const hunt = easeInOutCubic(invLerp(P.hunt[0], P.hunt[1], T));
    const zoom = lerp(1, 2.6, pinch);
    // pan: header → text wall → down to the buried footer
    const panX = lerp(lerp(0, 700, pinch), 520, hunt), panY = lerp(lerp(0, 230, pinch), 700, hunt);
    const leave = easeInOutCubic(invLerp(P.leave[0], P.leave[1], T));
    const tA = bump(T, (P.pinch[0] + P.pinch[1]) / 2, 0.55);
    const touches = [];
    if (tA > 0) { const s = lerp(60, 230, pinch); touches.push([390 - s, 900 - s * 0.6, tA], [390 + s, 900 + s * 0.6, tA]); }
    const hA = bump(T, (P.hunt[0] + P.hunt[1]) / 2, 0.6);
    if (hA > 0) touches.push([420, lerp(1200, 700, hunt), hA]);
    const lA = bump(T, (P.leave[0] + P.leave[1]) / 2, 0.4);
    if (lA > 0) touches.push([lerp(20, 640, leave), 980, lA]);
    const oldSt = {
      zoom: +zoom.toFixed(3), panX: Math.round(panX), panY: Math.round(panY), load: +invLerp(P.load[0], P.load[1], T).toFixed(3),
      spinner: +(bump(T, (P.load[0] + P.load[1]) / 2, 0.45) * 1).toFixed(2), spinPhase: +(T * 9).toFixed(2),
      marquee: Math.round(MARQUEE(T)), touches: touches.map((a) => a.map((v) => +v.toFixed(2))), leave: +leave.toFixed(3),
    };
    // after leaving, the screen shows the search results; the swap later rebuilds the site
    phone.update({ mode: 'old', ...oldSt });
  } else if (T < P.phoneSwap[1]) {
    phone.update({ mode: 'swap', p: +easeInOutCubic(invLerp(P.phoneSwap[0], P.phoneSwap[1], T)).toFixed(3), old: { leave: 1 }, nw: {} });
  } else {
    // benefits: scroll to show the page adapts; then tap Book → sheet → send
    const sc = win(T, 12.4, 13.3) * (1 - win(T, 13.6, 14.4));
    const tapP = invLerp(P.tapBook - 0.05, P.tapBook + 0.4, T);
    const st = {
      scroll: Math.round(sc * 520),
      tapBook: +clamp(tapP).toFixed(2),
      sheet: +win(T, P.sheet[0], P.sheet[1], easeOutCubic).toFixed(3),
      svc: +win(T, P.svc, P.svc + 0.2).toFixed(2), when: +win(T, P.when, P.when + 0.2).toFixed(2),
      name: +win(T, P.name[0], P.name[1], (x) => x).toFixed(2), send: +clamp(invLerp(P.send, P.send + 0.35, T)).toFixed(2),
      sent: +win(T, P.sent[0], P.sent[1]).toFixed(3),
      hi: +(win(T, 14.25, 15.3, (x) => x) * (1 - win(T, 15.9, 16.3))).toFixed(3),
    };
    let tap = null;
    if (T < P.svc - 0.1) tap = [390, 862, tapP];
    else if (T < P.when - 0.05) tap = [150, 1690 - 1090 + 272, invLerp(P.svc - 0.05, P.svc + 0.35, T)];
    else if (T < P.name[0]) tap = [170, 1690 - 1090 + 412, invLerp(P.when - 0.05, P.when + 0.35, T)];
    else tap = [390, 1690 - 1090 + 708, invLerp(P.send - 0.05, P.send + 0.4, T)];
    st.tap = tap.map((v) => +(+v).toFixed(2));
    phone.update({ mode: 'new', ...st });
  }

  // ---------- pain callouts (attached to the phone)
  painChips.forEach((c, i) => {
    const t0 = P.chips[i];
    const p = easeOutCubic(invLerp(t0, t0 + 0.45, T));
    const o = smooth(invLerp(t0, t0 + 0.3, T)) * (1 - smooth(invLerp(6.55, 6.95, T)));
    c.panel.group.position.set(c.pos[0], c.pos[1] - (1 - p) * 0.06, c.pos[2] + (1 - p) * 0.15);
    c.panel.group.rotation.set(0, 0.12 * (c.pos[0] < 0 ? 1 : -1), 0);
    c.panel.group.scale.setScalar(lerp(0.85, 1, p) * (V ? 1 : 0.9));
    c.panel.setOpacity(o);
    c.panel.update({ kind: 'bad', text: c.text });
  });

  // ---------- incoming requests: the first flies out of the phone, more follow
  const arrived = P.requests.map((t0) => T >= t0);
  requests.forEach((r, k) => {
    const t0 = P.requests[k];
    const p = easeInOutCubic(invLerp(t0, t0 + 0.6, T));
    const slot = P.requests.slice(k + 1).reduce((s, tk) => s + easeInOutCubic(invLerp(tk, tk + 0.45, T)), 0);
    const dst = v3(L.stackX, 0.42 - slot * (V ? 0.33 : 0.37), 0.28);
    const src = k === 0 ? v3(0, -0.2, 0.05) : v3(L.stackX - 0.2, 1.3, 0.5);
    const pos = src.clone().lerp(dst, p);
    pos.z += Math.sin(p * Math.PI) * 0.3;
    r.group.position.copy(pos);
    r.group.rotation.set(0.05 * Math.sin(p * Math.PI), 0.18 - 0.1 * p, 0);
    r.group.scale.setScalar((k === 0 ? lerp(0.3, 0.8, p) : 0.8) * (V ? 0.86 : 0.92));
    const o = (k === 0 ? smooth(invLerp(t0, t0 + 0.15, T)) : smooth(invLerp(t0, t0 + 0.3, T))) * (1 - win(T, M.brand[0], M.brand[0] + 0.7));
    r.setOpacity(T >= t0 ? o : 0);
    r.update({ i: k, glow: +bump(T, t0 + 0.6, 0.6).toFixed(2) });
  });

  // ---------- hero ribbon: scan sweep, background thread, then the infinity
  const settle = win(T, 25.55, 27.2, easeInOutCubic);
  const Ec = E.clone().add((V ? v3(0, -2.35, -2.6) : v3(0.0, -4.2, -3.0)).multiplyScalar(settle));
  const phase = T * 0.75;
  const bandTwist = (s) => s * Math.PI * 2 + phase;
  const mE = win(T, M.brand[0], M.brand[1] - 0.1, easeInOutCubic);
  const scanP = invLerp(M.scan[0], M.scan[1], T);
  const scanning = T < M.scan[1] + 0.05;
  let range = [0, 1];
  if (T < M.scan[1] + 0.05) {
    hero.setPath(scanPath, v3(0.1, 0.55, 1).normalize());
    const head = lerp(0.02, 1.5, smooth(scanP));
    range = [clamp(head - 0.5), clamp(head)];
    hero.mesh.visible = scanP > 0 && range[1] - range[0] > 0.004;
  } else {
    hero.setPath(mE > 0 ? lerpPts(bgPath, railPath(1, bandTwist, Ec), mE) : bgPath);
    const g = win(T, r1 - 0.2, r1 + 1.2, easeOutCubic);
    range = [0, g];
    hero.mesh.visible = g > 0.002;
  }
  hero.width = lerp(0.19, rail2.width, mE); hero.thickness = lerp(0.016, rail2.width, mE); hero.taper = lerp(0.07, 0, mE);
  if (hero.mesh.visible) hero.build({ range, twist: scanning ? (s) => 0.35 * Math.sin(s * 9 + T * 3) : (s) => s * Math.PI * 2 * 2.2 * (1 - mE) + T * 0.8 });
  const hp = [];
  if (scanning && scanP > 0 && scanP < 1) { const hd = lerp(0.02, 1.5, smooth(scanP)); hp.push([hd - 0.04, 0.05, 2.6], [hd - 0.2, 0.12, 0.7]); }
  const lp = invLerp(r1 - 0.1, r1 + 1.0, T);
  if (lp > 0 && lp < 1) hp.push([lerp(0, 1, lp), 0.06, 2.2 * Math.sin(lp * Math.PI)]);
  P.requests.forEach((t0) => { const q = invLerp(t0, t0 + 0.8, T); if (q > 0 && q < 1) hp.push([lerp(0.1, 0.9, q), 0.05, 1.8 * Math.sin(q * Math.PI)]); });
  const ep = invLerp(M.brand[1] - 0.2, M.brand[1] + 1.4, T);
  if (ep > 0 && ep < 1) hp.push([ep, 0.08, 1.6 * Math.sin(ep * Math.PI)]);
  setPulses(heroMat, hp.slice(0, 4));

  const ig = win(T, M.brand[0] + 0.35, M.brand[1] + 0.2, easeInOutCubic);
  band.mesh.visible = rail2.mesh.visible = ig > 0.001;
  if (ig > 0.001) {
    band.mesh.position.copy(Ec); rail2.mesh.position.copy(Ec);
    const c = 0.25, rg = ig >= 0.999 ? [0, 1] : [c - ig / 2, c + ig / 2];
    band.build({ range: rg, twist: bandTwist });
    band.mesh.material.userData.uniforms.uPhase.value = T * 0.35;
    rail2.setPath(railPath(-1, bandTwist, null));
    rail2.build({ range: rg });
  }

  // ---------- camera
  const cv = track(CAM, T);
  camera.position.set(cv[0] + noise1(T * 0.4 + 3) * 0.02, cv[1] + noise1(T * 0.37 + 9) * 0.016, cv[2]);
  camera.lookAt(cv[3], cv[4], cv[5]);
  camera.setViewOffset(W, H, cv[7], cv[8], W, H);
  camera.updateProjectionMatrix();
  const focus = camera.position.distanceTo(new THREE.Vector3(cv[3], cv[4], cv[5]));
  return { focus, aperture: cv[6] * 40 * SCALE, maxCoc: 16 * SCALE };
}

// ------------------------------------------------------------------ public API
async function init() {
  await Promise.all(['400', '500', '600', '650', '700'].map((w) => document.fonts.load(`${w} 40px "Geist"`)));
  await document.fonts.load('500 20px "Geist Mono"');
  await Promise.all(['400 20px "Tinos"', '700 20px "Tinos"', 'italic 700 20px "Tinos"', '400 20px "Comic Neue"', '700 20px "Comic Neue"'].map((f) => document.fonts.load(f)));
  const img = document.querySelector('.end .logo');
  if (!img.complete) await new Promise((r) => (img.onload = r));
  await document.fonts.ready;
  drawOldPage(snapOld.getContext('2d'), OLD.W, OLD.H, { marquee: Math.round(MARQUEE(M.rebuild[0])), blink: true, load: 1, counter: 4821 });
  drawNewPage(snapNew.getContext('2d'), NEW.W, NEW.H, {});
  texOld.needsUpdate = texNew.needsUpdate = true;
}

function renderAt(tOut) {
  const T = remap(CUT, tOut);
  const dof = update(T);
  overlay.update(tOut);
  const frame = Math.round(tOut * FPS);
  post.render(scene, camera, { ...dof, seed: (frame % 97) * 0.731, bloom: 0.22, fade: smooth(invLerp(0, 0.35, tOut)) });
}

window.AD = { renderAt, duration: DURATION[CUT], fps: FPS, format: FORMAT, cut: CUT, film: 'makeover', size: [W, H], ready: init().then(() => true) };

if (q.get('preview')) {
  const bar = document.createElement('div');
  bar.id = 'controls';
  bar.innerHTML = `<button id="pp">Pause</button><input id="sc" type="range" min="0" max="${DURATION[CUT]}" step="0.001" value="0"><span id="tt">0.00</span>`;
  document.body.appendChild(bar);
  const fit = () => { const s = Math.min(innerWidth / W, (innerHeight - 50) / H); stage.style.transform = `scale(${s})`; };
  fit(); addEventListener('resize', fit);
  let playing = true, t0 = performance.now() / 1000 - (+q.get('t') || 0);
  const sc = bar.querySelector('#sc'), tt = bar.querySelector('#tt');
  bar.querySelector('#pp').onclick = (e) => { playing = !playing; e.target.textContent = playing ? 'Pause' : 'Play'; t0 = performance.now() / 1000 - +sc.value; };
  sc.oninput = () => { playing = false; };
  window.AD.ready.then(() => {
    const loop = () => { const t = playing ? (performance.now() / 1000 - t0) % DURATION[CUT] : +sc.value; if (playing) sc.value = t; tt.textContent = t.toFixed(2); renderAt(t); requestAnimationFrame(loop); };
    loop();
  });
}
