import { google } from 'googleapis';
import { sendEmail } from '../utils/email.js';
import { requireCron } from '../utils/security.js';

export default async function handler(req, res) {
  // Cron-only endpoint: reject callers without the shared CRON_SECRET.
  if (!requireCron(req, res)) return;

  // Weekly digest mode: a separate weekly cron-job.org job hits this endpoint
  // with ?task=weekly-digest to email the stylist the clients who missed their
  // deposit window this week. The normal every-5-min call (no param) is unaffected.
  if (req.query.task === 'weekly-digest') {
    return await sendWeeklyExpiredDigest(res);
  }

  try {
    // Decode the service account credentials
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

    // Authenticate with Google
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/calendar',
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const calendar = google.calendar({ version: 'v3', auth });
    const spreadsheetId = '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    // Read all bookings
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Booking Form!A:T',
    });

    const rows = response.data.values;

    if (!rows || rows.length <= 1) {
      return res.status(200).json({ message: 'No bookings found' });
    }

    const now = new Date();
    let expiredCount = 0;
    const expiredBookings = [];

    // Process each row (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = row[12] || ''; // Column M
      const tempEventId = row[14] || ''; // Column O
      const depositDeadline = row[17] || ''; // Column R

      // Only process bookings with status "pending_deposit"
      if (status !== 'pending_deposit') {
        continue;
      }

      // Check if deadline has passed
      if (!depositDeadline) {
        continue;
      }

      const deadline = new Date(depositDeadline);

      if (now <= deadline) {
        continue; // Not expired yet
      }

      // Deposit deadline has expired!
      const name = row[1] || '';
      const email = row[2] || '';
      const acceptedSlot = row[13] || ''; // Column N
      const slots = [row[4] || '', row[5] || '', row[6] || ''];
      const slotNumber = parseInt(acceptedSlot.replace('Slot ', '')) - 1;
      const selectedSlot = slots[slotNumber];

      try {
        // Delete temporary calendar event
        const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

        if (tempEventId) {
          try {
            await calendar.events.delete({
              calendarId,
              eventId: tempEventId,
            });
          } catch (calError) {
            console.error(`Error deleting calendar event ${tempEventId}:`, calError);
            // Continue even if delete fails (event might already be deleted)
          }
        }

        // Update Sheet: Status=expired, clear temp event ID
        const rowNumber = i + 1;

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: [
              {
                range: `Booking Form!M${rowNumber}`, // Status
                values: [['expired']],
              },
              {
                range: `Booking Form!O${rowNumber}`, // Clear CalendarEventId
                values: [['']],
              },
            ],
          },
        });

        // Send expiration email to client
        const baseUrl = process.env.BASE_URL || 'https://hairbydekyi.vercel.app';

        await sendEmail(auth, {
          from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
          to: email,
          subject: 'Your time slot was not reserved',
          html: `
            <h2>Time Slot Not Reserved</h2>
            <p>Hi ${name},</p>
            <p>Unfortunately, we didn't receive your deposit within the 24-hour window for the following time slot:</p>

            <p><strong>Time slot:</strong> ${selectedSlot}</p>

            <p>This time slot is no longer reserved and is now available for others to book.</p>

            <p>If you'd still like to book an appointment, please visit our website and select a new time:</p>
            <p><a href="${baseUrl}" style="display: inline-block; padding: 12px 24px; background-color: #A8BDA8; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Book Again</a></p>

            <p>Questions? Reply to this email or DM us @hairbydekyi on Instagram.</p>

            <p>- Dekyi</p>
          `,
        });

        expiredCount++;
        expiredBookings.push({
          name,
          email,
          slot: selectedSlot,
          deadline: depositDeadline,
        });

      } catch (error) {
        console.error(`Error processing expired booking for ${email}:`, error);
        continue;
      }
    }

    return res.status(200).json({
      success: true,
      expiredCount,
      expiredBookings,
    });

  } catch (error) {
    console.error('Error checking expired holds:', error);
    return res.status(500).json({
      error: 'Failed to check expired holds',
    });
  }
}

/**
 * Weekly digest: email hairbydekyi@gmail.com the list of clients whose deposit
 * window lapsed in the last 7 days (status "expired"), so their slot was
 * released. Triggered by its own weekly cron-job.org job hitting
 *   /api/check-expired-holds?task=weekly-digest   (carrying the CRON_SECRET).
 */
