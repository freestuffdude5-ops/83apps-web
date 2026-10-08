# Outreach sender (Google Sheet + Apps Script + Gmail API)

Sends approved leads from a Google Sheet through your own Gmail (hayden@83appstudio.com), one at a time,
during business hours, with a slow daily ramp, one follow-up in the same thread, and automatic stop on
reply, bounce or opt-out. Runs on Google's servers on a timer, so your computer can be off.

## Before the first send: fix email authentication (DNS at Njalla)
Add two TXT records for 83appstudio.com (Njalla > Domains > 83appstudio.com > DNS > Add record):

| Type | Name | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:hayden@83appstudio.com` |

DKIM is already published. In Google Admin > Apps > Google Workspace > Gmail > Authenticate email, make sure
it says "Authenticating email with DKIM". Check all three with https://www.mail-tester.com/ (send it one test).

## Setup (about 10 minutes, once)
1. Google Drive: upload the folder `83 Apps Outreach Images` (keep that exact name).
2. Create a new Google Sheet. Extensions > Apps Script. Delete what's there, paste `Code.gs`, save.
3. In the Apps Script editor: Services (+) > Gmail API > Add. Save. Close the tab and reload the sheet.
4. Sheet menu: Outreach > 1. Set up sheet. Approve the permissions (it's your own script).
5. Settings tab: put your PO box in MAILING_ADDRESS.
6. Leads tab: File > Import > Upload `leads-batch1.csv` > "Append to current sheet".
7. For each lead, do the CHECK FIRST items in its notes, then type YES in `approved`.
8. Outreach > 2. Send a test to myself. Check it on your phone and computer.
9. Outreach > 3. Start automatic sending.

## Autopilot (automatic leads + images)
`../autopilot` builds leads, concept images and emails and adds them to this sheet by itself. Setup:
`../autopilot/README.md` > "Connect it to the Google Sheet". New rows arrive with a "view image" link and an
`approved` checkbox. Set `AUTO_APPROVE` to YES to skip the ticking. Before each first email the website claim is
re-checked (`RECHECK_BEFORE_SEND`), so nothing goes out that stopped being true.

## Day to day
- Replies land in your normal inbox, in the same thread. The sheet marks them `replied` and stops the follow-up.
- "Not interested / unsubscribe / stop" replies are marked `opted out` and added to the Suppression tab automatically.
- Pause instantly: set PAUSED to YES, or Outreach > Stop.
- Add more leads any time: new rows with `approved` = YES are picked up on the next run.
- Ramp (Settings > RAMP_PER_WEEK): 15/day in week 1, 25, 40, then 60. Follow-ups count toward the daily limit.

`test_mock.cjs` runs `Code.gs` against fake Google services: `node test_mock.cjs Code.gs`.
