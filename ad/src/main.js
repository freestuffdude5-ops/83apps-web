// 83 APPS — 3D advertisement. Director: builds the world once, then
// renderAt(t) poses every object, camera and text layer for time t.
// URL params: format=vertical|landscape, cut=30|15, scale=0.5 (preview size),
// preview=1 (interactive scrubber), t=12.3 (open at a time).
import * as THREE from 'three';
import { Post } from './post.js';
import { buildEnvironment } from './env.js';
import { Ribbon } from './ribbon.js';
import { makeChrome, setPulses, makeInfinityGlass } from './materials.js';
import { Panel, Display, Phone } from './objects.js';
import * as cards from './ui/cards.js';
import { drawDesktop, drawPhone, DESKTOP_TARGETS, PHONE_TARGETS } from './ui/site.js';
import { Overlay } from './overlay.js';
import { clamp, lerp, invLerp, smooth, smoother, win, easeOutCubic, easeInOutCubic, easeInCubic, track, noise1, spline, resample, v3 } from './util.js';
import { K, COPY30, COPY15, remap, FPS, DURATION } from './timeline.js';

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
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // final grade pass encodes sRGB itself
renderer.transmissionResolutionScale = 0.5;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#060608').convertSRGBToLinear();
scene.environment = buildEnvironment(renderer);
scene.environmentIntensity = 1;
const post = new Post(renderer, RW, RH);
const camera = new THREE.PerspectiveCamera(V ? 30 : 23, W / H, 0.1, 80);

// ------------------------------------------------------------------ layout
// Set centres. Vertical travels downward between scenes, landscape travels right.
const A = v3(0, 0, 0);
const C = V ? v3(0, -7, -1) : v3(8.5, 0, -1);
const D = V ? v3(0, -14, -1) : v3(17, 0, -1);
const E = V ? v3(0, -14.1, -2.2) : v3(17.1, 0, -2.2);
const P = (base, x, y, z) => base.clone().add(v3(x, y, z));

const L = V ? {
  frag: { inquiry: [P(A, -0.18, 0.98, 0.4), [0.05, 0.26, -0.035]], sheet: [P(A, 0.22, -0.06, -0.35), [0.02, -0.27, 0.025]], task: [P(A, -0.28, -1.05, 0.6), [-0.05, 0.21, 0.03]] },
  display: [P(A, 0.92, -0.32, -1.6), [0.02, -0.3, 0]],
  phone: [P(A, -0.5, -0.46, 0.5), [0.02, 0.3, 0]],
  board: [P(C, 0, 0.56, -0.35), [0.03, -0.1, 0]],
  record: [P(C, 0.1, -0.62, 0.5), [0, 0.09, 0], 0.82],
  trigger: [P(D, -0.1, 0.95, 0.25), [0.02, 0.12, 0], 0.95],
  actions: [[P(D, 0.18, 0.3, 0), [0, -0.1, 0], 0.9], [P(D, 0.18, -0.36, 0), [0, -0.1, 0], 0.9], [P(D, 0.18, -1.02, 0), [0, -0.1, 0], 0.9]],
  wireFrom: (i) => P(D, -0.78, 0.85, 0.2),
  wireTo: (i) => P(D, -0.53, 0.3 - i * 0.66, 0.05),
  shiftY: -150, shiftX: 0,
  infA: 0.95,
} : {
  frag: { inquiry: [P(A, -0.55, 0.62, 0.35), [0.05, 0.28, -0.035]], sheet: [P(A, 0.62, 0.05, -0.4), [0.02, -0.27, 0.025]], task: [P(A, -0.4, -0.72, 0.6), [-0.05, 0.22, 0.03]] },
  display: [P(A, -0.05, 0.12, -0.8), [0.02, -0.18, 0]],
  phone: [P(A, 1.52, -0.32, 0.35), [0.02, -0.34, 0]],
  board: [P(C, -0.3, 0.3, -0.4), [0.03, 0.12, 0]],
  record: [P(C, 0.95, -0.22, 0.5), [0, -0.16, 0], 0.9],
  trigger: [P(D, -1.1, 0.02, 0.25), [0.02, 0.18, 0], 0.9],
  actions: [[P(D, 1.0, 0.75, 0), [0, -0.14, 0], 0.9], [P(D, 1.0, 0.0, 0.05), [0, -0.14, 0], 0.9], [P(D, 1.0, -0.75, 0), [0, -0.14, 0], 0.9]],
  wireFrom: (i) => P(D, -0.4, 0.02, 0.25),
  wireTo: (i) => P(D, 0.3, 0.75 - i * 0.75, 0.02),
  shiftY: 0, shiftX: -300,
  infA: 1.3,
};

// ------------------------------------------------------------------ objects
const U = 1 / 620; // world units per UI canvas pixel
function place(obj, [pos, rot, s0 = 1], s = 1) { obj.position.copy(pos); obj.rotation.set(rot[0], rot[1], rot[2]); obj.scale.setScalar(s * s0); }

