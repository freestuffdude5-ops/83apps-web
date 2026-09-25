# 83 APPS: 3D advertisement

A 30-second 3D commercial for 83 App Studio in two compositions: vertical 9:16 at 1080×1920 and landscape 16:9 at 1920×1080. It also includes a 15-second cut of each. Everything is real-time 3D (Three.js / WebGL2). A headless Chromium renders each frame deterministically, and ffmpeg encodes the frames to H.264.

| File (in `renders/`) | Format | Length |
|---|---|---|
| `83apps-30s-vertical.mp4` | 1080×1920, 30 fps, H.264 + AAC | 30 s |
| `83apps-30s-landscape.mp4` | 1920×1080, 30 fps, H.264 + AAC | 30 s |
| `83apps-15s-vertical.mp4` | 1080×1920, 30 fps, H.264 + AAC | 15 s |
| `83apps-15s-landscape.mp4` | 1920×1080, 30 fps, H.264 + AAC | 15 s |
| `*-silent.mp4` | same, no audio track | |

## The story

| Time (30s) | Scene | On-screen copy |
|---|---|---|
| 0–4 | Macro on a flowing chrome ribbon. It pulls back to show glass fragments of busywork: an unanswered inquiry, a messy spreadsheet, an overdue task. | Too much busywork? |
| 4–10 | The ribbon pulls taut through the fragments, and they glide into a desktop display and a phone. A customer fills in the quote form on the (fictional) client site and sends it. | 01 / Websites: Websites that work for you. |
| 10–17 | The submitted inquiry lifts off the screen as a glass card and docks in a customer workspace. A customer record slides out, and the appointment, the stage change (New → Scheduled) and the next step fill in. | 02 / Business tools: Everything in its place. |
| 17–23 | The record becomes an automation trigger. Light travels down three chrome wires, and each step activates when the light arrives: confirmation sent, reminder scheduled, project status updated. | 03 / Workflow automation: Less repeat work. Clear next steps. |
| 23–26 | The ribbon becomes one of two silver rails that travel and twist around a blue-violet glass infinity band, keeping the infinity silhouette. | Smarter systems. Better ways to work. |
| 26–30 | The sculpture settles back and the actual 83 logo resolves with one light sweep. The final frame holds for about 3 s. | 83 APPS · Websites / Business tools / Workflow automation · Book a free 25-minute consultation · 83appstudio.com · Serving Florida |

The 15-second cut is not a separate animation. It uses the same master with speed ramps through the action, and it only skips moments where the picture is holding still. `REMAP15` in `src/timeline.js` maps output time to master time, and the cut has its own copy (`COPY15`).

## Brand accuracy notes

- **Logo**: `assets/brand/83-logo.png` is the owner's logo, byte-identical to `https://83appstudio.com/83-logo.png` (the kit ZIP was empty). It is shown uniformly scaled and never redrawn or distorted. It sits on opaque black, so the whole logo group is screen-blended: black drops out against the #060608 stage and the artwork stays untouched.
- **Infinity**: a supporting motif only. The website artwork `flow-sculpture.png` is kept in `assets/reference/` as a reference and is not used in the film.
- **Palette and type**: #060608 background, #F4F4F7 text, #A1A1AE muted, #BDA6FF violet, 9% white hairlines. Type is Geist and Geist Mono (SIL OFL, bundled in `assets/fonts/`, from the official `geist` package).
- **Example data only**: "Seaside Pool Co." and "Maya Torres" are fictional. The phone number uses the reserved 555-01xx range. Labels such as "Sample website", "Sample form · no data is sent" and "Example workflow" appear in the UI. There are no testimonials, statistics, results or third-party logos. The roofing product is not shown.

## Audio

`tools/audio.py` synthesizes the soundtrack from scratch: a pad, a soft pulse, and effects (whooshes, typing ticks, chimes as each automation step fires, a logo hit). It uses no samples or third-party music, so there is nothing to license. It is synced to the cue sheet that `tools/cues.mjs` derives from the timeline, and `tools/mux.mjs` normalizes it to −16 LUFS / −1.5 dBTP. The film is fully understandable with the sound off. Use the `-silent` versions if you want to add your own licensed music or a voiceover.

## Editing and previewing

```bash
cd ad
npm install                    # three, geist, playwright
npm run preview                # http://localhost:8383/?format=vertical&cut=30&preview=1
```

The preview page plays in real time with a scrubber and has links to switch format or cut. Add `&t=12` to open at a time. A GPU browser plays it smoothly.

Where things live:

- `src/timeline.js`: all timing (`K`), headlines (`COPY30` / `COPY15`), the 15s remap.
- `src/main.js`: layouts per format (`L`), camera shots (`CAM`, via `shot(time, target, frameHeight, {az, el, ap, sx, sy})`), and the choreography in `update()`.
- `src/ui/site.js`, `src/ui/cards.js`: the interface mockups (canvas 2D, drawn onto the 3D panels).
- `src/overlay.js` and the CSS in `index.html`: headline typography and the end card.
- `src/materials.js`, `src/env.js`, `src/post.js`: chrome and glass materials, studio lighting, and depth of field, bloom and grading.

## Rendering

Requirements: Node 18+, Chromium via Playwright, and Python 3 with `numpy scipy imageio-ffmpeg`. imageio-ffmpeg provides an ffmpeg build with libx264 and AAC; or set `FFMPEG=/path/to/ffmpeg`.

```bash
cd ad
npm install && npx playwright install chromium
pip install numpy scipy imageio-ffmpeg
./tools/build.sh                                  # everything → out/final/

# individual pieces
node tools/render.mjs --format vertical --cut 30 --workers 3 --out out/v30.mp4
node tools/render.mjs --format landscape --stills 4.5,12,27 --scale 0.5   # review stills
node tools/cues.mjs 30 > out/cues-30.json && python3 tools/audio.py out/cues-30.json out/audio-30.wav
node tools/mux.mjs out/v30.mp4 out/audio-30.wav out/v30-final.mp4
```

`tools/qa.py video.mp4` is a motion check. It reports any stretch where the picture changes much faster than the rest of the film, which catches camera whips, pops and flashes. Run it on a quick `--scale 0.25` render before committing to a full-resolution render.

The renderer uses software WebGL (SwiftShader), so it works without a GPU. That takes about 1 s per 1080p frame with 3 workers, or about 17 minutes per 30-second version. On a machine with a GPU, you can drop the `--use-angle=swiftshader` flags in `tools/render.mjs` for a large speed-up. Encoding is H.264 High, CRF 16, BT.709, `+faststart`.

## Safe areas

The vertical version keeps headlines between about 300 and 560 px from the top, and 3D content in roughly the 600–1650 px band. That keeps essential text clear of the top UI in TikTok, Reels and Shorts and the caption and CTA area at the bottom. The end card places the URL and CTA above about 1450 px. The landscape version puts copy in the left column and the 3D subject on the right.
