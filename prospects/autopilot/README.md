# Autopilot: lead → custom concept image → email → Gmail

Turns businesses from the Florida lead database into ready-to-send outreach. Each one gets a concept homepage
image built from their own data, plus an email that only says things a real browser confirmed. Finished leads go
straight into the Google Sheet, and the Apps Script sender (`../gmail-sender/Code.gs`) sends them slowly,
follows up once, and stops on replies.

```
Florida DB ──select──▶ probe (real browser) ──▶ emails (site / Wayback, MX) ──▶ build (Google data + photos + concept page
  + screenshots) ──▶ compose (verified claims only) ──▶ push (Sheet row + images in Drive) ──▶ Code.gs sends, follows up, re-checks
```

## Where the leads and emails come from
| Lead type (Florida DB) | Active, 5+ reviews | Where the email comes from | Opening line (verified) |
|---|---|---|---|
| Broken website | ~9,500 | Wayback copy of their old site | "I tapped the Website button on your Google listing and X didn't load" |
| Booking/free page only (Square, GlossGenius, Vagaro, free Wix...) | ~10,000 | printed on their own booking page | "your Google listing sends people to your Square page rather than a website of your own" |
| Facebook-only | ~13,900 | the public "Intro" on their Facebook page | "the only website on your Google listing is your Facebook page" |
| No website | ~68,000 | their YellowPages listing (matched by phone, or exact name + city) | "your Google listing doesn't have a website linked at all" |
| Own site, outdated or unchecked | ~12,700 | mailto/printed on their site | "Chrome marked it Not secure" / "shrunk-down desktop page on a phone" / "footer still says © 2017" |
| Working site with an email | ~13,800 | their site | only if one of the flaws above is really there |

Measured yield (test batches): about 3 in 10 for broken, booking and Facebook, 1 in 10 for no-website.
That's roughly 15,000+ emailable businesses statewide. "Your listing links to Facebook/Square/nothing" is re-read from
the live Google listing when the image is built. If Google sends back an incomplete listing, the lead is skipped.

## What each lead gets, automatically
- **Real data, one request:** name, phone, address, hours, rating and review count from Google Maps
  (`gplace.py`). Also Google's summary, the owner's description, the "people mention" topics, business photos,
  customer photos and the visible reviews.
- **Their website, in a real browser** (`siteprobe.mjs`):
  - where the Google link really lands (http = Chrome shows "Not secure");
  - whether the phone layout is broken;
  - the footer year;
  - mailto/printed emails on the home and contact pages;
  - their logo and large photos.
- **Email address** (`emails.py`): only one that belongs to the business. That means the same domain as their site,
  or a personal mailbox linked on their own site (current or a Wayback copy).
  - Rejected: platform, developer and placeholder addresses (Wix/GoDaddy filler, Sentry, menu platforms), and
    any address whose domain has no mail server.
- **Concept image** (`mockup.py` + `template.html` + `render.mjs` + `composite.py`):
  - one of five design families picked from the Google category: bold trades, food & drink editorial, soft
    beauty/pets/wellness, clean professional, fresh outdoor services (`verticals.py`);
  - their logo, with the accent colour taken from it; the best of their own photos, scored for size, sharpness,
    exposure and "looks like a flyer";
  - a real 5-star review quote, their rating, hours and address;
  - desktop + iPhone screenshots composited into a 1200×720 JPG, plus a reviews-section image when they have
    2+ good reviews.
  - No photo of their own: a hand-checked public-domain photo for that trade (`stock.py`, `stock_picks.json`),
    or a clean brand-colour panel.
- **Email text** (`compose.py`, Hayden's voice): pricing line, "you choose the look", the Google/AI search line,
  and the screenshots.
  - The opening uses only verified claims: "didn't load", "shows a domain-for-sale page", "Chrome marked it
    'Not secure'", "phone layout is shrunk", "footer still says © 2017".
  - If nothing true and specific can be said (the site is fine), the lead is skipped.
- **Before every first email**, the Sheet re-checks the claim from Google's servers. If the site came back or
  moved to https, the lead is skipped instead of sent.

## Run it
```
python3 run.py all --count 50            # select → probe → emails → build → review sheet (→ push if .env exists)
python3 run.py select --count 200 --county Volusia,Flagler --kinds site,broken [--vertical food,roof]
python3 run.py probe | emails | build | sheet | push | status
python3 run.py thumbs                    # data/thumbs-N.jpg: 8 finished images per sheet, for a quick look
python3 run.py fix --cids 476772 --hero 2        # use candidate photo #2 (data/out/<lead>/cand2.jpg), then: run.py build
python3 run.py fix --cids 476772 --hero stock    # use the trade's stock photo
python3 run.py fix --cids 476772 --drop "wrong business type"
./loop.sh                                 # keeps going: nearby counties first, then all of Florida
```
Everything is resumable. State lives in `data/autopilot.db` and images in `data/out/` (both gitignored, never
committed). Needs the Florida export at `../fl/data/export/florida_businesses.db`, Python 3 with requests,
Pillow and numpy, and Node with Playwright (from `prospects/node_modules`).

## Connect it to the Google Sheet (once)
1. Paste the latest `../gmail-sender/Code.gs` into the sheet's Apps Script project. Run **Outreach > 1. Set up sheet**
   again: it adds the new columns and creates `WEBAPP_TOKEN`.
2. In the Apps Script editor: **Deploy > New deployment > Web app**.
   - Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the URL.
   - The token keeps everyone else out.
3. Create `autopilot/.env` (gitignored):
   ```
   OUTREACH_WEBAPP_URL=https://script.google.com/macros/s/.../exec
   OUTREACH_TOKEN=<WEBAPP_TOKEN from the Settings tab>
   ```
4. `python3 run.py push`. Leads appear in the Leads tab with a **view image** link and an `approved` checkbox.
   - Images land in the `83 Apps Outreach Images` Drive folder.
   - Tick the ones you want, or set `AUTO_APPROVE` to YES on the Settings tab to send everything the autopilot adds.

## Settings that matter (Sheet > Settings)
- `AUTO_APPROVE`: NO = you tick each lead. YES = fully hands-off.
- `RECHECK_BEFORE_SEND`: YES (recommended). Skips leads whose website changed since the claim was checked.
- `RAMP_PER_WEEK`: 15, 25, 40, 60 per day. Keeps a new sending domain out of spam.
