// node test_drafts.cjs Drafts.gs  -- runs the outreach script against fake Gmail (drafts-only mode, then auto-send mode)
const fs = require('fs'), vm = require('vm');
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const ME = 'hayden@83appstudio.com';
const SIG = "Hayden\n83 App Studio\nHayden@83appstudio.com\n83 APPS LLC, PO BOX 730331, ORMOND BEACH FL 32174\n\nIf you'd rather not hear from me, just reply and let me know.";
const body = (n) => `[[83auto]]\n[[img:abc/previews/one.jpg|abc/previews/two.jpg]]\n[[site:https://www.google.com/url?q=http://${n}.example/&source=gmail&ust=1&sa=E]]\n[[claims:broken]]\n[[followup:Hi, just following up on the concept for ${n}.]]\nHi ${n} team,\n\nI tapped the Website button and https://www.google.com/url?q=http://${n}.example&source=gmail&ust=1&sa=E didn't load.\n\nThere are two screenshots below: the homepage, and a reviews section.\n\nDo you have 15 minutes this week for a quick Zoom?\n\n${SIG}`;
const ok = (c, m) => { if (!c) { console.log('FAIL:', m); process.exitCode = 1; } else console.log('ok  ', m); };

function world(autoSend) {
  const W = { reads: 0, searches: 0, NOW: Date.parse('2026-10-13T14:05:00Z'), props: {}, drafts: [], created: [], logs: [], SITES: {}, threads: {}, labels: {}, sentMail: [], idn: 0 };
  class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(W.NOW); } static now() { return W.NOW; } }
  const msg = (from, to, subject, text, at) => ({ getFrom: () => from, getTo: () => to, getSubject: () => subject, getPlainBody: () => text, getDate: () => new Date(at) });
  function deliver(to, subject, text, o, threadId) {          // a message leaves the outbox
    const tid = threadId || 't' + (++W.idn);
    (W.threads[tid] ||= { id: tid, to, subject, msgs: [] }).msgs.push(msg('Hayden <' + ME + '>', to, subject, text, W.NOW));
    W.sentMail.push({ to, subject, text, o, tid });
    return tid;
  }
  W.draft = (to, text, subject, o, replyTo) => {
    const d = { id: 'd' + (++W.idn), deleted: false, at: W.NOW + W.idn, to, subject: subject || 'The website link on your Google listing', text, o,
      getId: () => d.id,
      getMessage: () => { W.reads++; return msg(ME, d.to, d.subject, d.text, d.at); },
      deleteDraft() { d.deleted = true; },
      send() { d.deleted = true; deliver(d.to, d.subject, d.text, d.o, replyTo); } };
    W.drafts.push(d); return d;
  };
  const thread = (t) => t && ({ getId: () => t.id, getMessages: () => t.msgs.map(m => Object.assign({}, m, {
    createDraftReplyAll: (text, o) => W.draft(t.to, text, 'Re: ' + t.subject, o, t.id) })) });
  const ctx = { Date: FakeDate, Math, JSON, String, Number, Object, Array, RegExp, Error, decodeURIComponent,
    console: { log: s => W.logs.push(s) }, Logger: { log: s => W.logs.push(s) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => W.props[k] ?? null, setProperty: (k, v) => { W.props[k] = String(v); }, deleteProperty: k => { delete W.props[k]; }, getProperties: () => ({ ...W.props }) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => ME }) },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create() {} }) }) }) },
    Utilities: { formatDate: (d, tz, f) => {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(d).map(x => [x.type, x.value]));
      if (f === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
      if (f === 'H') return String(Number(p.hour) % 24);
      if (f === 'u') return String(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1);
    } },
    GmailApp: {
      getDrafts: () => W.drafts.filter(d => !d.deleted),
      createDraft: (to, subj, text, o) => { W.created.push({ to, subj, body: text, o }); return W.draft(to, text, subj, o); },
      sendEmail: (to, subj, text, o) => deliver(to, subj, text, o),
      getUserLabelByName: (n) => W.labels[n] || null,
      getThreadById: (id) => thread(W.threads[id]),
      search: (q) => { W.searches++; const to = (q.match(/to:(\S+)/) || [])[1]; const t = Object.values(W.threads).find(t => t.to === to && !/^Re:/.test(t.subject)); return t ? [thread(t)] : []; } },
    UrlFetchApp: { fetch: (u) => {
      if (u.includes('raw.githubusercontent.com')) return { getBlob: () => ({ name: '', setName(n) { this.name = n; return this; }, url: u }) };
      const s = W.SITES[u]; if (!s) throw new Error('DNS error');
      return { getResponseCode: () => s.code || 200, getAllHeaders: () => (s.loc ? { Location: s.loc } : {}), getContentText: () => s.body || '' }; } } };
  vm.createContext(ctx);
  vm.runInContext(SRC.replace('const AUTO_SEND = true;', 'const AUTO_SEND = ' + autoSend + ';'), ctx);
  W.run = c => vm.runInContext(c, ctx);
  return W;
}

