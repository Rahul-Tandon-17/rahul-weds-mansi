/**
 * Rahul & Mansi wedding RSVP: receives RSVPs from the invite website
 * and keeps one row per 10-digit mobile number in the "RSVPs" tab of this Google Sheet.
 * If the same number replies again, its row is replaced with the new answer.
 *
 * Setup steps are in SETUP.md.
 */

const SHEET_NAME = 'RSVPs';
const DAYS = ['day1', 'day2'];
const HEADERS = [
  'Last updated', 'Name', 'Mobile', 'Attending',
  'Day 1 (13 Mar)', 'Day 2 (14 Mar)', 'Times replied'
];
const MOBILE_COL = 3;   // column C
const REPLIES_COL = 7;  // column G

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) writeHeader_(sheet);
  return sheet;
}

function writeHeader_(sheet) {
  // Clear any old headers to the right (e.g. from an earlier version with more columns).
  const extra = sheet.getMaxColumns() - HEADERS.length;
  if (extra > 0) sheet.getRange(1, HEADERS.length + 1, 1, extra).clearContent();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.getRange('C:C').setNumberFormat('@');  // keep mobile numbers as text
}

// Keeps a value as plain text, so a name starting with "=" can't become a formula.
function clean_(v, max) {
  v = String(v == null ? '' : v).trim().slice(0, max || 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// "Yes" if the guest is coming that day, otherwise "No".
function yesNo_(v) {
  return v === 'Yes' || parseInt(v, 10) > 0 ? 'Yes' : 'No';
}

// Plain 10-digit Indian mobile, e.g. 9876543210. Removes spaces, a +91/91
// prefix or a leading 0. Returns '' if it isn't a valid number.
function normalisePhone_(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
  else if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const phone = normalisePhone_(p.phone);
  if (!p.name || !phone) {
    return ContentService.createTextOutput('missing name or mobile');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_();
    const attending = p.attending === 'No' ? 'No' : 'Yes';
    const values = [
      new Date(),
      clean_(p.name, 100),
      phone,
      attending,
      ...DAYS.map(d => attending === 'Yes' ? yesNo_(p[d]) : 'No')
    ];

    // Look for an earlier reply from the same number.
    let row = 0, replies = 0;
    const last = sheet.getLastRow();
    if (last > 1) {
      const nums = sheet.getRange(2, MOBILE_COL, last - 1, 1).getDisplayValues();
      for (let i = 0; i < nums.length; i++) {
        if (normalisePhone_(nums[i][0]) === phone) {
          row = i + 2;
          replies = Number(sheet.getRange(row, REPLIES_COL).getValue()) || 1;
          break;
        }
      }
    }

    if (row) {
      sheet.getRange(row, 1, 1, HEADERS.length).setValues([[...values, replies + 1]]);
    } else {
      sheet.appendRow([...values, 1]);
      sheet.getRange(sheet.getLastRow(), MOBILE_COL).setNumberFormat('@').setValue(phone);
    }
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput('ok');
}

// Lets you open the web app URL in a browser to check it's live.
function doGet() {
  return ContentService.createTextOutput('RSVP endpoint is live.');
}

// Run once from the editor (and again after updating this script)
// to set up the RSVPs header and the Headcount tab.
function setup() {
  const sheet = getSheet_();
  writeHeader_(sheet);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let summary = ss.getSheetByName('Headcount');
  if (!summary) summary = ss.insertSheet('Headcount');
  summary.clear();
  summary.getRange('A1:B1').setValues([['', 'Replies']]).setFontWeight('bold');
  summary.getRange('A2:B5').setFormulas([
    ['="Coming on Day 1 · 13 Mar (Haldi & Sangeet)"', '=COUNTIF(RSVPs!E2:E,"Yes")'],
    ['="Coming on Day 2 · 14 Mar (Varmala, Pheras & Reception)"', '=COUNTIF(RSVPs!F2:F,"Yes")'],
    ['="Families replied"', '=COUNTA(RSVPs!C2:C)'],
    ['="Declined"', '=COUNTIF(RSVPs!D2:D,"No")']
  ]);
}
