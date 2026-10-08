/**
 * 83 App Studio outreach sender: Google Sheet + Apps Script + Gmail API.
 *
 * Sends one approved lead at a time during business hours, ramps the daily volume up slowly,
 * sends one follow-up in the same thread if there is no reply, and stops automatically on
 * replies, bounces and opt-outs. Nothing is sent unless the row's "approved" cell says YES.
 *
 * Setup (once): Extensions > Apps Script, paste this file, add the "Gmail API" service
 * (Services +), reload the sheet, then use the Outreach menu: Set up sheet > Send a test to myself > Start.
 */

const TAB = { SETTINGS: 'Settings', LEADS: 'Leads', SUPP: 'Suppression', LOG: 'Log' };
const LEAD_COLS = ['approved', 'business', 'email', 'subject', 'body', 'image_file', 'followup_body',
  'status', 'sent_at', 'thread_id', 'message_id', 'followup_at', 'replied_at', 'notes'];
const DEFAULTS = [
  ['FROM_NAME', 'Hayden | 83 App Studio', 'Name people see in their inbox'],
  ['SIGNATURE', 'Hayden\n83 App Studio\nHayden@83appstudio.com', 'Added under every email'],
  ['MAILING_ADDRESS', '', 'REQUIRED by law (CAN-SPAM). Your PO box, one line. Nothing sends while this is empty.'],
  ['OPT_OUT_LINE', "If you'd rather not hear from me, just reply and let me know.", 'Required opt-out wording'],
  ['SEND_DAYS', '1,2,3,4,5', 'Days to send (1=Mon ... 7=Sun)'],
  ['SEND_START_HOUR', 9, 'Local time, 24h'],
  ['SEND_END_HOUR', 16, 'Stops starting new sends at this hour'],
  ['RAMP_PER_WEEK', '15,25,40,60', 'Max emails per day in week 1, 2, 3, then 4+ (follow-ups count too)'],
  ['MIN_GAP_MINUTES', 6, 'Random pause between emails: at least...'],
  ['MAX_GAP_MINUTES', 14, '...and at most'],
  ['FOLLOWUP_AFTER_DAYS', 5, 'Send the follow-up this many days after the first email if no reply'],
  ['FOLLOWUPS_ENABLED', 'YES', 'YES or NO'],
  ['IMAGE_FOLDER', '83 Apps Outreach Images', 'Google Drive folder holding the screenshots named in image_file'],
  ['PAUSED', 'NO', 'Set to YES to pause instantly'],
  ['START_DATE', '', 'Filled in when you press Start (used for the ramp)'],
];
const OPT_OUT_RE = /\b(unsubscribe|remove me|take me off|stop emailing|do not (contact|email)|don'?t (contact|email)|not interested|no thank)/i;
const BOUNCE_FROM_RE = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i;

// ---------------------------------------------------------------- menu & setup
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Outreach')
    .addItem('1. Set up sheet', 'setup')
    .addItem('2. Send a test to myself', 'sendTest')
    .addItem('3. Start automatic sending', 'start')
    .addSeparator()
    .addItem('Stop automatic sending', 'stop')
    .addItem('Check replies now', 'checkReplies')
    .addItem('Show today\'s status', 'showStatus')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(TAB.SETTINGS) || ss.insertSheet(TAB.SETTINGS);
  if (s.getLastRow() < 2) {
    s.getRange(1, 1, 1, 3).setValues([['setting', 'value', 'what it does']]).setFontWeight('bold');
    s.getRange(2, 1, DEFAULTS.length, 3).setValues(DEFAULTS);
    s.setColumnWidth(1, 190); s.setColumnWidth(2, 320); s.setColumnWidth(3, 520);
  }
  let l = ss.getSheetByName(TAB.LEADS) || ss.insertSheet(TAB.LEADS);
  if (l.getLastRow() < 1) l.getRange(1, 1, 1, LEAD_COLS.length).setValues([LEAD_COLS]).setFontWeight('bold');
  l.setFrozenRows(1);
  let p = ss.getSheetByName(TAB.SUPP) || ss.insertSheet(TAB.SUPP);
  if (p.getLastRow() < 1) p.getRange(1, 1, 1, 3).setValues([['email', 'reason', 'date']]).setFontWeight('bold');
  let g = ss.getSheetByName(TAB.LOG) || ss.insertSheet(TAB.LOG);
  if (g.getLastRow() < 1) g.getRange(1, 1, 1, 5).setValues([['time', 'type', 'business', 'email', 'detail']]).setFontWeight('bold');
  toast_('Sheet ready. Paste or import your leads into the Leads tab, fill in MAILING_ADDRESS, then send a test.');
}

