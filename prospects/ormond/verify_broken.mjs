// Re-verifies "broken website" prospects: DNS (dns.google), then loads each URL like a phone visitor,
// classifies what they'd see, and saves a screenshot as evidence for the pitch.
//   node verify_broken.mjs broken_candidates.json broken_verified.json
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [inFile, outFile] = process.argv.slice(2);
const list = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const shotDir = 'broken-shots';
fs.mkdirSync(shotDir, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

async function dns(host) {
  try {
    const r = await fetch(`https://dns.google/resolve?name=${host}&type=A`);
    const j = await r.json();
    return { status: j.Status, answers: (j.Answer || []).map((a) => a.data) }; // 3 = NXDOMAIN
  } catch (e) { return { status: null, error: String(e).slice(0, 80) }; }
}

const RULES = [
  [/for sale|buy this domain|domain is for sale|make an offer|afternic|dan\.com|sedo/i, 'Domain is parked for sale'],
  [/parked|parking|lander|this domain (has been|was) registered|domain name is registered|godaddy/i, 'Parked placeholder page'],
  [/suspended|account has been suspended|hosting.*expired|website expired|expired/i, 'Site suspended / expired'],
  [/connectyourdomain|site not found|not published|does not have a domain|404|not found/i, 'Error: site not found'],
  [/welcome to nginx|default web page|apache.*test page|centos|it works!|index of \//i, 'Blank server default page'],
  [/slot|casino|judi|togel|betting|gacor|博|体育|娱乐|poker/i, 'Hijacked: gambling spam'],
  [/insurance|premium finance/i, 'Points to an unrelated business'],
];

const browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, ignoreHTTPSErrors: true });
const results = [];
for (const item of list) {
  const r = { ...item };
  const host = new URL(item.url).hostname;
  r.dns = await dns(host);
  if (r.dns.status === 3) {
    r.verdict = 'Domain does not exist (expired or never renewed)';
  } else {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2500);
      r.httpStatus = resp ? resp.status() : null;
      r.finalUrl = page.url();
      r.title = (await page.title()).slice(0, 120);
      const text = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 1500));
      r.snippet = text.replace(/\s+/g, ' ').slice(0, 200);
      const hay = `${r.title} ${text} ${r.finalUrl}`;
      r.verdict = (RULES.find(([re]) => re.test(hay)) || [])[1]
        || (r.httpStatus >= 500 ? `Server error (HTTP ${r.httpStatus})` : r.httpStatus >= 400 ? `Error page (HTTP ${r.httpStatus})` : 'LOADS - check manually');
      const f = path.join(shotDir, slug(item.name) + '.jpg');
      await page.screenshot({ path: f, type: 'jpeg', quality: 70 });
      r.shot = f;
    } catch (e) {
      const msg = String(e.message).split('\n')[0];
      r.error = msg.slice(0, 140);
      r.verdict = /ERR_NAME_NOT_RESOLVED/.test(msg) ? 'Domain does not exist (expired or never renewed)'
        : /ERR_CONNECTION_REFUSED|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/.test(msg) ? 'Server not responding'
        : /ERR_CERT|SSL/.test(msg) ? 'Security error (broken certificate)'
        : /Timeout/.test(msg) ? 'Times out (never loads)' : 'Could not load: ' + msg.slice(0, 60);
    }
    await page.close();
  }
  results.push(r);
  console.log(`${r.verdict.padEnd(48)} ${item.name.slice(0, 32)}  ${item.url}`);
}
await browser.close();
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
