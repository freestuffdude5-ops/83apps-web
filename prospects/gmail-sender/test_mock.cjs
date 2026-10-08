// Local harness: runs Code.gs against fake Google services to check the send / follow-up / reply logic.
const fs = require('fs'), vm = require('vm');
const code = fs.readFileSync(process.argv[2], 'utf8');
let NOW = Date.parse('2026-10-13T14:05:00Z');            // Tuesday 10:05 New York
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
function sheet(name) {
  const data = [];
  const S = { name, data,
    getLastRow: () => data.length, getLastColumn: () => Math.max(0, ...data.map(r => r.length)),
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (data[r - 1 + i] || [])[c - 1 + j] ?? '')),
      setValues: (v) => { v.forEach((row, i) => row.forEach((x, j) => { (data[r - 1 + i] ||= [])[c - 1 + j] = x; })); return { setFontWeight() {} }; },
      setValue: (x) => { (data[r - 1] ||= [])[c - 1] = x; }, setFontWeight() {} }),
    appendRow: (row) => data.push(row.slice()), setFrozenRows() {}, setColumnWidth() {} };
  return S;
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = sheet(n)), toast() {} };
const props = {}; const sent = []; const threads = {}; let idn = 0;
const ctx = {
  Date: FakeDate, Math, JSON, String, Number, Set, Object, Array, RegExp, Error, console,
  Logger: { log: m => console.log('  [log]', m) },
  SpreadsheetApp: { getActive: () => ss, getUi: () => ({ alert: m => console.log('  [alert]', m.split('\n')[0]), createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) }) },
  Utilities: {
    Charset: { UTF_8: 'utf8' },
    base64Encode: (x) => Buffer.from(typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x)).toString('base64'),
    base64EncodeWebSafe: (x) => Buffer.from(x, 'utf8').toString('base64url'),
    getUuid: () => 'u' + (++idn),
    formatDate: (d, tz, f) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
      if (f === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
      if (f === 'H') return String(Number(p.hour) % 24);
      if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
    } },
  Session: { getEffectiveUser: () => ({ getEmail: () => 'hayden@83appstudio.com' }), getScriptTimeZone: () => 'America/New_York' },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  UrlFetchApp: { fetch: (u) => ({ getContentText: () => JSON.stringify(u.includes('nomail.example') ? { Status: 3 } : { Status: 0, Answer: [{ data: '1 mx.example.' }] }) }) },
  DriveApp: { getFoldersByName: () => { let done = false; return { hasNext: () => !done, next: () => { done = true; return { getFilesByName: n => { let d = false; return { hasNext: () => !d, next: () => { d = true; return { getBlob: () => ({ getBytes: () => [...Buffer.from('JPEGDATA-' + n)], getContentType: () => 'image/jpeg' }) }; } }; } }; } }; } },
  ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }), deleteTrigger() {} },
  Gmail: { Users: {
    Messages: {
      send: (req) => { const raw = Buffer.from(req.raw, 'base64url').toString('utf8'); const id = 'm' + (++idn); const tid = req.threadId || 't' + idn;
        (threads[tid] ||= []).push({ id, from: 'hayden@83appstudio.com', snippet: '' }); sent.push({ id, tid, raw }); return { id, threadId: tid }; },
      get: (me, id, o) => ({ payload: { headers: [{ name: 'Message-ID', value: '<' + id + '@mail.gmail.com>' }] }, snippet: '' }),
      list: () => ({ messages: [] }) },
    Threads: { get: (me, tid) => ({ messages: (threads[tid] || []).map(m => ({ payload: { headers: [{ name: 'From', value: m.from }] }, snippet: m.snippet, internalDate: String(NOW) })) }) } } },
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const run = (fn) => vm.runInContext(fn, ctx);
const leadsData = () => sheets.Leads.data;
const st = (i) => { const h = leadsData()[0]; return Object.fromEntries(h.map((k, j) => [k, leadsData()[i][j]])); };
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

