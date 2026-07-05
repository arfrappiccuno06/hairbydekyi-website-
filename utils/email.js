import { google } from 'googleapis';
import { Resend } from 'resend';
import { generateToken } from './tokens.js';

const DEFAULT_FROM = 'Hair by Dekyi <noreply@hairbydekyi.com>';
const QUEUE_TAB = 'Email Queue';

// Stop retrying a permanently-failing email after this many cron passes so a
// single bad address can't be retried forever (~20 * 5min cron ≈ 1.5 hours,
// and well past a daily quota reset).
const MAX_ATTEMPTS = 20;

// Cap how many queued emails a single cron pass will try to send, to keep the
// serverless function well within its time budget.
const MAX_DRAIN_PER_RUN = 25;

// Queue columns: A..J
const HEADER = [
  'queued_at', 'from', 'to', 'subject', 'html',
  'status', 'attempts', 'last_error', 'sent_at', 'idempotency_key',
];
const COL = { status: 5, attempts: 6, idempotencyKey: 9 };
const RANGE = `${QUEUE_TAB}!A:J`;

function getSpreadsheetId() {
  return process.env.GOOGLE_SPREADSHEET_ID || '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';
}

/**
 * Send a transactional email with automatic self-healing.
 *
 * The Resend SDK does NOT throw on API errors (e.g. a quota/rate-limit 429 is
 * returned as { error }). This helper treats both thrown errors and returned
 * errors as failures and parks the email in the "Email Queue" sheet tab, where
 * a cron (drainEmailQueue) retries it until it succeeds — so nothing is lost
 * when the daily send limit is hit.
 *
 * A stable idempotency key is generated up front and reused across the initial
 * send AND every retry, so Resend de-duplicates even if the same email is sent
 * twice (ambiguous network failure, or two overlapping cron drains).
 *
 * @returns {Promise<{ data: object|null, error: {message:string}|null, queued: boolean }>}
 *   Resend-compatible shape plus a `queued` flag (true if it was safely parked
 *   for retry). Existing `.error` / `.data?.id` checks continue to work.
 */
export async function sendEmail(auth, { from = DEFAULT_FROM, to, subject, html }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const idempotencyKey = generateToken();

  try {
    const response = await resend.emails.send(
      { from, to, subject, html },
      { idempotencyKey }
    );
    if (response.error) {
      throw new Error(response.error.message || JSON.stringify(response.error));
    }
    return { data: response.data, error: null, queued: false };
  } catch (err) {
    console.error(`Email send failed (to ${to}): ${err.message}. Queuing for retry.`);
    let queued = false;
    try {
      await queueEmail(auth, { from, to, subject, html, idempotencyKey, error: err.message });
      queued = true;
    } catch (queueErr) {
      console.error('Failed to queue email for retry:', queueErr);
    }
    return { data: null, error: { message: err.message }, queued };
  }
}

/**
 * Retry every pending email in the queue. Call this from a cron handler.
 * Safe to run every time — it only touches rows marked "pending".
 * @returns {Promise<{ attempted: number, sent: number }>}
 */
export async function drainEmailQueue(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId();
  const resend = new Resend(process.env.RESEND_API_KEY);

  let rows;
  try {
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range: RANGE });
    rows = resp.data.values;
  } catch (e) {
    // Tab doesn't exist yet => nothing has ever been queued.
    return { attempted: 0, sent: 0 };
  }

  if (!rows || rows.length === 0) {
    return { attempted: 0, sent: 0 };
  }

  // Only skip the first row if it's actually the header. This guards against a
  // tab that somehow lost its header row (which would otherwise make the first
  // queued email get skipped forever).
  const startIndex = (rows[0][0] || '') === 'queued_at' ? 1 : 0;

  const updates = [];
  let attempted = 0;
  let sent = 0;

  for (let i = startIndex; i < rows.length && attempted < MAX_DRAIN_PER_RUN; i++) {
    const row = rows[i];
    if ((row[COL.status] || '') !== 'pending') continue;

    attempted++;
    const rowNumber = i + 1;
    const from = row[1] || DEFAULT_FROM;
    const to = row[2] || '';
    const subject = row[3] || '';
    const html = row[4] || '';
    const idempotencyKey = row[COL.idempotencyKey] || undefined;
    const newAttempts = (parseInt(row[COL.attempts], 10) || 0) + 1;

    try {
      const response = await resend.emails.send(
        { from, to, subject, html },
        idempotencyKey ? { idempotencyKey } : undefined
      );
      if (response.error) {
        throw new Error(response.error.message || JSON.stringify(response.error));
      }
      // Success: status, attempts, last_error(cleared), sent_at
      updates.push({
        range: `${QUEUE_TAB}!F${rowNumber}:I${rowNumber}`,
        values: [['sent', newAttempts, '', new Date().toISOString()]],
      });
      sent++;
    } catch (err) {
      const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
      // status, attempts, last_error
      updates.push({
        range: `${QUEUE_TAB}!F${rowNumber}:H${rowNumber}`,
        values: [[newStatus, newAttempts, err.message]],
      });
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data: updates },
    });
  }

  return { attempted, sent };
}

/**
 * Append a failed email to the queue tab (creating the tab if needed).
 */
async function queueEmail(auth, { from, to, subject, html, idempotencyKey, error }) {
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = getSpreadsheetId();

  // Columns: queued_at, from, to, subject, html, status, attempts, last_error, sent_at, idempotency_key
  const row = [
    new Date().toISOString(),
    from,
    to,
    subject,
    html,
    'pending',
    0,
    error || '',
    '',
    idempotencyKey || '',
  ];

  try {
    await appendQueueRow(sheets, spreadsheetId, row);
  } catch (e) {
    // Most likely the tab doesn't exist yet: create it, then retry once.
    await ensureQueueTab(sheets, spreadsheetId);
    await appendQueueRow(sheets, spreadsheetId, row);
  }
}

async function appendQueueRow(sheets, spreadsheetId, row) {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: RANGE,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

async function ensureQueueTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties?.title === QUEUE_TAB
  );
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: QUEUE_TAB } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${QUEUE_TAB}!A1:J1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER] },
  });
}
