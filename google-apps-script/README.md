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

1. The browser sends forms to the same-origin `/api/forms` Worker route. Its
   server-side forwarding URL is the `FORM_BACKEND_URL` constant in
   [`worker/index.js`](../worker/index.js). Update that one constant only if
   the Apps Script project is intentionally replaced with a new `/exec` URL.
2. Commit and push — Cloudflare Workers Build deploys automatically.

## Testing

- Submit the prayer form on `/prayer.html` and the contact form on
  `/visit.html` on the live/preview site.
- Check that a row appears in the "Prayer Requests" / "Visit & Contact
  Messages" tabs of the Google Sheet (created automatically on first
  submission of each type).
- Check that a notification email arrives at the address set in
  `NOTIFY_EMAIL` inside `Code.gs`.

## Launch status (as of 2026-08-04)

- `NOTIFY_EMAIL` is now set to `info@selahchurchfxbg.com` — the testing
  address (`thyratechllc@gmail.com`) is no longer used. Whoever pastes an
  updated `Code.gs` in the future must **Deploy → Manage deployments →
  edit (pencil) → New version → Deploy** to make code changes live —
  editing the code alone does not update the running `/exec` URL. The
  `/exec` URL itself stays the same across versions, so `script.js` never
  needs to change for a code-only update.
- Confirm someone on the pastoral team actually has access to
  `info@selahchurchfxbg.com` and knows to watch it (or forward it) for
  prayer requests, since these are meant to reach real people quickly.
- Clear the test rows from the Sheet (accumulated during development)
  before real visitor submissions start arriving, so they don't get
  confused with real ones.

## Form transport

Apps Script redirects each POST to a `script.googleusercontent.com` response.
The site therefore sends the visitor's request to its same-origin Worker,
which forwards it server-to-server and streams back Apps Script's JSON result.
This avoids browser-specific cross-origin redirect failures without falsely
claiming a submission succeeded when Apps Script rejected it.

When Turnstile rejects a request, `Code.gs` writes only safe verification
metadata (reason, Cloudflare error codes, action, and hostname) to both the
Apps Script execution log and the `Diagnostics` tab in the existing form
Sheet. It never logs the Turnstile token or form contents. If the external
Turnstile request itself fails, the safe Apps Script exception text is included
in the Diagnostics reason.

Turnstile response tokens are opaque values that commonly exceed 240 characters.
They must use `turnstileToken_()` rather than `oneLine_()`: the latter is only
for short display fields and would silently truncate a valid token before it
reaches Cloudflare. The repository's `SCRIPT_VERSION` must be bumped on every
backend change and matched against `doGet` after manually deploying the existing
web-app deployment's new version.

## Notes

- Submissions are also logged to the Google Sheet as a backup in case an
  email notification is missed — email + sheet log, same address for both
  forms, was the delivery decision for this build (2026-08-04).
- A hidden honeypot field (`_gotcha`) in both forms silently drops bot
  submissions without saving or emailing them.
- The client sends `Content-Type: text/plain` on purpose (not
  `application/json`) — this keeps the request a CORS "simple request" so
  the browser doesn't send an OPTIONS preflight, which Apps Script web apps
  don't handle. `doPost` still parses the body as JSON on the server side.
