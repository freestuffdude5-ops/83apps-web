/**
 * 83 App Studio: automatic outreach sender (no spreadsheet).
 *
 * Claude prepares each email as a Gmail DRAFT that starts with the line [[83auto]]. Every 5 minutes this script
 * sends at most one of those drafts, during Mon-Fri 9:00-16:00 Eastern, with the concept screenshots embedded
 * in the email (downloaded from the links in the draft). It ramps up slowly (15, 25, 40, then 60 a day), sends
 * one follow-up in the same thread after 5 days with no reply, and stops for anyone who replies, bounces or asks
 * to be left alone. Before the first email it re-checks the website claim; if the site changed, the draft is
 * dropped instead of sent. At 4 PM it emails you a one-line summary.
 *
 * Setup (once): script.google.com > New project > paste this > Save > choose "setup" next to Run > Run > Allow.
 * Pause: run "pause". Resume: run "setup" again. Drafts without [[83auto]] are never touched.
 */
const CFG = {
  TZ: 'America/New_York', DAYS: [1, 2, 3, 4, 5], START_HOUR: 9, END_HOUR: 16,
  RAMP: [15, 25, 40, 60], MIN_GAP_MIN: 6, MAX_GAP_MIN: 14, FOLLOWUP_DAYS: 5,
  FROM_NAME: 'Hayden | 83 App Studio',
  IMG_BASE: 'https://raw.githubusercontent.com/freestuffdude5-ops/83apps-web/',
  SUMMARY_HOUR: 16,
};
const OPT_OUT_RE = /\b(unsubscribe|remove me|take me off|stop emailing|do not (contact|email)|don'?t (contact|email)|not interested|no thank)/i;
const BOUNCE_RE = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;
const P = () => PropertiesService.getScriptProperties();

// ---------------------------------------------------------------- setup / control
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  const p = P();
  if (!p.getProperty('start')) p.setProperty('start', today_());
  p.deleteProperty('paused');
  const n = autoDrafts_().length;
  Logger.log('Running. ' + n + ' outreach drafts waiting. Today\'s limit: ' + quota_() + '.');
}
function pause() { P().setProperty('paused', '1'); Logger.log('Paused. Run setup to resume.'); }
function status() { Logger.log(JSON.stringify(stats_(), null, 1)); }

// ---------------------------------------------------------------- the 5-minute heartbeat
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const p = P();
    if (p.getProperty('paused')) return;
    if (Date.now() - Number(p.getProperty('lastCheck') || 0) > 20 * 60000) { checkReplies_(); p.setProperty('lastCheck', String(Date.now())); }
    maybeSummary_();
    if (!inWindow_()) return;
    if (Date.now() < Number(p.getProperty('nextAt') || 0)) return;
    if (sentToday_() >= quota_()) return;
    const did = sendFollowup_() || sendFirst_();
    if (did) p.setProperty('nextAt', String(Date.now() + (CFG.MIN_GAP_MIN + Math.random() * (CFG.MAX_GAP_MIN - CFG.MIN_GAP_MIN)) * 60000));
  } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- first emails (from drafts)
function autoDrafts_() {
  return GmailApp.getDrafts().map(d => ({ d: d, m: d.getMessage() }))
    .filter(x => x.m.getPlainBody().indexOf('[[83auto]]') >= 0)
    .sort((a, b) => a.m.getDate() - b.m.getDate());
}

/** Undo Gmail's link wrapping (https://www.google.com/url?q=X&...) and its http:// on bare domain names. */
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

function sendFirst_() {
  const supp = supp_();
  for (const x of autoDrafts_()) {
    const e = parseDraft_(x.m);
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e.to) || supp[e.to] || sentTo_(e.to)) { x.d.deleteDraft(); log_('dropped (bad, suppressed or already emailed): ' + e.to); continue; }
    if (e.claims) {
      const changed = recheckClaims_(e.site, e.claims);
      if (changed) { x.d.deleteDraft(); log_('dropped ' + e.to + ': ' + changed); bumpSkipped_(); continue; }
    }
    const images = e.imgs.map(u => UrlFetchApp.fetch(/^https?:/.test(u) ? u : CFG.IMG_BASE + u).getBlob());
    const res = sendRaw_({ to: e.to, subject: e.subject, text: e.body, html: toHtml_(e.body, images.length), images: images });
    const rec = { to: e.to, at: Date.now(), name: e.name, followup: e.followup, msgId: res.messageId, subject: e.subject };
    P().setProperty('t:' + res.threadId, JSON.stringify(rec));
    x.d.deleteDraft();
    bumpSent_(); log_('sent ' + e.to);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- follow-ups, replies
