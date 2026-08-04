# Selah contact/prayer form backend (Google Apps Script)

`Code.gs` in this folder is the source of truth. Apps Script has no CLI deploy
in this setup, so it has to be pasted into the Apps Script editor by hand.
Keep this file in sync any time `Code.gs` changes.

## One-time setup

The script is **standalone** (not bound to the sheet) — it opens the sheet
by ID (`SHEET_ID` in `Code.gs`) instead of relying on
`SpreadsheetApp.getActiveSpreadsheet()`, which returns `null` when the
script runs from a web app request instead of the Sheets UI. That means
the sheet and the script are two separate Drive files linked only by that
ID.

The sheet already exists: **[Selah Website
Forms](https://docs.google.com/spreadsheets/d/1bxb9EaJzvQlyI89n2_0P7b1Z9lOtYsB6okvoUSBszuk/edit)**
(owned by `raynor.harrington@gmail.com`). If the Apps Script project ends
up under a *different* Google account, share that sheet with the script's
account as **Editor** first, or the writes will fail.

1. Go to [script.google.com](https://script.google.com) and create a new
   project (or reuse the one you already made).
2. Delete the default contents and paste in the full contents of this
   folder's `Code.gs`.
3. Click the disk icon (or Ctrl+S) to save. Name the project "Selah Forms"
   when prompted.
4. Click **Deploy → New deployment** (not "Manage deployments" — editing an
   existing deployment's access level doesn't always take effect; a fresh
   deployment does).
   - Click the gear icon next to "Select type" and choose **Web app**.
   - Description: `Selah forms v1`.
   - Execute as: **Me** (your Google account).
   - Who has access: **Anyone**.
   - Click **Deploy**.
5. Google will ask you to authorize the script (it needs permission to send
   email and edit the sheet on your behalf) — click through the consent
   screen. It may show an "unverified app" warning since this is a personal
   script; click **Advanced → Go to Selah Forms (unsafe)** to proceed. This
   is expected for personal Apps Script projects and is safe since you wrote
   the code.
6. Copy the **Web app URL** it gives you — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

## Wire it into the site

1. Open [`script.js`](../script.js) and find the `FORM_ENDPOINT` constant
   near the top.
2. Replace the placeholder with the Web app URL from step 7 above.
3. Commit and push — Cloudflare Workers Build deploys automatically.

## Testing

- Submit the prayer form on `/prayer.html` and the contact form on
  `/visit.html` on the live/preview site.
- Check that a row appears in the "Prayer Requests" / "Visit & Contact
  Messages" tabs of the Google Sheet (created automatically on first
  submission of each type).
- Check that a notification email arrives at the address set in
  `NOTIFY_EMAIL` inside `Code.gs` (currently `thyratechllc@gmail.com` for
  testing).

## Before real launch

- In `Code.gs`, change `NOTIFY_EMAIL` to `info@selahchurchfxbg.com`, save,
  and **Deploy → Manage deployments → edit (pencil) → New version → Deploy**.
  Editing the code alone does not update the live `/exec` URL — you must
  push a new version for changes to take effect. The `/exec` URL itself
  stays the same across versions, so `script.js` does not need to change.
- Confirm someone on the pastoral team actually has access to
  `info@selahchurchfxbg.com` and knows to watch it (or forward it) for
  prayer requests, since these are meant to reach real people quickly.

## Known quirk: occasional false "failed" message

During testing, one submission out of several showed `Failed to fetch` in
the browser console **even though the row was written and the email sent
successfully** — confirmed by a duplicate row in the sheet. This happens
because Apps Script web apps respond to POST with a redirect to a
`script.googleusercontent.com` URL, and the browser's `fetch` occasionally
fails to read that second hop even after the script already ran to
completion server-side.

Practical effect: a visitor might occasionally see "something went wrong"
and resubmit, creating a duplicate row/email. It's not silent data loss
(the opposite — the original submission did go through), just a
possible duplicate. If duplicates in the sheet become a real annoyance,
the fix is de-duplicating by matching name+message within a short time
window before emailing, but that's not implemented — flagging it here
rather than adding complexity that may not be needed in practice.

## Notes

- Submissions are also logged to the Google Sheet as a backup in case an
  email notification is missed — see the "Delivery" decision recorded for
  this build (2026-08-04): email + sheet log, same address for both forms
  during testing.
- A hidden honeypot field (`_gotcha`) in both forms silently drops bot
  submissions without saving or emailing them.
- The client sends `Content-Type: text/plain` on purpose (not
  `application/json`) — this keeps the request a CORS "simple request" so
  the browser doesn't send an OPTIONS preflight, which Apps Script web apps
  don't handle. `doPost` still parses the body as JSON on the server side.
