// Opens each business's website in a real browser (desktop + iPhone) and records only what we can prove:
// where Google's link really lands (http = Chrome shows "Not secure"), whether the phone layout is broken,
// the copyright year, emails (home + contact page), the logo and the large photos on the site.
//   node siteprobe.mjs in.json out.jsonl [shotsDir]      in.json = [{cid, website}, ...]
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const [inFile, outFile, shotDir = 'data/siteshots'] = process.argv.slice(2);
const todo = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).cid) : []);
fs.mkdirSync(shotDir, { recursive: true });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const safe = (s) => s.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);

async function grab(page) {
  return page.evaluate(() => {
    const abs = (u) => { try { return new URL(u, location.href).href; } catch { return null; } };
    const html = document.documentElement.outerHTML;
    const text = document.body ? document.body.innerText : '';
    const mailto = [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href').slice(7).split('?')[0]);
    const imgs = [...document.images].filter((i) => i.naturalWidth >= 700 && i.naturalHeight >= 380)
      .map((i) => ({ src: i.currentSrc || i.src, w: i.naturalWidth, h: i.naturalHeight, alt: i.alt || '' }));
    const bg = [...document.querySelectorAll('section,div,header,figure')].slice(0, 400).map((e) => getComputedStyle(e).backgroundImage)
      .filter((b) => b && b.startsWith('url(')).map((b) => abs(b.slice(4, -1).replace(/["']/g, ''))).filter(Boolean);
    const logoEl = [...document.querySelectorAll('img')].find((i) => /logo/i.test(`${i.src} ${i.alt} ${i.className} ${i.id} ${i.parentElement && i.parentElement.className}`) && i.naturalWidth >= 80)
      || (document.querySelector('header img, .header img, #header img, nav img'));
    const og = document.querySelector('meta[property="og:image"]');
    const contact = [...document.querySelectorAll('a[href]')].map((a) => a.href).find((h) => /contact/i.test(h) && h.startsWith(location.origin));
    const year = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]).filter((y) => y > 1995 && y <= 2030);
    return {
      title: document.title, text: text.replace(/\s+/g, ' ').slice(0, 3000), html_len: html.length,
      mailto, emails_in_html: (html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).slice(0, 30),
      viewport: !!document.querySelector('meta[name="viewport"]'),
      generator: (document.querySelector('meta[name="generator"]') || {}).content || null,
      images: imgs.slice(0, 14), bg: [...new Set(bg)].slice(0, 8), og: og ? abs(og.content) : null,
      logo: logoEl ? { src: logoEl.currentSrc || logoEl.src, w: logoEl.naturalWidth, h: logoEl.naturalHeight } : null,
      icon: abs((document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel~="icon"]') || {}).href || ''),
      contact, copyright: year.length ? Math.max(...year) : null,
      theme: (document.querySelector('meta[name="theme-color"]') || {}).content || null,
    };
  });
}

async function probe(t) {
  const out = { cid: t.cid, website: t.website };
  const d = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 860 }, userAgent: UA });
  const page = await d.newPage();
  try {
    const resp = await page.goto(t.website, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    out.status = resp ? resp.status() : null; out.final = page.url();
    Object.assign(out, await grab(page));
    await page.screenshot({ path: `${shotDir}/${safe(t.cid)}-desktop.jpg`, type: 'jpeg', quality: 60 });
    if (out.contact) {
      try {
        await page.goto(out.contact, { waitUntil: 'domcontentloaded', timeout: 20000 }); await page.waitForTimeout(1500);
        const c = await grab(page);
        out.contact_mailto = c.mailto; out.contact_emails = c.emails_in_html; out.contact_text = c.text.slice(0, 1500);
      } catch {}
    }
  } catch (e) { out.error = String(e.message).split('\n')[0].slice(0, 200); }
  await d.close();
  if (!out.error) {
    const m = await browser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true });
    const p = await m.newPage();
    try {
      await p.goto(t.website, { waitUntil: 'domcontentloaded', timeout: 30000 }); await p.waitForTimeout(2500);
      out.mobile = await p.evaluate(() => ({
        vw: innerWidth, sw: document.documentElement.scrollWidth,
        viewport: !!document.querySelector('meta[name="viewport"]'),
        smallText: (() => { const ps = [...document.querySelectorAll('p,li,td,span')].filter((e) => e.innerText && e.innerText.trim().length > 30).slice(0, 40); if (!ps.length) return null; const s = ps.map((e) => parseFloat(getComputedStyle(e).fontSize)).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; })(),
      }));
      await p.screenshot({ path: `${shotDir}/${safe(t.cid)}-phone.jpg`, type: 'jpeg', quality: 60 });
    } catch (e) { out.mobile_error = String(e.message).split('\n')[0].slice(0, 160); }
    await m.close();
  }
  out.ts = Date.now();
  return out;
}

const queue = todo.filter((t) => !done.has(t.cid));
const N = Number(process.env.PROBE_WORKERS || 4);
await Promise.all(Array.from({ length: N }, async () => {
  while (queue.length) {
    const t = queue.shift();
    let r; try { r = await probe(t); } catch (e) { r = { cid: t.cid, website: t.website, error: String(e).slice(0, 200) }; }
    fs.appendFileSync(outFile, JSON.stringify(r) + '\n');
  }
}));
await browser.close();
