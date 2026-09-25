// Prints the sound-design cue sheet (seconds, in output time) for a cut as JSON.
//   node tools/cues.mjs 30
import { K, REMAP15, COPY30, COPY15 } from '../src/timeline.js';

const cut = +(process.argv[2] || 30);
const master = [];
const cue = (t, type, v = 1, i = 0) => master.push({ t, type, v, i });
// transitions
[[K.connect[0] + 0.1, 1], [K.lift[0] + 0.05, 0.9], [K.toD[0], 0.8], [K.toE[0] + 0.1, 1.1]].forEach(([t, v]) => cue(t, 'whoosh', v));
// typing + taps on the website form
for (const [a, b] of [K.name, K.phone]) for (let t = a; t < b; t += 0.085) cue(t, 'type', 0.55);
[K.name[0] - 0.1, K.phone[0] - 0.1, K.chip, K.press].forEach((t) => cue(t, 'tap', 0.9));
cue(K.sent[0] + 0.05, 'chime', 0.9);
cue(K.dock + 0.05, 'dock', 0.8);
[K.record[0], K.appt[0], K.move[1] - 0.1, K.next[0]].forEach((t) => cue(t, 'tick', 0.7));
K.pulses.forEach(([a, b], i) => { cue(a, 'pulse', 0.5); cue(b, 'step', 0.9 + i * 0.05, i); });
cue(K.toE[1] - 0.6, 'swell', 1);
cue(K.endIn + 0.05, 'logo', 1);

function toOut(m) {
  if (cut !== 15) return [m];
  const out = [];
  for (const [a, b, ma, mb] of REMAP15) if (m >= ma && m < mb) out.push(a + ((m - ma) / (mb - ma)) * (b - a));
  return out;
}
const cues = [];
for (const c of master) for (const t of toOut(c.t)) cues.push({ ...c, t: +t.toFixed(3) });
// section markers drive the music arrangement
const copy = cut === 15 ? COPY15 : COPY30;
const sections = { duration: cut, pulseIn: cut === 15 ? 2.3 : 4.0, pulseOut: toOut(K.toE[0] + 0.4)[0] ?? (cut === 15 ? 10.4 : 22.6), endIn: copy.endcard.in };
console.log(JSON.stringify({ cues: cues.sort((a, b) => a.t - b.t), sections }, null, 1));
