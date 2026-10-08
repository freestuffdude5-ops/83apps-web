/**
 * 83 App Studio: puts the concept screenshots INTO your outreach drafts. It never sends anything.
 *
 * Claude writes each outreach email as a Gmail draft that starts with the line [[83auto]] (plus a few [[...]] lines
 * with the screenshot links). Every 5 minutes this script turns each of those into a finished draft: same email,
 * same recipient, with the screenshots embedded inside it, and deletes the raw one. You open Gmail > Drafts, look at
 * each email, and press Send. Before building a draft it re-checks the website claim; if the site changed, the draft
 * is removed instead (it says so in the log).
 * Five days after you send one, if they haven't replied, it also prepares a short follow-up draft.
 *
 * Setup (once): script.google.com > New project > paste this > Save > pick "setup" next to Run > Run > Allow.
 * To stop: pick "stop" > Run. Drafts without [[83auto]] are never touched.
 */
const IMG_BASE = 'https://raw.githubusercontent.com/freestuffdude5-ops/83apps-web/';
const FROM_NAME = 'Hayden | 83 App Studio';
const FOLLOWUP_DAYS = 5;
const P = () => PropertiesService.getScriptProperties();
console.log('83 Drafts script loaded.');

/** Whatever is selected next to Run (myFunction or setup), it does the setup. */
function myFunction() { setup(); }

function setup() {
  Logger.log('Account: ' + Session.getEffectiveUser().getEmail() + '  (must be hayden@83appstudio.com)');
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  Logger.log('5-minute timer created.');
  const n = prepareDrafts_();
  Logger.log('Drafts finished with screenshots this run: ' + n + '. Any left over are done by the timer within 5 minutes.');
  Logger.log('Running. Finished drafts with screenshots are in Gmail > Drafts.');
}
function stop() { ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t)); Logger.log('Stopped.'); }

function tick() {
  console.log('Account: ' + Session.getEffectiveUser().getEmail());
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { prepareDrafts_(); prepareFollowups_(); } finally { lock.releaseLock(); }
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
    if (e.followup) P().setProperty('fu:' + e.to, JSON.stringify({ subject: e.subject, text: e.followup }));
    x.d.deleteDraft();
    done++;
    console.log('Finished draft for ' + e.to);
  }
  return done;
}

/** 5+ days after you sent one with no reply: a follow-up draft (Re: same subject; you press Send). */
function prepareFollowups_() {
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const all = P().getProperties();
  Object.keys(all).filter(k => k.indexOf('fu:') === 0).forEach(k => {
    const to = k.slice(3), f = JSON.parse(all[k]);
    const th = GmailApp.search('in:sent to:' + to + ' subject:"' + f.subject.replace(/"/g, '') + '"', 0, 1)[0];
    if (!th) return;                                        // not sent yet
    const msgs = th.getMessages();
    if (msgs.some(m => m.getFrom().toLowerCase().indexOf(me) < 0)) { P().deleteProperty(k); return; }   // they replied / bounced
    if (Date.now() - msgs[0].getDate().getTime() < FOLLOWUP_DAYS * 86400000) return;
    const body = f.text + '\n\n' + signature_();
    GmailApp.createDraft(to, /^re:/i.test(f.subject) ? f.subject : 'Re: ' + f.subject, body, { htmlBody: toHtml_(body, 0), name: FROM_NAME });
    P().deleteProperty(k);
  });
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