const frag = {
  inquiry: new Panel({ px: [900, 380], unit: U, draw: cards.drawInquiry }),
  sheet: new Panel({ px: [1000, 530], unit: U, draw: cards.drawSheet }),
  task: new Panel({ px: [660, 300], unit: U, draw: cards.drawTask }),
};
Object.values(frag).forEach((p) => scene.add(p.group));

const display = new Display({ w: 2.56, h: 1.6, px: [1600, 1000], draw: drawDesktop });
const phone = new Phone({ h: 1.62, px: [780, 1690], draw: drawPhone });
scene.add(display.group, phone.group);

const token = new Panel({ px: [760, 210], unit: U, draw: cards.drawToken, radiusPx: 40 });
const board = new Panel({ px: [1520, 700], unit: U, draw: cards.drawBoard });
const record = new Panel({ px: [1000, 930], unit: U, draw: cards.drawRecord, radiusPx: 48 });
const trigger = new Panel({ px: [1000, 270], unit: U, draw: cards.drawTrigger });
const actions = [0, 1, 2].map((i) => new Panel({ px: [1000, 330], unit: U, draw: cards.drawAction }));
[token, board, record, trigger, ...actions].forEach((p) => scene.add(p.group));

// hero chrome ribbon: the connective thread of the whole film
const heroMat = makeChrome({ pulseColor: '#a9bcff' });
const hero = new Ribbon({ rings: 520, width: 0.2, thickness: 0.016, material: heroMat, taper: 0.06, samples: 800 });
scene.add(hero.mesh);

// automation wires
const wires = [0, 1, 2].map(() => {
  const m = makeChrome({ roughness: 0.14, pulseColor: '#b9a5ff' });
  const r = new Ribbon({ rings: 160, capSeg: 6, width: 0.026, thickness: 0.026, material: m, taper: 0.03, samples: 300 });
  scene.add(r.mesh);
  return r;
});

// infinity sculpture: glass band + two chrome rails (one of them is the hero)
const band = new Ribbon({ rings: 460, capSeg: 8, width: 0.4 * L.infA, thickness: 0.07 * L.infA, material: makeInfinityGlass(), closed: true, taper: 0.08, samples: 900 });
const rail2 = new Ribbon({ rings: 460, capSeg: 6, width: 0.052 * L.infA, thickness: 0.052 * L.infA, material: makeChrome({ roughness: 0.08 }), closed: true, taper: 0.05, samples: 900 });
scene.add(band.mesh, rail2.mesh);

// ------------------------------------------------------------------ paths
const N = 800;
const toWorld = (base, pts) => pts.map(([x, y, z]) => base.clone().add(v3(x, y, z)));
const shapes = V ? {
  loose: toWorld(A, [[-2.6, 3.1, -2.4], [-1.25, 1.95, -0.9], [0.55, 1.15, -0.25], [0.95, 0.15, 0.25], [0.15, -0.55, 1.15], [0.85, -1.3, 2.3], [1.9, -2.3, 1.2], [2.8, -3.5, -0.6]]),
  connect: toWorld(A, [[-2.5, 2.8, -1.8], [-1.0, 1.75, -0.35], [-0.18, 0.98, 0.12], [0.62, 0.45, -0.55], [0.22, -0.06, -0.62], [-0.55, -0.55, 0.2], [-0.28, -1.05, 0.32], [0.55, -1.75, 0.2], [2.3, -2.9, -0.6]]),
  B: toWorld(A, [[-2.6, 2.3, -2.6], [-1.1, 1.45, -2.3], [0.7, 1.05, -2.3], [2.0, 0.2, -2.1], [1.4, -0.9, -1.9], [0.1, -0.85, -0.5], [-1.3, -1.35, -0.25], [-0.4, -2.35, 0.1], [2.4, -2.9, -0.8]]),
  C: toWorld(C, [[-1.9, 3.6, -1.6], [-1.5, 1.8, -1.2], [0.3, 1.55, -1.15], [1.55, 0.7, -0.95], [0.65, -0.2, -0.5], [-1.15, -1.1, -0.2], [0.1, -2.2, 0.1], [2.4, -2.9, -0.8]]),
  D: toWorld(D, [[-2.1, 3.4, -1.5], [-1.45, 2.1, -0.4], [-0.95, 1.2, 0.05], [-1.35, 0.1, -0.25], [-1.2, -1.1, -0.35], [-0.55, -2.25, -0.4], [1.8, -3.1, -1.1]]),
} : {
  loose: toWorld(A, [[-3.6, 2.2, -2.4], [-2.0, 1.25, -0.9], [-0.1, 0.9, -0.3], [0.9, 0.35, 0.3], [0.9, -0.55, 1.2], [1.45, -0.95, 2.3], [2.8, -1.4, 1.2], [4.2, -2.2, -0.6]]),
  connect: toWorld(A, [[-3.4, 2.0, -1.8], [-1.6, 1.2, -0.4], [-0.55, 0.62, 0.1], [0.1, 0.4, -0.5], [0.62, 0.05, -0.62], [0.2, -0.45, 0.1], [-0.4, -0.72, 0.32], [0.9, -1.3, 0.1], [3.4, -1.8, -0.6]]),
  B: toWorld(A, [[-3.6, 1.8, -2.1], [-1.9, 1.3, -1.6], [0.2, 1.2, -1.55], [1.35, 0.6, -1.3], [2.3, 0.3, -0.5], [2.1, -0.6, -0.2], [0.9, -1.1, -0.2], [3.6, -1.8, -0.6]]),
  C: toWorld(C, [[-3.8, 1.5, -1.6], [-2.2, 1.2, -1.2], [-0.4, 1.0, -1.15], [1.0, 0.6, -0.95], [2.4, -0.1, -0.4], [1.2, -0.9, -0.1], [-0.4, -1.3, -0.2], [3.2, -1.9, -0.8]]),
  D: toWorld(D, [[-3.8, 1.3, -1.5], [-2.6, 0.9, -0.5], [-1.9, 0.1, 0.05], [-2.4, -0.7, -0.25], [-1.0, -1.35, -0.35], [1.2, -1.6, -0.5], [3.4, -1.9, -1.1]]),
};
const dense = {};
for (const k in shapes) dense[k] = resample(spline(shapes[k], 400), N);

