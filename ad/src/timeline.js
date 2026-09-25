// Master timing (seconds) for the 30-second film, the on-screen copy, and
// the time remap that produces the 15-second cut from the same animation.

export const FPS = 30;

export const K = {
  connect: [3.2, 4.1],     // ribbon pulls taut through the fragments
  gather: [3.55, 4.85],      // fragments fly into the screens, devices appear
  name: [5.35, 6.25],
  phone: [6.45, 7.2],
  chip: 7.5,
  press: 7.95,
  sent: [8.15, 8.75],
  lift: [9.0, 10.55],      // inquiry lifts off the phone and travels to the workspace
  dock: 10.35,
  record: [10.9, 11.8],
  appt: [12.25, 12.85],
  move: [13.1, 13.9],
  next: [14.2, 14.8],
  toD: [16.15, 17.3],
  wires: [17.0, 17.85],
  pulses: [[17.8, 18.45], [18.65, 19.3], [19.5, 20.15]],
  toE: [22.15, 23.7],
  endIn: 26.2,
};

// On-screen copy for the 30s master (vertical and landscape share it).
export const COPY30 = {
  blocks: [
    { lines: ['Too much busywork?'], in: 0.75, out: 3.75 },
    { eyebrow: ['01', 'Websites'], lines: ['Websites that', 'work for you.'], in: 4.95, out: 9.3, lineDelay: [0, 0.12] },
    { eyebrow: ['02', 'Business tools'], lines: ['Everything', 'in its place.'], in: 10.75, out: 16.25, lineDelay: [0, 0.1] },
    { eyebrow: ['03', 'Workflow automation'], lines: ['Less repeat work.', 'Clear next steps.'], in: 17.3, out: 22.25, lineDelay: [0, 0.85] },
    { lines: ['Smarter systems.', 'Better ways to work.'], in: 23.55, out: 25.95, lineDelay: [0, 0.55] },
  ],
  endcard: { in: K.endIn },
};

// 15-second cut: segments of master time played back-to-back
// [outStart, outEnd, masterStart, masterEnd]. Speed ramps carry the action;
// the few jumps only skip moments where the picture is holding still.
export const REMAP15 = [
  [0.0, 2.3, 0.8, 3.5],      // hook
  [2.3, 5.1, 3.5, 8.85],     // ribbon connects → devices → form is sent
  [5.1, 6.3, 9.0, 10.55],    // inquiry flies to the workspace
  [6.3, 7.9, 10.55, 14.85],  // record, appointment, stage, next step
  [7.9, 8.8, 16.1, 17.35],   // to automation
  [8.8, 10.1, 17.35, 20.3],  // three steps fire
  [10.1, 11.2, 22.1, 23.75], // resolve into the infinity
  [11.2, 12.2, 25.3, 26.7],  // → logo
  [12.2, 15.0, 26.7, 29.5],  // end card hold
];

export const COPY15 = {
  blocks: [
    { lines: ['Too much busywork?'], in: 0.3, out: 2.35 },
    { eyebrow: ['01', 'Websites'], lines: ['Websites'], in: 2.9, out: 5.05 },
    { eyebrow: ['02', 'Business tools'], lines: ['Business tools'], in: 5.6, out: 7.85 },
    { eyebrow: ['03', 'Workflow automation'], lines: ['Workflow', 'automation'], in: 8.3, out: 10.05, lineDelay: [0, 0.08] },
    { lines: ['Smarter systems.'], in: 10.35, out: 11.75 },
  ],
  endcard: { in: 11.84 },
};

export function remap(cut, t) {
  if (cut !== 15) return t;
  for (const [a, b, ma, mb] of REMAP15) {
    if (t < b || b === REMAP15[REMAP15.length - 1][1]) return ma + ((Math.min(t, b) - a) / (b - a)) * (mb - ma);
  }
  return t;
}

export const DURATION = { 30: 30, 15: 15 };
