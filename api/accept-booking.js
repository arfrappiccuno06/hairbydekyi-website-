import { google } from 'googleapis';
import { Resend } from 'resend';

export default async function handler(req, res) {
  try {
    // Parse query parameters
    const { token, slot } = req.query;

    if (!token || slot === undefined) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Request</h1>
            <p>Missing token or slot parameter.</p>
          </body>
        </html>
      `);
    }

    const slotIndex = parseInt(slot, 10);
    if (![0, 1, 2].includes(slotIndex)) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Slot</h1>
            <p>Slot must be 0, 1, or 2.</p>
          </body>
        </html>
      `);
    }

    // Authenticate with Google
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8')
    );

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

    // Read all rows to find the matching token
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Form Responses 1!A:P',
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return res.status(404).send(`
        <html>
          <body>
            <h1>Booking Not Found</h1>
            <p>No booking found with this token.</p>
          </body>
        </html>
      `);
    }

    // Find the row with matching token (Column L = index 11)
    let matchingRowIndex = -1;
    let bookingData = null;

    for (let i = 1; i < rows.length; i++) {
      if (rows[i][11] === token) {
        matchingRowIndex = i;
        bookingData = rows[i];
        break;
      }
    }

    if (!bookingData) {
      return res.status(404).send(`
        <html>
          <body>
            <h1>Booking Not Found</h1>
            <p>Invalid or expired token.</p>
          </body>
        </html>
      `);
    }

    // Extract booking details
    const name = bookingData[1] || '';
    const email = bookingData[2] || '';
    const phone = bookingData[3] || '';
    const slots = [
      bookingData[4] || '', // Slot 1
      bookingData[5] || '', // Slot 2
      bookingData[6] || '', // Slot 3
    ];
    const status = bookingData[12] || ''; // Column M

    // Idempotency check
    if (status !== 'Pending') {
      return res.status(200).send(`
        <html>
          <body>
            <h1>Booking Already Processed</h1>
            <p>This booking has already been ${status.toLowerCase()}.</p>
            <p><strong>Client:</strong> ${name}</p>
            <p><strong>Status:</strong> ${status}</p>
          </body>
        </html>
      `);
    }

    // Get the selected slot
    const selectedSlot = slots[slotIndex];
    if (!selectedSlot) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Invalid Slot</h1>
            <p>The selected slot is empty.</p>
          </body>
        </html>
      `);
    }

    // Parse slot string to extract date and time
    // Expected format: "Monday, June 16 at 09:00 AM" or similar
    const slotParsed = parseSlotString(selectedSlot);
    if (!slotParsed) {
      return res.status(400).send(`
        <html>
          <body>
            <h1>Error</h1>
            <p>Could not parse slot time: ${selectedSlot}</p>
          </body>
        </html>
      `);
    }

    const { startDateTime, endDateTime } = slotParsed;

    // Race condition check: Verify slot is still available in Calendar
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startDateTime,
        timeMax: endDateTime,
        timeZone: 'America/Toronto',
        items: [{ id: calendarId }],
      },
    });

    const busySlots = freeBusy.data.calendars[calendarId].busy || [];
    const isSlotTaken = busySlots.length > 0;

    if (isSlotTaken) {
      // Slot is already booked - show error with alternative slots
      const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
      const alternativeLinks = [];

      for (let i = 0; i < 3; i++) {
        if (i !== slotIndex && slots[i]) {
          alternativeLinks.push(`
            <p><strong>Slot ${i + 1}:</strong> ${slots[i]}<br>
            <a href="${baseUrl}/api/accept-booking?token=${token}&slot=${i}">Accept Slot ${i + 1}</a></p>
          `);
        }
      }

      // Update status to Conflict
      const rowNumber = matchingRowIndex + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Form Responses 1!M${rowNumber}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['Conflict']],
        },
      });

      return res.status(409).send(`
        <html>
          <body>
            <h1>Slot Already Booked</h1>
            <p>Unfortunately, this time slot was just booked by someone else.</p>
            ${alternativeLinks.length > 0 ? `
              <h2>Try one of these alternative slots:</h2>
              ${alternativeLinks.join('')}
            ` : '<p>No alternative slots available. Please contact the client.</p>'}
          </body>
        </html>
      `);
    }

    // Create Calendar event
    const event = {
      summary: `Hair Appointment - ${name}`,
      description: `Client: ${name}\nEmail: ${email}\nPhone: ${phone}`,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Toronto',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Toronto',
      },
    };

    const createdEvent = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    const eventId = createdEvent.data.id;

    // Update Sheet: Status=Accepted, AcceptedSlot, CalendarEventId, ProcessedTimestamp
    const rowNumber = matchingRowIndex + 1;
    const now = new Date().toISOString();

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          {
            range: `Form Responses 1!M${rowNumber}`,
            values: [['Accepted']],
          },
          {
            range: `Form Responses 1!N${rowNumber}`,
            values: [[`Slot ${slotIndex + 1}`]],
          },
          {
            range: `Form Responses 1!O${rowNumber}`,
            values: [[eventId]],
          },
          {
            range: `Form Responses 1!P${rowNumber}`,
            values: [[now]],
          },
        ],
      },
    });

    // Send confirmation email to client
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: 'Hair by Dekyi <onboarding@resend.dev>',
      to: email,
      subject: 'Appointment Confirmed!',
      html: `
        <h2>Appointment Confirmed!</h2>
        <p>Hi ${name},</p>
        <p>Your appointment has been confirmed for:</p>
        <h3>${selectedSlot}</h3>
        <p>We look forward to seeing you!</p>
        <p>If you need to make any changes, please contact us directly.</p>
      `,
    });

    // Return success page
    return res.status(200).send(`
      <html>
        <body>
          <h1>Booking Accepted!</h1>
          <p><strong>Client:</strong> ${name}</p>
          <p><strong>Confirmed Time:</strong> ${selectedSlot}</p>
          <p>A confirmation email has been sent to ${email}.</p>
          <p>Calendar event has been created.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Error accepting booking:', error);
    return res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>Failed to accept booking: ${error.message}</p>
        </body>
      </html>
    `);
  }
}

/**
 * Parse slot string like "Monday, June 16 at 09:00 AM" into ISO datetime
 * Returns { startDateTime: ISO string, endDateTime: ISO string (90 min later) }
 */
function parseSlotString(slotString) {
  try {
    // Extract date and time parts
    // Expected format: "Monday, June 16 at 09:00 AM"
    const match = slotString.match(/(\w+,\s+\w+\s+\d+)\s+at\s+(\d+:\d+\s+[AP]M)/i);

    if (!match) {
      return null;
    }

    const dateStr = match[1]; // "Monday, June 16"
    const timeStr = match[2]; // "09:00 AM"

    // Parse date (assuming current year)
    const currentYear = new Date().getFullYear();
    const fullDateStr = `${dateStr}, ${currentYear} ${timeStr}`;

    const startDate = new Date(fullDateStr);

    if (isNaN(startDate.getTime())) {
      return null;
    }

    // Create end time (90 minutes later)
    const endDate = new Date(startDate.getTime() + 90 * 60 * 1000);

    return {
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
    };
  } catch (error) {
    console.error('Error parsing slot string:', error);
    return null;
  }
}