// lemniscate (the infinity silhouette) with depth so the loops pass cleanly
function lemniscate(a, n = 600) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const d = 1 + Math.sin(th) ** 2;
    pts.push(v3((a * Math.cos(th)) / d, (a * Math.sin(th) * Math.cos(th)) / d * 1.12, 0.44 * a * Math.sin(th) * 0.62));
  }
  pts.push(pts[0].clone());
  return pts;
}
const lem = lemniscate(L.infA);
band.setPath(lem, v3(0, 0, 1));

// ------------------------------------------------------------------ camera
// A shot frames a target: frameH is the world height visible through the lens,
// az/el orbit around the target, shift moves the composition (px) so the
// subject sits in the part of the frame not used by the headline.
const TAN = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
function shot(t, tg, frameH, { az = 0, el = 0, ap = 0.5, sx = L.shiftX, sy = L.shiftY, ease } = {}) {
  const d = frameH / TAN;
  const pos = [tg[0] + Math.sin(az) * Math.cos(el) * d, tg[1] + Math.sin(el) * d, tg[2] + Math.cos(az) * Math.cos(el) * d];
  return { t, v: [...pos, ...tg, ap, sx, sy], ease };
}
const add = (b, x, y, z) => [b.x + x, b.y + y, b.z + z];
const pPos = L.phone[0], dPos = L.display[0];
const CAM = V ? [
  shot(0.0, add(A, 0.8, -1.3, 2.28), 0.62, { az: 0.38, el: 0.25, ap: 2.2, sy: 0 }),
  shot(1.1, add(A, 0.45, -0.95, 1.7), 1.55, { az: 0.2, el: 0.08, ap: 1.4, sy: -60, ease: 'soft' }),
  shot(2.7, add(A, 0.0, -0.08, 0), 4.3, { az: 0.03, el: 0.01, ap: 0.5 }),
  shot(3.7, add(A, 0.0, -0.05, 0), 4.45, { az: 0.0, el: 0.0, ap: 0.5, ease: 'linear' }),
  shot(4.9, add(A, 0.05, -0.1, -0.2), 4.0, { az: -0.1, el: 0.02, ap: 0.6 }),
  shot(5.7, [pPos.x + 0.05, pPos.y, pPos.z], 2.85, { az: 0.2, el: 0.02, ap: 0.9, sy: -215 }),
  shot(8.6, [pPos.x + 0.05, pPos.y - 0.02, pPos.z], 2.7, { az: 0.16, el: 0.0, ap: 0.9, sy: -215, ease: 'linear' }),
  shot(9.4, add(A, -0.1, -0.45, 0.5), 3.7, { az: 0.05, el: 0.02, ap: 0.6 }),
  shot(10.5, add(C, 0.05, -0.02, 0), 4.5, { az: 0.04, el: 0.03, ap: 0.6 }),
  shot(12.4, add(C, 0.05, -0.06, 0), 4.35, { az: 0.08, el: 0.0, ap: 0.6, ease: 'soft' }),
  shot(16.1, add(C, 0.05, -0.08, 0), 4.3, { az: -0.02, el: -0.01, ap: 0.6, ease: 'soft' }),
  shot(17.3, add(D, 0.05, -0.03, 0), 4.75, { az: 0.08, el: 0.03, ap: 0.55, sy: -185 }),
  shot(20.4, add(D, 0.05, -0.05, 0), 4.6, { az: -0.02, el: -0.01, ap: 0.55, sy: -185, ease: 'soft' }),
  shot(22.2, add(D, 0.05, -0.05, 0), 4.7, { az: -0.04, el: -0.02, ap: 0.5, sy: -185, ease: 'soft' }),
  shot(23.7, add(E, 0.0, 0.0, 0), 4.9, { az: 0.06, el: 0.05, ap: 0.4 }),
  shot(25.9, add(E, 0.0, 0.0, 0), 4.6, { az: -0.05, el: 0.02, ap: 0.4, ease: 'soft' }),
  shot(27.4, add(E, 0.0, 0.45, 0), 6.2, { az: 0.0, el: 0.02, ap: 1.0, sy: 0 }),
  shot(30.0, add(E, 0.0, 0.45, 0), 6.35, { az: 0.0, el: 0.02, ap: 1.0, sy: 0, ease: 'linear' }),
] : [
  shot(0.0, add(A, 1.35, -0.95, 2.3), 0.62, { az: 0.38, el: 0.22, ap: 2.2, sx: 0 }),
  shot(1.1, add(A, 1.0, -0.65, 1.7), 1.3, { az: 0.22, el: 0.08, ap: 1.4, sx: -120, ease: 'soft' }),
  shot(2.7, add(A, 0.05, -0.02, 0), 2.85, { az: 0.04, el: 0.01, ap: 0.5 }),
  shot(3.7, add(A, 0.05, 0.0, 0), 2.95, { az: 0.0, el: 0.0, ap: 0.5, ease: 'linear' }),
  shot(4.9, add(A, 0.3, -0.05, -0.3), 3.15, { az: -0.08, el: 0.02, ap: 0.6 }),
  shot(5.7, [dPos.x, dPos.y - 0.02, dPos.z], 2.6, { az: -0.12, el: 0.02, ap: 0.8, sx: -390 }),
  shot(8.6, [dPos.x, dPos.y - 0.03, dPos.z], 2.5, { az: -0.15, el: 0.0, ap: 0.8, sx: -390, ease: 'linear' }),
  shot(9.4, add(A, 1.0, -0.2, 0.4), 2.9, { az: 0.05, el: 0.02, ap: 0.6 }),
  shot(10.5, add(C, 0.3, 0.02, 0), 3.35, { az: 0.04, el: 0.03, ap: 0.6 }),
  shot(12.4, add(C, 0.3, -0.02, 0), 3.3, { az: 0.08, el: 0.0, ap: 0.6, ease: 'soft' }),
  shot(16.1, add(C, 0.3, -0.03, 0), 3.3, { az: 0.03, el: -0.01, ap: 0.6, ease: 'soft' }),
  shot(17.3, add(D, -0.5, 0.0, 0), 3.85, { az: 0.08, el: 0.03, ap: 0.55 }),
  shot(20.4, add(D, -0.5, -0.02, 0), 3.8, { az: -0.02, el: -0.01, ap: 0.55, ease: 'soft' }),
  shot(22.2, add(D, -0.5, -0.02, 0), 3.85, { az: -0.04, el: -0.02, ap: 0.5, ease: 'soft' }),
  shot(23.7, add(E, -0.3, 0.0, 0), 3.9, { az: 0.06, el: 0.05, ap: 0.4 }),
  shot(25.9, add(E, -0.3, 0.0, 0), 3.75, { az: -0.05, el: 0.02, ap: 0.4, ease: 'soft' }),
  shot(27.4, add(E, 0.0, 0.2, 0), 4.3, { az: 0.0, el: 0.02, ap: 1.2, sx: 0 }),
  shot(30.0, add(E, 0.0, 0.2, 0), 4.4, { az: 0.0, el: 0.02, ap: 1.2, sx: 0, ease: 'linear' }),
];

