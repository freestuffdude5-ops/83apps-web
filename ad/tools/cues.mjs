// Prints the sound-design cue sheet (seconds, in output time) for a cut as JSON.
//   node tools/cues.mjs 30            (main film)
//   node tools/cues.mjs 30 makeover   (website makeover film)
const cut = +(process.argv[2] || 30);
const film = process.argv[3] || 'main';
const master = [];
const cue = (t, type, v = 1, i = 0, extra = {}) => master.push({ t, type, v, i, ...extra });
let REMAP15, sections;

if (film === 'makeover') {
  const T = await import('../src/makeover-timeline.js');
  const M = T.M;
  REMAP15 = T.REMAP15;
  cue(1.0, 'whoosh', 0.7);                         // pull back from the old site
  M.chips.forEach((t) => cue(t + 0.05, 'bad', 1));  // pain callouts
  cue(M.leave[0], 'pulse', 0.9);                   // swipe back
  cue(M.scan[0] + 0.25, 'whoosh', 1.1);            // chrome scan
  for (let i = 0; i < 6; i++) cue(M.rebuild[0] + i * 0.1 + 1.5, 'snap', 1, i, { pan: (i % 3 - 1) * 0.35 }); // blocks click into place
  cue(M.phoneSwap[0], 'pulse', 0.6);
  [M.tapBook, M.svc, M.when, M.send].forEach((t) => cue(t, 'tap', 0.9));
  for (let t = M.name[0]; t < M.name[1]; t += 0.07) cue(t, 'type', 0.55);
  cue(M.sent[0] + 0.05, 'chime', 0.9);
  M.requests.forEach((t, i) => { cue(t, 'pulse', 0.4); cue(t + 0.55, 'step', 0.95 + i * 0.05, i); });
  cue(M.brand[0], 'whoosh', 1);
  cue(M.endIn + 0.05, 'logo', 1);
  sections = { ...T.MUSIC[cut], film: 'makeover', endIn: (cut === 15 ? T.COPY15 : T.COPY30).endcard.in };
} else {
  const T = await import('../src/timeline.js');
  const K = T.K;
  REMAP15 = T.REMAP15;
  [[K.connect[0] + 0.1, 1], [K.lift[0] + 0.05, 0.9], [K.toD[0], 0.8], [K.toE[0] + 0.1, 1.1]].forEach(([t, v]) => cue(t, 'whoosh', v));
  for (const [a, b] of [K.name, K.phone]) for (let t = a; t < b; t += 0.085) cue(t, 'type', 0.55);
  [K.name[0] - 0.1, K.phone[0] - 0.1, K.chip, K.press].forEach((t) => cue(t, 'tap', 0.9));
  cue(K.sent[0] + 0.05, 'chime', 0.9);
  cue(K.dock + 0.05, 'dock', 0.8);
  [K.record[0], K.appt[0], K.move[1] - 0.1, K.next[0]].forEach((t) => cue(t, 'tick', 0.7));
  K.pulses.forEach(([a, b], i) => { cue(a, 'pulse', 0.5); cue(b, 'step', 0.9 + i * 0.05, i); });
  cue(K.endIn + 0.05, 'logo', 1);
  const copy = cut === 15 ? T.COPY15 : T.COPY30;
  // section markers drive the music arrangement (beat grid at 120 BPM)
  sections = cut === 15
    ? { duration: 15, grid0: 0.3, drop: 2.3, build: 9.8, brand: 10.8, logo: 11.8, final: 13.8, endIn: copy.endcard.in }
    : { duration: 30, grid0: 0.0, drop: 4.0, build: 22.0, brand: 24.0, logo: 26.0, final: 28.0, endIn: copy.endcard.in };
}

function toOut(m) {
  if (cut !== 15) return [m];
  const out = [];
  for (const [a, b, ma, mb] of REMAP15) if (m >= ma && m < mb) out.push(a + ((m - ma) / (mb - ma)) * (b - a));
  return out;
}
const cues = [];
for (const c of master) for (const t of toOut(c.t)) cues.push({ ...c, t: +t.toFixed(3) });
console.log(JSON.stringify({ cues: cues.sort((a, b) => a.t - b.t), sections }, null, 1));
