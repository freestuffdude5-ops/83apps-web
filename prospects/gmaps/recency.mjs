// Newest-review age for Google Maps places: opens each profile, Reviews tab, sorts by Newest,
// and records the age of the newest review (days). Resumable.
//   node recency.mjs in.json out.json [workers]
import { chromium } from 'playwright';
import fs from 'node:fs';

const [inFile, outFile, W = '4'] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
const cidDec = (cid) => BigInt(cid.split(':')[1]).toString();
const AGE = /(?:Edited )?(a|an|\d+) (hour|day|week|month|year)s? ago/;
const days = (s) => { const m = s.match(AGE); if (!m) return null; const n = /^\d+$/.test(m[1]) ? +m[1] : 1; return n * { hour: 0, day: 1, week: 7, month: 30, year: 365 }[m[2]]; };

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
async function one(ctx, p) {
  const page = await ctx.newPage();
  const r = { cid: p.cid };
  try {
    await page.goto(p.placeId ? `https://www.google.com/maps/place/?q=place_id:${p.placeId}&hl=en` : `https://www.google.com/maps?cid=${cidDec(p.cid)}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForSelector('h1', { timeout: 30000 });
    await page.waitForTimeout(1200);
    const body = await page.evaluate(() => document.body.innerText);
    r.permClosed = /Permanently closed/.test(body); r.tempClosed = /Temporarily closed/.test(body);
    const tab = page.locator('button[role="tab"]:has-text("Reviews")').first();
    if (await tab.count()) {
      await tab.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(1800);
      const sort = page.locator('button[aria-label*="Sort"], button:has-text("Sort")').first();
      if (await sort.count()) {
        await sort.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(700);
        const newest = page.locator('[role="menuitemradio"]:has-text("Newest"), div[role="menu"] >> text=Newest').first();
        if (await newest.count()) { await newest.click({ timeout: 8000 }).then(() => { r.sorted = true; }).catch(() => {}); await page.waitForTimeout(2200); }
      }
    }
    r.hasReviewsTab = (await tab.count()) > 0;
    for (let k = 0; k < 4; k++) { await page.mouse.move(250, 600); await page.mouse.wheel(0, 1500); await page.waitForTimeout(500); }
    const txt = await page.evaluate(() => document.body.innerText);
    const ages = (txt.match(/(?:Edited )?(?:a|an|\d+) (?:hour|day|week|month|year)s? ago/g) || []).map(days).filter((x) => x !== null);
    r.newestDays = ages.length ? (r.sorted ? ages[0] : Math.min(...ages)) : null;
    r.nAges = ages.length;
  } catch (e) { r.error = String(e.message).split('\n')[0].slice(0, 120); }
  await page.close();
  return r;
}
const queue = list.filter((p) => !(p.cid in done));
let i = 0, n = 0;
async function worker() {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US', viewport: { width: 1200, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });
  while (i < queue.length) {
    const p = queue[i++];
    let r; try { r = await Promise.race([one(ctx, p), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 90000))]); } catch (e) { r = { cid: p.cid, error: String(e) }; }
    done[p.cid] = r;
    if (++n % 10 === 0) { fs.writeFileSync(outFile, JSON.stringify(done)); console.log(n, '/', queue.length); }
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: +W }, worker));
fs.writeFileSync(outFile, JSON.stringify(done));
await browser.close();
console.log('done', Object.keys(done).length);