// ------------------------------------------------------------------ overlay
const COPY = CUT === 15 ? COPY15 : COPY30;
const overlay = new Overlay(document.getElementById('overlay'), { format: FORMAT, blocks: COPY.blocks, endcard: COPY.endcard });

// ------------------------------------------------------------------ helpers
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tokenPos = new THREE.Vector3();
function drift(obj, t, seed, amp = 1) {
  obj.position.y += noise1(t * 0.35 + seed * 13.1) * 0.03 * amp;
  obj.position.x += noise1(t * 0.3 + seed * 7.7) * 0.02 * amp;
  obj.rotation.x += noise1(t * 0.25 + seed * 3.3) * 0.025 * amp;
  obj.rotation.y += noise1(t * 0.22 + seed * 5.9) * 0.03 * amp;
}
/** Standard entrance: rise, settle and sharpen in. */
function enter(panel, t, t0, dur = 0.8, { dy = -0.18, dz = -0.25, s0 = 0.94, rx = 0.12 } = {}) {
  const p = easeOutCubic(invLerp(t0, t0 + dur, t));
  panel.inner.position.set(0, dy * (1 - p), dz * (1 - p));
  panel.inner.rotation.set(rx * (1 - p), 0, 0);
  panel.inner.scale.setScalar(lerp(s0, 1, p));
  return smooth(invLerp(t0, t0 + dur * 0.7, t));
}
function lerpPts(a, b, w, out) { for (let i = 0; i < a.length; i++) out[i].lerpVectors(a[i], b[i], w); return out; }
const heroPts = Array.from({ length: N }, () => new THREE.Vector3());
const panelPoint = (panel, px, py) => { // canvas px → world point on a panel
  const cw = panel.canvas.width, ch = panel.canvas.height;
  return panel.group.localToWorld(v3((px - cw / 2) * U, -(py - ch / 2) * U, 0.03));
};

