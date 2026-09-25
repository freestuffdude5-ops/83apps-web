// DOM typography layer: headlines, eyebrows and the end card. Composited over
// the WebGL canvas and captured with it, so type stays vector-crisp.
// Every property is a pure function of time (no CSS transitions/animations).
import { clamp, smoother, easeOutCubic, invLerp } from './util.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class Overlay {
  constructor(root, { format, blocks, endcard }) {
    this.root = root;
    this.format = format;
    this.blocks = blocks.map((b) => this._mkBlock(b));
    this.endcard = endcard;
    this._mkEnd();
    this.scrim = document.createElement('div');
    this.scrim.className = 'scrim';
    root.prepend(this.scrim);
  }

  _mkBlock(b) {
    const el = document.createElement('div');
    el.className = 'block';
    let html = '';
    if (b.eyebrow) html += `<div class="eyebrow"><span class="num">${esc(b.eyebrow[0])}</span><span class="bar"></span><span>${esc(b.eyebrow[1])}</span></div>`;
    html += '<h1 class="headline">';
    b.lines.forEach((line, li) => {
      html += '<span class="line">';
      line.split(' ').forEach((w) => { html += `<span class="w" data-l="${li}">${esc(w)}</span> `; });
      html += '</span>';
    });
    html += '</h1>';
    el.innerHTML = html;
    this.root.appendChild(el);
    return { ...b, el, words: [...el.querySelectorAll('.w')], eyebrowEl: el.querySelector('.eyebrow') };
  }

  _mkEnd() {
    const e = document.createElement('div');
    e.className = 'end';
    e.innerHTML = `
      <div class="logo-wrap"><img class="logo" src="assets/brand/83-logo.png" alt="83 APPS logo"><img class="logo glint" src="assets/brand/83-logo.png" alt=""></div>
      <div class="lockup">
        <div class="wordmark">83 APPS</div>
        <div class="services"><span>Websites</span><i>/</i><span>Business tools</span><i>/</i><span>Workflow automation</span></div>
        <div class="cta"><span>Book a free 25-minute consultation</span><svg viewBox="0 0 24 24" width="1em" height="1em"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <div class="url">83appstudio.com</div>
        <div class="region">Serving Florida</div>
      </div>`;
    this.root.appendChild(e);
    this.end = {
      el: e, logo: e.querySelector('.logo-wrap'), glint: e.querySelector('.glint'),
      parts: ['.wordmark', '.services', '.cta', '.url', '.region'].map((q) => e.querySelector(q)),
    };
  }

  update(t) {
    let scrim = 0;
    for (const b of this.blocks) {
      const vis = t > b.in - 0.05 && t < b.out + 0.05;
      b.el.style.display = vis ? (this.format === 'landscape' ? 'flex' : 'block') : 'none';
      if (!vis) continue;
      const out = smoother(invLerp(b.out - 0.5, b.out, t));
      scrim = Math.max(scrim, Math.min(smoother(invLerp(b.in - 0.2, b.in + 0.4, t)), 1 - out));
      if (b.eyebrowEl) {
        const p = smoother(invLerp(b.in - 0.15, b.in + 0.45, t));
        b.eyebrowEl.style.opacity = (p * (1 - out)).toFixed(3);
        b.eyebrowEl.style.transform = `translateY(${((1 - p) * 14 - out * 8).toFixed(2)}px)`;
      }
      let k = 0;
      b.words.forEach((w) => {
        const li = +w.dataset.l;
        const start = b.in + (b.lineDelay?.[li] ?? 0) + (k++) * (b.stagger ?? 0.075);
        const p = smoother(invLerp(start, start + 0.6, t));
        const o = p * (1 - out);
        w.style.opacity = o.toFixed(3);
        w.style.transform = `translateY(${((1 - p) * 0.32 - out * 0.12).toFixed(3)}em)`;
        const bl = (1 - p) * 10 + out * 8;
        w.style.filter = bl > 0.05 ? `blur(${bl.toFixed(2)}px)` : 'none';
      });
    }
    this.scrim.style.opacity = (scrim * 0.9).toFixed(3);

    // end card
    const E = this.endcard, e = this.end;
    const on = t >= E.in - 0.05;
    e.el.style.display = on ? 'flex' : 'none';
    if (!on) return;
    const lp = smoother(invLerp(E.in, E.in + 0.9, t));
    e.logo.style.opacity = lp.toFixed(3);
    const sc = 1.06 - 0.06 * easeOutCubic(invLerp(E.in, E.in + 1.4, t));
    e.logo.style.transform = `scale(${sc.toFixed(4)})`;
    e.logo.style.filter = lp < 0.999 ? `blur(${((1 - lp) * 12).toFixed(2)}px)` : 'none';
    // one light sweep across the logo, masked by the logo's own highlights
    const g = invLerp(E.in + 0.5, E.in + 1.6, t);
    const gx = -40 + g * 180;
    e.glint.style.opacity = (Math.sin(clamp(g) * Math.PI) * 0.85).toFixed(3);
    e.glint.style.webkitMaskImage = e.glint.style.maskImage = `linear-gradient(105deg, transparent ${gx - 18}%, #000 ${gx}%, transparent ${gx + 18}%)`;
    e.parts.forEach((el, i) => {
      const s = E.in + 0.55 + i * 0.14;
      const p = smoother(invLerp(s, s + 0.7, t));
      el.style.opacity = p.toFixed(3);
      el.style.transform = `translateY(${((1 - p) * 18).toFixed(2)}px)`;
      el.style.filter = p < 0.999 ? `blur(${((1 - p) * 6).toFixed(2)}px)` : 'none';
    });
  }
}
