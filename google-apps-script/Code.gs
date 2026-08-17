/**
 * Selah Church website form handler.
 *
 * Receives POSTs from prayer.html and contact.html (via fetch in script.js),
 * logs each submission to a tab in the "Selah Website Forms" Google Sheet
 * (SHEET_ID below), and emails a notification to NOTIFY_EMAIL.
 *
 * Implements the Thyra Tech Lead Capture System standard, with two deliberate
 * departures from the shared template because this site genuinely needs them:
 *   - two form types (prayer + contact) rather than one
 *   - Google Sheet logging in addition to email
 * See Thyra-Tech-site/site/docs/thyra-lead-capture-system.md.
 *
 * Deploy as: Web App, execute as "Me", access "Anyone".
 * To publish a change: Deploy -> Manage deployments -> pencil -> New version.
 * Editing the code alone does not update the running /exec URL.
 * See ../google-apps-script/README.md for full setup steps.
 */

// ===== CONFIG =====
var NOTIFY_EMAIL = 'info@selahchurchfxbg.com';

/**
 * Sender display name on notification emails.
 *
 * Without this, MailApp uses the profile name of the Google account that owns
 * this script — so prayer requests and contact messages arrived in the church
 * inbox looking like personal email from Raynor Harrington. This is the same
 * fix already applied on the Anchored Accounting site.
 *
 * MailApp cannot change the From *address*, only the display name. This
 * project is owned by raynor.harrington@gmail.com, so that address is still
 * underneath if someone expands the sender. New client scripts are created
 * from thyratechllc@gmail.com instead; moving this one would change the /exec
 * URL and require editing script.js.
 */
var SENDER_DISPLAY_NAME = 'Selah Church Website';

/**
 * Require a valid Cloudflare Turnstile token.
 *
 * Live since 2026-08-17. Widget `selah-church-forms` (Managed); its sitekey is
 * in script.js and its secret is in this project's Script Properties as
 * TURNSTILE_SECRET.
 *
 * Fails closed: a missing secret, an unreachable Cloudflare, or a mismatched
 * action/hostname rejects the submission rather than letting it through. That
 * means a misconfiguration looks exactly like the form being broken — check
 * the Script Property first if legitimate messages stop arriving.
 *
 * The honeypot below is NOT sufficient on its own: a bot already beat a
 * honeypot on the Anchored Accounting site.
 */
var TURNSTILE_ENABLED = true;

/** Must match the `action` script.js renders the widget with. */
var TURNSTILE_ACTION = 'selah-form';

/** Hostnames the widget may legitimately be solved on. */
var TURNSTILE_HOSTNAMES = [
  'selahchurchfxbg.com',
  'www.selahchurchfxbg.com',
  'selah-church.thyratechllc.workers.dev'
];

// "Selah Website Forms" — https://docs.google.com/spreadsheets/d/1bxb9EaJzvQlyI89n2_0P7b1Z9lOtYsB6okvoUSBszuk/edit
// This is a standalone script (not bound to the sheet), so it must open the
// sheet by ID — SpreadsheetApp.getActiveSpreadsheet() returns null when a
// script runs from a web app request instead of the Sheets UI.
var SHEET_ID = '1bxb9EaJzvQlyI89n2_0P7b1Z9lOtYsB6okvoUSBszuk';

var PRAYER_SHEET_NAME = 'Prayer Requests';
var CONTACT_SHEET_NAME = 'Visit & Contact Messages';

// ===== ENTRY POINTS =====

/** Opening the /exec URL in a browser. Confirms the deployment is live. */
function doGet() {
  return jsonResponse({ ok: true, result: 'success', service: SENDER_DISPLAY_NAME + ' forms' });
}

function doPost(e) {
  try {
    var data = requestData_(e);

    // 1. Turnstile, when enabled. Fails closed.
    if (TURNSTILE_ENABLED && !verifyTurnstile_(data)) {
      return jsonResponse({ ok: false, result: 'error', message: 'Verification failed. Please reload the page and try again.' });
    }

    // 2. Honeypot: real visitors never fill this hidden field. Bots often do.
    //    Report success without saving or emailing anything, so the bot does
    //    not learn it was caught.
    if (oneLine_(data._gotcha)) {
      return jsonResponse({ ok: true, result: 'success' });
    }

    if (data.formType === 'prayer') {
      handlePrayerRequest(data);
    } else if (data.formType === 'contact') {
      handleContactMessage(data);
    } else {
      throw new Error('Unknown formType: ' + data.formType);
    }

    // `ok` is the Thyra Tech standard key; `result` is kept so an older
    // deployed front end still reads a success it understands. Both are
    // emitted deliberately — do not drop `result` until every page is updated.
    return jsonResponse({ ok: true, result: 'success' });
  } catch (err) {
    console.error(err);
    return jsonResponse({ ok: false, result: 'error', message: err.message });
  }
}

