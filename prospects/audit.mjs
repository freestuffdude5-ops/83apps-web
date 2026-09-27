// Website audit for prospect research. Opens each site the way a customer on
// an iPhone would and records objective, checkable facts plus screenshots.
//   node audit.mjs sites.json out/audit.json   (sites: [{name, website, ...}])
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [inFile, outFile] = process.argv.slice(2);
const sites = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const shotDir = path.join(path.dirname(outFile), 'shots');
fs.mkdirSync(shotDir, { recursive: true });
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
const seen = new Set(done.map((d) => d.key));
const slug = (s) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const YEAR = 2026;

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const iphone = devices['iPhone 13'];

async function auditOne(site) {
  const url = /^https?:/.test(site.website) ? site.website : 'https://' + site.website;
  const r = { ...site, key: slug(url), url };
  // does the site answer on https with a valid certificate?
  const ctxStrict = await browser.newContext({ ...iphone, deviceScaleFactor: 1, ignoreHTTPSErrors: false });
  const ctx = await browser.newContext({ ...iphone, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
  try {
    const ps = await ctxStrict.newPage();
    try {
      const resp = await ps.goto(url.replace(/^http:/, 'https:'), { waitUntil: 'domcontentloaded', timeout: 20000 });
      r.httpsOk = !!resp && resp.status() < 400;
    } catch (e) { r.httpsOk = false; r.httpsErr = String(e.message).split('\n')[0].slice(0, 120); }
    await ps.close();

    const page = await ctx.newPage();
    let bytes = 0;
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
    const t0 = Date.now();
    let resp;
    try {
      resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (e) {
      try { resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); r.loadTimeout = true; }
      catch (e2) { r.error = String(e2.message).split('\n')[0].slice(0, 160); return r; }
    }
    r.loadSec = +((Date.now() - t0) / 1000).toFixed(1);
    r.status = resp ? resp.status() : null;
    r.finalUrl = page.url();
    r.finalHttps = r.finalUrl.startsWith('https:');
    await page.waitForTimeout(1500);
    // pages we could not really see: proxy failures or bot walls. Never score these.
    const bodyText = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 600));
    const wall = /upstream request failed|performing security verification|just a moment|attention required|access denied|verify you are human|checking your browser/i.exec(bodyText);
    if (wall || (r.status && r.status >= 400)) { r.blocked = wall ? wall[0] : `HTTP ${r.status}`; return r; }
    const m = await page.evaluate((YEAR) => {
      const vp = document.querySelector('meta[name=viewport]');
      const vpc = vp ? vp.getAttribute('content') || '' : '';
      const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
      const html = document.documentElement.outerHTML;
      const text = document.body ? document.body.innerText : '';
      // visible text size check
      let small = 0, total = 0;
      for (const el of document.querySelectorAll('p, li, td, span, a, div')) {
        if (!el.childNodes.length) continue;
        const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 12);
        if (!own.length) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        total++;
        if (parseFloat(cs.fontSize) * (window.visualViewport ? 1 : 1) < 13) small++;
      }
      const tels = [...document.querySelectorAll('a[href^="tel:"]')];
      const telAbove = tels.some((a) => { const b = a.getBoundingClientRect(); return b.width > 0 && b.top < window.innerHeight && b.bottom > 0; });
      const ctaRe = /(book|schedule|appointment|free (estimate|quote)|get (a )?quote|request (service|an? estimate|a quote))/i;
      const ctas = [...document.querySelectorAll('a, button')].filter((a) => ctaRe.test(a.innerText || ''));
      const ctaAbove = ctas.some((a) => { const b = a.getBoundingClientRect(); return b.width > 0 && b.top < window.innerHeight && b.bottom > 0; });
      const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((x) => +x[1]).filter((y) => y > 1995 && y <= YEAR + 1);
      const gen = (document.querySelector('meta[name=generator]') || {}).content || '';
      const builders = [];
      if (/wix\.com|wixstatic/.test(html)) builders.push('Wix');
      if (/squarespace/.test(html)) builders.push('Squarespace');
      if (/wsimg\.com|godaddy/i.test(html)) builders.push('GoDaddy builder');
      if (/weebly/.test(html)) builders.push('Weebly');
      if (/vpweb|vistaprint/i.test(html)) builders.push('Vistaprint');
      if (/homestead\.com/.test(html)) builders.push('Homestead');
      if (/wp-content/.test(html)) builders.push('WordPress');
      if (/duda|dudamobile|multiscreensite/.test(html)) builders.push('Duda');
      if (/hibu/.test(html)) builders.push('hibu');
      if (/yodle|web\.com|websitepro|thryv/i.test(html)) builders.push('template vendor');
      return {
        title: document.title.slice(0, 120),
        metaDesc: !!document.querySelector('meta[name=description]'),
        viewport: /width\s*=\s*device-width/.test(vpc),
        overflowPx: docW - window.innerWidth,
        smallTextPct: total ? Math.round((small / total) * 100) : null,
        textBlocks: total,
        telLinks: tels.length,
        telAbove,
        ctaCount: ctas.length,
        ctaAbove,
        forms: document.querySelectorAll('form input:not([type=hidden]), form textarea').length,
        copyright: years.length ? Math.max(...years) : null,
        generator: gen.slice(0, 60),
        builders,
        retro: ['font', 'marquee', 'center', 'frameset', 'blink'].reduce((n, t) => n + document.getElementsByTagName(t).length, 0) + (html.match(/<table/gi) || []).length,
        flash: /\.swf|shockwave/i.test(html),
        words: text.split(/\s+/).length,
        mixedContent: [...document.querySelectorAll('img[src^="http:"], script[src^="http:"]')].length,
      };
    }, YEAR);
    Object.assign(r, m);
    r.pageKB = Math.round(bytes / 1024);
    const f = path.join(shotDir, r.key + '-mobile.jpg');
    await page.screenshot({ path: f, type: 'jpeg', quality: 70 });
    r.shotMobile = path.relative(path.dirname(outFile), f);
    // desktop view for pitch mockups
    const d = await browser.newContext({ viewport: { width: 1366, height: 800 }, ignoreHTTPSErrors: true });
    const dp = await d.newPage();
    try {
      await dp.goto(r.finalUrl, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await dp.waitForTimeout(1200);
      const fd = path.join(shotDir, r.key + '-desktop.jpg');
      await dp.screenshot({ path: fd, type: 'jpeg', quality: 65 });
      r.shotDesktop = path.relative(path.dirname(outFile), fd);
    } catch {}
    await d.close();
  } finally {
    await ctx.close(); await ctxStrict.close();
  }
  return r;
}

const queue = sites.filter((s) => s.website && !/facebook-only/.test(s.website) && !seen.has(slug(/^https?:/.test(s.website) ? s.website : 'https://' + s.website)));
let i = 0;
const results = [...done];
async function worker() {
  while (i < queue.length) {
    const s = queue[i++];
    let r;
    try { r = await Promise.race([auditOne(s), new Promise((_, j) => setTimeout(() => j(new Error('audit timeout')), 120000))]); }
    catch (e) { r = { ...s, key: slug(s.website), url: s.website, error: String(e.message).slice(0, 160) }; }
    results.push(r);
    fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
    console.log(`${results.length}/${done.length + queue.length} ${r.error ? 'ERR ' : ''}${s.name} — ${r.url}`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
await browser.close();
