// Runs Outreach.gs against fake Google services:  node test_outreach.cjs Outreach.gs
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(process.argv[2], 'utf8');
let NOW = Date.parse('2026-10-13T14:05:00Z');            // Tuesday 10:05 New York
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const props = {}; const sent = []; const threads = {}; let idn = 0; const drafts = []; const SITES = {}; const logs = [];
const ME = 'hayden@83appstudio.com';
function draft(to, body, subject) {
  const d = { id: 'd' + (++idn), deleted: false, at: NOW + idn,
    getMessage: () => ({ getPlainBody: () => body, getTo: () => to, getSubject: () => subject || 'The website link on your Google listing', getDate: () => new Date(d.at) }),
    deleteDraft() { d.deleted = true; } };
  drafts.push(d); return d;
}
const thread = (id) => ({ getMessages: () => (threads[id] || []).map(m => ({ getFrom: () => m.from, getPlainBody: () => m.body })), addLabel() {} });
const ctx = {
  Date: FakeDate, Math, JSON, String, Number, Object, Array, RegExp, Error, console: { log: s => logs.push(s) },
  Logger: { log: m => logs.push(m) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Session: { getEffectiveUser: () => ({ getEmail: () => ME }) },
  ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }), getOAuthToken: () => 'tok' },
  Utilities: {
    Charset: { UTF_8: 'utf8' }, getUuid: () => 'uuid' + (++idn),
    base64Encode: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x)).toString('base64'),
    base64EncodeWebSafe: (x) => Buffer.from(x, 'utf8').toString('base64url'),
    formatDate: (d, tz, f) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit', hour12: false, weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
      if (f === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
      if (f === 'H') return String(Number(p.hour) % 24);
      if (f === 'HH:mm') return `${p.hour}:${p.minute}`;
      if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
    } },
  GmailApp: {
    getDrafts: () => drafts.filter(d => !d.deleted),
    getThreadById: (id) => thread(id), getUserLabelByName: () => ({}), createLabel: () => ({}),
    search: (q) => q.startsWith('in:sent') ? [{ getId: () => 'tf' + idn, addLabel() {} }] : [],
    sendEmail: (to, subj, body, o = {}) => { if (o.inlineImages) { (threads['tf' + idn] ||= []).push({ from: ME, body: '' }); sent.push({ fallback: true, to, subj, body, o, tid: 'tf' + idn }); } else sent.push({ summary: true, to, subj, body }); } },
  UrlFetchApp: { fetch: (u, o = {}) => {
    if (u.includes('/messages/send') && ctx.API_OFF) throw new Error('Gmail API has not been used in project');
    if (u.includes('/messages/send')) {
      const req = JSON.parse(o.payload); const raw = Buffer.from(req.raw, 'base64url').toString('utf8');
      const id = 'm' + (++idn), tid = req.threadId || 't' + idn;
      (threads[tid] ||= []).push({ from: ME, body: '' }); sent.push({ id, tid, raw });
      return { getContentText: () => JSON.stringify({ id, threadId: tid }) };
    }
    if (u.includes('gmail.googleapis.com')) return { getContentText: () => JSON.stringify({ payload: { headers: [{ name: 'Message-ID', value: '<' + u.split('/').pop().split('?')[0] + '@mail.gmail.com>' }] } }) };
    if (u.includes('raw.githubusercontent.com')) return { getBlob: () => ({ getBytes: () => [...Buffer.from('JPEG:' + u)], getContentType: () => 'image/jpeg' }) };
    const s = SITES[u]; if (!s) throw new Error('DNS error');
    return { getResponseCode: () => s.code || 200, getAllHeaders: () => (s.loc ? { Location: s.loc } : {}), getContentText: () => s.body || '' };
  } },
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const run = (fn) => vm.runInContext(fn, ctx);
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };
const SIG = "Hayden\n83 App Studio\nHayden@83appstudio.com\n83 APPS LLC, PO BOX 730331, ORMOND BEACH FL 32174\n\nIf you'd rather not hear from me, just reply and let me know.";
const body = (name, extra = '') => `[[83auto]]\n[[img:abc123/previews/one.jpg|abc123/previews/two.jpg]]\n[[site:http://${name}.example/]]\n[[claims:broken]]\n[[followup:Hi, just following up on the concept for ${name}.]]${extra}\nHi ${name} team,\n\nYour site didn't load.\n\nMy sites start at $250. There are two screenshots below: the homepage, and a reviews section.\n\nWant me to send over the full page?\n\n${SIG}`;

draft('a@biz.com', body('alpha'));
draft('b@biz.com', body('beta'));
draft('c@biz.com', body('gamma'));
const personal = draft('friend@gmail.com', 'Hey, lunch tomorrow?', 'lunch');
SITES['http://gamma.example/'] = { body: '<html><body><h1>Gamma Plumbing</h1><p>We are open again and serving the whole area.</p></body></html>' };

