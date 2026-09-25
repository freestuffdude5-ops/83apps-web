// Swept "ribbon" geometry: a stadium-shaped cross-section (flat band with
// rounded edges, or a round tube when width == thickness) swept along any
// curve with rotation-minimising frames, an animated twist, tapered ends and
// a reveal range. Rebuilt on the CPU every frame (a few thousand vertices).
import * as THREE from 'three';
import { resample, clamp, smooth } from './util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class Ribbon {
  constructor({ rings = 360, capSeg = 7, width = 0.2, thickness = 0.02, material, closed = false, taper = 0.08, samples = 700 }) {
    this.rings = rings;
    this.width = width;
    this.thickness = thickness;
    this.closed = closed;
    this.taper = taper;
    this.K = samples;
    // cross-section: stadium made of two flat faces joined by semicircular caps
    this.profile = [];
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k <= capSeg; k++) {
        const ang = Math.PI / 2 - (k / capSeg) * Math.PI + side * Math.PI; // right cap then left cap
        this.profile.push({ cx: side === 0 ? 1 : -1, x: Math.cos(ang), y: Math.sin(ang) });
      }
    }
    const M = (this.M = this.profile.length);
    const n = rings;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * M * 3);
    this.nrm = new Float32Array(n * M * 3);
    this.u = new Float32Array(n * M * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('ribU', new THREE.BufferAttribute(this.u, 2).setUsage(THREE.DynamicDrawUsage));
    // two index buffers: open (partial reveal, tapered ends) and joined
    // (a fully revealed closed loop)
    const mk = (join) => {
      const idx = [];
      for (let i = 0; i < (join ? n : n - 1); i++) {
        const i2 = (i + 1) % n;
        for (let j = 0; j < M; j++) {
          const j2 = (j + 1) % M;
          const a = i * M + j, b = i2 * M + j, c = i2 * M + j2, d = i * M + j2;
          idx.push(a, b, d, b, c, d);
        }
      }
      return new THREE.BufferAttribute(new Uint32Array(idx), 1);
    };
    this.idxOpen = mk(false);
    this.idxJoin = closed ? mk(true) : null;
    this._join = false;
    g.setIndex(this.idxOpen);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.P = []; this.T = []; this.W = []; this.B = [];
    for (let k = 0; k < this.K; k++) { this.P.push(new THREE.Vector3()); this.T.push(new THREE.Vector3()); this.W.push(new THREE.Vector3()); this.B.push(new THREE.Vector3()); }
  }

  /** Compute centreline + rotation-minimising frames from a dense polyline. */
  setPath(points, up = null) {
    const K = this.K;
    const P = resample(points, K);
    for (let k = 0; k < K; k++) this.P[k].copy(P[k]);
    for (let k = 0; k < K; k++) {
      const a = this.closed ? (k - 1 + K) % K : Math.max(0, k - 1);
      const b = this.closed ? (k + 1) % K : Math.min(K - 1, k + 1);
      this.T[k].subVectors(this.P[b], this.P[a]).normalize();
    }
    if (up) {
      for (let k = 0; k < K; k++) {
        this.W[k].crossVectors(this.T[k], up).normalize();
        this.B[k].crossVectors(this.T[k], this.W[k]).normalize();
      }
    } else {
      // double-reflection rotation minimising frames
      const t0 = this.T[0];
      _a.set(0, 1, 0); if (Math.abs(t0.dot(_a)) > 0.9) _a.set(1, 0, 0);
      this.W[0].crossVectors(t0, _a).normalize();
      for (let i = 0; i < K - 1; i++) {
        const v1 = _a.subVectors(this.P[i + 1], this.P[i]);
        const c1 = v1.dot(v1) || 1e-9;
        const rL = _b.copy(this.W[i]).addScaledVector(v1, (-2 / c1) * v1.dot(this.W[i]));
        const tL = _c.copy(this.T[i]).addScaledVector(v1, (-2 / c1) * v1.dot(this.T[i]));
        const v2 = tL.subVectors(this.T[i + 1], tL);
        const c2 = v2.dot(v2);
        this.W[i + 1].copy(rL);
        if (c2 > 1e-12) this.W[i + 1].addScaledVector(v2, (-2 / c2) * v2.dot(rL));
        this.W[i + 1].normalize();
      }
      for (let k = 0; k < K; k++) this.B[k].crossVectors(this.T[k], this.W[k]).normalize();
      if (this.closed) {
        // distribute holonomy so the band closes seamlessly
        const w0 = this.W[0], wl = this.W[K - 1];
        const ang = Math.atan2(_a.crossVectors(wl, w0).dot(this.T[0]), wl.dot(w0));
        for (let k = 0; k < K; k++) {
          const th = (ang * k) / (K - 1);
          const c = Math.cos(th), s = Math.sin(th);
          _b.copy(this.W[k]).multiplyScalar(c).addScaledVector(this.B[k], s);
          this.B[k].multiplyScalar(c).addScaledVector(this.W[k], -s);
          this.W[k].copy(_b);
        }
      }
    }
    return this;
  }

  _sample(s, outP, outT, outW, outB) {
    const K = this.K;
    let f = s * (K - 1);
    if (this.closed) { f = ((f % (K - 1)) + (K - 1)) % (K - 1); } else f = clamp(f, 0, K - 1);
    const i = Math.min(K - 2, Math.floor(f)), u = f - i;
    outP.lerpVectors(this.P[i], this.P[i + 1], u);
    outT.lerpVectors(this.T[i], this.T[i + 1], u).normalize();
    outW.lerpVectors(this.W[i], this.W[i + 1], u).normalize();
    outB.lerpVectors(this.B[i], this.B[i + 1], u).normalize();
  }

  /** Position on the centreline at arc parameter s (0..1). */
  pointAt(s, out = new THREE.Vector3()) {
    const T = new THREE.Vector3(), W = new THREE.Vector3(), B = new THREE.Vector3();
    this._sample(s, out, T, W, B);
    return out;
  }

  /**
   * Rebuild the mesh.
   * opts.range [a,b] visible part of the curve; opts.twist(s) -> radians;
   * opts.widthFn(s) -> scale; opts.offset(s) -> [w,b] offset of the section
   * centre in frame units (used to build rails that ride a band's edges).
   */
  build({ range = [0, 1], twist = null, widthFn = null, offset = null } = {}) {
    const n = this.rings, M = this.M;
    const [a, b] = range;
    const P = new THREE.Vector3(), T = new THREE.Vector3(), W = new THREE.Vector3(), B = new THREE.Vector3();
    const Wr = new THREE.Vector3(), Br = new THREE.Vector3();
    const span = Math.max(1e-5, b - a);
    const full = this.closed && span >= 0.9999;
    if (this.closed && full !== this._join) { this._join = full; this.geometry.setIndex(full ? this.idxJoin : this.idxOpen); }
    const hw0 = this.width / 2, hb0 = this.thickness / 2;
    let p = 0, q = 0;
    for (let i = 0; i < n; i++) {
      const f = full ? i / n : i / (n - 1);
      const s = a + span * f;
      this._sample(s, P, T, W, B);
      const th = twist ? twist(s) : 0;
      const c = Math.cos(th), sn = Math.sin(th);
      Wr.copy(W).multiplyScalar(c).addScaledVector(B, sn);
      Br.copy(B).multiplyScalar(c).addScaledVector(W, -sn);
      let sc = widthFn ? widthFn(s) : 1;
      if (!full && this.taper > 0) {
        // taper toward the visible ends (distance measured in curve fraction)
        const d = Math.min(f, 1 - f) * span;
        sc *= 0.03 + 0.97 * smooth(d / this.taper);
      }
      if (offset) { const o = offset(s, Wr, Br); P.addScaledVector(Wr, o[0]).addScaledVector(Br, o[1]); }
      const hw = hw0 * sc, hb = hb0 * sc;
      const flat = Math.max(0, hw - hb);
      for (let j = 0; j < M; j++) {
        const pr = this.profile[j];
        const lx = pr.cx * flat + pr.x * hb, ly = pr.y * hb;
        this.pos[p] = P.x + Wr.x * lx + Br.x * ly;
        this.pos[p + 1] = P.y + Wr.y * lx + Br.y * ly;
        this.pos[p + 2] = P.z + Wr.z * lx + Br.z * ly;
        this.nrm[p] = Wr.x * pr.x + Br.x * pr.y;
        this.nrm[p + 1] = Wr.y * pr.x + Br.y * pr.y;
        this.nrm[p + 2] = Wr.z * pr.x + Br.z * pr.y;
        this.u[q] = s; this.u[q + 1] = j / M;
        p += 3; q += 2;
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.ribU.needsUpdate = true;
    return this;
  }
}
