// node test_drafts.cjs Drafts.gs  -- runs the draft-preparing script against fake Gmail
const fs = require('fs'), vm = require('vm');
let NOW = Date.parse('2026-10-13T14:05:00Z');
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const props = {}, drafts = [], created = [], logs = [], SITES = {}, sentThreads = {}; let idn = 0;
const ME = 'hayden@83appstudio.com';
function draft(to, body, subject) { const d = { deleted: false, getMessage: () => ({ getPlainBody: () => body, getTo: () => to, getSubject: () => subject || 'The website link on your Google listing', getDate: () => new Date(NOW) }), deleteDraft() { d.deleted = true; } }; drafts.push(d); return d; }
const ctx = { Date: FakeDate, Math, JSON, String, Number, Object, Array, RegExp, Error, decodeURIComponent, console: { log: s => logs.push(s) }, Logger: { log: s => logs.push(s) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => ME }) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
  GmailApp: { getDrafts: () => drafts.filter(d => !d.deleted), createDraft: (to, subj, body, o) => created.push({ to, subj, body, o }),
    search: (q) => { const to = (q.match(/to:(\S+)/) || [])[1]; return sentThreads[to] ? [{ getMessages: () => sentThreads[to] }] : []; } },
  UrlFetchApp: { fetch: (u, o) => {
    if (u.includes('raw.githubusercontent.com')) return { getBlob: () => ({ name: '', setName(n) { this.name = n; return this; }, url: u }) };
    const s = SITES[u]; if (!s) throw new Error('DNS error');
    return { getResponseCode: () => s.code || 200, getAllHeaders: () => (s.loc ? { Location: s.loc } : {}), getContentText: () => s.body || '' }; } } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), ctx);
const run = c => vm.runInContext(c, ctx);
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const SIG = "Hayden\n83 App Studio\nHayden@83appstudio.com\n83 APPS LLC, PO BOX 730331, ORMOND BEACH FL 32174\n\nIf you'd rather not hear from me, just reply and let me know.";
const body = (n) => `[[83auto]]\n[[img:abc/previews/one.jpg|abc/previews/two.jpg]]\n[[site:https://www.google.com/url?q=http://${n}.example/&source=gmail&ust=1&sa=E]]\n[[claims:broken]]\n[[followup:Hi, just following up on the concept for ${n}.]]\nHi ${n} team,\n\nI tapped the Website button and https://www.google.com/url?q=http://${n}.example&source=gmail&ust=1&sa=E didn't load.\n\nThere are two screenshots below: the homepage, and a reviews section.\n\nWant me to send over the full page?\n\n${SIG}`;
draft('a@biz.com', body('alpha')); draft('b@biz.com', body('beta')); const mine = draft('friend@gmail.com', 'lunch?', 'lunch');
SITES['http://beta.example/'] = { body: '<html><body><h1>Beta</h1><p>We are open again and serving the whole area today.</p></body></html>' };
run('setup()');
ok(created.length === 1 && created[0].to === 'a@biz.com', 'raw draft turned into a finished draft (same recipient)');
const c = created[0];
ok(Object.keys(c.o.inlineImages).join() === 'concept1,concept2' && c.o.inlineImages.concept1.url === 'https://raw.githubusercontent.com/freestuffdude5-ops/83apps-web/abc/previews/one.jpg', 'both screenshots embedded from the published images');
ok(/cid:concept1/.test(c.o.htmlBody) && /cid:concept2/.test(c.o.htmlBody) && c.o.htmlBody.indexOf('screenshots below') < c.o.htmlBody.indexOf('cid:concept1'), 'pictures placed right under the "screenshots below" line');
ok(!/\[\[/.test(c.body) && !/\[\[/.test(c.o.htmlBody), 'hidden [[lines]] removed');
ok(/and alpha\.example didn't load/.test(c.body) && !/google\.com\/url/.test(c.o.htmlBody), 'Gmail redirect links turned back into the plain website name');
ok(c.o.name === 'Hayden | 83 App Studio' && /PO BOX 730331/.test(c.o.htmlBody), 'from name + PO box footer');
ok(drafts[0].deleted && drafts[1].deleted && !mine.deleted, 'raw drafts removed; site that came back is dropped; personal drafts untouched');
ok(!created.some(x => x.to === 'b@biz.com'), 'no draft for the business whose website works again');
// follow-up prep: not yet sent -> nothing; sent 6 days ago, no reply -> follow-up draft
run('tick()'); ok(created.length === 1, 'no follow-up before you send');
const sentAt = NOW; sentThreads['a@biz.com'] = [{ getFrom: () => 'Hayden <' + ME + '>', getDate: () => new Date(sentAt) }];
NOW += 6 * 86400000; run('tick()');
const fu = created[created.length - 1];
ok(fu.to === 'a@biz.com' && /^Re: The website link/.test(fu.subj) && /following up on the concept for alpha/.test(fu.body) && /PO BOX/.test(fu.body), 'follow-up draft prepared 5+ days after sending');
run('tick()'); ok(created.length === 2, 'follow-up prepared only once');
