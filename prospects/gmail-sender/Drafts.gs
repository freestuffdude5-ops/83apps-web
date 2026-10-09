/**
 * 83 App Studio outreach: puts the concept screenshots INTO the outreach emails and sends them for you.
 *
 * Claude writes each outreach email as a Gmail draft that starts with the line [[83auto]] (plus a few [[...]] lines
 * with the screenshot links). Every 5 minutes this script:
 *  1. turns each of those into a finished draft: same email, same recipient, with the screenshots embedded inside it.
 *     It re-checks the website claim first; if the site changed, the draft is removed instead.
 *  2. sends one finished outreach draft at a time, Mon-Fri 9 AM-4 PM New York time, 6-14 minutes apart, at most
 *     15 a day in week 1, then 25, 40, 60 (follow-ups count). It re-checks the website claim again right before sending.
 *  3. 5 days after an email went out with no reply, sends one short follow-up in the same conversation.
 *     Any reply (or a bounce) stops the follow-up. Replies are yours to answer.
 * Only drafts this script finished are ever sent. Your own drafts are never touched.
 *
 * Setup (once): script.google.com > New project > paste this > Save > pick "setup" next to Run > Run > Allow.
 * Pause sending: create a Gmail label named  83 pause  (delete the label to resume). Stop everything: pick "stop" > Run.
 * Set AUTO_SEND to false below to go back to drafts only (you press Send).
 */
const AUTO_SEND = true;
const IMG_BASE = 'https://raw.githubusercontent.com/freestuffdude5-ops/83apps-web/';
const FROM_NAME = 'Hayden | 83 App Studio';
const FOLLOWUP_DAYS = 5;
const TZ = 'America/New_York';
const RAMP = [15, 25, 40, 60];            // emails a day in week 1, 2, 3, 4+ (first emails + follow-ups)
const GAP_MIN = [6, 14];                  // minutes between sends (random)
const P = () => PropertiesService.getScriptProperties();
console.log('83 Outreach script loaded.' + (AUTO_SEND ? ' Auto-send is ON.' : ' Drafts only.'));

/** Whatever is selected next to Run (myFunction or setup), it does the setup. */
function myFunction() { setup(); }

function setup() {
  P().setProperty('installed', '1');
  Logger.log('Account: ' + Session.getEffectiveUser().getEmail() + '  (must be hayden@83appstudio.com)');
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  Logger.log('5-minute timer created.');
  const n = prepareDrafts_();
  Logger.log('Drafts finished with screenshots this run: ' + n + '. Any left over are done by the timer within 5 minutes.');
  Logger.log(AUTO_SEND ? 'Running. It sends one email at a time, Mon-Fri 9 AM-4 PM New York time.' : 'Running. Finished drafts with screenshots are in Gmail > Drafts.');
}
function stop() { ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t)); Logger.log('Stopped.'); }

function tick() {
  console.log('Account: ' + Session.getEffectiveUser().getEmail());
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    prepareDrafts_();
    prepareFollowups_();
    if (AUTO_SEND) sendNext_();
  } finally { lock.releaseLock(); }
}

/** Turns every [[83auto]] draft into a finished draft with the screenshots embedded. */
function prepareDrafts_() {
  const started = Date.now();
  const all = GmailApp.getDrafts();
  const raw = all.map(d => ({ d: d, m: d.getMessage() })).filter(x => x.m.getPlainBody().indexOf('[[83auto]]') >= 0);
  console.log('Drafts in Gmail: ' + all.length + ', waiting for screenshots: ' + raw.length);
  let done = 0;
  for (const x of raw) {
    if (Date.now() - started > 4 * 60000) break;          // stay under Apps Script's time limit; the rest go next run
    const e = parseDraft_(x.m);
    if (e.claims) {
      const changed = recheckClaims_(e.site, e.claims);
      if (changed) { x.d.deleteDraft(); console.log('Removed draft to ' + e.to + ': ' + changed); continue; }
    }
    const inline = {};
    e.imgs.forEach((u, k) => { inline['concept' + (k + 1)] = UrlFetchApp.fetch(/^https?:/.test(u) ? u : IMG_BASE + u).getBlob().setName('concept' + (k + 1) + '.jpg'); });
    GmailApp.createDraft(e.to, e.subject, e.body, { htmlBody: toHtml_(e.body, e.imgs.length), inlineImages: inline, name: FROM_NAME });
    if (e.followup) P().setProperty('fu:' + e.to, JSON.stringify({ subject: e.subject, text: e.followup, site: e.site, claims: e.claims }));
    x.d.deleteDraft();
    done++;
    console.log('Finished draft for ' + e.to);
  }
  return done;
}

/** 5+ days after an email went out with no reply: a follow-up (Re: same subject). Auto mode queues it to send in the
 *  same conversation; otherwise it becomes a draft you send. */