// ------------------------------------------------------------------ frame
function update(T, tOut) {
  // ---------- hook fragments
  const fragT = [['inquiry', 1.0], ['sheet', 1.3], ['task', 1.6]];
  const gatherP = win(T, K.gather[0], K.gather[1], easeInOutCubic);
  fragT.forEach(([k, t0], i) => {
    const p = frag[k];
    place(p.group, L.frag[k]);
    drift(p.group, T, i + 1);
    let o = enter(p, T, t0, 0.9);
    // gather: glide into the screens and dissolve into them
    const g = clamp(gatherP * 1.2 - (2 - i) * 0.1);
    if (g > 0) {
      const dest = i === 1 ? L.display[0] : L.phone[0];
      const e = easeInOutCubic(g);
      p.group.position.lerp(dest, e * 0.9);
      p.group.rotation.x = lerp(p.group.rotation.x, dest === L.display[0] ? L.display[1][0] : L.phone[1][0], e);
      p.group.rotation.y = lerp(p.group.rotation.y, dest === L.display[0] ? L.display[1][1] : L.phone[1][1], e);
      p.group.scale.setScalar(lerp(1, 0.45, e));
      o *= 1 - smooth(invLerp(0.25, 0.7, g));
    }
    p.setOpacity(o);
    p.update({ ping: k === 'inquiry' ? Math.max(0, 1 - Math.abs(T - 2.1) / 0.5) : 0 });
  });

  // ---------- devices
  const dev = win(T, 3.9, 5.0, easeOutCubic);
  place(display.group, L.display);
  place(phone.group, L.phone);
  display.group.position.y += (1 - dev) * -0.35; display.group.position.z -= (1 - dev) * 0.6;
  phone.group.position.y += (1 - dev) * -0.45; phone.group.position.z -= (1 - dev) * 0.4;
  phone.group.rotation.y += (1 - dev) * 0.25;
  drift(display.group, T, 11, 0.5); drift(phone.group, T, 12, 0.6);
  const devOut = win(T, 9.2, 10.2);
  display.group.position.z -= devOut * 0.8; phone.group.position.z -= devOut * 0.5;
  const devO = smooth(invLerp(4.05, 4.8, T)) * (1 - devOut);
  display.setOpacity(devO); phone.setOpacity(devO);
  if (devO > 0) {
    const st = {
      name: win(T, K.name[0], K.name[1], (x) => x), phone: win(T, K.phone[0], K.phone[1], (x) => x),
      service: win(T, K.chip, K.chip + 0.25), press: invLerp(K.press, K.press + 0.35, T), sent: win(T, K.sent[0], K.sent[1]),
      focus: T < K.name[0] - 0.2 ? 0 : T < K.phone[0] - 0.1 ? 1 : T < K.chip - 0.1 ? 2 : 0,
      caret: Math.floor(T * 2.4) % 2 === 0 || (T > K.name[0] && T < K.phone[1]),
    };
    // desktop cursor choreography
    const DT = DESKTOP_TARGETS;
    const cx = track([
      { t: 4.8, v: [1320, 880] }, { t: 5.3, v: DT.name }, { t: 6.3, v: DT.name }, { t: 6.5, v: DT.phone }, { t: 7.25, v: DT.phone },
      { t: 7.5, v: DT.chip }, { t: 7.7, v: DT.chip }, { t: 7.95, v: DT.button }, { t: 8.6, v: DT.button }, { t: 9.2, v: [1450, 900] },
    ], T);
    const click = Math.max(0, 1 - Math.abs(T - K.chip) / 0.12, 1 - Math.abs(T - K.press) / 0.12, 1 - Math.abs(T - (K.name[0] - 0.1)) / 0.12);
    display.update({ ...st, cursor: [Math.round(cx[0]), Math.round(cx[1])], click: +click.toFixed(2) });
    const PT = PHONE_TARGETS;
    const tap = T < K.phone[0] ? [...PT.name, invLerp(K.name[0] - 0.15, K.name[0] + 0.35, T)]
      : T < K.chip - 0.05 ? [...PT.phone, invLerp(K.phone[0] - 0.15, K.phone[0] + 0.35, T)]
      : T < K.press - 0.05 ? [...PT.chip, invLerp(K.chip - 0.1, K.chip + 0.4, T)]
      : [...PT.button, invLerp(K.press - 0.05, K.press + 0.45, T)];
    phone.update({ ...st, tap: tap.map((x) => +x.toFixed(2)) });
  }

  // ---------- inquiry token: lifts off the phone, travels to the workspace
  const lp = invLerp(K.lift[0], K.lift[1], T);
  const lpE = easeInOutCubic(lp);
  if (T > K.lift[0] - 0.05 && T < K.lift[1] + 0.3) {
    // departure point: the form card on the phone (vertical) / display (landscape)
    const src = V ? panelPointOnDevice(phone, 390, 1000) : panelPointOnDevice(display, 1218, 520);
    const dst = boardSlotWorld();
    const lift = src.clone().add(v3(0, 0.1, 0.9));
    const mid = src.clone().lerp(dst, 0.5).add(v3(V ? 0.5 : 0, V ? 0 : 0.5, 1.4));
    const pre = dst.clone().add(v3(0, 0, 0.55));
    const path = new THREE.CatmullRomCurve3([src, lift, mid, pre, dst], false, 'centripetal');
    token.group.position.copy(path.getPointAt(lpE));
    token.group.rotation.set(0.05 * Math.sin(lp * Math.PI), (V ? 0.25 : -0.2) * (1 - lpE) + 0.12 * Math.sin(lp * Math.PI), -0.06 * Math.sin(lp * Math.PI));
    token.group.scale.setScalar(lerp(V ? 0.75 : 0.62, 1, smooth(invLerp(0, 0.2, lp))) * lerp(1, 0.42, smooth(invLerp(0.72, 1, lp))));
    token.inner.position.set(0, 0, 0); token.inner.rotation.set(0, 0, 0); token.inner.scale.setScalar(1);
    token.setOpacity(smooth(invLerp(0, 0.12, lp)) * (1 - smooth(invLerp(0.93, 1.0, lp))));
    token.update({});
    tokenPos.copy(token.group.position);
  } else token.setOpacity(0);

  // ---------- workspace
  place(board.group, L.board);
  drift(board.group, T, 21, 0.5);
  const bo = enter(board, T, 9.7, 1.0, { dz: -0.6, dy: 0 }) * (1 - win(T, K.toD[0], K.toD[0] + 0.8));
  board.group.position.z -= win(T, K.toD[0], K.toD[1]) * 1.2;
  board.setOpacity(bo);
  board.update({ arrive: +smooth(invLerp(K.dock + 0.05, K.dock + 0.35, T)).toFixed(3), move: +win(T, K.move[0], K.move[1], (x) => x).toFixed(3), hi: 1 });

  // record panel slides out of the board toward the viewer, then later
  // becomes the automation trigger
  const rIn = win(T, K.record[0], K.record[1], easeOutCubic);
  const toD = win(T, K.toD[0], K.toD[1], easeInOutCubic);
  place(record.group, L.record);
  record.group.position.lerp(board.group.position, (1 - rIn) * 0.6);
  record.group.position.z -= (1 - rIn) * 0.3;
  record.group.scale.multiplyScalar(lerp(0.8, 1, rIn));
  drift(record.group, T, 22, 0.5);
  record.inner.position.set(0, 0, 0); record.inner.rotation.set(0.1 * (1 - rIn), 0, 0); record.inner.scale.setScalar(1);
  // fly toward the trigger slot
  if (toD > 0) {
    record.group.position.lerp(L.trigger[0], toD);
    record.group.scale.multiplyScalar(lerp(1, 0.55, toD));
  }
  record.setOpacity(smooth(invLerp(K.record[0], K.record[0] + 0.5, T)) * (1 - smooth(invLerp(0.72, 0.97, toD))));
  record.update({
    reveal: +win(T, K.record[0] + 0.1, K.record[1] + 0.3, (x) => x).toFixed(3),
    stage: +win(T, K.move[0] + 0.3, K.move[1]).toFixed(3),
    appt: +win(T, K.appt[0], K.appt[1]).toFixed(3),
    next: +win(T, K.next[0], K.next[1]).toFixed(3),
    nextGlow: +Math.max(0, 1 - Math.abs(T - (K.next[1] + 0.2)) / 0.9).toFixed(3),
    glow: +Math.max(0, 1 - Math.abs(T - K.record[1]) / 0.8).toFixed(3) * 0.6,
  });

  // ---------- automation
  place(trigger.group, L.trigger);
  drift(trigger.group, T, 31, 0.5);
  const trO = smooth(invLerp(K.toD[1] - 0.45, K.toD[1] - 0.05, T)) * (1 - win(T, K.toE[0], K.toE[0] + 0.7));
  trigger.inner.scale.setScalar(lerp(0.6, 1, win(T, K.toD[0] + 0.4, K.toD[1] + 0.1, easeOutCubic)));
  trigger.group.position.z -= win(T, K.toE[0], K.toE[1]) * 1.2;
  trigger.setOpacity(trO);
  const firing = K.pulses.map(([a, b]) => invLerp(a, b, T));
  trigger.update({ glow: +Math.max(...K.pulses.map(([a]) => Math.max(0, 1 - Math.abs(T - a) / 0.5))).toFixed(2) });
  actions.forEach((p, i) => {
    place(p.group, L.actions[i]);
    drift(p.group, T, 40 + i, 0.5);
    let o = enter(p, T, K.wires[0] + 0.15 * i, 0.8, { dz: -0.4, dy: 0 });
    const out = win(T, K.toE[0] + i * 0.1, K.toE[0] + 0.8 + i * 0.1);
    p.group.position.z -= out * 1.5; p.group.position.y += out * 0.2;
    o *= 1 - out;
    p.setOpacity(o);
    const on = firing[i] >= 1 ? win(T, K.pulses[i][1], K.pulses[i][1] + 0.5) : 0;
    p.update({ i, on: +on.toFixed(3), settle: +win(T, K.pulses[i][1] + 0.5, K.pulses[i][1] + 1.6).toFixed(3) });
  });
  wires.forEach((w, i) => {
    const a = L.wireFrom(i), b = L.wireTo(i);
    const m1 = a.clone().lerp(b, 0.35).add(V ? v3(-0.45, 0, 0.1) : v3(0, 0, 0.15));
    const m2 = a.clone().lerp(b, 0.75).add(V ? v3(-0.2, 0, 0.05) : v3(-0.1, 0, 0.05));
    w.setPath(spline([a, m1, m2, b], 120));
    const g = win(T, K.wires[0] + i * 0.12, K.wires[1] + i * 0.12);
    const r = win(T, K.toE[0], K.toE[0] + 0.9);
    w.mesh.visible = g > 0.001 && r < 0.999;
    if (w.mesh.visible) w.build({ range: [r, Math.max(r + 0.001, g)] });
    const [pa, pb] = K.pulses[i];
    const pp = invLerp(pa, pb, T);
    setPulses(w.mesh.material, pp > 0 && pp < 1.15 ? [[lerp(-0.05, 1.05, pp), 0.07, 3.2 * (1 - smooth(invLerp(1, 1.15, pp)))]] : []);
  });

  // ---------- hero ribbon
  const w = (a, b, e = easeInOutCubic) => win(T, a, b, e);
  let pts;
  const mA = w(K.connect[0], K.connect[1]);
  const mB = w(4.0, 5.1);
  const mC = w(9.0, 10.6);
  const mD = w(16.0, 17.4);
  const mE = w(K.toE[0], K.toE[1] - 0.1);
  // the sculpture centre: after the brand line it settles low and far back,
  // behind the end card
  const settle = win(T, 25.55, 27.2, easeInOutCubic);
  const Ec = E.clone().add((V ? v3(0, -2.35, -2.6) : v3(0.0, -4.2, -3.0)).multiplyScalar(settle));
  const phase = T * 0.75;
  const bandTwist = (s) => s * Math.PI * 2 + phase;
  if (mE > 0) pts = lerpPts(dense.D, railPath(+1, bandTwist, Ec), mE, heroPts);
  else if (mD > 0) pts = lerpPts(dense.C, dense.D, mD, heroPts);
  else if (mC > 0) pts = lerpPts(dense.B, dense.C, mC, heroPts);
  else if (mB > 0) pts = lerpPts(lerpPts(dense.loose, dense.connect, mA, heroPts).map((p) => p.clone()), dense.B, mB, heroPts);
  else pts = lerpPts(dense.loose, dense.connect, mA, heroPts);
  hero.setPath(pts);
  hero.width = lerp(0.2, rail2.width, mE);
  hero.thickness = lerp(0.016, rail2.width, mE);
  hero.taper = lerp(0.06, 0.0, mE);
  const calm = w(3.4, 5.2);
  const twistAmt = lerp(3.4, 1.8, calm) * Math.PI * 2;
  const flow = T * lerp(1.15, 0.55, calm);
  hero.build({ range: [0, 1], twist: (s) => s * twistAmt * (1 - mE) + flow });
  // light pulses on the hero: submitting the form, the next step, the loop
  const hp = [];
  const sp = invLerp(K.press + 0.15, K.press + 1.1, T);
  if (sp > 0 && sp < 1) hp.push([lerp(0.1, 0.95, sp), 0.05, 2.4 * Math.sin(sp * Math.PI)]);
  const np = invLerp(K.next[0], K.next[0] + 1.0, T);
  if (np > 0 && np < 1) hp.push([lerp(0.05, 0.95, np), 0.05, 2.0 * Math.sin(np * Math.PI)]);
  const ep = invLerp(K.toE[1] - 0.2, K.toE[1] + 1.4, T);
  if (ep > 0 && ep < 1) hp.push([lerp(0, 1, ep), 0.08, 1.6 * Math.sin(ep * Math.PI)]);
  setPulses(heroMat, hp);

  // ---------- infinity sculpture (glass band + second rail)
  const ig = win(T, K.toE[0] + 0.35, K.toE[1] + 0.2, easeInOutCubic);
  band.mesh.visible = rail2.mesh.visible = ig > 0.001;
  if (ig > 0.001) {
    band.mesh.position.copy(Ec); rail2.mesh.position.copy(Ec);
    const c = 0.25;
    const range = ig >= 0.999 ? [0, 1] : [c - ig / 2, c + ig / 2];
    band.build({ range, twist: bandTwist });
    band.mesh.material.userData.uniforms.uPhase.value = T * 0.35;
    rail2.setPath(railPath(-1, bandTwist, null));
    rail2.build({ range });
  }

  // ---------- camera
  const cv = track(CAM, T);
  // follow the inquiry card while it travels to the workspace
  const fol = Math.min(win(T, K.lift[0] + 0.15, K.lift[0] + 0.6), 1 - win(T, K.lift[1] - 0.45, K.lift[1] + 0.1)) * 0.75;
  if (fol > 0) {
    const dx = (tokenPos.x - cv[3]) * fol, dy = (tokenPos.y - cv[4]) * fol, dz = (tokenPos.z - cv[5]) * fol * 0.5;
    cv[0] += dx; cv[1] += dy; cv[2] += dz; cv[3] += dx; cv[4] += dy; cv[5] += dz;
  }
  camera.position.set(cv[0], cv[1], cv[2]);
  // subtle hand-held float
  camera.position.x += noise1(T * 0.4 + 3) * 0.025;
  camera.position.y += noise1(T * 0.37 + 9) * 0.02;
  camera.lookAt(cv[3], cv[4], cv[5]);
  // composition offset (text area), eases out for the end card
  camera.setViewOffset(W, H, cv[7], cv[8], W, H);
  camera.updateProjectionMatrix();
  const focus = camera.position.distanceTo(tmpA.set(cv[3], cv[4], cv[5]));
  return { focus, aperture: cv[6] * 40 * SCALE, maxCoc: 16 * SCALE };
}

