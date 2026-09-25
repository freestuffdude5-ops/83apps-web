// Small deterministic math helpers shared by every scene.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutExpo = (t) => { t = clamp(t); return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); };
export const easeInOutQuint = (t) => { t = clamp(t); return t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2; };
export const easeOutBack = (t, s = 1.4) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };

/** progress of `t` through the window [a, b] with an easing curve */
export const win = (t, a, b, ease = smoother) => ease(invLerp(a, b, t));
/** fade in over [a, a+fi], hold, fade out over [b-fo, b] */
export const envelope = (t, a, b, fi = 0.4, fo = 0.4, ease = smooth) =>
  Math.min(ease(invLerp(a, a + fi, t)), 1 - ease(invLerp(b - fo, b, t)));

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Smooth value noise (deterministic) for gentle drift.
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
}

/**
 * Keyframe track. keys: [{t, v:[...numbers]}], interpolated with a
 * Catmull-Rom spline in value space and a smootherstep in time per segment,
 * so the motion settles into each key without stopping abruptly when keys
 * are flagged `flow`.
 */
export function track(keys, t) {
  if (t <= keys[0].t) return keys[0].v.slice();
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v.slice();
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  let u = (t - k1.t) / (k2.t - k1.t);
  const e = k2.ease || 'inout';
  if (e === 'inout') u = smoother(u);
  else if (e === 'out') u = easeOutCubic(u);
  else if (e === 'in') u = easeInCubic(u);
  else if (e === 'soft') u = lerp(u, smoother(u), 0.6);
  // linear: leave u
  const out = [];
  for (let j = 0; j < k1.v.length; j++) {
    const p0 = k0.v[j], p1 = k1.v[j], p2 = k2.v[j], p3 = k3.v[j];
    // Catmull-Rom (uniform) with tension .5
    const u2 = u * u, u3 = u2 * u;
    out.push(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3));
  }
  return out;
}

/** Resample a polyline to n points evenly spaced by arc length. */
export function resample(points, n) {
  const len = [0];
  for (let i = 1; i < points.length; i++) len.push(len[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = len[len.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / (n - 1)) * total;
    while (j < len.length - 2 && len[j + 1] < d) j++;
    const seg = len[j + 1] - len[j] || 1;
    const f = (d - len[j]) / seg;
    out.push(points[j].clone().lerp(points[j + 1], f));
  }
  return out;
}

/** Dense smooth curve through control points (centripetal Catmull-Rom). */
export function spline(ctrl, n = 400, closed = false) {
  const c = new THREE.CatmullRomCurve3(ctrl, closed, 'centripetal');
  return c.getSpacedPoints(n - 1);
}