run('setup()');
const S = sheets.Settings.data; S.find(r => r[0] === 'MAILING_ADDRESS')[1] = 'PO Box 123, Ormond Beach, FL 32175';
const H = leadsData()[0];
const row = o => H.map(k => o[k] ?? '');
leadsData().push(row({ approved: 'YES', business: 'Biz One', email: 'one@example.com', subject: 'A homepage idea for Biz One', body: 'Hi there,\n\nI built a concept.\n\nThere\'s a screenshot below.\n\nWant me to send it?', image_file: 'one.jpg', followup_body: 'Hi again, following up.' }));
leadsData().push(row({ approved: 'YES', business: 'Biz Two', email: 'two@example.com', subject: 'Idea for Biz Two', body: 'Hello,\n\nText only.', followup_body: 'Following up.' }));
leadsData().push(row({ approved: '', business: 'Not approved', email: 'three@example.com', subject: 's', body: 'b' }));
leadsData().push(row({ approved: 'YES', business: 'Bad domain', email: 'x@nomail.example', subject: 's', body: 'b' }));

run('sendTest()'); ok(sent.length === 2 && sent[0].raw.includes('To: hayden@83appstudio.com'), 'test sends go to me (email + follow-up)');
sent.length = 0;
run('start()'); run('tick()');
ok(sent.length === 1 && st(1).status === 'sent', 'first tick sends lead 1');
const raw = sent[0].raw;
ok(/Content-Type: multipart\/related/.test(raw) && /Content-ID: <concept1>/.test(raw), 'inline image part present');
const html = Buffer.from(raw.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString();
ok(html.indexOf('screenshot below') < html.indexOf('cid:concept1') && html.indexOf('cid:concept1') < html.indexOf('Want me to send'), 'image placed right after the "screenshot below" paragraph');
ok(html.includes('PO Box 123') && html.includes('rather not hear'), 'address + opt-out line in HTML');
ok(/List-Unsubscribe: <mailto:hayden@83appstudio.com\?subject=unsubscribe>/.test(raw), 'List-Unsubscribe header');
run('tick()'); ok(sent.length === 1, 'no second send inside the random gap');
NOW += 15 * 60000; run('tick()'); ok(sent.length === 2 && st(2).status === 'sent', 'lead 2 sent after the gap');
NOW += 15 * 60000; run('tick()'); ok(st(3).status === '' , 'unapproved lead never sent'); ok(String(st(4).status).startsWith('bad email'), 'domain with no mail server is skipped');
// reply on lead 2 saying not interested
threads[st(2).thread_id].push({ id: 'r1', from: 'Two <two@example.com>', snippet: 'Thanks but not interested' });
run('checkReplies()'); ok(st(2).status === 'opted out' && sheets.Suppression.data.some(r => r[0] === 'two@example.com'), 'opt-out reply detected and suppressed');
// weekend: no sends
NOW = Date.parse('2026-10-17T15:00:00Z'); const before = sent.length; run('tick()'); ok(sent.length === before, 'nothing sent on Saturday');
// follow-up for lead 1 on the next weekday (6 days later), same thread with In-Reply-To
NOW = Date.parse('2026-10-19T14:30:00Z'); run('tick()');
const fu = sent[sent.length - 1];
ok(st(1).status === 'followed up' && fu.tid === st(1).thread_id && /In-Reply-To: <m\d+@mail.gmail.com>/.test(fu.raw) && /Subject: Re: A homepage idea/.test(fu.raw), 'follow-up sent in the same thread with Re: subject');
ok(!/multipart\/related/.test(fu.raw), 'follow-up has no image');
// a bounce in the thread
threads[st(1).thread_id].push({ id: 'b1', from: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', snippet: 'Address not found' });
run('checkReplies()'); ok(st(1).status === 'bounced', 'bounce detected');
// quota: week 1 = 15
ok(run('quota_(settings_())') === 15, 'week-1 quota is 15'); NOW += 21 * 86400000; ok(run('quota_(settings_())') === 60, 'week-4 quota is 60');
console.log('log rows:', sheets.Log.data.length - 1);