function threads_() {
  const all = P().getProperties(), out = [];
  Object.keys(all).filter(k => k.indexOf('t:') === 0).forEach(k => out.push({ id: k.slice(2), r: JSON.parse(all[k]) }));
  return out;
}
function sendFollowup_() {
  const supp = supp_();
  for (const t of threads_()) {
    const r = t.r;
    if (r.done || r.fu || !r.followup || Date.now() - r.at < CFG.FOLLOWUP_DAYS * 86400000 || supp[r.to]) continue;
    if (replyIn_(t.id, r)) continue;
    const subj = /^re:/i.test(r.subject) ? r.subject : 'Re: ' + r.subject;
    const body = r.followup + '\n\n' + signature_();
    sendRaw_({ to: r.to, subject: subj, text: body, html: toHtml_(body, 0), images: [], threadId: t.id, inReplyTo: r.msgId });
    r.fu = Date.now(); P().setProperty('t:' + t.id, JSON.stringify(r));
    bumpSent_(); log_('follow-up ' + r.to);
    return true;
  }
  return false;
}
/** Looks at the thread; records replied / bounced / opted out. True if the conversation should stop. */
function replyIn_(id, r) {
  let th; try { th = GmailApp.getThreadById(id); } catch (e) { return false; }
  if (!th) return false;
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  for (const m of th.getMessages()) {
    const from = m.getFrom().toLowerCase();
    if (from.indexOf(me) >= 0) continue;
    const snip = m.getPlainBody().slice(0, 600);
    r.done = BOUNCE_RE.test(from) ? 'bounced' : (OPT_OUT_RE.test(snip) ? 'opted out' : 'replied');
    if (r.done !== 'replied') addSupp_(r.to, r.done);
    P().setProperty('t:' + id, JSON.stringify(r));
    log_(r.done + ': ' + r.to);
    return true;
  }
  return false;
}
function checkReplies_() {
  threads_().forEach(t => { if (!t.r.done) replyIn_(t.id, t.r); });
  try {   // bounces that Gmail didn't thread
    GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:3d', 0, 30).forEach(th => {
      const txt = th.getMessages().map(m => m.getPlainBody()).join(' ').toLowerCase();
      threads_().forEach(t => { if (!t.r.done && txt.indexOf(t.r.to) >= 0) { t.r.done = 'bounced'; addSupp_(t.r.to, 'bounced'); P().setProperty('t:' + t.id, JSON.stringify(t.r)); } });
    });
  } catch (e) {}
}

// ---------------------------------------------------------------- sending (Gmail API with this script's own access)
function sendRaw_(o) {
  const me = Session.getEffectiveUser().getEmail();
  const raw = buildMime_({ from: me, fromName: CFG.FROM_NAME, to: o.to, subject: o.subject, text: o.text, html: o.html, images: o.images, inReplyTo: o.inReplyTo, unsubscribe: me });
  const payload = { raw: Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8) };
  if (o.threadId) payload.threadId = o.threadId;
  const api = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
  const hdr = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  let res;
  try {
    res = JSON.parse(UrlFetchApp.fetch(api + '/send', { method: 'post', contentType: 'application/json', headers: hdr, payload: JSON.stringify(payload) }).getContentText());
    if (!res.id) throw new Error(JSON.stringify(res).slice(0, 200));
  } catch (err) {   // Gmail API not available to this script: use Gmail's built-in sender instead
    const inline = {}; o.images.forEach((b, k) => { inline['concept' + (k + 1)] = b; });
    const subj = o.threadId ? o.subject : o.subject;
    GmailApp.sendEmail(o.to, subj, o.text, { htmlBody: o.html, inlineImages: inline, name: CFG.FROM_NAME });
    const th = GmailApp.search('in:sent to:' + o.to + ' newer_than:1d', 0, 1)[0];
    if (th) th.addLabel(GmailApp.getUserLabelByName('83 Outreach') || GmailApp.createLabel('83 Outreach'));
    return { threadId: th ? th.getId() : 'x' + Date.now(), messageId: '' };
  }
  let messageId = '';
  try {
    const meta = JSON.parse(UrlFetchApp.fetch(api + '/' + res.id + '?format=metadata&metadataHeaders=Message-ID', { headers: hdr }).getContentText());
    messageId = ((meta.payload.headers || []).find(h => /^message-id$/i.test(h.name)) || {}).value || '';
  } catch (e) {}
  GmailApp.getThreadById(res.threadId).addLabel(GmailApp.getUserLabelByName('83 Outreach') || GmailApp.createLabel('83 Outreach'));
  return { threadId: res.threadId, messageId: messageId };
}

/** Plain paragraphs to simple HTML; screenshots go right after the paragraph that mentions "screenshot". */
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