function start() {
  const st = settings_();
  if (!String(st.MAILING_ADDRESS || '').trim()) { alert_('Fill in MAILING_ADDRESS on the Settings tab first (your PO box). It is required by law.'); return; }
  if (!st.START_DATE) setSetting_('START_DATE', Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'));
  setSetting_('PAUSED', 'NO');
  stop_(true);
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  log_('start', '', '', 'Automatic sending started');
  alert_('Started. It checks every 5 minutes and sends one approved lead at a time during your sending hours. ' +
    'Use Outreach > Stop to stop, or set PAUSED to YES.');
}

function stop() { stop_(false); alert_('Stopped. Nothing more will be sent until you press Start again.'); }

function stop_(quiet) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'tick').forEach(t => ScriptApp.deleteTrigger(t));
  if (!quiet) log_('stop', '', '', 'Automatic sending stopped');
}

// ---------------------------------------------------------------- the 5-minute heartbeat
function tick() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const st = settings_();
    if (yes_(st.PAUSED)) return;
    if (!String(st.MAILING_ADDRESS || '').trim()) { log_('blocked', '', '', 'MAILING_ADDRESS is empty: nothing sent'); return; }
    const props = PropertiesService.getScriptProperties();
    if (Date.now() - Number(props.getProperty('lastReplyCheck') || 0) > 25 * 60 * 1000) {
      checkReplies(); props.setProperty('lastReplyCheck', String(Date.now()));
    }
    if (!inWindow_(st)) return;
    if (Date.now() < Number(props.getProperty('nextSendAt') || 0)) return;
    if (sentToday_() >= quota_(st)) return;
    const did = sendNextFollowup_(st) || sendNextInitial_(st);
    if (did) {
      const gap = randBetween_(Number(st.MIN_GAP_MINUTES) || 6, Number(st.MAX_GAP_MINUTES) || 14);
      props.setProperty('nextSendAt', String(Date.now() + gap * 60 * 1000));
    }
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- sending
function sendNextInitial_(st) {
  const { sheet, rows, col } = leads_();
  const supp = suppression_();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!yes_(r[col.approved]) || String(r[col.status] || '').trim()) continue;
    const email = String(r[col.email] || '').trim().toLowerCase();
    const rowNum = i + 2;
    if (!/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(email)) { setCells_(sheet, rowNum, col, { status: 'bad email' }); continue; }
    if (supp.has(email)) { setCells_(sheet, rowNum, col, { status: 'skipped: on suppression list' }); continue; }
    if (!hasMx_(email.split('@')[1])) { setCells_(sheet, rowNum, col, { status: 'bad email: domain has no mail server' }); continue; }
    try {
      const res = sendMail_(st, { to: email, subject: r[col.subject], body: r[col.body], images: imageBlobs_(st, r[col.image_file]) });
      setCells_(sheet, rowNum, col, { status: 'sent', sent_at: new Date(), thread_id: res.threadId, message_id: res.messageId });
      bumpSent_(); log_('sent', r[col.business], email, r[col.subject]);
    } catch (e) {
      setCells_(sheet, rowNum, col, { status: 'error: ' + String(e.message || e).slice(0, 120) });
      log_('error', r[col.business], email, String(e.message || e));
    }
    return true;
  }
  return false;
}