function prepareFollowups_() {
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const all = P().getProperties();
  Object.keys(all).filter(k => k.indexOf('fu:') === 0).forEach(k => {
    const to = k.slice(3), f = JSON.parse(all[k]);
    if (f.due) return;                                      // already waiting to be sent
    const th = GmailApp.search('in:sent to:' + to + ' subject:"' + f.subject.replace(/"/g, '') + '"', 0, 1)[0];
    if (!th) return;                                        // not sent yet
    const msgs = th.getMessages();
    if (msgs.some(m => m.getFrom().toLowerCase().indexOf(me) < 0)) {   // they replied, or it bounced
      if (msgs.some(m => /mailer-daemon|postmaster/i.test(m.getFrom()))) suppress_(to, 'bounced');
      P().deleteProperty(k); return;
    }
    if (Date.now() - msgs[0].getDate().getTime() < FOLLOWUP_DAYS * 86400000) return;
    if (AUTO_SEND) { f.due = th.getId(); P().setProperty(k, JSON.stringify(f)); return; }
    const body = f.text + '\n\n' + signature_();
    GmailApp.createDraft(to, /^re:/i.test(f.subject) ? f.subject : 'Re: ' + f.subject, body, { htmlBody: toHtml_(body, 0), name: FROM_NAME });
    P().deleteProperty(k);
  });
}

/** Sends ONE email if it's business hours, today's limit isn't reached and the random gap has passed.
 *  Follow-ups go first, then the oldest finished outreach draft. */
function sendNext_() {
  if (GmailApp.getUserLabelByName('83 pause')) { console.log('Paused (Gmail label "83 pause" exists).'); return; }
  const now = new Date();
  const dow = Number(Utilities.formatDate(now, TZ, 'u')), hour = Number(Utilities.formatDate(now, TZ, 'H'));
  if (dow > 5 || hour < 9 || hour >= 16) return;
  if (Date.now() < Number(P().getProperty('nextAt') || 0)) return;
  const today = Utilities.formatDate(now, TZ, 'yyyy-MM-dd');
  if (!P().getProperty('start')) P().setProperty('start', today);
  const week = Math.floor((Date.parse(today) - Date.parse(P().getProperty('start'))) / (7 * 86400000));
  const limit = RAMP[Math.min(week, RAMP.length - 1)];
  const count = Number(P().getProperty('day:' + today) || 0);
  if (count >= limit) return;
  const supp = JSON.parse(P().getProperty('supp') || '{}');
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const all = P().getProperties();
  let sent = null;

  // 1. follow-ups that are due
  for (const k of Object.keys(all).filter(x => x.indexOf('fu:') === 0)) {
    const to = k.slice(3), f = JSON.parse(all[k]);
    if (!f.due) continue;
    P().deleteProperty(k);
    if (supp[to]) continue;
    const th = GmailApp.getThreadById(f.due);
    if (!th || th.getMessages().some(m => m.getFrom().toLowerCase().indexOf(me) < 0)) continue;   // replied meanwhile
    const body = f.text + '\n\n' + signature_();
    const opts = { htmlBody: toHtml_(body, 0), name: FROM_NAME };
    const d = th.getMessages()[0].createDraftReplyAll(body, opts);   // same conversation, to the original recipient
    if ((d.getMessage().getTo() || '').toLowerCase().indexOf(to) >= 0) d.send();
    else { d.deleteDraft(); GmailApp.sendEmail(to, /^re:/i.test(f.subject) ? f.subject : 'Re: ' + f.subject, body, opts); }
    sent = 'follow-up to ' + to; break;
  }

  // 2. the oldest finished outreach draft
  if (!sent) {
    const queue = GmailApp.getDrafts().map(d => ({ d: d, m: d.getMessage() })).filter(x => {
      x.to = (x.m.getTo() || '').replace(/.*<([^>]+)>.*/, '$1').trim().toLowerCase();
      x.f = all['fu:' + x.to] && JSON.parse(all['fu:' + x.to]);
      return x.f && !x.f.due && x.m.getSubject() === x.f.subject && x.m.getPlainBody().indexOf('[[83auto]]') < 0;
    }).sort((a, b) => a.m.getDate() - b.m.getDate());
    for (const x of queue) {
      if (supp[x.to]) { x.d.deleteDraft(); P().deleteProperty('fu:' + x.to); console.log('Skipped ' + x.to + ' (on the do-not-contact list)'); continue; }
      if (x.f.claims) {
        const changed = recheckClaims_(x.f.site, x.f.claims);
        if (changed) { x.d.deleteDraft(); P().deleteProperty('fu:' + x.to); console.log('Removed draft to ' + x.to + ': ' + changed); continue; }
      }
      x.d.send();
      sent = 'email to ' + x.to; break;
    }
  }
  if (!sent) return;
  P().setProperty('day:' + today, String(count + 1));
  P().setProperty('nextAt', String(Date.now() + (GAP_MIN[0] + Math.random() * (GAP_MIN[1] - GAP_MIN[0])) * 60000));
  console.log('Sent ' + sent + ' (' + (count + 1) + ' of ' + limit + ' today)');
}

function suppress_(email, why) {
  const s = JSON.parse(P().getProperty('supp') || '{}');
  s[email] = why; P().setProperty('supp', JSON.stringify(s));
}

function unwrap_(s) {
  return s.replace(/https:\/\/www\.google\.com\/url\?q=([^&\s\]]+)(?:&[^\s\]]*)?/g, (all, q) => {
    const u = decodeURIComponent(q);
    const bare = u.match(/^http:\/\/([^\/?#]+)$/);
    return bare ? bare[1] : u;
  });
}
function parseDraft_(m) {
  const meta = {}, keep = [];
  unwrap_(m.getPlainBody()).replace(/\r/g, '').split('\n').forEach(line => {
    const mm = line.trim().match(/^\[\[(\w+)(?::(.*))?\]\]$/);
    if (mm) meta[mm[1]] = (mm[2] || '').trim(); else keep.push(line);
  });
  return { to: m.getTo().replace(/.*<([^>]+)>.*/, '$1').trim().toLowerCase(), subject: m.getSubject(),
    body: keep.join('\n').replace(/^\s+|\s+$/g, ''), imgs: meta.img ? meta.img.split('|').filter(Boolean) : [],
    site: meta.site || '', claims: meta.claims || '', followup: meta.followup || '', name: meta.name || '' };
}
function toHtml_(body, nImages) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const imgs = [];
  for (let k = 1; k <= nImages; k++) imgs.push('<p><img src="cid:concept' + k + '" alt="Concept homepage screenshot" width="600" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e3e0da"></p>');
  let at = paras.findIndex(p => /screenshot/i.test(p));
  if (at < 0) at = Math.max(0, paras.length - 3);
  const out = [];
  paras.forEach((p, k) => {
    const small = /rather not hear from me/i.test(p);
    out.push('<p' + (small ? ' style="color:#888;font-size:12px"' : '') + '>' + esc(p).replace(/\n/g, '<br>') + '</p>');
    if (k === at) out.push.apply(out, imgs);
  });
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' + out.join('\n') + '</div>';
}
function signature_() {
  return "Hayden\n83 App Studio\nHayden@83appstudio.com\n83 APPS LLC, PO BOX 730331, ORMOND BEACH FL 32174\n\nIf you'd rather not hear from me, just reply and let me know.";
}
function recheckClaims_(website, claims) {
  const list = String(claims).split(',').map(x => x.trim()).filter(Boolean);
  if (!website || !list.length) return null;
  const res = fetchFollow_(String(website));
  for (const c of list) {
    if (c === 'broken') {
      if (res.error) continue;
      if (res.code === 401 || res.code === 403 || res.code === 429) return 'website could not be re-checked (HTTP ' + res.code + '), check it yourself';
      if (res.code >= 400) continue;
      if (/buy this domain|for sale|expired|suspended|not found|isn.t connected|no site here|default page|welcome to nginx|it works!/i.test(res.body.slice(0, 20000))) continue;
      if (res.body.replace(/<[^>]+>/g, '').trim().length < 40) continue;
      return 'website works again (claim "didn\'t load" no longer true)';
    }
    if (res.error || res.code >= 400) return 'website could not be re-checked (' + (res.error || 'HTTP ' + res.code) + ')';
    if (c === 'not_secure' && /^https:/i.test(res.url)) return 'website now redirects to https (claim "Not secure" no longer true)';
    if (c === 'not_mobile_vp' && /<meta[^>]+name=["']?viewport/i.test(res.body)) return 'website now has a mobile layout (claim no longer true)';
    const m = c.match(/^old_(\d{4})$/);
    if (m) {
      const years = (res.body.match(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi) || []).map(x => Number(x.slice(-4)));
      if (years.length && Math.max.apply(null, years) > Number(m[1])) return 'footer year changed (claim no longer true)';
    }
  }
  return null;
}
function fetchFollow_(url) {
  let u = url;
  for (let hop = 0; hop < 7; hop++) {
    let r;
    try { r = UrlFetchApp.fetch(u, { followRedirects: false, muteHttpExceptions: true, validateHttpsCertificates: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36' } }); }
    catch (e) { return { error: String(e.message || e).slice(0, 80), url: u, code: 0, body: '' }; }
    const code = r.getResponseCode();
    const h = r.getAllHeaders();
    const loc = h.Location || h.location;
    if (code >= 300 && code < 400 && loc) { u = /^https?:/i.test(loc) ? loc : (u.match(/^https?:\/\/[^/]+/i)[0] + (loc[0] === '/' ? '' : '/') + loc); continue; }
    return { url: u, code: code, body: r.getContentText() || '' };
  }
  return { error: 'too many redirects', url: u, code: 0, body: '' };
}

// Whenever this file runs (whatever is selected next to Run) and the 5-minute timer is missing: install it.
if (!ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'tick')) setup();