run('setup()');
ok(props.start === '2026-10-13', 'setup records the start date (ramp week 1)');
run('tick()');
ok(sent.length === 1 && /To: a@biz.com/.test(sent[0].raw), 'first tick sends the oldest outreach draft');
const raw = sent[0].raw;
ok(/multipart\/related/.test(raw) && /Content-ID: <concept1>/.test(raw) && /Content-ID: <concept2>/.test(raw), 'both screenshots embedded inline');
const html = Buffer.from(raw.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString();
const text = Buffer.from(raw.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString();
ok(!/\[\[/.test(html) && !/\[\[/.test(text), 'no [[markers]] in the sent email');
ok(html.indexOf('screenshots below') < html.indexOf('cid:concept1') && html.indexOf('cid:concept2') < html.indexOf('Want me to send'), 'images placed after the "screenshots below" paragraph');
ok(html.includes('PO BOX 730331') && /color:#888[^>]*>If you&#39;d rather not|color:#888[^>]*>If you'd rather not/.test(html), 'PO box footer + small opt-out line');
ok(/From: "Hayden \| 83 App Studio" <hayden@83appstudio.com>/.test(raw) && /List-Unsubscribe/.test(raw), 'From name and List-Unsubscribe header');
ok(drafts[0].deleted && !personal.deleted, 'sent draft removed; personal drafts never touched');
run('tick()'); ok(sent.length === 1, 'waits the random gap before the next send');
NOW += 15 * 60000; run('tick()'); ok(sent.length === 2 && /To: b@biz.com/.test(sent[1].raw), 'second draft sent after the gap');
NOW += 15 * 60000; run('tick()');
ok(drafts[2].deleted && sent.length === 2, 'site that works again: draft dropped, nothing sent');
draft('a@biz.com', body('alpha-dup')); NOW += 15 * 60000; run('tick()');
ok(sent.length === 2, 'never emails the same address twice');
// reply on b: stops its follow-up; opt-out-like wording on a: suppress
const tidA = sent[0].tid, tidB = sent[1].tid;
threads[tidB].push({ from: 'Beta <b@biz.com>', body: 'Sure, send me a quote!' });
// weekend: nothing sent
NOW = Date.parse('2026-10-17T15:00:00Z'); const n0 = sent.length; run('tick()'); ok(sent.length === n0, 'nothing sent on Saturday');
// follow-up for a, 6 days later, same thread
NOW = Date.parse('2026-10-19T14:30:00Z'); props.lastCheck = '0'; run('tick()');
const fu = sent[sent.length - 1];
ok(fu.tid === tidA && /In-Reply-To: <m\d+@mail.gmail.com>/.test(fu.raw) && /Subject: Re: The website link/.test(fu.raw), 'follow-up in the same thread with Re: and In-Reply-To');
ok(!/multipart\/related/.test(fu.raw), 'follow-up has no images');
NOW += 20 * 60000; run('tick()');
ok(!sent.slice(n0).some(s => s.tid === tidB), 'no follow-up to someone who replied');
const recB = JSON.parse(props['t:' + tidB]); ok(recB.done === 'replied', 'reply recorded');
// opt-out reply
draft('d@biz.com', body('delta')); NOW += 20 * 60000; run('tick()');
const tidD = sent[sent.length - 1].tid; threads[tidD].push({ from: 'd@biz.com', body: 'Not interested, please remove me' });
props.lastCheck = '0'; NOW += 20 * 60000; run('tick()');
ok(JSON.parse(props.supp || '{}')['d@biz.com'] === 'opted out', 'opt-out reply goes on the do-not-contact list');
// 4 PM summary email to me
NOW = Date.parse('2026-10-19T20:10:00Z'); run('tick()');
const sum = sent.find(s => s.summary); ok(sum && sum.to === ME && /sent/.test(sum.subj), 'daily 4 PM summary emailed to Hayden');
// quota: week 1 = 15
ok(run('quota_()') === 15 || run('quota_()') === 25, 'ramp quota');
run('pause()'); draft('e@biz.com', body('eps')); NOW = Date.parse('2026-10-20T14:00:00Z'); const n1 = sent.length; run('tick()');
ok(sent.length === n1, 'pause stops everything');

// Gmail API switched off: falls back to GmailApp with the same inline images
run('setup()'); ctx.API_OFF = true; draft('f@biz.com', body('foxtrot')); NOW = Date.parse('2026-10-21T14:00:00Z'); props.nextAt = '0'; run('tick()');
const fb = sent[sent.length - 1];
ok(fb.fallback && fb.to === 'e@biz.com' && Object.keys(fb.o.inlineImages).length === 2 && /cid:concept1/.test(fb.o.htmlBody) && !/\[\[/.test(fb.body), 'fallback sender still embeds both screenshots, no markers');

ok(run("unwrap_('and https://www.google.com/url?q=http://letitraingutterscompany.com&source=gmail&ust=1791567877876000&sa=E shows')") === 'and letitraingutterscompany.com shows', 'unwraps Gmail redirect back to the bare domain');
ok(run("unwrap_('[[site:https://www.google.com/url?q=https://letitraingutterscompany.com/&source=gmail&ust=1&sa=E]]')") === '[[site:https://letitraingutterscompany.com/]]', 'unwraps the site marker URL');