function sendNextFollowup_(st) {
  if (!yes_(st.FOLLOWUPS_ENABLED)) return false;
  const { sheet, rows, col } = leads_();
  const supp = suppression_();
  const waitMs = (Number(st.FOLLOWUP_AFTER_DAYS) || 5) * 86400000;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r[col.status] !== 'sent' || !r[col.followup_body] || r[col.followup_at] || !r[col.thread_id]) continue;
    const sentAt = r[col.sent_at] instanceof Date ? r[col.sent_at].getTime() : Date.parse(r[col.sent_at]);
    if (!sentAt || Date.now() - sentAt < waitMs) continue;
    const email = String(r[col.email]).trim().toLowerCase();
    if (supp.has(email)) continue;
    const rowNum = i + 2;
    if (threadHasReply_(r[col.thread_id], rowNum, sheet, col, email, r[col.business])) continue;   // a reply arrived since the last check
    try {
      const subj = /^re:/i.test(r[col.subject]) ? r[col.subject] : 'Re: ' + r[col.subject];
      sendMail_(st, { to: email, subject: subj, body: r[col.followup_body], images: [], threadId: r[col.thread_id], inReplyTo: r[col.message_id] });
      setCells_(sheet, rowNum, col, { status: 'followed up', followup_at: new Date() });
      bumpSent_(); log_('follow-up', r[col.business], email, subj);
    } catch (e) {
      setCells_(sheet, rowNum, col, { notes: 'follow-up error: ' + String(e.message || e).slice(0, 120) });
      log_('error', r[col.business], email, 'follow-up: ' + String(e.message || e));
    }
    return true;
  }
  return false;
}

/** Builds a MIME message (plain text + HTML with inline images) and sends it with the Gmail API. */
function sendMail_(st, m) {
  const me = Session.getEffectiveUser().getEmail();
  const tail = String(st.SIGNATURE || '').trim() + '\n' + String(st.MAILING_ADDRESS || '').trim();
  const text = String(m.body).trim() + (m.images.length ? '\n\n[Screenshot attached below]' : '') + '\n\n' + tail + '\n\n' + st.OPT_OUT_LINE;
  const html = toHtml_(String(m.body).trim(), m.images.length, tail, st.OPT_OUT_LINE);
  const raw = buildMime_({ from: me, fromName: st.FROM_NAME, to: m.to, subject: m.subject, text: text, html: html,
    images: m.images, inReplyTo: m.inReplyTo, unsubscribe: me });
  const req = { raw: Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8) };
  if (m.threadId) req.threadId = m.threadId;
  const sent = Gmail.Users.Messages.send(req, 'me');
  let messageId = '';
  try {
    const meta = Gmail.Users.Messages.get('me', sent.id, { format: 'metadata', metadataHeaders: ['Message-ID'] });
    const h = (meta.payload.headers || []).find(x => /^message-id$/i.test(x.name));
    messageId = h ? h.value : '';
  } catch (e) { /* threading still works through threadId */ }
  return { threadId: sent.threadId, messageId: messageId };
}

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

/** Plain paragraphs to simple HTML; screenshots go right after the paragraph that mentions "screenshot". */
function toHtml_(body, nImages, tail, optOut) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const imgs = [];
  for (let k = 1; k <= nImages; k++) imgs.push('<p><img src="cid:concept' + k + '" alt="Concept homepage screenshot" width="600" style="max-width:100%;height:auto;border-radius:8px;border:1px solid #e3e0da"></p>');
  let at = paras.findIndex(p => /screenshot/i.test(p));
  if (at < 0) at = Math.max(0, paras.length - 2);
  const out = [];
  paras.forEach((p, k) => { out.push('<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'); if (k === at) out.push.apply(out, imgs); });
  out.push('<p>' + esc(tail).replace(/\n/g, '<br>') + '</p>', '<p style="color:#888;font-size:12px">' + esc(optOut) + '</p>');
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' + out.join('\n') + '</div>';
}

// ---------------------------------------------------------------- replies, bounces, opt-outs
function checkReplies() {
  const { sheet, rows, col } = leads_();
  rows.forEach((r, i) => {
    if (!r[col.thread_id] || !/^(sent|followed up)$/.test(r[col.status])) return;
    threadHasReply_(r[col.thread_id], i + 2, sheet, col, String(r[col.email]).toLowerCase(), r[col.business]);
  });
  // bounce notices Gmail did not thread with the original
  try {
    const list = Gmail.Users.Messages.list('me', { q: 'from:(mailer-daemon OR postmaster) newer_than:3d', maxResults: 50 });
    (list.messages || []).forEach(m => {
      const msg = Gmail.Users.Messages.get('me', m.id, { format: 'metadata' });
      const snip = String(msg.snippet || '').toLowerCase();
      rows.forEach((r, i) => {
        const email = String(r[col.email] || '').toLowerCase();
        if (email && snip.indexOf(email) >= 0 && /^(sent|followed up)$/.test(r[col.status])) {
          setCells_(sheet, i + 2, col, { status: 'bounced' }); addSuppression_(email, 'bounced'); log_('bounce', r[col.business], email, msg.snippet);
        }
      });
    });
  } catch (e) { /* optional */ }
}