// ---------------------------------------------------------------- pacing, state, summary
function today_() { return Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd'); }
function inWindow_() {
  const now = new Date(), day = Number(Utilities.formatDate(now, CFG.TZ, 'u')), hour = Number(Utilities.formatDate(now, CFG.TZ, 'H'));
  return CFG.DAYS.indexOf(day) >= 0 && hour >= CFG.START_HOUR && hour < CFG.END_HOUR;
}
function quota_() {
  const s = P().getProperty('start'); if (!s) return CFG.RAMP[0];
  const weeks = Math.floor((Date.parse(today_()) - Date.parse(s)) / (7 * 86400000));
  return CFG.RAMP[Math.min(Math.max(weeks, 0), CFG.RAMP.length - 1)];
}
function sentToday_() { return Number(P().getProperty('sent:' + today_()) || 0); }
function bumpSent_() { P().setProperty('sent:' + today_(), String(sentToday_() + 1)); }
function bumpSkipped_() { const k = 'skip:' + today_(); P().setProperty(k, String(Number(P().getProperty(k) || 0) + 1)); }
function supp_() { return JSON.parse(P().getProperty('supp') || '{}'); }
function addSupp_(email, why) { const s = supp_(); s[email] = why; P().setProperty('supp', JSON.stringify(s)); }
function sentTo_(email) { return threads_().some(t => t.r.to === email); }
function log_(s) { console.log(s); const k = 'log:' + today_(); P().setProperty(k, ((P().getProperty(k) || '') + '\n' + Utilities.formatDate(new Date(), CFG.TZ, 'HH:mm') + ' ' + s).slice(-8000)); }
function stats_() {
  const t = threads_();
  return { drafts_waiting: autoDrafts_().length, sent_today: sentToday_(), limit_today: quota_(), emailed_total: t.length,
    followed_up: t.filter(x => x.r.fu).length, replied: t.filter(x => x.r.done === 'replied').length,
    opted_out: t.filter(x => x.r.done === 'opted out').length, bounced: t.filter(x => x.r.done === 'bounced').length,
    paused: !!P().getProperty('paused') };
}
function maybeSummary_() {
  const now = new Date(), day = Number(Utilities.formatDate(now, CFG.TZ, 'u')), hour = Number(Utilities.formatDate(now, CFG.TZ, 'H'));
  if (CFG.DAYS.indexOf(day) < 0 || hour < CFG.SUMMARY_HOUR || P().getProperty('summary:' + today_())) return;
  P().setProperty('summary:' + today_(), '1');
  const s = stats_(), me = Session.getEffectiveUser().getEmail();
  const replies = threads_().filter(x => x.r.done === 'replied').map(x => x.r.to);
  GmailApp.sendEmail(me, '83 Outreach today: ' + s.sent_today + ' sent, ' + s.replied + ' replies so far',
    'Sent today: ' + s.sent_today + ' of ' + s.limit_today + '\nSkipped today (site changed): ' + (P().getProperty('skip:' + today_()) || 0) +
    '\nDrafts still waiting: ' + s.drafts_waiting + '\nTotal emailed: ' + s.emailed_total + ' | followed up: ' + s.followed_up +
    '\nReplies: ' + s.replied + (replies.length ? ' (' + replies.join(', ') + ')' : '') + '\nOpted out: ' + s.opted_out + ' | bounced: ' + s.bounced +
    '\n\nToday\'s log:' + (P().getProperty('log:' + today_()) || ' nothing'));
}
function wrap_(s) { return String(s).replace(/(.{76})/g, '$1\r\n'); }
function buildMime_(o) {
  const b64 = s => wrap_(Utilities.base64Encode(s, Utilities.Charset.UTF_8));
  const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?=';
  const encName = s => /^[\x20-\x7e]*$/.test(s) ? '"' + String(s).replace(/["\\]/g, '') + '"' : enc(s);
  const alt = 'alt-' + Utilities.getUuid(), rel = 'rel-' + Utilities.getUuid();
  const head = ['MIME-Version: 1.0', 'From: ' + encName(o.fromName) + ' <' + o.from + '>', 'To: ' + o.to, 'Subject: ' + enc(String(o.subject))];
  if (o.inReplyTo) head.push('In-Reply-To: ' + o.inReplyTo, 'References: ' + o.inReplyTo);
  if (o.unsubscribe) head.push('List-Unsubscribe: <mailto:' + o.unsubscribe + '?subject=unsubscribe>');
  const altPart = ['--' + alt, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(o.text),
    '--' + alt, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(o.html), '--' + alt + '--'].join('\r\n');
  if (!o.images.length) return head.concat(['Content-Type: multipart/alternative; boundary="' + alt + '"', '', altPart]).join('\r\n');
  const parts = ['--' + rel, 'Content-Type: multipart/alternative; boundary="' + alt + '"', '', altPart];
  o.images.forEach((img, k) => {
    const name = 'concept' + (k + 1) + '.jpg';
    parts.push('--' + rel, 'Content-Type: ' + (img.getContentType() || 'image/jpeg') + '; name="' + name + '"', 'Content-Transfer-Encoding: base64',
      'Content-ID: <concept' + (k + 1) + '>', 'Content-Disposition: inline; filename="' + name + '"', '', wrap_(Utilities.base64Encode(img.getBytes())));
  });
  parts.push('--' + rel + '--');
  return head.concat(['Content-Type: multipart/related; boundary="' + rel + '"', '', parts.join('\r\n')]).join('\r\n');
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
