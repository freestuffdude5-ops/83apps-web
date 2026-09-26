// Timing for the website-makeover film (30s master + 15s cut). Beats sit on
// a 120 BPM grid (2 s bars) so the new site lands exactly on the music drop.

export const FPS = 30;

export const M = {
  hookOut: 3.2,
  load: [3.3, 3.95],        // old page crawls in on the phone
  pinch: [3.95, 4.85],      // pinch-zoom to read tiny text
  hunt: [4.85, 5.85],       // pan around looking for the phone number
  leave: [6.1, 6.75],       // swipe back: the visitor leaves
  chips: [3.7, 4.4, 5.2],   // pain callouts: slow, tiny, buried
  scan: [6.75, 8.45],        // chrome ribbon scans across the old site
  rebuild: [8.0, 10.0],     // blocks lift, flip and land (drop at 10.0)
  phoneSwap: [10.15, 10.95],
  glint: [10.2, 11.2],
  beats: [12.0, 14.0, 16.0],// three benefits
  tapBook: 16.55,
  sheet: [16.7, 17.25],
  svc: 18.05, when: 18.45, name: [18.75, 19.25], send: 19.55, sent: [19.7, 20.2],
  requests: [20.1, 21.0, 21.9],
  brand: [23.3, 24.9],      // devices recede, infinity forms
  endIn: 26.2,
};

export const COPY30 = {
  blocks: [
    { lines: ['Is your website', 'working against you?'], in: 1.25, out: 3.25, lineDelay: [0, 0.1] },
    { lines: ['If it’s hard to use,', 'visitors leave.'], in: 3.55, out: 6.95, lineDelay: [0, 0.9] },
    { eyebrow: ['83', 'Website redesign'], lines: ['Rebuilt to work', 'for your customers.'], in: 10.05, out: 11.9, lineDelay: [0, 0.1] },
    { eyebrow: ['01', 'Mobile-first'], lines: ['Clear on', 'every screen.'], in: 12.05, out: 13.9, lineDelay: [0, 0.08] },
    { eyebrow: ['02', 'Easy to trust'], lines: ['Answers', 'up front.'], in: 14.05, out: 15.9, lineDelay: [0, 0.08] },
    { eyebrow: ['03', 'Easy to act'], lines: ['One tap to', 'call or book.'], in: 16.05, out: 17.95, lineDelay: [0, 0.08] },
    { lines: ['Built to turn visitors', 'into inquiries.'], in: 18.15, out: 23.25, lineDelay: [0, 0.35] },
    { lines: ['Websites that', 'work for you.'], in: 23.75, out: 25.95, lineDelay: [0, 0.3] },
  ],
  endcard: { in: M.endIn, services: ['New websites', 'Redesigns', 'Built for every screen'] },
};

// [outStart, outEnd, masterStart, masterEnd]
export const REMAP15 = [
  [0.0, 1.8, 0.6, 3.0],     // hook
  [1.8, 4.2, 3.85, 6.75],   // pain, a little faster
  [4.2, 7.2, 7.3, 10.0],    // the scan and rebuild, a touch of slow motion
  [7.2, 8.2, 10.0, 11.4],   // new site lands
  [8.2, 9.6, 16.2, 18.0],   // one tap to book
  [9.6, 11.4, 19.45, 22.5], // request sent, requests arrive
  [11.4, 12.2, 25.4, 26.6], // → logo
  [12.2, 15.0, 26.6, 29.4], // end card hold
];

export const COPY15 = {
  blocks: [
    { lines: ['Is your website', 'working against you?'], in: 0.35, out: 1.8, lineDelay: [0, 0.08] },
    { lines: ['If it’s hard to use,', 'visitors leave.'], in: 2.0, out: 4.15, lineDelay: [0, 0.5] },
    { eyebrow: ['83', 'Website redesign'], lines: ['Rebuilt to work', 'for your customers.'], in: 7.25, out: 9.45, lineDelay: [0, 0.08] },
    { lines: ['Built to turn visitors', 'into inquiries.'], in: 9.6, out: 11.35, lineDelay: [0, 0.2] },
  ],
  endcard: { in: 11.8, services: ['New websites', 'Redesigns', 'Built for every screen'] },
};

// Music sections (output seconds) for tools/music.py
export const MUSIC = {
  30: { duration: 30, grid0: 0.0, build: 8.0, drop: 10.0, brand: 24.0, logo: 26.0, final: 28.0 },
  15: { duration: 15, grid0: -0.8, build: 5.2, drop: 7.2, brand: 11.7, logo: 11.7, final: 13.7 },
};

export function remap(cut, t) {
  if (cut !== 15) return t;
  for (const [a, b, ma, mb] of REMAP15) {
    if (t < b || b === REMAP15[REMAP15.length - 1][1]) return ma + ((Math.min(t, b) - a) / (b - a)) * (mb - ma);
  }
  return t;
}

export const DURATION = { 30: 30, 15: 15 };