function panelPointOnDevice(dev, px, py) {
  const cw = dev.canvas.width, ch = dev.canvas.height;
  const sw = dev === phone ? phone.screenW : 2.56, sh = dev === phone ? phone.screenH : 1.6;
  dev.group.updateMatrixWorld(true);
  return dev.group.localToWorld(v3((px / cw - 0.5) * sw, -(py / ch - 0.5) * sh, 0.05));
}
function boardSlotWorld() {
  board.group.updateMatrixWorld(true);
  // "New" column, first slot (see drawBoard metrics)
  return board.group.localToWorld(v3((219 - 760) * U, -(256 - 350) * U, 0.05));
}
const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _W = new THREE.Vector3(), _B = new THREE.Vector3();
const railBuf = { '1': Array.from({ length: 900 }, () => new THREE.Vector3()), '-1': Array.from({ length: 900 }, () => new THREE.Vector3()) };
function railPath(side, twist, origin) {
  const n = 900, out = railBuf[side];
  const off = band.width / 2 + rail2.width * 0.2;
  for (let k = 0; k < n; k++) {
    const s = k / (n - 1);
    band._sample(s, _P, _T, _W, _B);
    const th = twist(s);
    const c = Math.cos(th), sn = Math.sin(th);
    const wx = _W.x * c + _B.x * sn, wy = _W.y * c + _B.y * sn, wz = _W.z * c + _B.z * sn;
    out[k].set(_P.x + wx * off * side, _P.y + wy * off * side, _P.z + wz * off * side);
    if (origin) out[k].add(origin);
  }
  return origin ? resample(out, N) : out;
}