/** True if someone other than me wrote in the thread; updates the row (replied / bounced / opted out). */
function threadHasReply_(threadId, rowNum, sheet, col, email, business) {
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  let t;
  try { t = Gmail.Users.Threads.get('me', threadId, { format: 'metadata', metadataHeaders: ['From'] }); } catch (e) { return false; }
  for (const m of (t.messages || [])) {
    const from = ((m.payload.headers || []).find(h => /^from$/i.test(h.name)) || {}).value || '';
    if (from.toLowerCase().indexOf(me) >= 0) continue;
    const snippet = String(m.snippet || '');
    if (BOUNCE_FROM_RE.test(from)) {
      setCells_(sheet, rowNum, col, { status: 'bounced' }); addSuppression_(email, 'bounced'); log_('bounce', business, email, snippet);
    } else if (OPT_OUT_RE.test(snippet)) {
      setCells_(sheet, rowNum, col, { status: 'opted out', replied_at: new Date(m.internalDate * 1) }); addSuppression_(email, 'asked not to be contacted');
      log_('opt-out', business, email, snippet);
    } else {
      setCells_(sheet, rowNum, col, { status: 'replied', replied_at: new Date(m.internalDate * 1) }); log_('REPLY', business, email, snippet);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- test & status
function sendTest() {
  const st = settings_();
  if (!String(st.MAILING_ADDRESS || '').trim()) { alert_('Fill in MAILING_ADDRESS on the Settings tab first.'); return; }
  const { rows, col } = leads_();
  const r = rows.find(x => x[col.business] && x[col.body]);
  if (!r) { alert_('Add at least one lead to the Leads tab first.'); return; }
  const me = Session.getEffectiveUser().getEmail();
  sendMail_(st, { to: me, subject: '[TEST for ' + r[col.email] + '] ' + r[col.subject], body: r[col.body], images: imageBlobs_(st, r[col.image_file]) });
  if (r[col.followup_body]) sendMail_(st, { to: me, subject: '[TEST follow-up] Re: ' + r[col.subject], body: r[col.followup_body], images: [] });
  alert_('Sent a test of "' + r[col.business] + '" (and its follow-up) to ' + me + '. Check how it looks on your phone and computer.');
}

function showStatus() {
  const st = settings_();
  const { rows, col } = leads_();
  const count = s => rows.filter(r => r[col.status] === s).length;
  const waiting = rows.filter(r => yes_(r[col.approved]) && !String(r[col.status] || '').trim()).length;
  alert_('Today: ' + sentToday_() + ' of ' + quota_(st) + ' sent.\nApproved and waiting: ' + waiting + '\nSent: ' + count('sent') +
    '  Followed up: ' + count('followed up') + '\nReplied: ' + count('replied') + '  Opted out: ' + count('opted out') + '  Bounced: ' + count('bounced') +
    '\nAutomatic sending is ' + (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'tick') ? 'ON' : 'OFF') + (yes_(st.PAUSED) ? ' (paused)' : '') + '.');
}

// ---------------------------------------------------------------- helpers
function settings_() {
  const s = SpreadsheetApp.getActive().getSheetByName(TAB.SETTINGS);
  const out = {};
  DEFAULTS.forEach(d => out[d[0]] = d[1]);
  if (s && s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, 2).getValues().forEach(([k, v]) => { if (k) out[String(k).trim()] = v; });
  return out;
}
function setSetting_(key, value) {
  const s = SpreadsheetApp.getActive().getSheetByName(TAB.SETTINGS);
  const keys = s.getRange(2, 1, Math.max(1, s.getLastRow() - 1), 1).getValues().map(r => r[0]);
  const i = keys.indexOf(key);
  if (i >= 0) s.getRange(i + 2, 2).setValue(value); else s.appendRow([key, value, '']);
}
function leads_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TAB.LEADS);
  const last = sheet.getLastRow();
  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const col = {};
  LEAD_COLS.forEach(c => { col[c] = header.indexOf(c); if (col[c] < 0) throw new Error('Leads tab is missing the column "' + c + '"'); });
  const rows = last > 1 ? sheet.getRange(2, 1, last - 1, header.length).getValues() : [];
  return { sheet, rows, col };
}
function setCells_(sheet, rowNum, col, values) { Object.keys(values).forEach(k => sheet.getRange(rowNum, col[k] + 1).setValue(values[k])); }
function suppression_() {
  const s = SpreadsheetApp.getActive().getSheetByName(TAB.SUPP);
  if (!s || s.getLastRow() < 2) return new Set();
  return new Set(s.getRange(2, 1, s.getLastRow() - 1, 1).getValues().map(r => String(r[0]).trim().toLowerCase()).filter(Boolean));
}
function addSuppression_(email, reason) {
  if (suppression_().has(email)) return;
  SpreadsheetApp.getActive().getSheetByName(TAB.SUPP).appendRow([email, reason, new Date()]);
}
function log_(type, business, email, detail) {
  const s = SpreadsheetApp.getActive().getSheetByName(TAB.LOG);
  if (s) s.appendRow([new Date(), type, business || '', email || '', String(detail || '').slice(0, 300)]);
}
function imageBlobs_(st, names) {
  const list = String(names || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!list.length) return [];
  const folders = DriveApp.getFoldersByName(st.IMAGE_FOLDER);
  if (!folders.hasNext()) throw new Error('Drive folder "' + st.IMAGE_FOLDER + '" not found');
  const folder = folders.next();
  return list.map(n => {
    const it = folder.getFilesByName(n);
    if (!it.hasNext()) throw new Error('Image "' + n + '" not found in "' + st.IMAGE_FOLDER + '"');
    return it.next().getBlob();
  });
}
function hasMx_(domain) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('mx:' + domain);
  if (hit) return hit === '1';
  let ok = true;   // if the lookup itself fails, don't block the send
  try {
    const j = JSON.parse(UrlFetchApp.fetch('https://dns.google/resolve?name=' + encodeURIComponent(domain) + '&type=MX', { muteHttpExceptions: true }).getContentText());
    ok = j.Status === 0 && (j.Answer || []).length > 0;
  } catch (e) { ok = true; }
  cache.put('mx:' + domain, ok ? '1' : '0', 21600);
  return ok;
}
function tz_() { return Session.getScriptTimeZone() || 'America/New_York'; }
function today_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function sentToday_() { return Number(PropertiesService.getScriptProperties().getProperty('sent:' + today_()) || 0); }
function bumpSent_() { PropertiesService.getScriptProperties().setProperty('sent:' + today_(), String(sentToday_() + 1)); }
function quota_(st) {
  const ramp = String(st.RAMP_PER_WEEK || '15').split(',').map(x => Number(x.trim())).filter(x => x > 0);
  const start = st.START_DATE ? new Date(st.START_DATE) : new Date();
  const week = Math.max(0, Math.floor((Date.now() - start.getTime()) / (7 * 86400000)));
  return ramp[Math.min(week, ramp.length - 1)] || 15;
}
function inWindow_(st) {
  const now = new Date();
  const day = Number(Utilities.formatDate(now, tz_(), 'u'));      // 1 = Monday ... 7 = Sunday
  const hour = Number(Utilities.formatDate(now, tz_(), 'H'));
  const days = String(st.SEND_DAYS).split(',').map(x => Number(x.trim()));
  return days.indexOf(day) >= 0 && hour >= Number(st.SEND_START_HOUR) && hour < Number(st.SEND_END_HOUR);
}
function randBetween_(a, b) { return a + Math.random() * Math.max(0, b - a); }
function wrap_(s) { return String(s).replace(/(.{76})/g, '$1\r\n'); }
function yes_(v) { return v === true || /^(yes|y|true|1)$/i.test(String(v).trim()); }
function alert_(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } }
function toast_(msg) { try { SpreadsheetApp.getActive().toast(msg, 'Outreach', 8); } catch (e) { Logger.log(msg); } }