async function sendWeeklyExpiredDigest(res) {
  try {
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

    // Digest only reads the sheet and sends email (no calendar) → least privilege.
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId =
      process.env.GOOGLE_SPREADSHEET_ID || '1mNaPRaHr_HwFVY-Szxak-QCZwWDJ-BWO0E4tBc1f-NA';

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Booking Form!A:U',
    });

    const rows = response.data.values || [];
    const headers = rows[0] || [];
    const instagramColIndex = headers.findIndex(
      (h) => String(h || '').toLowerCase().includes('instagram')
    );

    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const missed = [];

    // Skip the header row.
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const status = row[12] || ''; // Column M
      if (status !== 'expired') continue;

      // Column R (deposit_deadline) doubles as "when the window lapsed": the
      // 5-min job flips the row to "expired" within minutes of this passing.
      const depositDeadline = row[17] || '';
      const deadlineMs = Date.parse(depositDeadline);
      if (Number.isNaN(deadlineMs) || deadlineMs < weekAgo || deadlineMs > now) {
        continue;
      }

      const acceptedSlot = row[13] || ''; // Column N ("Slot 1/2/3")
      const slots = [row[4] || '', row[5] || '', row[6] || ''];
      const slotNumber = parseInt(acceptedSlot.replace('Slot ', ''), 10) - 1;
      const lostSlot = slots[slotNumber] || acceptedSlot || 'Unknown slot';

      missed.push({
        name: row[1] || 'Unknown',
        email: row[2] || '',
        phone: row[3] || '',
        instagram: (instagramColIndex >= 0 ? row[instagramColIndex] : '') || '',
        lostSlot,
        deadline: depositDeadline,
      });
    }

    await sendEmail(auth, {
      from: 'Hair by Dekyi <noreply@hairbydekyi.com>',
      to: 'hairbydekyi@gmail.com',
      subject: `Weekly recap: ${missed.length} missed deposit${missed.length === 1 ? '' : 's'}`,
      html: buildWeeklyDigestHtml(missed),
    });

    return res.status(200).json({ success: true, missedCount: missed.length });
  } catch (error) {
    console.error('Error sending weekly expired digest:', error);
    return res.status(500).json({ error: 'Failed to send weekly digest' });
  }
}

/**
 * Build the digest email body. Renders a friendly "all clear" note when nobody
 * missed their deposit, otherwise a table of the flaked bookings.
 */
function buildWeeklyDigestHtml(missed) {
  if (missed.length === 0) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2c2c2c;">
        <h2 style="color: #8a9d8a;">Weekly Recap</h2>
        <p>Good news — no clients missed their deposit window this week. </p>
      </div>
    `;
  }

  const rowsHtml = missed
    .map((m) => {
      const d = new Date(m.deadline);
      const deadlineStr = Number.isNaN(d.getTime())
        ? m.deadline
        : d.toLocaleString('en-US', {
            timeZone: 'America/Toronto',
            dateStyle: 'medium',
            timeStyle: 'short',
          });
      const contact = [m.email || '—', m.phone, m.instagram]
        .filter(Boolean)
        .join('<br>');
      return `
        <tr>
          <td style="padding:8px;border:1px solid #e0d8d2;">${m.name}</td>
          <td style="padding:8px;border:1px solid #e0d8d2;">${m.lostSlot}</td>
          <td style="padding:8px;border:1px solid #e0d8d2;">${contact}</td>
          <td style="padding:8px;border:1px solid #e0d8d2;">${deadlineStr}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #2c2c2c;">
      <h2 style="color: #8a9d8a; margin-bottom: 6px;">Weekly Recap</h2>
      <p style="color:#666; margin-top:0;">
        ${missed.length} client${missed.length === 1 ? '' : 's'} didn't submit a deposit in time this week,
        so ${missed.length === 1 ? 'their slot was' : 'their slots were'} released.
      </p>
      <table style="border-collapse:collapse; width:100%; font-size:14px;">
        <thead>
          <tr style="background:#f5f1ed;">
            <th style="text-align:left; padding:8px; border:1px solid #e0d8d2;">Client</th>
            <th style="text-align:left; padding:8px; border:1px solid #e0d8d2;">Slot released</th>
            <th style="text-align:left; padding:8px; border:1px solid #e0d8d2;">Contact</th>
            <th style="text-align:left; padding:8px; border:1px solid #e0d8d2;">Deadline missed</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="font-size:12px; color:#999; margin-top:16px;">
        Covers the past 7 days. These slots are already free for others to book.
      </p>
    </div>
  `;
}
