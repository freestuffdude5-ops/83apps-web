// Screenshots each built concept: desktop hero (1440x900), iPhone 13 hero, and the reviews section.
//   node render.mjs dir1 dir2 ...
import { chromium, devices } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const dirs = process.argv.slice(2);
const browser = await chromium.launch();
const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const phone = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
for (const d of dirs) {
  const url = 'file://' + path.resolve(d, 'index.html');
  try {
    const p = await desk.newPage();
    await p.goto(url, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(d, 'desktop.png') });
    const rv = await p.$('#reviews');
    if (rv) await rv.screenshot({ path: path.join(d, 'reviews.png') });
    else if (fs.existsSync(path.join(d, 'reviews.png'))) fs.unlinkSync(path.join(d, 'reviews.png'));
    await p.close();
    const m = await phone.newPage();
    await m.goto(url, { waitUntil: 'load' }); await m.evaluate(() => document.fonts.ready); await m.waitForTimeout(250);
    await m.screenshot({ path: path.join(d, 'phone.png') });
    await m.close();
    console.log('ok', d);
  } catch (e) { console.log('fail', d, String(e).slice(0, 200)); }
}
await browser.close();