// ===== FORM HANDLERS =====
function handlePrayerRequest(data) {
  var name = oneLine_(data.name);
  var email = oneLine_(data.email);
  var request = block_(data.request);
  var confidential = !!data.confidential;

  if (!name || !request) {
    throw new Error('Missing required fields.');
  }

  var sheet = getOrCreateSheet(PRAYER_SHEET_NAME, ['Timestamp', 'Name', 'Email', 'Confidential', 'Request']);
  sheet.appendRow([new Date(), name, email, confidential ? 'Yes' : 'No', request]);

  var subject = 'New Prayer Request — ' + name;
  var body = [
    'Name: ' + name,
    'Email: ' + (email || '(not provided)'),
    'Confidential: ' + (confidential ? 'Yes — the sender asked for this to be kept confidential' : 'No'),
    '',
    'Request:',
    request,
    '',
    '---',
    'Submitted through the prayer form on selahchurchfxbg.com.'
  ].join('\n');

  sendNotification_(subject, body, email);
}

function handleContactMessage(data) {
  var name = oneLine_(data.name);
  var email = oneLine_(data.email);
  var message = block_(data.message);

  if (!name || !email || !message) {
    throw new Error('Missing required fields.');
  }

  var sheet = getOrCreateSheet(CONTACT_SHEET_NAME, ['Timestamp', 'Name', 'Email', 'Message']);
  sheet.appendRow([new Date(), name, email, message]);

  var subject = 'New Visit/Contact Message — ' + name;
  var body = [
    'Name: ' + name,
    'Email: ' + email,
    '',
    'Message:',
    message,
    '',
    '---',
    'Submitted through the contact form on selahchurchfxbg.com.',
    'Reply to this email to respond directly to ' + name + '.'
  ].join('\n');

  sendNotification_(subject, body, email);
}

// ===== EMAIL =====

/**
 * One place that sends mail, so the display name and Reply-To cannot drift
 * apart between the two form types.
 *
 * replyTo is only set when the submitter actually gave an address — the
 * prayer form's email field is optional, and passing an empty replyTo makes
 * MailApp throw. Safe to pass through because oneLine_ has stripped CR/LF,
 * which is what stops a crafted address injecting extra headers (e.g. a Bcc).
 */
function sendNotification_(subject, body, replyTo) {
  var options = {
    to: NOTIFY_EMAIL,
    name: SENDER_DISPLAY_NAME,
    subject: subject,
    body: body
  };

  if (replyTo && isEmail_(replyTo)) {
    options.replyTo = replyTo;
  }

  MailApp.sendEmail(options);
}

// ===== TURNSTILE =====

/**
 * True only for a submission carrying a valid, unused Turnstile token that was
 * minted by our form and solved on one of our own pages.
 */
function verifyTurnstile_(data) {
  var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
  if (!secret) {
    return false;
  }

  var token = oneLine_(data['cf-turnstile-response']);
  if (!token || token.length > 2048) {
    return false;
  }

  var response;
  try {
    response = UrlFetchApp.fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'post',
        payload: { secret: secret, response: token },
        muteHttpExceptions: true
      }
    );
  } catch (err) {
    return false;
  }

  if (response.getResponseCode() !== 200) {
    return false;
  }

  var result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (err) {
    return false;
  }

  return result.success === true &&
    result.action === TURNSTILE_ACTION &&
    TURNSTILE_HOSTNAMES.indexOf(result.hostname) !== -1;
}

// ===== HELPERS =====
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Accepts the site's text/plain JSON body, and ordinary form fields as a
 *  fallback so a no-JS post would still parse. */
function requestData_(e) {
  var contents = e && e.postData && e.postData.contents;
  if (contents) {
    try {
      var parsed = JSON.parse(contents);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (ignored) {
      // Fall through to ordinary form fields.
    }
  }
  return (e && e.parameter) || {};
}

/** Single-line field. Strips line breaks so they cannot be used to inject
 *  extra email headers, and caps the length. */
function oneLine_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 240);
}

/** Multi-line field. Keeps the submitter's line breaks. */
function block_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).replace(/\r\n/g, '\n').trim().slice(0, 5000);
}

/** Shape check only — does not verify the address exists. */
function isEmail_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
