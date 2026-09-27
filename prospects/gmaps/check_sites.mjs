// Tests the exact website link from each Google Business Profile, like a customer tapping "Website".
// Strict: "BROKEN" only for failures anyone would see; proxy/bot-wall problems are "UNVERIFIABLE".
//   node check_sites.mjs targets.json checked.json
import { chromium } from 'playwright';
import fs from 'node:fs';

const [inFile, outFile] = process.argv.slice(2);
const targets = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const done = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : [];
const seen = new Set(done.map((d) => d.cid));
fs.mkdirSync('shots', { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function dns(host) {
  for (let i = 0; i < 2; i++) {
    try { const j = await (await fetch(`https://dns.google/resolve?name=${host}&type=A`)).json(); return j.Status; } catch {}
  }
  return null;
}

const BROKEN = [
  [/buy this domain|domain is for sale|this domain (name )?(may be|is) for sale|make an offer on this domain|afternic|hugedomains|dan\.com|sedo\.com/i, 'Domain parked / for sale'],
  [/this domain has expired|domain has expired|renew now|website expired|site has expired|subscription expired/i, 'Website or domain expired'],
  [/account (has been )?suspended|domain temporarily disabled|this site has been suspended|hosting account.*(suspended|disabled)/i, 'Hosting suspended'],
  [/isn.t connected to a site|connectyourdomain|site not found|this site is not published|does not have a domain assigned|there is no site here|domain not configured/i, 'Builder error: site not connected / not found'],
  [/welcome to nginx|apache2 (ubuntu|debian) default page|http server test page|it works!|default web page|future home of something quite cool|coming soon.*godaddy|parked free, courtesy of godaddy/i, 'Blank server / parked default page'],
  [/web server is down|error code 52[0-6]|origin (is )?unreachable|connection timed out.*cloudflare|dns resolution error/i, 'Server down (Cloudflare error)'],
];
const PROXY = /upstream connect error|upstream request failed|ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY/i;
const WALL = /just a moment|verify you are human|attention required|checking your browser|access denied|request forbidden|captcha/i;
const SPAM = /slot gacor|togel|judi|casino online|situs|sabung|betting|体育|娱乐/i;

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 860 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' });

async function visit(url) {
  const page = await ctx.newPage();
  const r = {};
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(2500);
    r.status = resp ? resp.status() : null; r.final = page.url(); r.title = (await page.title()).slice(0, 100);
    r.text = (await page.evaluate(() => (document.body ? document.body.innerText : ''))).replace(/\s+/g, ' ').slice(0, 1200);
    r.page = page;
  } catch (e) { r.error = String(e.message).split('\n')[0].slice(0, 160); await page.close(); }
  return r;
}

async function check(t) {
  const out = { ...t };
  let host; try { host = new URL(t.website).hostname; } catch { out.verdict = 'UNVERIFIABLE'; out.why = 'bad URL'; return out; }
  const st = await dns(host);
  out.dns = st;
  if (st === 3) { out.verdict = 'BROKEN'; out.why = 'Domain does not exist (expired): browsers show "server can\'t be found"'; return out; }
  const tries = [];
  for (let i = 0; i < 2; i++) {
    const v = await visit(t.website); tries.push(v);
    const hay = `${v.title || ''} ${v.text || ''} ${v.error || ''}`;
    if (v.page && !PROXY.test(hay) && v.status && v.status < 400 && !BROKEN.some(([re]) => re.test(hay)) && !WALL.test(hay)) {
      out.verdict = SPAM.test(hay) ? 'CHECK' : 'OK'; out.why = SPAM.test(hay) ? 'Shows gambling spam to us (may be cloaked: check on your phone)' : 'loads';
      out.final = v.final; out.title = v.title; await v.page.close(); return out;
    }
    if (i === 0) { if (v.page) await v.page.close(); await new Promise((r) => setTimeout(r, 3000)); }
  }
  const v = tries[1]; const hay = `${v.title || ''} ${v.text || ''} ${v.error || ''}`;
  out.final = v.final; out.title = v.title; out.status = v.status; out.snippet = (v.text || v.error || '').slice(0, 200);
  const rule = BROKEN.find(([re]) => re.test(hay));
  if (PROXY.test(hay)) { out.verdict = 'UNVERIFIABLE'; out.why = 'our network could not reach it'; }
  else if (rule) { out.verdict = 'BROKEN'; out.why = rule[1]; }
  else if (WALL.test(hay)) { out.verdict = 'UNVERIFIABLE'; out.why = 'bot protection page'; }
  else if (/ERR_NAME_NOT_RESOLVED/.test(hay)) { out.verdict = 'BROKEN'; out.why = 'Domain does not resolve'; }
  else if (/ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_CLOSED/.test(hay)) { out.verdict = 'BROKEN'; out.why = 'Server refuses connections (site down)'; }
  else if (/Timeout/.test(hay)) { out.verdict = 'CHECK'; out.why = 'Timed out twice (may be slow or down)'; }
  else if (v.status >= 500) { out.verdict = 'CHECK'; out.why = `Server error HTTP ${v.status} twice`; }
  else if (v.status === 404 || v.status === 410) { out.verdict = 'BROKEN'; out.why = `Homepage returns "not found" (HTTP ${v.status})`; }
  else if (v.status >= 400) { out.verdict = 'CHECK'; out.why = `HTTP ${v.status}`; }
  else { out.verdict = 'CHECK'; out.why = 'unclear'; }
  if (v.page) {
    if (out.verdict !== 'UNVERIFIABLE') { const f = `shots/${slug(t.name)}.jpg`; await v.page.screenshot({ path: f, type: 'jpeg', quality: 65 }); out.shot = f; }
    await v.page.close();
  }
  return out;
}

const queue = targets.filter((t) => !seen.has(t.cid));
const results = [...done];
let i = 0;
async function worker() {
  while (i < queue.length) {
    const t = queue[i++];
    let r; try { r = await check(t); } catch (e) { r = { ...t, verdict: 'UNVERIFIABLE', why: String(e).slice(0, 100) }; }
    results.push(r);
    if (results.length % 10 === 0) fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
    if (r.verdict !== 'OK') console.log(`${r.verdict.padEnd(12)} ${r.name.slice(0, 34).padEnd(34)} ${r.website}  ${r.why}`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
await browser.close();
console.log('done', results.length);