// ------------------------------------------------------------------ public API
let fontsReady = null;
async function init() {
  await Promise.all(['400', '500', '600', '650', '700'].map((w) => document.fonts.load(`${w} 40px "Geist"`)));
  await document.fonts.load('500 20px "Geist Mono"');
  const img = document.querySelector('.end .logo');
  if (!img.complete) await new Promise((r) => (img.onload = r));
  await document.fonts.ready;
  fontsReady = true;
}

function renderAt(tOut) {
  const T = remap(CUT, tOut);
  const dof = update(T, tOut);
  overlay.update(tOut);
  const frame = Math.round(tOut * FPS);
  post.render(scene, camera, { ...dof, seed: (frame % 97) * 0.731, bloom: 0.22, fade: Math.min(1, smooth(invLerp(0, 0.35, tOut)) + 0.0) });
}

window.AD = { renderAt, duration: DURATION[CUT], fps: FPS, format: FORMAT, cut: CUT, size: [W, H], ready: init().then(() => true) };

// ------------------------------------------------------------------ preview UI
if (q.get('preview')) {
  const bar = document.createElement('div');
  bar.id = 'controls';
  bar.innerHTML = `<button id="pp">Pause</button><input id="sc" type="range" min="0" max="${DURATION[CUT]}" step="0.001" value="0"><span id="tt">0.00</span>
    <a style="color:#bda6ff" href="?format=vertical&cut=${CUT}&preview=1&scale=${SCALE}">vertical</a><a style="color:#bda6ff" href="?format=landscape&cut=${CUT}&preview=1&scale=${SCALE}">landscape</a>
    <a style="color:#bda6ff" href="?format=${FORMAT}&cut=${CUT === 30 ? 15 : 30}&preview=1&scale=${SCALE}">${CUT === 30 ? '15s' : '30s'} cut</a>`;
  document.body.appendChild(bar);
  const fit = () => { const s = Math.min(innerWidth / W, (innerHeight - 50) / H); stage.style.transform = `scale(${s})`; };
  fit(); addEventListener('resize', fit);
  let playing = true, t0 = performance.now() / 1000 - (+q.get('t') || 0);
  const sc = bar.querySelector('#sc'), tt = bar.querySelector('#tt');
  bar.querySelector('#pp').onclick = (e) => { playing = !playing; e.target.textContent = playing ? 'Pause' : 'Play'; t0 = performance.now() / 1000 - +sc.value; };
  sc.oninput = () => { playing = false; bar.querySelector('#pp').textContent = 'Play'; };
  window.AD.ready.then(() => {
    const loop = () => {
      let t = playing ? (performance.now() / 1000 - t0) % DURATION[CUT] : +sc.value;
      if (playing) sc.value = t;
      tt.textContent = t.toFixed(2);
      renderAt(t);
      requestAnimationFrame(loop);
    };
    loop();
  });
}
