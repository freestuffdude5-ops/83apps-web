// 3D objects: frosted-glass UI panels and the two devices (display + phone).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeFrost, deviceMaterials } from './materials.js';
import { rr } from './ui/draw.js';

function canvasTexture(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { c, ctx: c.getContext('2d'), tex };
}

/**
 * A floating glass card with an interface drawn on it.
 * px: canvas size [w,h]; unit: world units per canvas pixel.
 */
export class Panel {
  constructor({ px, unit = 1 / 620, draw, radiusPx = 44, depth = 0.045, frost = true }) {
    this.draw = draw;
    const [cw, ch] = px;
    const w = cw * unit, h = ch * unit;
    this.w = w; this.h = h;
    this.group = new THREE.Group();
    this.inner = new THREE.Group(); // for local animation (tilt, lift) on top of placement
    this.group.add(this.inner);
    if (frost) {
      this.slabMat = makeFrost();
      this.slabMat.transparent = true;
      // rounded slab: RoundedBox radius is bounded by depth, so build the
      // rounded silhouette with an extruded shape instead.
      const shape = new THREE.Shape();
      const R = radiusPx * unit;
      const x0 = -w / 2, y0 = -h / 2;
      shape.moveTo(x0 + R, y0);
      shape.lineTo(x0 + w - R, y0); shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + R);
      shape.lineTo(x0 + w, y0 + h - R); shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - R, y0 + h);
      shape.lineTo(x0 + R, y0 + h); shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - R);
      shape.lineTo(x0, y0 + R); shape.quadraticCurveTo(x0, y0, x0 + R, y0);
      const bev = Math.min(0.012, depth * 0.3);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 10 });
      geo.translate(0, 0, -(depth - bev * 2) / 2);
      this.slab = new THREE.Mesh(geo, this.slabMat);
      this.inner.add(this.slab);
    }
    const { c, ctx, tex } = canvasTexture(cw, ch);
    this.canvas = c; this.ctx = ctx; this.tex = tex;
    this.uiMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, premultipliedAlpha: false });
    this.ui = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.uiMat);
    this.ui.position.z = depth / 2 + 0.002;
    this.ui.renderOrder = 2;
    this.inner.add(this.ui);
    this._key = null;
    this.opacity = 1;
  }
  update(state) {
    const key = JSON.stringify(state);
    if (key === this._key) return;
    this._key = key;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.draw(this.ctx, this.canvas.width, this.canvas.height, state);
    this.tex.needsUpdate = true;
  }
  setOpacity(o) {
    this.opacity = o;
    this.group.visible = o > 0.002;
    this.uiMat.opacity = o;
    if (this.slabMat) { this.slabMat.opacity = o; }
  }
}

/** Floating display with a thin graphite body. */
export class Display {
  constructor({ w = 3.2, h = 2.0, px = [1600, 1000], draw }) {
    const M = deviceMaterials();
    this.mats = M;
    this.group = new THREE.Group();
    const bz = 0.07, bez = 0.05;
    const body = new THREE.Mesh(new RoundedBoxGeometry(w + bez * 2, h + bez * 2, bz, 6, 0.03), M.body);
    body.position.z = -bz / 2;
    this.group.add(body);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w + bez * 2 - 0.02, h + bez * 2 - 0.02), M.black);
    front.position.z = 0.0005;
    this.group.add(front);
    const { c, ctx, tex } = canvasTexture(px[0], px[1]);
    this.canvas = c; this.ctx = ctx; this.tex = tex; this.draw = draw;
    this.screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.screenMat);
    scr.position.z = 0.002;
    this.group.add(scr);
    // additive cover glass: adds reflections of the studio only
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(w + bez * 2 - 0.02, h + bez * 2 - 0.02),
      new THREE.MeshPhysicalMaterial({ color: '#000000', metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glass.position.z = 0.004;
    this.group.add(this.glass);
    this.materials = [M.body, M.black, this.screenMat, this.glass.material];
    this._key = null;
  }
  update(state) {
    const key = JSON.stringify(state);
    if (key === this._key) return;
    this._key = key;
    this.draw(this.ctx, this.canvas.width, this.canvas.height, state);
    this.tex.needsUpdate = true;
  }
  setOpacity(o) {
    this.group.visible = o > 0.002;
    for (const m of this.materials) { m.transparent = true; m.opacity = o; }
  }
}

/** Phone with polished titanium frame and a rounded screen. */
export class Phone {
  constructor({ h = 1.7, px = [780, 1690], draw }) {
    const M = deviceMaterials();
    const w = (h * px[0]) / px[1];
    this.group = new THREE.Group();
    const bez = 0.035, d = 0.085;
    const W = w + bez * 2, H = h + bez * 2;
    // rounded outline: RoundedBox radius is limited by depth, so round the
    // silhouette with an extruded shape for the frame instead
    const R = 0.13;
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2 + R, -H / 2); sh.lineTo(W / 2 - R, -H / 2); sh.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
    sh.lineTo(W / 2, H / 2 - R); sh.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2); sh.lineTo(-W / 2 + R, H / 2);
    sh.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R); sh.lineTo(-W / 2, -H / 2 + R); sh.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
    const bev = 0.018;
    const frameGeo = new THREE.ExtrudeGeometry(sh, { depth: d - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 6, curveSegments: 18 });
    frameGeo.translate(0, 0, -d + bev);
    const frame = new THREE.Mesh(frameGeo, M.frame);
    this.group.add(frame);
    const frontGeo = new THREE.ShapeGeometry(sh, 18);
    const front = new THREE.Mesh(frontGeo, M.black);
    front.position.z = bev + 0.0008;
    front.scale.set(0.985, 0.992, 1);
    this.group.add(front);
    const { c, ctx, tex } = canvasTexture(px[0], px[1]);
    this.canvas = c; this.ctx = ctx; this.tex = tex; this.draw = draw;
    this.screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.screenMat);
    scr.position.z = bev + 0.002;
    this.group.add(scr);
    this.glass = new THREE.Mesh(frontGeo, new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 0.4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glass.position.z = bev + 0.004;
    this.glass.scale.copy(front.scale);
    this.group.add(this.glass);
    this.w = W; this.h = H;
    this.screenW = w; this.screenH = h;
    this.materials = [M.frame, M.black, this.screenMat, this.glass.material];
    this._key = null;
    this._r = (0.1 / h) * px[1];
  }
  update(state) {
    const key = JSON.stringify(state);
    if (key === this._key) return;
    this._key = key;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    rr(ctx, 0, 0, canvas.width, canvas.height, this._r);
    ctx.clip();
    this.draw(ctx, canvas.width, canvas.height, state);
    ctx.restore();
    this.tex.needsUpdate = true;
  }
  setOpacity(o) {
    this.group.visible = o > 0.002;
    for (const m of this.materials) { m.transparent = true; m.opacity = o; }
  }
}