// ---------- drafts-only mode (AUTO_SEND = false): unchanged behaviour ----------
{
  const W = world(false);
  W.draft('a@biz.com', body('alpha')); W.draft('b@biz.com', body('beta')); const mine = W.draft('friend@gmail.com', 'lunch?', 'lunch');
  W.SITES['http://beta.example/'] = { body: '<html><body><h1>Beta</h1><p>We are open again and serving the whole area today.</p></body></html>' };
  W.run('setup()');
  ok(W.created.length === 1 && W.created[0].to === 'a@biz.com', 'raw draft turned into a finished draft (same recipient)');
  const c = W.created[0];
  ok(Object.keys(c.o.inlineImages).join() === 'concept1,concept2' && c.o.inlineImages.concept1.url === 'https://raw.githubusercontent.com/freestuffdude5-ops/83apps-web/abc/previews/one.jpg', 'both screenshots embedded from the published images');
  ok(/cid:concept1/.test(c.o.htmlBody) && /cid:concept2/.test(c.o.htmlBody) && c.o.htmlBody.indexOf('screenshots below') < c.o.htmlBody.indexOf('cid:concept1'), 'pictures placed right under the "screenshots below" line');
  ok(!/\[\[/.test(c.body) && !/\[\[/.test(c.o.htmlBody), 'hidden [[lines]] removed');
  ok(/and alpha\.example didn't load/.test(c.body) && !/google\.com\/url/.test(c.o.htmlBody), 'Gmail redirect links turned back into the plain website name');
  ok(c.o.name === 'Hayden | 83 App Studio' && /PO BOX 730331/.test(c.o.htmlBody), 'from name + PO box footer');
  ok(W.drafts[0].deleted && W.drafts[1].deleted && !mine.deleted, 'raw drafts removed; site that came back is dropped; personal drafts untouched');
  ok(!W.created.some(x => x.to === 'b@biz.com'), 'no draft for the business whose website works again');
  W.run('tick()'); ok(W.sentMail.length === 0, 'drafts-only mode never sends');
  W.drafts.find(d => d.to === 'a@biz.com' && !d.deleted).send();             // Hayden presses Send
  W.run('tick()'); ok(W.created.length === 1, 'no follow-up before 5 days');
  W.NOW += 6 * 86400000; W.run('tick()');
  const fu = W.created[W.created.length - 1];
  ok(fu.to === 'a@biz.com' && /^Re: The website link/.test(fu.subj) && /following up on the concept for alpha/.test(fu.body) && /PO BOX/.test(fu.body), 'follow-up draft prepared 5+ days after sending');
  W.run('tick()'); ok(W.created.length === 2 && W.sentMail.length === 1, 'follow-up prepared only once, never sent');
}

// ---------- auto-send mode ----------
{
  const W = world(true);
  W.NOW = Date.parse('2026-10-13T12:30:00Z');                  // Tuesday 8:30 AM New York
  ['alpha', 'beta', 'gamma', 'delta'].forEach(n => W.draft(n[0] + '@biz.com', body(n)));
  const mine = W.draft('friend@gmail.com', 'lunch?', 'lunch');
  W.run('setup()');
  ok(W.created.length === 4 && W.sentMail.length === 0, 'drafts finished before 9 AM, nothing sent yet');
  W.NOW = Date.parse('2026-10-13T13:01:00Z'); W.run('tick()');  // 9:01 AM
  ok(W.sentMail.length === 1 && W.sentMail[0].to === 'a@biz.com', 'at 9 AM it sends the oldest finished draft');
  ok(/cid:concept1/.test(W.sentMail[0].o.htmlBody) && Object.keys(W.sentMail[0].o.inlineImages).length === 2, 'sent email carries both embedded screenshots');
  W.NOW += 5 * 60000; W.run('tick()'); ok(W.sentMail.length === 1, 'waits the random 6-14 minute gap');
  W.NOW += 10 * 60000; W.run('tick()'); ok(W.sentMail.length === 2 && W.sentMail[1].to === 'b@biz.com', 'next one after the gap');
  // site came back between drafting and sending -> dropped, not sent
  W.SITES['http://gamma.example/'] = { body: '<html><body><h1>Gamma</h1><p>We are open again and serving the whole area today.</p></body></html>' };
  W.NOW += 15 * 60000; W.run('tick()');
  ok(!W.sentMail.some(m => m.to === 'c@biz.com') && W.sentMail[2].to === 'd@biz.com', 're-checks the site right before sending; skips gamma, sends delta');
  ok(!mine.deleted && !W.sentMail.some(m => m.to === 'friend@gmail.com'), 'your own drafts are never sent');
  // pause label
  W.draft('e@biz.com', body('echo')); W.NOW += 15 * 60000; W.labels['83 pause'] = {}; W.run('tick()');
  const n0 = W.sentMail.length; ok(!W.sentMail.some(m => m.to === 'e@biz.com'), 'Gmail label "83 pause" stops sending');
  delete W.labels['83 pause']; W.NOW += 15 * 60000; W.run('tick()'); ok(W.sentMail.length === n0 + 1, 'deleting the label resumes');
  // after 4 PM / weekend
  W.draft('f@biz.com', body('fox')); W.run('tick()');
  W.NOW = Date.parse('2026-10-13T20:30:00Z'); W.run('tick()'); ok(!W.sentMail.some(m => m.to === 'f@biz.com'), 'nothing after 4 PM');
  W.NOW = Date.parse('2026-10-17T15:00:00Z'); W.run('tick()'); ok(!W.sentMail.some(m => m.to === 'f@biz.com'), 'nothing on Saturday');
  // daily limit (week 1 = 15)
  W.NOW = Date.parse('2026-10-14T13:00:00Z');
  for (let i = 0; i < 20; i++) W.draft('bulk' + i + '@biz.com', body('bulk' + i));
  for (let i = 0; i < 80; i++) { W.NOW += 15 * 60000; W.run('tick()'); }
  ok(Number(W.props['day:2026-10-14']) === 15, 'stops at 15 a day in week 1 (got ' + W.props['day:2026-10-14'] + ')');
  // follow-ups: alpha no reply -> follow-up in the same thread; beta replied -> none; delta bounced -> none + do-not-contact
  const tidOf = to => W.sentMail.find(m => m.to === to && !/^Re:/.test(m.subject)).tid;
  W.threads[tidOf('b@biz.com')].msgs.push({ getFrom: () => 'Beta <b@biz.com>', getDate: () => new Date(W.NOW) });
  W.threads[tidOf('d@biz.com')].msgs.push({ getFrom: () => 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', getDate: () => new Date(W.NOW) });
  W.NOW = Date.parse('2026-10-19T13:00:00Z');                   // Monday, 6 days after
  for (let i = 0; i < 12; i++) { W.NOW += 15 * 60000; W.run('tick()'); }
  const fus = W.sentMail.filter(m => /^Re:/.test(m.subject));
  const fa = fus.find(m => m.to === 'a@biz.com');
  ok(fa && fa.tid === tidOf('a@biz.com') && /following up on the concept for alpha/.test(fa.text) && /PO BOX/.test(fa.text), 'follow-up sent in the same conversation 5+ days later');
  ok(!fus.some(m => m.to === 'b@biz.com'), 'no follow-up to someone who replied');
  ok(!fus.some(m => m.to === 'd@biz.com') && JSON.parse(W.props.supp || '{}')['d@biz.com'] === 'bounced', 'bounce: no follow-up, address on the do-not-contact list');
  ok(fus.filter(m => m.to === 'a@biz.com').length === 1, 'only one follow-up per business');
  ok(!W.drafts.some(d => !d.deleted && /^Re:/.test(d.subject)), 'no leftover follow-up drafts');
  // Gmail usage: an idle run reads no drafts and runs no searches
  W.NOW = Date.parse('2026-10-20T02:00:00Z'); W.run('tick()');      // checks the 5-day-old conversations once
  const r0 = W.reads, s0 = W.searches; W.NOW += 5 * 60000; W.run('tick()');
  ok(W.reads === r0 && W.searches === s0, 'an idle run reads no drafts and runs no searches (Gmail usage stays tiny)');
}

// ---------- drafts finished by the previous version + emails you send yourself ----------
{
  const W = world(true);
  W.NOW = Date.parse('2026-10-13T12:00:00Z');
  // a finished draft from the old version (no q: record yet) and its follow-up record
  const old = W.draft('old@biz.com', 'Hi Old team,\n\nThere are two screenshots below.\n\n' + SIG, 'The website link on your Google listing');
  W.props['fu:old@biz.com'] = JSON.stringify({ subject: 'The website link on your Google listing', text: 'Hi, just following up on old.' });
  // one already sent by hand before the update
  W.props['fu:hand@biz.com'] = JSON.stringify({ subject: 'The website link on your Google listing', text: 'Hi, just following up on hand.' });
  const handTid = (() => { const d = W.draft('hand@biz.com', 'hello', 'The website link on your Google listing'); d.send(); return W.sentMail[0].tid; })();
  W.sentMail.length = 0;
  const mine = W.draft('friend@gmail.com', 'lunch?', 'lunch');
  W.run('tick()');
  ok(Object.keys(W.props).some(k => k.startsWith('q:') && JSON.parse(W.props[k]).to === 'old@biz.com'), 'old finished draft picked up into the send queue');
  ok(JSON.parse(W.props['fu:hand@biz.com']).sentAt, 'email you sent yourself: 5-day follow-up clock started');
  const reads = W.reads; W.run('tick()'); ok(W.reads === reads, 'drafts are read only once, never again');
  W.NOW = Date.parse('2026-10-13T13:05:00Z'); W.run('tick()');
  ok(W.sentMail.length === 1 && W.sentMail[0].to === 'old@biz.com' && !mine.deleted, 'old draft sent at 9 AM; your own draft untouched');
  // you send a queued draft yourself -> it leaves the queue and its follow-up clock starts
  W.draft('x@biz.com', body('xray')); W.run('tick()');
  const qx = Object.keys(W.props).find(k => k.startsWith('q:') && JSON.parse(W.props[k]).to === 'x@biz.com');
  W.drafts.find(d => d.id === qx.slice(2)).send(); W.run('tick()');
  ok(!W.props[qx] && JSON.parse(W.props['fu:x@biz.com']).sentAt, 'draft you sent yourself leaves the queue; follow-up clock starts');
  ok(W.sentMail.filter(m => m.to === 'x@biz.com').length === 1, 'never sent twice');
  W.NOW = Date.parse('2026-10-19T14:00:00Z');
  for (let i = 0; i < 6; i++) { W.NOW += 15 * 60000; W.run('tick()'); }
  const fu = W.sentMail.filter(m => /^Re:/.test(m.subject)).map(m => m.to).sort().join();
  ok(fu === 'hand@biz.com,old@biz.com,x@biz.com', 'follow-ups go to all three after 5 days (got ' + fu + ')');
  ok(W.sentMail.find(m => m.to === 'hand@biz.com' && /^Re:/.test(m.subject)).tid === handTid, 'follow-up lands in the same conversation');
}
