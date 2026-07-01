import { google } from 'googleapis';
import { Resend } from 'resend';

export default async function handler(req, res) {
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

    const resend = new Resend(process.env.RESEND_API_KEY);
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

        await resend.emails.send({
          from: 'Hair by Dekyi <onboarding@resend.dev>',
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
      details: error.message,
    });
  }
}
