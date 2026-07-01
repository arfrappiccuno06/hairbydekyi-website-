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

    // Read Deposits Form tab (A=Timestamp, B=Screenshot, C=Token, D=Email)
    const depositsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Deposits Form!A:D',
    });

    const depositRows = depositsResponse.data.values;

    if (!depositRows || depositRows.length <= 1) {
      return res.status(200).json({ message: 'No deposits found' });
    }

    // Read Booking Form tab to match deposits
    const bookingsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Booking Form!A:T',
    });

    const bookingRows = bookingsResponse.data.values;

    if (!bookingRows || bookingRows.length <= 1) {
      return res.status(200).json({ message: 'No bookings found' });
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let depositsProcessed = 0;
    const processedDeposits = [];

    // Process each deposit row (skip header)
    for (let i = 1; i < depositRows.length; i++) {
      const depositRow = depositRows[i];
      const depositTimestamp = depositRow[0] || '';
      const depositScreenshot = depositRow[1] || '';
      const depositToken = depositRow[2] || '';
      const depositEmail = depositRow[3] || '';

      if (!depositToken) {
        continue; // Skip rows without token
      }

      // Find matching booking by deposit_token (Column Q = index 16)
      let matchingBookingIndex = -1;
      let matchingBooking = null;

      for (let j = 1; j < bookingRows.length; j++) {
        const bookingDepositToken = bookingRows[j][16] || ''; // Column Q
        if (bookingDepositToken === depositToken) {
          matchingBookingIndex = j;
          matchingBooking = bookingRows[j];
          break;
        }
      }

      if (!matchingBooking) {
        console.log(`No matching booking found for deposit token: ${depositToken}`);
        continue;
      }

      // Check if deposit already processed
      const depositReceivedTimestamp = matchingBooking[18] || ''; // Column S
      if (depositReceivedTimestamp) {
        continue; // Already processed
      }

      // Extract booking details
      const name = matchingBooking[1] || '';
      const email = matchingBooking[2] || '';
      const phone = matchingBooking[3] || '';
      const acceptedSlot = matchingBooking[13] || ''; // Column N
      const tempEventId = matchingBooking[14] || ''; // Column O
      const depositDeadline = matchingBooking[17] || ''; // Column R
      const serviceDescription = matchingBooking[7] || '';
      const referencePhotos = matchingBooking[8] || '';

      // Check if deadline has passed
      const now = new Date();
      const deadline = new Date(depositDeadline);

      if (now > deadline) {
        console.log(`Deposit received after deadline for ${email}`);
        // Could send a "too late" email here if desired
        continue;
      }

      // Get the accepted slot details to parse for calendar event
      const slots = [
        matchingBooking[4] || '',
        matchingBooking[5] || '',
        matchingBooking[6] || '',
      ];

      const slotNumber = parseInt(acceptedSlot.replace('Slot ', '')) - 1;
      const selectedSlot = slots[slotNumber];

      const slotParsed = parseSlotString(selectedSlot);
      if (!slotParsed) {
        console.error(`Could not parse slot: ${selectedSlot}`);
        continue;
      }

      const { startDateTime, endDateTime } = slotParsed;
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

      try {
        // Delete temporary calendar event
        if (tempEventId) {
          await calendar.events.delete({
            calendarId,
            eventId: tempEventId,
          });
        }

        // Create PERMANENT calendar event
        const permanentEvent = {
          summary: `Hair Appointment - ${name}`,
          description: [
            `Client: ${name}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            `\nService Description: ${serviceDescription}`,
            `\nReference Photos: ${referencePhotos || 'NOT PROVIDED'}`,
            `\nDeposit Screenshot: ${depositScreenshot}`,
            `\nDeposit Received: ${depositTimestamp}`,
          ].join('\n'),
          start: {
            dateTime: startDateTime,
            timeZone: 'America/Toronto',
          },
          end: {
            dateTime: endDateTime,
            timeZone: 'America/Toronto',
          },
          colorId: '10', // Green color for confirmed
        };

        const createdEvent = await calendar.events.insert({
          calendarId,
          requestBody: permanentEvent,
        });

        const permanentEventId = createdEvent.data.id;

        // Update Booking Form: Status=confirmed, CalendarEventId=permanent, deposit_received_timestamp, deposit_screenshot_url
        const bookingRowNumber = matchingBookingIndex + 1;

        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'RAW',
            data: [
              {
                range: `Booking Form!M${bookingRowNumber}`, // Status
                values: [['confirmed']],
              },
              {
                range: `Booking Form!O${bookingRowNumber}`, // CalendarEventId (permanent)
                values: [[permanentEventId]],
              },
              {
                range: `Booking Form!S${bookingRowNumber}`, // deposit_received_timestamp
                values: [[now.toISOString()]],
              },
              {
                range: `Booking Form!T${bookingRowNumber}`, // deposit_screenshot_url
                values: [[depositScreenshot]],
              },
            ],
          },
        });

        // Send confirmation email to client
        await resend.emails.send({
          from: 'Hair by Dekyi <onboarding@resend.dev>',
          to: email,
          subject: 'Appointment confirmed! See you soon 💇‍♀️',
          html: `
            <h2>Appointment Confirmed!</h2>
            <p>Hi ${name},</p>
            <p>Your deposit has been received and your appointment is now confirmed!</p>

            <h3>Appointment Details:</h3>
            <p><strong>📅 Date & Time:</strong> ${selectedSlot}</p>
            <p><strong>💵 Service:</strong> At Home Cut n Style ($45)</p>
            <p><strong>✅ Deposit:</strong> $5 received</p>

            <p>We look forward to seeing you!</p>

            <p>If you need to make any changes, please contact us directly at hairbydekyi@gmail.com or DM @hairbydekyi on Instagram.</p>

            <p>- Dekyi</p>
          `,
        });

        depositsProcessed++;
        processedDeposits.push({
          name,
          email,
          slot: selectedSlot,
          depositTimestamp,
        });

      } catch (error) {
        console.error(`Error processing deposit for ${email}:`, error);
        continue;
      }
    }

    return res.status(200).json({
      success: true,
      depositsProcessed,
      processedDeposits,
    });

  } catch (error) {
    console.error('Error checking deposits:', error);
    return res.status(500).json({
      error: 'Failed to check deposits',
      details: error.message,
    });
  }
}

/**
 * Parse slot string like "Monday, June 16 at 09:00 AM" into ISO datetime
 */
function parseSlotString(slotString) {
  try {
    const match = slotString.match(/(\w+,\s+\w+\s+\d+)\s+at\s+(\d+:\d+\s+[AP]M)/i);

    if (!match) {
      return null;
    }

    const dateStr = match[1];
    const timeStr = match[2];

    const currentYear = new Date().getFullYear();
    const fullDateStr = `${dateStr}, ${currentYear} ${timeStr}`;

    const startDate = new Date(fullDateStr);

    if (isNaN(startDate.getTime())) {
      return null;
    }

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
