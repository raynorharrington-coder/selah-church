/**
 * Selah Church website form handler.
 *
 * Receives POSTs from prayer.html and visit.html (via fetch in script.js),
 * logs each submission to a tab in this script's bound Google Sheet, and
 * emails a notification to NOTIFY_EMAIL.
 *
 * Deploy as: Web App, execute as "Me", access "Anyone".
 * See ../google-apps-script/README.md for full setup steps.
 */

// ===== CONFIG =====
// Testing address for now — switch to info@selahchurchfxbg.com before launch.
var NOTIFY_EMAIL = 'thyratechllc@gmail.com';

// "Selah Website Forms" — https://docs.google.com/spreadsheets/d/1bxb9EaJzvQlyI89n2_0P7b1Z9lOtYsB6okvoUSBszuk/edit
// This is a standalone script (not bound to the sheet), so it must open the
// sheet by ID — SpreadsheetApp.getActiveSpreadsheet() returns null when a
// script runs from a web app request instead of the Sheets UI.
var SHEET_ID = '1bxb9EaJzvQlyI89n2_0P7b1Z9lOtYsB6okvoUSBszuk';

var PRAYER_SHEET_NAME = 'Prayer Requests';
var CONTACT_SHEET_NAME = 'Visit & Contact Messages';

// ===== ENTRY POINT =====
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // Honeypot: real visitors never fill this hidden field. Bots often do.
    // Report success without saving or emailing anything.
    if (data._gotcha) {
      return jsonResponse({ result: 'success' });
    }

    if (data.formType === 'prayer') {
      handlePrayerRequest(data);
    } else if (data.formType === 'contact') {
      handleContactMessage(data);
    } else {
      throw new Error('Unknown formType: ' + data.formType);
    }

    return jsonResponse({ result: 'success' });
  } catch (err) {
    return jsonResponse({ result: 'error', message: err.message });
  }
}

// ===== FORM HANDLERS =====
function handlePrayerRequest(data) {
  var name = sanitize(data.name);
  var email = sanitize(data.email);
  var request = sanitize(data.request);
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
    'Confidential: ' + (confidential ? 'Yes — pastoral team only' : 'No'),
    '',
    'Request:',
    request
  ].join('\n');

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
}

function handleContactMessage(data) {
  var name = sanitize(data.name);
  var email = sanitize(data.email);
  var message = sanitize(data.message);

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
    message
  ].join('\n');

  MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
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

function sanitize(value) {
  return (value || '').toString().trim().slice(0, 5000);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
